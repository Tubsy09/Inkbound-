import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api } from "@/src/api/client";

const ORIGIN = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type CheckoutCreate = { url: string; session_id: string; amount: number };

export async function createDeposit(bookingId: string): Promise<CheckoutCreate> {
  return api<CheckoutCreate>("/api/checkout/create", {
    method: "POST",
    body: JSON.stringify({ booking_id: bookingId, origin_url: ORIGIN }),
  });
}

export type CheckoutStatus = { status: string | null; payment_status: string; amount_total: number | null };

export async function getStatus(sessionId: string): Promise<CheckoutStatus> {
  return api<CheckoutStatus>(`/api/checkout/status/${encodeURIComponent(sessionId)}`);
}

// Polls up to ~60s. Returns final status.
export async function pollStatus(
  sessionId: string,
  onUpdate?: (s: CheckoutStatus) => void,
): Promise<CheckoutStatus> {
  for (let i = 0; i < 30; i++) {
    const s = await getStatus(sessionId);
    onUpdate?.(s);
    if (s.payment_status === "paid" || s.status === "expired") return s;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "timeout", payment_status: "unpaid", amount_total: null };
}

// Opens Stripe checkout. On web the page navigates away (payment-result handles
// the return). On native it opens the system browser; caller should poll after.
export async function openDeposit(url: string) {
  if (Platform.OS === "web") {
    window.location.assign(url);
  } else {
    await WebBrowser.openBrowserAsync(url);
  }
}
