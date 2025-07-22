import { apiPost } from "./apiRequest";

const message = async (prompt: string) => {
  try {
    const response = await apiPost<{ message: string; response: string }>(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/message`,
      {
        body: { prompt },
      }
    );

    if (!response.success) {
      console.error("API Error:", response);
      throw new Error(response.error || "Failed to send message");
    }

    return {
      success: true,
      message: response.data.response,
    };
  } catch (error) {
    console.error("Error in message function:", error);
    if ((error as { status?: number }).status === 500) {
      return { success: false, error: "Failed to send message" };
    } else {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

const atLevel = async (levelId: string) => {
  try {
    const response = await apiPost<{
      message: string;
      level_id: string;
      message_history: string[];
    }>(`${process.env.NEXT_PUBLIC_API_BASE_URL}/at-level/${levelId}`);

    if (!response.success) {
      throw new Error(response.error || "Failed to get level");
    }

    console.log(response.data);

    return {
      success: true,
      message: response.data.message,
      level: response.data.level_id,
      messageHistory: response.data.message_history,
    };
  } catch (error) {
    console.error("Error in atLevel function:", error);
    if ((error as { status?: number }).status === 500) {
      return { success: false, error: "Failed to send message" };
    } else {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

const finishGame = async (endSequence: string) => {
  try {
    const response = await apiPost<{ message: string }>(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/finish-game/${endSequence}`
    );

    if (!response.success) {
      throw new Error(response.error || "Failed to end game");
    }

    return {
      success: true,
      message:
        response.data.message ??
        "Congratulations! You have completed the scavenger hunt!",
    };
  } catch (error) {
    console.error("Error in finishGame function:", error);
    if ((error as { status?: number }).status === 500) {
      return { success: false, error: "Failed to end game" };
    } else {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

const clearChat = async () => {
  try {
    const response = await apiPost(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/clear-chat`
    );

    if (!response.success) {
      throw new Error(response.error || "Failed to clear chat");
    }

    return {
      success: true,
      message: "Chat cleared successfully",
    };
  } catch (error) {
    console.error("Error in clearChat function:", error);
    if ((error as { status?: number }).status === 500) {
      return { success: false, error: "Failed to clear chat" };
    } else {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

const pingCoordinates = async () => {
  try {
    // get coordinates of device
    // Function to get device coordinates using Geolocation API
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

    const coordinates = await getCoordinates();

    const response = await apiPost<{ message: string }>(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/ping-coordinates`,
      {
        body: coordinates,
      }
    );

    if (!response.success) {
      throw new Error(response.error || "Failed to ping coordinates");
    }

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    console.error("Error in pingCoordinates function:", error);
    if ((error as { status?: number }).status === 500) {
      return { success: false, error: "Failed to ping coordinates" };
    } else {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

export const scavengerHuntApi = {
  message,
  atLevel,
  pingCoordinates,
  finishGame,
  clearChat,
};
