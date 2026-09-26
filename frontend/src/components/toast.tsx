import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, useTheme } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastContextType = { show: (message: string, type?: ToastType) => void };

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(
    (text: string, type: ToastType = "info") => {
      setMsg({ text, type });
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== "web" }).start(
          () => setMsg(null),
        );
      }, 2800);
    },
    [opacity],
  );

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const accent =
    msg?.type === "success" ? colors.success : msg?.type === "error" ? colors.error : colors.brandPrimary;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + 12, opacity }]}
          testID="toast"
        >
          <View style={[styles.toast, { borderLeftColor: accent }]}>
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 9999 },
  toast: {
    backgroundColor: colors.surfaceTertiary,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 440,
    width: "100%",
  },
  text: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
}));
