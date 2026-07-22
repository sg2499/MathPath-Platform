import axios from "axios";
import { api } from "@/lib/api";
import type { LoginResponse, LoginResult, CurrentUser } from "@/types/auth";

const PROFILE_PHOTO_MAX_DIMENSION = 360;
const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 260_000;
const PROFILE_PHOTO_UPLOAD_TIMEOUT_MS = 60_000;
const LOGIN_REQUEST_TIMEOUT_MS = 90_000;
const AUTH_HEALTH_TIMEOUT_MS = 15_000;
const AUTH_RETRY_DELAYS_MS = [350, 700, 1_200];
const LOGIN_MAX_ATTEMPTS = 3;
const AUTH_WARMUP_MAX_ATTEMPTS = 3;

let AuthWarmupPromise: Promise<boolean> | null = null;

type RetryableAuthError = {
  response?: { status?: number };
  code?: string;
  message?: string;
};

function isRetryableAuthError(ErrorValue: unknown): boolean {
  if (!axios.isAxiosError(ErrorValue)) return false;

  const Status = (ErrorValue as RetryableAuthError).response?.status;
  if (Status) {
    return [408, 429, 502, 503, 504].includes(Status);
  }

  return ErrorValue.code === "ECONNABORTED" || ErrorValue.message === "Network Error";
}

function Sleep(DurationMs: number): Promise<void> {
  return new Promise((Resolve) => {
    if (typeof window === "undefined") {
      Resolve();
      return;
    }
    window.setTimeout(Resolve, DurationMs);
  });
}

async function waitBeforeRetry(AttemptIndex: number): Promise<void> {
  const DelayMs = AUTH_RETRY_DELAYS_MS[Math.min(AttemptIndex, AUTH_RETRY_DELAYS_MS.length - 1)] || 700;
  await Sleep(DelayMs);
}

async function executeAuthWarmup(): Promise<boolean> {
  for (let AttemptIndex = 0; AttemptIndex < AUTH_WARMUP_MAX_ATTEMPTS; AttemptIndex += 1) {
    try {
      await api.get("/health", {
        timeout: AUTH_HEALTH_TIMEOUT_MS,
        skipAuth: true,
      } as any);
      return true;
    } catch (ErrorValue) {
      if (AttemptIndex === AUTH_WARMUP_MAX_ATTEMPTS - 1 || !isRetryableAuthError(ErrorValue)) {
        return false;
      }
      await waitBeforeRetry(AttemptIndex);
    }
  }

  return false;
}

export async function warmupAuthApi(): Promise<boolean> {
  if (!AuthWarmupPromise) {
    AuthWarmupPromise = executeAuthWarmup().finally(() => {
      AuthWarmupPromise = null;
    });
  }

  return AuthWarmupPromise;
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const Payload = { identifier: identifier.trim(), password };
  let LastNetworkError: unknown = null;

  void warmupAuthApi();

  for (let AttemptIndex = 0; AttemptIndex < LOGIN_MAX_ATTEMPTS; AttemptIndex += 1) {
    try {
      const { data } = await api.post<LoginResult>("/auth/login", Payload, {
        timeout: LOGIN_REQUEST_TIMEOUT_MS,
        skipAuth: true,
      } as any);
      return data;
    } catch (ErrorValue) {
      if (!isRetryableAuthError(ErrorValue)) {
        throw ErrorValue;
      }

      LastNetworkError = ErrorValue;
      await warmupAuthApi();
      await waitBeforeRetry(AttemptIndex);
    }
  }

  throw LastNetworkError || new Error("The secure login service is still waking up. Please try again in a few seconds.");
}

export async function verifyTwoFactorLogin(challengeToken: string, code: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(
    "/auth/2fa/verify-login",
    { challengeToken, code: code.trim() },
    { timeout: LOGIN_REQUEST_TIMEOUT_MS, skipAuth: true } as any,
  );
  return data;
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await api.get<CurrentUser>("/auth/me");
  return data;
}

function LoadImageFromFile(FileValue: File): Promise<HTMLImageElement> {
  return new Promise((Resolve, Reject) => {
    const Reader = new FileReader();
    Reader.onerror = () => Reject(new Error("Could not read the selected image."));
    Reader.onload = () => {
      const ImageElement = new Image();
      ImageElement.onload = () => Resolve(ImageElement);
      ImageElement.onerror = () => Reject(new Error("Could not process the selected image."));
      ImageElement.src = String(Reader.result || "");
    };
    Reader.readAsDataURL(FileValue);
  });
}

function CanvasToBlob(CanvasElement: HTMLCanvasElement, Quality: number): Promise<Blob> {
  return new Promise((Resolve, Reject) => {
    CanvasElement.toBlob(
      (BlobValue) => {
        if (!BlobValue) {
          Reject(new Error("Could not compress the selected image."));
          return;
        }
        Resolve(BlobValue);
      },
      "image/jpeg",
      Quality,
    );
  });
}

async function CompressProfilePhoto(FileValue: File): Promise<File> {
  if (typeof window === "undefined") return FileValue;

  const ImageElement = await LoadImageFromFile(FileValue);
  const Scale = Math.min(
    1,
    PROFILE_PHOTO_MAX_DIMENSION / Math.max(ImageElement.width, ImageElement.height),
  );
  const TargetWidth = Math.max(1, Math.round(ImageElement.width * Scale));
  const TargetHeight = Math.max(1, Math.round(ImageElement.height * Scale));

  const CanvasElement = document.createElement("canvas");
  CanvasElement.width = TargetWidth;
  CanvasElement.height = TargetHeight;

  const Context = CanvasElement.getContext("2d");
  if (!Context) return FileValue;

  Context.fillStyle = "#ffffff";
  Context.fillRect(0, 0, TargetWidth, TargetHeight);
  Context.drawImage(ImageElement, 0, 0, TargetWidth, TargetHeight);

  const QualitySteps = [0.78, 0.68, 0.58, 0.48];
  let BestBlob = await CanvasToBlob(CanvasElement, QualitySteps[0]);

  for (const Quality of QualitySteps.slice(1)) {
    if (BestBlob.size <= PROFILE_PHOTO_MAX_UPLOAD_BYTES) break;
    BestBlob = await CanvasToBlob(CanvasElement, Quality);
  }

  if (BestBlob.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES && FileValue.size <= PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
    return FileValue;
  }

  const CleanName = (FileValue.name || "profile-photo").replace(/\.[^.]+$/, "");
  return new File([BestBlob], `${CleanName}.jpg`, { type: "image/jpeg" });
}

export async function uploadProfilePhoto(file: File): Promise<{ updated: boolean; photoUrl: string; user: CurrentUser }> {
  const PreparedFile = await CompressProfilePhoto(file);

  if (PreparedFile.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
    throw new Error("Profile photo is still too large after compression. Please choose a smaller image.");
  }

  const FormPayload = new FormData();
  FormPayload.append("file", PreparedFile);
  const { data } = await api.post<{ updated: boolean; photoUrl: string; user: CurrentUser }>("/auth/profile-photo", FormPayload, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: PROFILE_PHOTO_UPLOAD_TIMEOUT_MS,
  });
  return data;
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ updated: boolean; message: string }> {
  const { data } = await api.post<{ updated: boolean; message: string }>("/auth/change-password", payload);
  return data;
}

export async function logoutAllSessions(): Promise<{ updated: boolean; message: string }> {
  const { data } = await api.post<{ updated: boolean; message: string }>("/auth/logout-all-sessions", {});
  return data;
}

export type TwoFactorSetupResponse = { secret: string; qrCodeDataUrl: string; otpauthUri: string };

export async function startTwoFactorSetup(): Promise<TwoFactorSetupResponse> {
  const { data } = await api.post<TwoFactorSetupResponse>("/auth/2fa/setup", {});
  return data;
}

export async function enableTwoFactor(code: string): Promise<{ updated: boolean; message: string; backupCodes: string[] }> {
  const { data } = await api.post<{ updated: boolean; message: string; backupCodes: string[] }>("/auth/2fa/enable", { code });
  return data;
}

export async function disableTwoFactor(password: string): Promise<{ updated: boolean; message: string }> {
  const { data } = await api.post<{ updated: boolean; message: string }>("/auth/2fa/disable", { password });
  return data;
}
