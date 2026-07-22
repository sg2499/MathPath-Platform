import axios from "axios";
import { getActiveRoleHeaderValue, getCsrfToken, clearSession } from "./auth";

// 2026-07-22 security hardening: relative, same-origin base URL. The actual
// backend is reached via the Next.js rewrite in next.config.mjs, which
// proxies /api/* to the real Render URL server-side -- the browser itself
// never makes a cross-origin request, which is what lets the session cookie
// be first-party (SameSite=Lax) instead of needing the cross-site None that
// Safari/iOS block by default. See next.config.mjs's ResolveBackendOrigin()
// for where the real backend URL is actually configured.
const DEFAULT_API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || "90000");

export const api = axios.create({
  baseURL: "/api",
  timeout: DEFAULT_API_TIMEOUT_MS,
  // Session now lives in an httpOnly cookie (see backend/app/core/cookies.py)
  // instead of a token read out of localStorage -- withCredentials is what
  // makes the browser actually attach it on every request.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const RequestConfig = config as typeof config & { skipAuth?: boolean };
  if (RequestConfig.skipAuth) {
    return config;
  }

  if (!config.headers) {
    config.headers = {} as typeof config.headers;
  }

  // Non-secret hint telling the backend which role's session cookie applies
  // to this request (a person can be logged into admin/teacher/student at
  // once in different tabs -- see cookies.py's read_session_token()). Only
  // set if a call site hasn't already provided an explicit override (e.g.
  // shared routes like /assessment-result/[attemptId] that aren't under a
  // role-prefixed path).
  if (!config.headers["X-Auth-Role"] && !config.headers["x-auth-role"]) {
    const RoleHint = getActiveRoleHeaderValue();
    if (RoleHint) config.headers["X-Auth-Role"] = RoleHint;
  }

  // CSRF double-submit token, required on every mutating request once a
  // cookie session exists -- see get_current_user()'s CSRF check in
  // backend/app/dependencies.py. Harmless no-op before login (no cookie yet).
  const Method = (config.method || "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(Method)) {
    const CsrfToken = getCsrfToken();
    if (CsrfToken) config.headers["X-CSRF-Token"] = CsrfToken;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      clearSession();
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
