import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  testID,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  variant?: "primary" | "secondary";
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isSecondary = variant === "secondary";
  const handle = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };
  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isSecondary ? styles.btnSecondary : styles.btnPrimary,
        (disabled || loading) && styles.btnDisabled,
        pressed && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.onSurface : colors.onBrandPrimary} />
      ) : (
        <Text style={[styles.btnText, isSecondary ? styles.btnTextSecondary : styles.btnTextPrimary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: colors.warning, fg: colors.onWarning, label: "Pending" },
    confirmed: { bg: colors.success, fg: colors.onSuccess, label: "Confirmed" },
    declined: { bg: colors.error, fg: colors.onError, label: "Declined" },
    cancelled: { bg: colors.surfaceTertiary, fg: colors.muted, label: "Cancelled" },
    completed: { bg: colors.brandTertiary, fg: colors.onBrandTertiary, label: "Completed" },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function GradientScrim() {
  return (
    <LinearGradient
      colors={["transparent", "rgba(10,10,10,0.55)", "rgba(10,10,10,0.96)"]}
      locations={[0, 0.55, 1]}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "100%" }}
    />
  );
}

export function Rating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.ratingRow}>
      <Icon name="star" size={size} color={colors.brandPrimary} />
      <Text style={[styles.ratingText, { fontSize: size }]}>{value?.toFixed(1) ?? "–"}</Text>
      {count != null ? <Text style={[styles.ratingCount, { fontSize: size - 2 }]}>({count})</Text> : null}
    </View>
  );
}

export function StyleChips({
  styles: styleList,
  selected,
  onSelect,
}: {
  styles: string[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRowContent}
      style={styles.chipRow}
    >
      {styleList.map((s) => {
        const active = s === selected;
        return (
          <Pressable
            key={s}
            testID={`style-chip-${s}`}
            onPress={() => onSelect(s)}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>{s}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnSecondary: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnText: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.2 },
  btnTextPrimary: { color: colors.onBrandPrimary },
  btnTextSecondary: { color: colors.onSurface },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { color: colors.onSurface, fontFamily: fonts.medium },
  ratingCount: { color: colors.muted, fontFamily: fonts.body },

  chipRow: { flexGrow: 0 },
  chipRowContent: { gap: 8, paddingHorizontal: 20, alignItems: "center", height: 56 },
  chip: {
    height: 36,
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipInactive: { backgroundColor: "transparent", borderColor: colors.border },
  chipText: { fontFamily: fonts.medium, fontSize: 13 },
  chipTextActive: { color: colors.onBrandPrimary },
  chipTextInactive: { color: colors.onSurfaceSecondary },
}));
