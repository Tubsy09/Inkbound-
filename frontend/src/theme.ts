// InkBound design tokens — "6 Glass / Luxe" dark theme.
// Values come from /app/design_guidelines.json. Single dark theme.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0A0A0A",
  onSurface: "#EDEDED",
  surfaceSecondary: "#171717",
  onSurfaceSecondary: "#A3A3A3",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#8A8A8A",
  surfaceInverse: "#F5F5F0",
  onSurfaceInverse: "#0A0A0A",
  muted: "#808080",

  brand: "#D9B76A",
  onBrand: "#0F0F0F",
  brandPrimary: "#D9B76A",
  onBrandPrimary: "#0F0F0F",
  brandSecondary: "#A68A48",
  onBrandSecondary: "#0A0A0A",
  brandTertiary: "#4A4027",
  onBrandTertiary: "#D9B76A",

  success: "#287846",
  onSuccess: "#A3E6B8",
  warning: "#A3782E",
  onWarning: "#F5D69D",
  error: "#8A2E2E",
  onError: "#F5B8B8",
  info: "#4A4A4A",
  onInfo: "#D4D4D4",

  border: "#262626",
  borderStrong: "#404040",
  divider: "#1F1F1F",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Font families loaded in app/_layout.tsx via expo-font.
export const fonts = {
  display: "Fraunces",
  body: "Satoshi",
  medium: "Satoshi-Medium",
  bold: "Satoshi-Bold",
};
