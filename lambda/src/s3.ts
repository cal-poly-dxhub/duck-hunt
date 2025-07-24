import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  GetObjectCommandInput,
  PutObjectCommandInput,
  DeleteObjectCommandInput,
  ListObjectsV2CommandInput,
  HeadObjectCommandInput,
  CopyObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

// Environment variables
export const GAME_CONFIG_BUCKET =
  process.env.GAME_CONFIG_BUCKET || "scavenger-hunt-configs";
export const PHOTO_BUCKET = process.env.PHOTO_BUCKET || "scavenger-hunt-photos";
export const BACKUP_BUCKET =
  process.env.BACKUP_BUCKET || "scavenger-hunt-backups";

// Initialize S3 client
export const s3Client = new S3Client({});

// Utility types
export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface UploadResult {
  bucket: string;
  key: string;
  location: string;
  etag: string;
  versionId?: string;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  contentType?: string;
  contentDisposition?: string;
}

export interface MultipartUploadPart {
  ETag: string;
  PartNumber: number;
}

// Main S3 Operations Class
export class S3Operations {
  // ==================== BASIC CRUD OPERATIONS ====================

  /**
   * Upload an object to S3
   */
  static async putObject(
    bucket: string,
    key: string,
    body: string | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      tags?: Record<string, string>;
      serverSideEncryption?: string;
    }
  ): Promise<UploadResult> {
    const params: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
    };

    // Add tags if provided
    if (options?.tags) {
      const tagString = Object.entries(options.tags)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      params.Tagging = tagString;
    }

    const result = await s3Client.send(new PutObjectCommand(params));

    return {
      bucket,
      key,
      location: `https://${bucket}.s3.amazonaws.com/${key}`,
      etag: result.ETag || "",
      versionId: result.VersionId,
    };
  }

  /**
   * Get an object from S3
   */
  static async getObject(
    bucket: string,
    key: string,
    options?: {
      range?: string; // e.g., "bytes=0-1023"
      versionId?: string;
    }
  ): Promise<{
    body: string;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
  }> {
    const params: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Range: options?.range,
      VersionId: options?.versionId,
    };

    const result = await s3Client.send(new GetObjectCommand(params));

    if (!result.Body) {
      throw new Error(`No content found for object: ${key}`);
    }

    const body = await result.Body.transformToString();

    return {
      body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      metadata: result.Metadata,
    };
  }

  /**
   * Get object as Buffer (for binary data like images)
   */
  static async getObjectAsBuffer(
    bucket: string,
    key: string,
    options?: {
      range?: string;
      versionId?: string;
    }
  ): Promise<{
    body: Buffer;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
  }> {
    const params: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Range: options?.range,
      VersionId: options?.versionId,
    };

    const result = await s3Client.send(new GetObjectCommand(params));

    if (!result.Body) {
      throw new Error(`No content found for object: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    const reader = (result.Body as any).getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return {
      body: Buffer.from(buffer),
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      metadata: result.Metadata,
    };
  }

  /**
   * Delete an object from S3
   */
  static async deleteObject(
    bucket: string,
    key: string,
    versionId?: string
  ): Promise<void> {
    const params: DeleteObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      VersionId: versionId,
    };

    await s3Client.send(new DeleteObjectCommand(params));
  }

  /**
   * Check if an object exists
   */
  static async objectExists(
    bucket: string,
    key: string,
    versionId?: string
  ): Promise<boolean> {
    try {
      const params: HeadObjectCommandInput = {
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
      };

      await s3Client.send(new HeadObjectCommand(params));
      return true;
    } catch (error: any) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get object metadata without downloading the content
   */
  static async getObjectMetadata(
    bucket: string,
    key: string,
    versionId?: string
  ): Promise<{
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
    metadata?: Record<string, string>;
  }> {
    const params: HeadObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      VersionId: versionId,
    };

    const result = await s3Client.send(new HeadObjectCommand(params));

    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      etag: result.ETag,
      metadata: result.Metadata,
    };
  }

  // ==================== LIST OPERATIONS ====================

  /**
   * List objects in a bucket with optional prefix
   */
  static async listObjects(
    bucket: string,
    options?: {
      prefix?: string;
      maxKeys?: number;
      continuationToken?: string;
      delimiter?: string;
    }
  ): Promise<{
    objects: S3Object[];
    isTruncated: boolean;
    nextContinuationToken?: string;
    commonPrefixes?: string[];
  }> {
    const params: ListObjectsV2CommandInput = {
      Bucket: bucket,
      Prefix: options?.prefix,
      MaxKeys: options?.maxKeys,
      ContinuationToken: options?.continuationToken,
      Delimiter: options?.delimiter,
    };

    const result = await s3Client.send(new ListObjectsV2Command(params));

    const objects: S3Object[] = (result.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      etag: obj.ETag || "",
    }));

    return {
      objects,
      isTruncated: result.IsTruncated || false,
      nextContinuationToken: result.NextContinuationToken,
      commonPrefixes: result.CommonPrefixes?.map((cp) => cp.Prefix!),
    };
  }

  /**
   * List all objects with a given prefix (handles pagination automatically)
   */
  static async listAllObjects(
    bucket: string,
    prefix?: string
  ): Promise<S3Object[]> {
    const allObjects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.listObjects(bucket, {
        prefix,
        continuationToken,
        maxKeys: 1000,
      });

      allObjects.push(...result.objects);
      continuationToken = result.nextContinuationToken;
    } while (continuationToken);

    return allObjects;
  }

  // ==================== COPY OPERATIONS ====================

  /**
   * Copy an object within S3
   */
  static async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string,
    options?: {
      metadata?: Record<string, string>;
      metadataDirective?: "COPY" | "REPLACE";
      contentType?: string;
      serverSideEncryption?: string;
    }
  ): Promise<UploadResult> {
    const params: CopyObjectCommandInput = {
      CopySource: `${sourceBucket}/${sourceKey}`,
      Bucket: destinationBucket,
      Key: destinationKey,
      Metadata: options?.metadata,
      MetadataDirective: options?.metadataDirective,
      ContentType: options?.contentType,
    };

    const result = await s3Client.send(new CopyObjectCommand(params));

    return {
      bucket: destinationBucket,
      key: destinationKey,
      location: `https://${destinationBucket}.s3.amazonaws.com/${destinationKey}`,
      etag: result.CopyObjectResult?.ETag || "",
      versionId: result.VersionId,
    };
  }

  // ==================== PRESIGNED URL OPERATIONS ====================

  /**
   * Generate a presigned URL for GET operations
   */
  static async getPresignedGetUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: options?.contentType,
      ResponseContentDisposition: options?.contentDisposition,
    });

    return await getSignedUrl(s3Client, command, {
      expiresIn: options?.expiresIn || 3600,
    });
  }

  /**
   * Generate a presigned URL for PUT operations
   */
  static async getPresignedPutUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions & {
      metadata?: Record<string, string>;
      serverSideEncryption?: string;
    }
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
    });

    return await getSignedUrl(s3Client, command, {
      expiresIn: options?.expiresIn || 3600,
    });
  }

  // ==================== MULTIPART UPLOAD OPERATIONS ====================

  /**
   * Upload large files using multipart upload
   */
  static async uploadLargeFile(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      partSize?: number; // in bytes, default 5MB
      queueSize?: number; // number of concurrent uploads
    }
  ): Promise<UploadResult> {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
        ServerSideEncryption: "AES256",
      },
      partSize: options?.partSize || 5 * 1024 * 1024, // 5MB
      queueSize: options?.queueSize || 4,
    });

    const result = await upload.done();

    return {
      bucket,
      key,
      location: result.Location || `https://${bucket}.s3.amazonaws.com/${key}`,
      etag: result.ETag || "",
      versionId: result.VersionId,
    };
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Delete multiple objects
   */
  static async deleteObjects(
    bucket: string,
    keys: string[]
  ): Promise<{
    deleted: string[];
    errors: { key: string; code: string; message: string }[];
  }> {
    // S3 delete objects API supports max 1000 objects per request
    const chunks = [];
    for (let i = 0; i < keys.length; i += 1000) {
      chunks.push(keys.slice(i, i + 1000));
    }

    const deleted: string[] = [];
    const errors: { key: string; code: string; message: string }[] = [];

    for (const chunk of chunks) {
      try {
        const deletePromises = chunk.map((key) =>
          this.deleteObject(bucket, key)
        );
        await Promise.all(deletePromises);
        deleted.push(...chunk);
      } catch (error: any) {
        chunk.forEach((key) => {
          errors.push({
            key,
            code: error.name || "UnknownError",
            message: error.message || "Unknown error occurred",
          });
        });
      }
    }

    return { deleted, errors };
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Generate a unique key with timestamp and UUID
   */
  static generateUniqueKey(
    prefix: string,
    extension?: string,
    includeTimestamp: boolean = true
  ): string {
    const timestamp = includeTimestamp ? Date.now() : "";
    const uuid = Math.random().toString(36).substring(2, 15);
    const ext = extension ? `.${extension}` : "";

    return `${prefix}${timestamp ? `_${timestamp}` : ""}_${uuid}${ext}`;
  }

  /**
   * Get file extension from key
   */
  static getFileExtension(key: string): string {
    const parts = key.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  }

  /**
   * Validate if key is an image file
   */
  static isImageFile(key: string): boolean {
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
    const extension = this.getFileExtension(key);
    return imageExtensions.includes(extension);
  }

  /**
   * Get content type based on file extension
   */
  static getContentType(key: string): string {
    const extension = this.getFileExtension(key);
    const contentTypes: Record<string, string> = {
      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      webp: "image/webp",
      svg: "image/svg+xml",
      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Text
      txt: "text/plain",
      csv: "text/csv",
      json: "application/json",
      xml: "application/xml",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      // Archives
      zip: "application/zip",
      tar: "application/x-tar",
      gz: "application/gzip",
      // Video
      mp4: "video/mp4",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      // Audio
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
    };

    return contentTypes[extension] || "application/octet-stream";
  }
}

// ==================== SPECIALIZED OPERATIONS FOR SCAVENGER HUNT ====================

export class ScavengerHuntS3Operations extends S3Operations {
  /**
   * Upload a game configuration file
   */
  static async uploadGameConfig(
    gameConfig: any,
    fileName?: string
  ): Promise<UploadResult> {
    const key = fileName || this.generateUniqueKey("game-config", "json");
    const body = JSON.stringify(gameConfig, null, 2);

    return await this.putObject(GAME_CONFIG_BUCKET, key, body, {
      contentType: "application/json",
      metadata: {
        type: "game-config",
        uploadedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Upload a team photo
   */
  static async uploadTeamPhoto(
    photoBuffer: Buffer,
    teamId: string,
    gameId: string,
    levelId?: string,
    originalFileName?: string
  ): Promise<UploadResult> {
    const extension = originalFileName
      ? this.getFileExtension(originalFileName)
      : "jpg";

    const key = `teams/${teamId}/photos/${
      levelId ? `${levelId}/` : ""
    }${this.generateUniqueKey("photo", extension)}`;

    return await this.putObject(PHOTO_BUCKET, key, photoBuffer, {
      contentType: this.getContentType(key),
      metadata: {
        teamId,
        gameId,
        levelId: levelId || "",
        uploadedAt: new Date().toISOString(),
        originalFileName: originalFileName || "",
      },
    });
  }

  /**
   * Get all photos for a team
   */
  static async getTeamPhotos(teamId: string): Promise<S3Object[]> {
    return await this.listAllObjects(PHOTO_BUCKET, `teams/${teamId}/photos/`);
  }

  /**
   * Get all photos for a specific level
   */
  static async getLevelPhotos(
    teamId: string,
    levelId: string
  ): Promise<S3Object[]> {
    return await this.listAllObjects(
      PHOTO_BUCKET,
      `teams/${teamId}/photos/${levelId}/`
    );
  }

  /**
   * Generate presigned URL for photo upload
   */
  static async getPhotoUploadUrl(
    teamId: string,
    gameId: string,
    levelId?: string,
    contentType: string = "image/jpeg",
    expiresIn: number = 300 // 5 minutes
  ): Promise<{ uploadUrl: string; key: string }> {
    const extension = contentType.split("/")[1] || "jpg";
    const key = `teams/${teamId}/photos/${
      levelId ? `${levelId}/` : ""
    }${this.generateUniqueKey("photo", extension)}`;

    const uploadUrl = await this.getPresignedPutUrl(PHOTO_BUCKET, key, {
      contentType,
      expiresIn,
      metadata: {
        teamId,
        gameId,
        levelId: levelId || "",
        uploadedAt: new Date().toISOString(),
      },
    });

    return { uploadUrl, key };
  }

  /**
   * Generate presigned URL for photo download
   */
  static async getPhotoDownloadUrl(
    key: string,
    expiresIn: number = 3600 // 1 hour
  ): Promise<string> {
    return await this.getPresignedGetUrl(PHOTO_BUCKET, key, { expiresIn });
  }

  /**
   * Backup game data to backup bucket
   */
  static async backupGameData(
    gameId: string,
    data: any
  ): Promise<UploadResult> {
    const key = `games/${gameId}/backup_${Date.now()}.json`;
    const body = JSON.stringify(data, null, 2);

    return await this.putObject(BACKUP_BUCKET, key, body, {
      contentType: "application/json",
      metadata: {
        gameId,
        backupType: "game-data",
        createdAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Clean up old game files
   */
  static async cleanupGameFiles(gameId: string): Promise<{
    deletedConfigs: string[];
    deletedPhotos: string[];
    deletedBackups: string[];
    errors: any[];
  }> {
    const results = {
      deletedConfigs: [] as string[],
      deletedPhotos: [] as string[],
      deletedBackups: [] as string[],
      errors: [] as any[],
    };

    try {
      // Clean up game configs (if they contain gameId in metadata or filename)
      const configs = await this.listAllObjects(GAME_CONFIG_BUCKET);
      const configsToDelete = configs
        .filter((obj) => obj.key.includes(gameId))
        .map((obj) => obj.key);

      if (configsToDelete.length > 0) {
        const configResult = await this.deleteObjects(
          GAME_CONFIG_BUCKET,
          configsToDelete
        );
        results.deletedConfigs = configResult.deleted;
        results.errors.push(...configResult.errors);
      }

      // Clean up photos for all teams in this game
      const photos = await this.listAllObjects(
        PHOTO_BUCKET,
        `games/${gameId}/`
      );
      const photosToDelete = photos.map((obj) => obj.key);

      if (photosToDelete.length > 0) {
        const photoResult = await this.deleteObjects(
          PHOTO_BUCKET,
          photosToDelete
        );
        results.deletedPhotos = photoResult.deleted;
        results.errors.push(...photoResult.errors);
      }

      // Clean up backups
      const backups = await this.listAllObjects(
        BACKUP_BUCKET,
        `games/${gameId}/`
      );
      const backupsToDelete = backups.map((obj) => obj.key);

      if (backupsToDelete.length > 0) {
        const backupResult = await this.deleteObjects(
          BACKUP_BUCKET,
          backupsToDelete
        );
        results.deletedBackups = backupResult.deleted;
        results.errors.push(...backupResult.errors);
      }
    } catch (error) {
      results.errors.push({
        operation: "cleanup",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return results;
  }
}

// Export default operations
export default S3Operations;
