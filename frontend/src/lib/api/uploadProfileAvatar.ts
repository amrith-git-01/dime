import { dimeApi } from "@/lib/api/dimeApi";

type ProfileAvatarUploadResponse = {
  avatar_url: string;
};

/**
 * Upload currently selected avatar image URL to backend storage.
 * Backend stores object in Supabase bucket and returns canonical avatar_url.
 */
export async function uploadProfileAvatarFromUrl(
  imageUrl: string,
): Promise<ProfileAvatarUploadResponse> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Could not fetch selected avatar image.");
  }

  const imageBlob = await imageResponse.blob();
  const formData = new FormData();
  formData.append("file", imageBlob, "avatar.png");

  const { data } = await dimeApi.post<ProfileAvatarUploadResponse>(
    "/api/v1/profile/avatar",
    formData,
  );
  return data;
}

