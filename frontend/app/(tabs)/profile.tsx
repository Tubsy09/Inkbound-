import { Image } from "expo-image";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { PrimaryButton } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const rows = [
    { icon: "email-outline" as const, label: "Email", value: user?.email ?? "" },
    { icon: "account-outline" as const, label: "Account type", value: user?.role === "artist" ? "Artist / Studio" : "Client" },
    { icon: "shield-check-outline" as const, label: "Member", value: "InkBound verified" },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: bottomChrome + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.hero}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{(user?.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name}</Text>
        <View style={styles.roleBadge}>
          <Icon name={user?.role === "artist" ? "brush-variant" : "account-heart-outline"} size={14} color={colors.onBrandTertiary} />
          <Text style={styles.roleBadgeText}>{user?.role === "artist" ? "Artist" : "Client"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
            <Icon name={r.icon} size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.signout}>
        <PrimaryButton testID="signout-btn" label="Sign Out" variant="secondary" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 30, paddingHorizontal: 20, marginBottom: 20 },
  hero: { alignItems: "center", gap: 10, marginBottom: 28 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceTertiary },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 40 },
  name: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 24 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleBadgeText: { color: colors.onBrandTertiary, fontFamily: fonts.medium, fontSize: 13 },
  card: {
    marginHorizontal: 20,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  rowValue: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 15, marginTop: 2 },
  signout: { paddingHorizontal: 20, marginTop: 28 },
}));
