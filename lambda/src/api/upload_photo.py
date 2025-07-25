import base64
import json
import os
import uuid
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

s3_client = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")


def get_current_team_level(team_id):
    """Get the current level for a team."""
    try:
        table = dynamodb.Table(os.environ["DUCK_HUNT_TABLE_NAME"])
        print(f"Querying for team_id: {team_id}")

        # Query using the correct schema
        response = table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            FilterExpression="attribute_not_exists(completed_at)",
            ExpressionAttributeValues={
                ":pk": f"TEAM#{team_id}",
                ":sk": "LEVEL#",
            },
        )

        print(f"Query response: {json.dumps(response, default=str)}")

        if not response.get("Items"):
            print(f"No team level found for team {team_id}")
            return None

        # Find the level with the lowest index
        current_level = min(response["Items"], key=lambda x: x.get("index", 0))
        return current_level

    except Exception as e:
        print(f"Error fetching current level for team {team_id}: {str(e)}")
        raise Exception(f"Failed to get current level for team: {team_id}")


def lambda_handler(event, context):
    try:
        # Extract headers
        headers = event.get("headers", {})
        user_id = headers.get("user-id")
        team_id = headers.get("team-id")

        # Validate required headers
        if not all([user_id, team_id]):
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {"error": "Missing required headers (user-id or team-id)"}
                ),
            }

        # Get current level for team
        try:
            current_level = get_current_team_level(team_id)
            if not current_level:
                return {
                    "statusCode": 404,
                    "body": json.dumps(
                        {"error": "No active level found for team"}
                    ),
                }
            level_id = current_level.get("level_id")
        except Exception as e:
            print(f"Error getting current level: {str(e)}")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to get current level"}),
            }

        # Check if body exists and is base64 encoded
        if not event.get("body") or not event.get("isBase64Encoded"):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid request body"}),
            }

        # Decode base64 body
        body = base64.b64decode(event["body"])

        # Generate unique identifiers and timestamps
        photo_id = str(uuid.uuid4())
        current_time = datetime.now().isoformat()
        epoch_timestamp = int(datetime.now().timestamp())
        sort_key = f"PHOTO#{epoch_timestamp}#{photo_id}"

        # Generate S3 filename
        filename = f"{team_id}/{level_id}/{epoch_timestamp}_{photo_id}.jpg"

        # Upload to S3
        try:
            s3_client.put_object(
                Bucket=os.environ["PHOTO_BUCKET"],
                Key=filename,
                Body=body,
                ContentType="image/jpeg",
            )
        except ClientError as e:
            print(f"Error uploading to S3: {str(e)}")
            return {
                "statusCode": 500,
                "body": json.dumps(
                    {"error": "Failed to upload photo to storage"}
                ),
            }

        # Create DynamoDB item
        try:
            table = dynamodb.Table(os.environ["DUCK_HUNT_TABLE_NAME"])

            item = {
                "PK": f"USER#{user_id}",
                "SK": sort_key,
                "GSI1PK": f"TEAM#{team_id}",
                "GSI1SK": sort_key,
                "GSI3PK": f"LEVEL#{level_id}",
                "GSI3SK": sort_key,
                "ItemType": "PHOTO",
                "id": photo_id,
                "user_id": user_id,
                "team_id": team_id,
                "level_id": level_id,
                "url": filename,
                "created_at": current_time,
                "updated_at": current_time,
            }

            table.put_item(Item=item)

            # Return photo data
            photo_data = {
                "id": photo_id,
                "user_id": user_id,
                "team_id": team_id,
                "level_id": level_id,
                "url": filename,
                "created_at": current_time,
                "updated_at": current_time,
            }

            return {
                "statusCode": 200,
                "body": json.dumps(
                    {
                        "message": "Photo uploaded successfully",
                        "photo": photo_data,
                    }
                ),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                },
            }

        except ClientError as e:
            print(f"Error updating DynamoDB: {str(e)}")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to create photo record"}),
            }

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
        }


# Test event
# {
#   "headers": {
#     "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryXXXXXX",
#     "user-id": "123e4567-e89b-12d3-a456-426614174000",
#     "team-id": "987fcdeb-51a2-12d3-a456-426614174000"
#   },
#   "body": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
#   "isBase64Encoded": true
# }
