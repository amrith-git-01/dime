import axios, { type AxiosInstance } from "axios";

import { supabase } from "@/lib/supabase/client";

export function getDimeApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

/** Same bearer token axios uses; needed for `fetch` uploads (RN FormData + axios XHR is unreliable). */
export async function getDimeAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

export const dimeApi: AxiosInstance = axios.create({
  baseURL: getDimeApiBaseUrl(),
  timeout: 45_000,
});

if (__DEV__) {
  if (!getDimeApiBaseUrl()) {
    console.warn(
      "[dimeApi] EXPO_PUBLIC_API_BASE_URL is empty — requests will fail.",
    );
  }
}

dimeApi.interceptors.request.use(async (config) => {
  const auth = await getDimeAuthHeaders();
  if (auth.Authorization) {
    config.headers.set("Authorization", auth.Authorization);
  }

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }

  return config;
});
