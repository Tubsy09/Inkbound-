import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

import { getAuthToken } from "@/src/api/client";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

// Requests library permission with a graceful, contextual flow.
async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (req.granted) return true;
  }
  // Permanently blocked
  Alert.alert(
    "Photo access needed",
    "Allow photo access to upload portfolio images.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ],
  );
  return false;
}

export type UploadResult = { path: string; url: string };

// Picks one image and uploads it to the backend object-storage endpoint.
// Returns the absolute display URL, or null if cancelled/denied.
export async function pickAndUpload(token: string | null): Promise<string | null> {
  const ok = await ensureLibraryPermission();
  if (!ok) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const name = asset.fileName || `photo_${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri: asset.uri, name, type } as any);
  }

  const headers: Record<string, string> = {};
  const authToken = token ?? getAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const r = await fetch(`${BASE}/api/upload`, { method: "POST", headers, body: form });
  if (!r.ok) throw new Error("Upload failed");
  const data: UploadResult = await r.json();
  return `${BASE}${data.url}`;
}
