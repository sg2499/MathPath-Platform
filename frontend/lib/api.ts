import axios from "axios";
import { getToken, clearAuth } from "./auth";

function ResolveApiBaseUrl(): string {
  // If the user hasn't configured a local backend URL in .env, default to the production Render server
  // to prevent "Network Error" (Connection Refused) when running frontend on localhost without a local backend.
  let RawBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://mathpath-backend.onrender.com/api").trim();
  
  // Auto-correct any leftover bad urls
  if (RawBaseUrl === "http://localhost:8000" && process.env.NODE_ENV === "production") {
      RawBaseUrl = "https://mathpath-backend.onrender.com/api";
  }

  const CleanBaseUrl = RawBaseUrl.replace(/\/+$/, "");
  return CleanBaseUrl.endsWith("/api") ? CleanBaseUrl : `${CleanBaseUrl}/api`;
}

const DEFAULT_API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || "90000");

export const api = axios.create({
  baseURL: ResolveApiBaseUrl(),
  timeout: DEFAULT_API_TIMEOUT_MS
});

api.interceptors.request.use((config) => {
  const RequestConfig = config as typeof config & { skipAuth?: boolean };
  if (RequestConfig.skipAuth) {
    if (config.headers) {
      delete config.headers.Authorization;
    }
    return config;
  }

  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      clearAuth();
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const Data = error.response?.data as any;
    const Detail = Data?.detail;
    const DetailMessage = typeof Detail === "string" ? Detail : Detail?.message;
    const DetailCode = typeof Detail === "object" ? Detail?.code : undefined;
    const ErrorMessage = Data?.error?.message || Data?.message || DetailMessage;
    if (ErrorMessage && DetailCode) return `${ErrorMessage} (${DetailCode})`;
    if (error.code === "ECONNABORTED") {
      return "The secure server is taking longer than expected. Please wait a moment and try again.";
    }
    if (!error.response && error.message === "Network Error") {
      return "The secure server is temporarily unreachable. Please wait a moment and try again.";
    }
    return ErrorMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
