import axios from "axios";
import { api } from "@/lib/api";
import type { LoginResponse, CurrentUser } from "@/types/auth";

const PROFILE_PHOTO_MAX_DIMENSION = 360;
const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 260_000;
const PROFILE_PHOTO_UPLOAD_TIMEOUT_MS = 60_000;
const LOGIN_REQUEST_TIMEOUT_MS = 25_000;
const AUTH_HEALTH_TIMEOUT_MS = 8_000;
const AUTH_RETRY_DELAYS_MS = [450, 900, 1_600, 2_800];

function shouldRetryLogin(ErrorValue: unknown): boolean {
  if (!axios.isAxiosError(ErrorValue)) return false;
  if (ErrorValue.response) return false;
  return ErrorValue.code === "ECONNABORTED" || ErrorValue.message === "Network Error";
}

function Sleep(DurationMs: number): Promise<void> {
  return new Promise((Resolve) => window.setTimeout(Resolve, DurationMs));
}

async function waitBeforeRetry(AttemptIndex: number): Promise<void> {
  if (typeof window === "undefined") return;
  const DelayMs = AUTH_RETRY_DELAYS_MS[Math.min(AttemptIndex, AUTH_RETRY_DELAYS_MS.length - 1)] || 1_000;
  await Sleep(DelayMs);
}

export async function warmupAuthApi(): Promise<boolean> {
  for (let AttemptIndex = 0; AttemptIndex < 4; AttemptIndex += 1) {
    try {
      await api.get("/health", {
        timeout: AUTH_HEALTH_TIMEOUT_MS,
        skipAuth: true,
      } as any);
      return true;
    } catch (ErrorValue) {
      if (AttemptIndex === 3 || !shouldRetryLogin(ErrorValue)) {
        return false;
      }
      await waitBeforeRetry(AttemptIndex);
    }
  }

  return false;
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const Payload = { identifier, password };
  let LastNetworkError: unknown = null;

  for (let AttemptIndex = 0; AttemptIndex < 4; AttemptIndex += 1) {
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", Payload, {
        timeout: LOGIN_REQUEST_TIMEOUT_MS,
        skipAuth: true,
      } as any);
      return data;
    } catch (ErrorValue) {
      if (!shouldRetryLogin(ErrorValue)) {
        throw ErrorValue;
      }

      LastNetworkError = ErrorValue;
      await warmupAuthApi();
      await waitBeforeRetry(AttemptIndex);
    }
  }

  throw LastNetworkError || new Error("The secure login service is still waking up. Please try again in a few seconds.");
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
