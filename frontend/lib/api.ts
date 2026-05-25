import axios from "axios";
import { getToken, clearAuth } from "./auth";

function ResolveApiBaseUrl(): string {
  const RawBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").trim();
  const CleanBaseUrl = RawBaseUrl.replace(/\/+$/, "");
  return CleanBaseUrl.endsWith("/api") ? CleanBaseUrl : `${CleanBaseUrl}/api`;
}

const DEFAULT_API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || "60000");

export const api = axios.create({
  baseURL: ResolveApiBaseUrl(),
  timeout: DEFAULT_API_TIMEOUT_MS
});

api.interceptors.request.use((config) => {
  const RequestConfig = config as typeof config & { skipAuth?: boolean };
  if (RequestConfig.skipAuth) {
    delete config.headers.Authorization;
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
      return "The server is taking longer than expected. Please wait for the latest deployment to finish, then refresh and try again.";
    }
    if (!error.response && error.message === "Network Error") {
      return "The server is temporarily unreachable. Please check the backend deployment status and try again.";
    }
    return ErrorMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
