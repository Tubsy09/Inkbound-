import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { pickAndUpload } from "@/src/api/uploads";
import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { StudioMe } from "@/src/types";

const STYLE_OPTIONS = ["Traditional", "Realism", "Blackwork", "Fine Line", "Japanese", "Neo-Traditional", "Watercolor", "Geometric"];

export default function StudioSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["studio", "me"],
    queryFn: () => api<StudioMe>("/api/studio/me"),
    enabled: !!user?.artist_id,
  });

  // Artists who work at someone else's studio only edit their own profile here; the studio belongs to its owner.
  const editsStudio = !user?.artist_id || !existing?.parlour || existing.is_owner;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tagline, setTagline] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [selStyles, setSelStyles] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"cover" | "avatar" | null>(null);

  useEffect(() => {
    if (existing?.parlour) {
      setName(existing.parlour.name ?? "");
      setAddress(existing.parlour.address ?? "");
      setTagline(existing.parlour.tagline ?? "");
      setSelStyles(existing.parlour.styles ?? []);
      setCover(existing.parlour.cover ?? null);
    }
    if (existing?.artist) {
      setSpecialty(existing.artist.specialty ?? "");
      setBio(existing.artist.bio ?? "");
      setAvatar(existing.artist.avatar ?? null);
    }
  }, [existing]);

  const toggleStyle = (s: string) =>
    setSelStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const upload = async (which: "cover" | "avatar") => {
    setUploading(which);
    try {
      const url = await pickAndUpload(null);
      if (url) {
        which === "cover" ? setCover(url) : setAvatar(url);
        toast.show("Photo uploaded", "success");
      }
    } catch (e: any) {
      toast.show(e?.message ?? "Upload failed", "error");
    } finally {
      setUploading(null);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api("/api/studio/setup", {
        method: "POST",
        body: JSON.stringify({
          name,
          address,
          tagline,
          specialty,
          bio,
          styles: selStyles,
          cover,
          avatar,
        }),
      }),
    onSuccess: async () => {
      toast.show(editsStudio ? "Studio saved" : "Profile saved", "success");
      await refreshUser();
      qc.invalidateQueries();
      router.replace("/(tabs)/dashboard");
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not save", "error"),
  });

  const onSave = () => {
    if (editsStudio && (!name.trim() || !address.trim())) {
      toast.show("Studio name and address are required", "error");
      return;
    }
    if (editsStudio && selStyles.length === 0) {
      toast.show("Pick at least one style", "error");
      return;
    }
    save.mutate();
  };

  if (user?.artist_id && isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="setup-back" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{!editsStudio ? "Edit your profile" : existing?.parlour ? "Edit studio" : "Set up your studio"}</Text>
        <View style={{ width: 42 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, gap: 18 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {editsStudio ? (
        <Pressable testID="upload-cover" style={styles.coverUpload} onPress={() => upload("cover")}>
          {cover ? <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" /> : null}
          <View style={styles.coverOverlay}>
            {uploading === "cover" ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Icon name="camera-plus-outline" size={26} color="#FFF" />
                <Text style={styles.coverText}>{cover ? "Change cover photo" : "Add studio cover photo"}</Text>
              </>
            )}
          </View>
        </Pressable>
        ) : (
          <Text style={styles.memberNote}>You work at {existing?.parlour?.name}. The studio's name, photos, services and hours are managed by its owner.</Text>
        )}

        <View style={styles.avatarRow}>
          <Pressable testID="upload-avatar" onPress={() => upload("avatar")} style={styles.avatarWrap}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" /> : <Icon name="account-plus-outline" size={28} color={colors.brandPrimary} />}
            {uploading === "avatar" ? <View style={styles.avatarLoading}><ActivityIndicator color="#FFF" /></View> : null}
          </Pressable>
          <Text style={styles.avatarHint}>Your artist photo</Text>
        </View>

        {editsStudio ? (
          <>
            <Field label="Studio name" value={name} onChange={setName} placeholder="e.g. Iron & Ink Collective" testID="input-studio-name" />
            <Field label="Address" value={address} onChange={setAddress} placeholder="Street, City, State" testID="input-studio-address" />
            <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="One line about your studio" testID="input-studio-tagline" />
          </>
        ) : null}
        <Field label="Your specialty" value={specialty} onChange={setSpecialty} placeholder="e.g. Fine Line & Blackwork" testID="input-studio-specialty" />
        <Field label="Bio" value={bio} onChange={setBio} placeholder="Tell clients about your work" multiline testID="input-studio-bio" />

        {editsStudio ? (
        <View>
          <Text style={styles.label}>Styles you offer</Text>
          <View style={styles.styleGrid}>
            {STYLE_OPTIONS.map((s) => {
              const active = selStyles.includes(s);
              return (
                <Pressable key={s} testID={`studio-style-${s}`} onPress={() => toggleStyle(s)} style={[styles.styleChip, active && styles.styleActive]}>
                  <Text style={[styles.styleText, active && styles.styleTextActive]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton testID="save-studio" label={user?.artist_id && existing?.parlour ? "Save changes" : "Create studio"} onPress={onSave} loading={save.isPending} />
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.inputMulti]}
        multiline={multiline}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  coverUpload: { height: 170, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  coverImg: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any) },
  coverOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(10,10,10,0.45)" },
  coverText: { color: "#FFF", fontFamily: fonts.medium, fontSize: 14 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarLoading: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any), alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,10,10,0.5)" },
  memberNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  avatarHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  label: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: 12, height: 52, paddingHorizontal: 16, color: colors.onSurface, fontFamily: fonts.body, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  inputMulti: { height: 100, paddingTop: 14, textAlignVertical: "top" },
  styleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  styleChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  styleActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  styleText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  styleTextActive: { color: colors.onBrandPrimary },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
}));
