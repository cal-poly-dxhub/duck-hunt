// import { RequestHeaders } from "@shared/types";
// import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
// import * as AWS from "aws-sdk";
// import * as multipart from "lambda-multipart-parser";
// import { fetchBaseData } from "./fetchBaseData";

// // Initialize S3 client
// const s3 = new AWS.S3();
// const BUCKET_NAME = process.env.PHOTO_BUCKET_NAME || "your-photo-bucket";

// interface UploadResponse {
//   success: boolean;
//   message?: string;
//   error?: string;
//   displayMessage?: string;
//   details?: string;
//   photoUrl?: string;
// }

// /**
//  * /upload-photo lambda handler
//  * @param event
//  */
// export const handler = async (
//   event: APIGatewayProxyEvent
// ): Promise<APIGatewayProxyResult> => {
//   console.log("INFO: Received event:", JSON.stringify(event, null, 2));

//   try {
//     // Validate request method
//     if (event.httpMethod !== "POST") {
//       return {
//         statusCode: 405,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//           "Access-Control-Allow-Headers": "Content-Type,user-id,team-id",
//           "Access-Control-Allow-Methods": "POST,OPTIONS",
//         },
//         body: JSON.stringify({
//           error: "Method not allowed",
//           displayMessage: "Only POST method is allowed for photo upload.",
//         }),
//       };
//     }

//     // Validate request headers
//     const headers = event.headers as unknown as RequestHeaders;

//     let baseData;
//     try {
//       baseData = await fetchBaseData(headers);
//     } catch (error) {
//       console.error("Error fetching base data:", error);
//       return {
//         statusCode: 400,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "Invalid request headers",
//           displayMessage:
//             "Invalid user or team ID. Try clearing your browser cookies.",
//           details: error instanceof Error ? error.message : "Unknown error",
//         }),
//       };
//     }

//     // Parse multipart form data
//     let parsedEvent;
//     try {
//       parsedEvent = await multipart.parse(event);
//     } catch (error) {
//       console.error("Error parsing multipart data:", error);
//       return {
//         statusCode: 400,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "Invalid file upload",
//           displayMessage: "Failed to process uploaded file. Please try again.",
//           details: "Error parsing multipart form data",
//         }),
//       };
//     }

//     // Validate file upload
//     if (
//       !parsedEvent.files ||
//       !parsedEvent.files.length ||
//       !parsedEvent.files[0]
//     ) {
//       return {
//         statusCode: 400,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "No file provided",
//           displayMessage: "Please select a photo to upload.",
//           details: "No file found in the request",
//         }),
//       };
//     }

//     const file = parsedEvent.files[0];

//     // Validate file type
//     const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
//     if (!allowedTypes.includes(file.contentType)) {
//       return {
//         statusCode: 400,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "Invalid file type",
//           displayMessage:
//             "Please upload a valid image file (JPEG, PNG, or GIF).",
//           details: `File type \${file.contentType} is not allowed`,
//         }),
//       };
//     }

//     // Validate file size (e.g., max 10MB)
//     const maxSize = 10 * 1024 * 1024; // 10MB
//     if (file.content.length > maxSize) {
//       return {
//         statusCode: 400,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "File too large",
//           displayMessage: "Please upload a photo smaller than 10MB.",
//           details: `File size \${file.content.length} exceeds maximum allowed size`,
//         }),
//       };
//     }

//     // Generate unique filename
//     const fileExtension = file.filename.split(".").pop() || "jpg";
//     const fileName = `team-photos/\${headers['team-id']}/\${uuidv4()}.\${fileExtension}`;

//     // Upload to S3
//     try {
//       const uploadParams = {
//         Bucket: BUCKET_NAME,
//         Key: fileName,
//         Body: file.content,
//         ContentType: file.contentType,
//         Metadata: {
//           "team-id": headers["team-id"] as string,
//           "user-id": headers["user-id"] as string,
//           "upload-timestamp": new Date().toISOString(),
//         },
//       };

//       const uploadResult = await s3.upload(uploadParams).promise();

//       // Here you might want to save the photo URL to your database
//       // associated with the team and user

//       const response: UploadResponse = {
//         success: true,
//         message: "Photo uploaded successfully",
//         photoUrl: uploadResult.Location,
//       };

//       return {
//         statusCode: 200,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify(response),
//       };
//     } catch (uploadError) {
//       console.error("Error uploading to S3:", uploadError);
//       return {
//         statusCode: 500,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*",
//         },
//         body: JSON.stringify({
//           error: "Upload failed",
//           displayMessage:
//             "Failed to upload photo. Please try again or contact support.",
//           details: "Error uploading file to storage",
//         }),
//       };
//     }
//   } catch (error) {
//     console.error("Unexpected error in upload-photo handler:", error);

//     return {
//       statusCode: 500,
//       headers: {
//         "Content-Type": "application/json",
//         "Access-Control-Allow-Origin": "*",
//       },
//       body: JSON.stringify({
//         error: "Internal server error",
//         displayMessage:
//           "An unexpected error occurred. Please try again or contact support.",
//         details: error instanceof Error ? error.message : "Unknown error",
//       }),
//     };
//   }
// };
