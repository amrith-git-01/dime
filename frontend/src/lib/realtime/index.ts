import { AppState } from "react-native";

import { getDimeApiBaseUrl } from "@/lib/api/baseUrl";
import { getAccessToken } from "@/lib/auth/session";
import { reportError } from "@/lib/reportError";
import { useAuthSessionStore } from "@/stores/authSessionStore";

import { RealtimeClient, type SocketLike } from "./realtimeClient";

export type {
  RealtimeEvent,
  RealtimeSubscription,
  RealtimeTable,
} from "./realtimeClient";

/** React Native's WebSocket, typed with its non-standard `headers` option. */
const RnWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: string[],
  options: { headers: Record<string, string> },
) => SocketLike;

/** Subprotocol offered at the handshake (versioning); the token goes in the Authorization header. */
const SUBPROTOCOL = "dime.v1";

/**
 * The app's single live-update connection. React Native's WebSocket accepts a non-standard third
 * argument with request headers, so the access token travels in `Authorization: Bearer`, never in
 * the URL. (The API also accepts `Sec-WebSocket-Protocol: dime.v1, bearer.<token>`; unused here.)
 */
export const realtimeClient = new RealtimeClient({
  getAccessToken,
  baseUrl: getDimeApiBaseUrl,
  createSocket: (url, token) =>
    new RnWebSocket(url, [SUBPROTOCOL], {
      headers: { Authorization: `Bearer ${token}` },
    }),
  onAccessTokenChange: (listener) =>
    useAuthSessionStore.subscribe((state, prev) => {
      if (state.session?.access_token !== prev.session?.access_token) {
        listener(state.session?.access_token ?? null);
      }
    }),
  onAppActive: (listener) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        listener();
      }
    });
    return () => subscription.remove();
  },
  onError: (error, context) => reportError(error, context),
});
