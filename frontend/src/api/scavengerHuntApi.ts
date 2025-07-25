import { validateUUID } from "@shared/scripts";
import {
  LevelResponseBody,
  Message,
  MessageResponseBody,
  MessageRole,
  UUID,
} from "@shared/types";
import { v4 } from "uuid";
import { apiRequest } from "./apiRequest";

// /message
const message = async (
  userMessage: Message<MessageRole.User>
): Promise<MessageResponseBody> => {
  try {
    if (
      !userMessage.id ||
      !userMessage.content ||
      !userMessage.role ||
      !userMessage.createdAt
    ) {
      console.error("Invalid user message:", JSON.stringify(userMessage));
      throw new Error("Invalid user message. Please try again.");
    }

    const { data, success, error } = await apiRequest<MessageResponseBody>(
      "POST",
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/message`,
      {
        body: { message: userMessage },
      }
    );

    if (!success) {
      console.error("/message returned not success:", JSON.stringify(error));
      throw new Error(error.displayMessage);
    }

    return data;
  } catch (error) {
    console.error("Error in message function:", error);
    return {
      message: {
        id: v4() as UUID,
        role: MessageRole.Assistant,
        content:
          typeof (error as { message?: string })?.message === "string"
            ? (error as { message: string }).message
            : "Failed to send message. Please try again or contact support.",
        createdAt: new Date(),
      },
      mapLink: null,
    };
  }
};

// /level
const level = async (levelId: string | null): Promise<LevelResponseBody> => {
  try {
    if (!!levelId && !validateUUID(levelId)) {
      console.error("Level ID not valid");
      throw new Error(
        "Level ID not valid. Try scanning another duck at this location."
      );
    }

    const { data, status, success, error } =
      await apiRequest<LevelResponseBody>(
        "POST",
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/level`,
        {
          body: { levelId },
        }
      );

    if (status == 208 && data) {
      // level already completed
      return data;
    } else if (status == 202 && data) {
      // all levels completed
      return data;
    }

    if (!success) {
      console.error("/level returned not success:", JSON.stringify(error));
      throw new Error(error.displayMessage);
    }

    return data;
  } catch (error) {
    console.error("Error in atLevel function:", error);
    return {
      currentTeamLevel: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      messageHistory: [
        {
          id: v4() as UUID,
          content:
            typeof (error as { message?: string })?.message === "string"
              ? (error as { message: string }).message
              : "Failed to retrieve level data. Please try later or contact support.",
          role: MessageRole.Assistant,
          createdAt: new Date(),
        },
      ],
      requiresPhoto: false,
    };
  }
};

const clearChat = async (): Promise<MessageResponseBody> => {
  try {
    const { data, success, error } = await apiRequest<MessageResponseBody>(
      "POST",
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/clear-chat`
    );

    if (!success) {
      console.error("/clear-chat returned not success:", JSON.stringify(error));
      throw new Error(error.displayMessage);
    }

    return data;
  } catch (error) {
    console.error("Error in clearChat function:", error);
    return {
      message: {
        id: v4() as UUID,
        role: MessageRole.Assistant,
        content:
          typeof (error as { message?: string })?.message === "string"
            ? (error as { message: string }).message
            : "Failed to clear chat. Please try again or contact support.",
        createdAt: new Date(),
      },
      mapLink: null,
    };
  }
};

// helper function for getting user coordinates from browser
// TODO: mobile coordinates
const getCoordinates = (): Promise<{
  latitude: number;
  longitude: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`Failed to get location: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 2000,
        maximumAge: 0,
      }
    );
  });
};

// /ping-coordinates
const pingCoordinates = async () => {
  try {
    const coordinates = await getCoordinates();
    await apiRequest(
      "POST",
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/ping-coordinates`,
      {
        body: coordinates,
      }
    );
  } catch (error) {
    console.error("Error in pingCoordinates function:", error);
  }
};

// /upload-photo
const uploadTeamPhoto = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append("photo", file);

    const teamId = localStorage.getItem("teamId");
    const userId = localStorage.getItem("userId");

    // handle manually - not using apiRequest
    if (!validateUUID(userId)) {
      console.error("User ID not valid");
      throw new Error("User ID not valid. Try clearing your browser cookies.");
    } else if (!validateUUID(teamId)) {
      console.error("Team ID not valid");
      throw new Error(
        "Team ID not valid. Try scanning your team duck again or clearing your browser cookies."
      );
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/upload-photo`,
      {
        method: "POST",
        body: formData,
        headers: {
          "user-id": userId as string,
          "team-id": teamId as string,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to upload photo");
    }

    return {
      success: true,
      message: data.message || "Photo uploaded successfully",
    };
  } catch (error) {
    console.error("Error in uploadTeamPhoto function:", error);
    return {
      success: false,
      error:
        typeof (error as { message?: string })?.message === "string"
          ? (error as { message: string }).message
          : "Error uploading photo. Try refreshing the page or contact support.",
    };
  }
};

export const scavengerHuntApi = {
  message,
  level,
  pingCoordinates,
  clearChat,
  uploadTeamPhoto,
};
