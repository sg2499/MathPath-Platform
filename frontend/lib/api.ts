import axios from "axios";
import { getToken, clearAuth } from "./auth";

function ResolveApiBaseUrl(): string {
  const RawBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").trim();
  const CleanBaseUrl = RawBaseUrl.replace(/\/+$/, "");
  return CleanBaseUrl.endsWith("/api") ? CleanBaseUrl : `${CleanBaseUrl}/api`;
}

export const api = axios.create({
  baseURL: ResolveApiBaseUrl(),
  timeout: 15000
});

api.interceptors.request.use((config) => {
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
    return ErrorMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
