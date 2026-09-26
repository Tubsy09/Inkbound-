import { Image } from "expo-image";
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1775135981378-4e7c1767436d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { signInEmail, signUpEmail, signInGoogle } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "artist">("customer");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      toast.show("Enter email and password", "error");
      return;
    }
    if (mode === "register" && !name.trim()) {
      toast.show("Enter your name", "error");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await signInEmail(email.trim(), password);
      else await signUpEmail(name.trim(), email.trim(), password, role);
    } catch (e: any) {
      toast.show(e?.message ?? "Authentication failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      await signInGoogle();
    } catch (e: any) {
      toast.show(e?.message ?? "Google sign-in failed", "error");
    }
  };

  const fillDemo = (which: "customer" | "artist") => {
    setMode("login");
    setEmail(which === "artist" ? "artist@inkbound.com" : "customer@inkbound.com");
    setPassword("Passw0rd!");
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <View style={styles.heroScrim} />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        <Text style={styles.brand}>InkBound</Text>
        <Text style={styles.tagline}>Discover studios. Book your artist. Wear the art.</Text>

        <View style={styles.card}>
          <View style={styles.segment}>
            <Pressable
              testID="tab-login"
              style={[styles.segBtn, mode === "login" && styles.segActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.segText, mode === "login" && styles.segTextActive]}>Sign In</Text>
            </Pressable>
            <Pressable
              testID="tab-register"
              style={[styles.segBtn, mode === "register" && styles.segActive]}
              onPress={() => setMode("register")}
            >
              <Text style={[styles.segText, mode === "register" && styles.segTextActive]}>Create Account</Text>
            </Pressable>
          </View>

          {mode === "register" ? (
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                testID="input-name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="input-email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="input-password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {mode === "register" ? (
            <View style={styles.field}>
              <Text style={styles.label}>I am a</Text>
              <View style={styles.roleRow}>
                <Pressable
                  testID="role-customer"
                  style={[styles.roleBtn, role === "customer" && styles.roleActive]}
                  onPress={() => setRole("customer")}
                >
                  <Icon name="account-heart-outline" size={18} color={role === "customer" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                  <Text style={[styles.roleText, role === "customer" && styles.roleTextActive]}>Client</Text>
                </Pressable>
                <Pressable
                  testID="role-artist"
                  style={[styles.roleBtn, role === "artist" && styles.roleActive]}
                  onPress={() => setRole("artist")}
                >
                  <Icon name="brush-variant" size={18} color={role === "artist" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                  <Text style={[styles.roleText, role === "artist" && styles.roleTextActive]}>Artist</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <PrimaryButton
            testID="submit-auth"
            label={mode === "login" ? "Sign In" : "Create Account"}
            onPress={submit}
            loading={busy}
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable testID="google-signin" style={styles.googleBtn} onPress={google}>
            <Icon name="google" size={20} color={colors.onSurface} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>
        </View>

        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Try a demo account</Text>
          <View style={styles.demoRow}>
            <Pressable testID="demo-customer" style={styles.demoChip} onPress={() => fillDemo("customer")}>
              <Text style={styles.demoChipText}>Client demo</Text>
            </Pressable>
            <Pressable testID="demo-artist" style={styles.demoChip} onPress={() => fillDemo("artist")}>
              <Text style={styles.demoChipText}>Artist demo</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  heroScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 340,
    backgroundColor: "rgba(10,10,10,0.55)",
  },
  scroll: { paddingHorizontal: 20 },
  brand: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 44, letterSpacing: 0.5 },
  tagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 15, marginTop: 6, marginBottom: 24 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  segActive: { backgroundColor: colors.brandPrimary },
  segText: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  segTextActive: { color: colors.onBrandPrimary },
  field: { gap: 8 },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  input: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleRow: { flexDirection: "row", gap: 12 },
  roleBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleText: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  roleTextActive: { color: colors.onBrandPrimary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  googleBtn: {
    flexDirection: "row",
    gap: 10,
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  googleText: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  demoBox: { marginTop: 20, alignItems: "center", gap: 10 },
  demoTitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  demoRow: { flexDirection: "row", gap: 12 },
  demoChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  demoChipText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
}));
