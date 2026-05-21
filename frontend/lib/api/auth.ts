import { api } from "@/lib/api";
import type { LoginResponse, CurrentUser } from "@/types/auth";

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", { identifier, password });
  return data;
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await api.get<CurrentUser>("/auth/me");
  return data;
}


export async function uploadProfilePhoto(file: File): Promise<{ updated: boolean; photoUrl: string; user: CurrentUser }> {
  const FormPayload = new FormData();
  FormPayload.append("file", file);
  const { data } = await api.post<{ updated: boolean; photoUrl: string; user: CurrentUser }>("/auth/profile-photo", FormPayload, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ updated: boolean; message: string }> {
  const { data } = await api.post<{ updated: boolean; message: string }>("/auth/change-password", payload);
  return data;
}
