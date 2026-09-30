import { Platform, Share } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export function profileUrl(kind: "artist" | "parlour", id: string) {
  return `${BASE}/${kind}/${id}`;
}

// Shares a public profile link. Returns "shared" | "copied" | "cancelled".
export async function shareProfile(
  kind: "artist" | "parlour",
  id: string,
  name: string,
): Promise<"shared" | "copied" | "cancelled"> {
  const url = profileUrl(kind, id);
  const message = `Check out ${name} on InkBound — book your next tattoo: ${url}`;

  if (Platform.OS === "web") {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    try {
      if (nav?.share) {
        await nav.share({ title: name, text: message, url });
        return "shared";
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        return "copied";
      }
    } catch {
      return "cancelled";
    }
    return "cancelled";
  }

  try {
    const res = await Share.share({ message, url });
    return res.action === Share.dismissedAction ? "cancelled" : "shared";
  } catch {
    return "cancelled";
  }
}
