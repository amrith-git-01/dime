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
  const { data } = await dimeApi.post<ProfileAvatarUploadResponse>(
    "/api/v1/profile/avatar/from-url",
    { image_url: imageUrl },
  );
  return data;
}
