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
    const response = await apiPost<{ level_id: string }>(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/at-level/${levelId}`
    );

    if (!response.success) {
      throw new Error(response.error || "Failed to get level");
    }

    return {
      success: true,
      level: response.data.level_id,
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

export const scavengerHuntApi = {
  message,
  atLevel,
  finishGame,
};
