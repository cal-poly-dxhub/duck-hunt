interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  data: T;
  success: boolean;
  status?: number;
  error?: string;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  try {
    const {
      method = "GET",
      params = {},
      query = {},
      body,
      headers: customHeaders = {},
    } = options;

    const teamId = localStorage.getItem("teamId");

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
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.message ||
          errorJson.error ||
          `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        errorMessage =
          errorText || `HTTP ${response.status}: ${response.statusText}`;
      }

      return {
        data: null as T,
        success: false,
        status: response.status,
        error: errorMessage,
      };
    }

    const data = await response.json();

    // console.log("INFO: API JSON Response:", {
    //   data,
    // });

    return {
      data,
      status: response.status,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";

    return {
      data: null as T,
      success: false,
      status: 500,
      error: errorMessage,
    };
  }
}

export const apiGet = <T = unknown>(
  endpoint: string,
  options?: Omit<ApiRequestOptions, "method">
) => apiRequest<T>(endpoint, { ...options, method: "GET" });

export const apiPost = <T = unknown>(
  endpoint: string,
  options?: Omit<ApiRequestOptions, "method">
) => apiRequest<T>(endpoint, { ...options, method: "POST" });

export const apiPut = <T = unknown>(
  endpoint: string,
  options?: Omit<ApiRequestOptions, "method">
) => apiRequest<T>(endpoint, { ...options, method: "PUT" });

export const apiDelete = <T = unknown>(
  endpoint: string,
  options?: Omit<ApiRequestOptions, "method">
) => apiRequest<T>(endpoint, { ...options, method: "DELETE" });
