import { Platform } from "react-native";

import { dimeApi } from "@/lib/api/dimeApi";

type ProfileAvatarUploadResponse = {
  avatar_url: string;
};

function normalizeLocalFileUri(uri: string): string {
  if (Platform.OS !== "android" || !uri.startsWith("file://")) {
    return uri;
  }
  return uri.replace(/^file:\/\//, "file://");
}

/**
 * Upload currently selected avatar image URL to backend storage.
 * Backend stores object in Supabase bucket and returns canonical avatar_url.
 */
export async function uploadProfileAvatarFromUrl(
  imageUrl: string,
): Promise<ProfileAvatarUploadResponse> {
  const { data } = await dimeApi.post<ProfileAvatarUploadResponse>(
    "/api/v1/profile/avatar/from-url",
    { image_url: imageUrl },
  );
  return data;
}

/**
 * Upload a local image (camera roll / picker) as the profile avatar.
 */
export async function uploadProfileAvatarFromFile(
  fileUri: string,
  mimeType = "image/jpeg",
): Promise<ProfileAvatarUploadResponse> {
  const form = new FormData();
  form.append("file", {
    uri: normalizeLocalFileUri(fileUri),
    name: "avatar.jpg",
    type: mimeType,
  } as unknown as Blob);

  const { data } = await dimeApi.post<ProfileAvatarUploadResponse>(
    "/api/v1/profile/avatar",
    form,
    { timeout: 60_000 },
  );
  return data;
}

export function isLocalImageUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  return (
    lower.startsWith("file://") ||
    lower.startsWith("content://") ||
    lower.startsWith("ph://")
  );
}
