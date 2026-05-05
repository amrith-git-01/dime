import axios, { isAxiosError, type AxiosInstance } from "axios";

import { supabase } from "@/lib/supabase/client";

const rawBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const dimeApi: AxiosInstance = axios.create({
  baseURL: rawBase ? rawBase.replace(/\/$/, "") : "",
  timeout: 45_000,
});

if (__DEV__) {
  if (!rawBase) {
    console.warn(
      "[dimeApi] EXPO_PUBLIC_API_BASE_URL is empty — requests will fail.",
    );
  }
  dimeApi.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (isAxiosError(error)) {
        const { config, message, code, response } = error;
        const path = config?.url ?? "";
        const base = config?.baseURL ?? "";
        console.warn("[dimeApi] request failed", {
          message,
          code,
          status: response?.status,
          url: `${base}${path}`,
        });
      }
      return Promise.reject(error);
    },
  );
}

dimeApi.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }

  return config;
});
