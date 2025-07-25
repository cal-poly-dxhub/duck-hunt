import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { corsHeaders, RequestHeaders } from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { PhotoOperations } from "src/dynamo/photo";
import { v4 as uuidv4 } from "uuid";
import { fetchBaseData } from "./fetchBaseData";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

interface UploadPhotoRequest {
  photo: string; // base64 encoded image data
  filename: string;
  contentType: string;
  size: number;
}

const detectImageFormat = (
  base64Data: string,
  contentType?: string
): { extension: string; mimeType: string } => {
  // First try to use the provided content type
  if (contentType) {
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return { extension: "jpg", mimeType: "image/jpeg" };
    }
    if (contentType.includes("png")) {
      return { extension: "png", mimeType: "image/png" };
    }
    if (contentType.includes("gif")) {
      return { extension: "gif", mimeType: "image/gif" };
    }
  }

  // Fallback to checking the base64 data
  const buffer = Buffer.from(base64Data, "base64");

  // Check for JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  // Check for PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  // Default to JPEG
  return { extension: "jpg", mimeType: "image/jpeg" };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  try {
    const headers = event.headers as unknown as RequestHeaders;

    const { currentLevel, gameId, currentTeamLevel, userMessages } =
      await fetchBaseData(headers);

    // Parse request body
    if (!event.body) {
      console.error("ERROR: Request body is missing or empty");
      throw new Error("Request body is required");
    }

    const requestBody: UploadPhotoRequest = JSON.parse(event.body);
    console.log("INFO: Parsed request body:", {
      filename: requestBody.filename,
      contentType: requestBody.contentType,
      size: requestBody.size,
      photoDataLength: requestBody.photo?.length || 0,
    });

    // Validate required fields
    if (!requestBody.photo) {
      throw new Error("Photo data is required");
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(requestBody.photo, "base64");
    console.log(
      `INFO: Converted base64 to buffer, size: ${fileBuffer.length} bytes`
    );

    // Detect image format
    const { extension, mimeType } = detectImageFormat(
      requestBody.photo,
      requestBody.contentType
    );
    console.log(`INFO: Detected image format: ${extension} (${mimeType})`);

    // Generate unique identifiers and timestamps
    console.log("INFO: Generating unique identifiers");
    const photoId = uuidv4();
    const epochTimestamp = Math.floor(Date.now() / 1000);

    // Generate S3 filename
    const filename = `${currentTeamLevel.team_id}/${currentTeamLevel.level_id}/${epochTimestamp}_${photoId}.${extension}`;
    console.log(`INFO: Generated S3 filename: ${filename}`);

    // Check environment variables
    const photoBucket = process.env.PHOTO_BUCKET;
    if (!photoBucket) {
      console.error("ERROR: PHOTO_BUCKET environment variable not set");
      throw new Error("PHOTO_BUCKET environment variable is required");
    }

    console.log(`INFO: Using S3 bucket: ${photoBucket}`);

    // Upload to S3
    try {
      console.log("INFO: Starting S3 upload...");
      const putCommand = new PutObjectCommand({
        Bucket: photoBucket,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      await s3Client.send(putCommand);
      console.log("INFO: S3 upload successful");
    } catch (error) {
      console.error("ERROR: S3 upload failed:", error);
      throw new Error(
        `Failed to upload photo to S3: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Save photo metadata to DynamoDB
    console.log("INFO: Saving photo metadata to DynamoDB...");
    await PhotoOperations.create({
      game_id: gameId,
      team_id: currentTeamLevel.team_id,
      level_id: currentTeamLevel.level_id,
      user_id: headers["user-id"],
      url: `https://${photoBucket}.s3.amazonaws.com/${filename}`,
    });

    console.log("INFO: Photo metadata saved to DynamoDB");

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: "Photo uploaded successfully",
        photo: {
          id: photoId,
          url: `https://${photoBucket}.s3.amazonaws.com/${filename}`,
          format: extension,
        },
      }),
    };
  } catch (error) {
    console.error("ERROR: Unexpected top-level error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
};
