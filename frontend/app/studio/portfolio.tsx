import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { pickAndUpload } from "@/src/api/uploads";
import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const { width } = Dimensions.get("window");

export default function PortfolioManager() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["studio", "me"],
    queryFn: () => api<{ artist: any; parlour: any }>("/api/studio/me"),
  });

  const addPhoto = useMutation({
    mutationFn: (url: string) => api("/api/studio/portfolio", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: () => {
      toast.show("Added to portfolio", "success");
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const removePhoto = useMutation({
    mutationFn: (url: string) => api("/api/studio/portfolio/remove", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: () => {
      toast.show("Photo removed", "info");
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const onAdd = async () => {
    setUploading(true);
    try {
      const url = await pickAndUpload(null);
      if (url) addPhoto.mutate(url);
    } catch (e: any) {
      toast.show(e?.message ?? "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const portfolio: string[] = data?.artist?.portfolio ?? [];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="portfolio-back" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <Pressable testID="portfolio-preview" onPress={() => user?.artist_id && router.push(`/artist/${user.artist_id}`)} style={styles.backBtn}>
          <Icon name="eye-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <Pressable testID="add-portfolio" style={styles.addCard} onPress={onAdd} disabled={uploading}>
            {uploading ? <ActivityIndicator color={colors.brandPrimary} /> : (
              <>
                <Icon name="image-plus" size={28} color={colors.brandPrimary} />
                <Text style={styles.addText}>Upload a work photo</Text>
              </>
            )}
          </Pressable>
          <Pressable testID="preview-public" style={styles.previewBtn} onPress={() => user?.artist_id && router.push(`/artist/${user.artist_id}`)}>
            <Icon name="account-eye-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.previewText}>Preview how clients see your profile</Text>
            <Icon name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
          {portfolio.length ? <Text style={styles.hint}>Tap the × on a photo to remove it.</Text> : null}
          <View style={styles.grid}>
            {portfolio.map((u, i) => (
              <View key={i} style={styles.imgWrap}>
                <Image source={{ uri: u }} style={styles.img} contentFit="cover" transition={200} />
                <Pressable
                  testID={`remove-photo-${i}`}
                  style={styles.removeBtn}
                  hitSlop={8}
                  onPress={() => removePhoto.mutate(u)}
                >
                  <Icon name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
          {portfolio.length === 0 ? <Text style={styles.empty}>No photos yet — add your best work.</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  addCard: { height: 120, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed", backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  addText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 },
  previewText: { flex: 1, color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imgWrap: { width: (width - 40) / 2 },
  img: { width: "100%", height: 180, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  removeBtn: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(10,10,10,0.7)", alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center", paddingVertical: 24 },
}));
