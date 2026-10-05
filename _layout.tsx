import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/toast";
import { AuthProvider, useAuth } from "@/src/auth/auth-context";
import { CurrencyProvider } from "@/src/currency";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "login";
    if (!user && !inAuth) {
      router.replace("/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="parlour/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="artist/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="booking/[artistId]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="studio/setup" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="studio/portfolio" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="studio/hours" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="studio/services" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="studio/join" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="studio/team" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="payment-result" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces: require("../assets/fonts/Fraunces.ttf"),
    Satoshi: require("../assets/fonts/Satoshi-Regular.ttf"),
    "Satoshi-Medium": require("../assets/fonts/Satoshi-Medium.ttf"),
    "Satoshi-Bold": require("../assets/fonts/Satoshi-Bold.ttf"),
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <CurrencyProvider>
                    <StatusBar style="light" />
                    <AuthGate />
                  </CurrencyProvider>
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
