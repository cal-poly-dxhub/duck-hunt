import { validateUUID } from "@shared/scripts";
import { ApiResponse } from "@shared/types";

interface ApiRequestOptions {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  try {
    const {
      params = {},
      query = {},
      body,
      headers: customHeaders = {},
    } = options;

    const teamId = localStorage.getItem("teamId");
    const userId = localStorage.getItem("userId");

    // TODO: teamId and userId validataion

    if (userId !== undefined && !validateUUID(userId)) {
      console.error("User ID not valid");
      throw new Error("User ID not valid. Try clearing your browser cookies.");
    } else if (!validateUUID(teamId)) {
      console.error("Team ID not valid");
      throw new Error(
        "Team ID not valid. Try scanning your team duck again or clearing your browser cookies."
      );
    }

    let url = endpoint;
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value));
    });

    const queryParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      queryParams.append(key, String(value));
    });
    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    if (teamId) {
      headers["team-id"] = teamId;
    }

    if (userId) {
      headers["user-id"] = userId;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    // console.log("INFO: API Request:", {
    //   endpoint,
    //   method,
    //   params,
    //   query,
    //   body,
    //   headers,
    //   url,
    // });

    const response = await fetch(url, fetchOptions);

    // console.log("INFO: API Response:", response);

    if (!response.ok) {
      let errorMessage = null;
      let errorDetails = null;
      try {
        errorDetails = await response.clone().json();
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || "An unknown error occurred";
      }

      return {
        data: null,
        success: false,
        status: response.status,
        error: {
          error:
            errorDetails?.error || errorMessage || "An unknown error occurred",
          displayMessage:
            errorDetails?.displayMessage ||
            "The server did not respond properly. Try again or contact support.",
          details: "Server response was not OK: " + errorMessage,
        },
      };
    }

    const data = await response.json();

    // console.log("INFO: API JSON Response:", {
    //   data,
    // });

    return {
      data: data,
      status: response.status,
      success: true,
      error: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";

    return {
      data: null,
      success: false,
      status: 500,
      error: {
        error: errorMessage,
        displayMessage:
          "An unexpected error occurred. Please check your internet connection and refresh the page.",
        details: "Error caught in apiRequest top level catch",
      },
    };
  }
}
