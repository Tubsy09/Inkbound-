import { Alert, Platform } from "react-native";

/** Ask "are you sure?" on native (Alert) and web (window.confirm, since Alert buttons don't work there). */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, cancelLabel = "Keep booking") {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
