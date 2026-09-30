import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { pickAndUpload } from "@/src/api/uploads";
import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function PortfolioManager() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["studio", "me"],
    queryFn: () => api<{ artist: any; parlour: any }>("/api/studio/me"),
  });

  useEffect(() => {
    if (data?.artist?.portfolio) setItems([...new Set<string>(data.artist.portfolio)]);
  }, [data]);

  const addPhoto = useMutation({
    mutationFn: (url: string) => api("/api/studio/portfolio", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: (res: any) => {
      toast.show("Added to portfolio", "success");
      if (res?.portfolio) setItems([...new Set<string>(res.portfolio)]);
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const removePhoto = useMutation({
    mutationFn: (url: string) => api("/api/studio/portfolio/remove", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: (res: any) => {
      toast.show("Photo removed", "info");
      if (res?.portfolio) setItems([...new Set<string>(res.portfolio)]);
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Failed", "error"),
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) => api("/api/studio/portfolio/reorder", { method: "POST", body: JSON.stringify({ order }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not save order", "error"),
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

  const gotoPreview = () => user?.artist_id && router.push(`/artist/${user.artist_id}`);

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<string>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <Pressable
          testID={`portfolio-item-${index}`}
          onLongPress={drag}
          disabled={isActive}
          style={[styles.row, isActive && styles.rowActive]}
        >
          <Icon name="drag-vertical" size={22} color={colors.muted} />
          <Image source={{ uri: item }} style={styles.thumb} contentFit="cover" transition={150} />
          <View style={{ flex: 1 }}>
            {index === 0 ? (
              <View style={styles.heroBadge}>
                <Icon name="star" size={12} color={colors.onBrandPrimary} />
                <Text style={styles.heroText}>Hero shot</Text>
              </View>
            ) : (
              <Text style={styles.rowIndex}>Photo {index + 1}</Text>
            )}
            <Text style={styles.rowHint}>Hold & drag to reorder</Text>
          </View>
          <Pressable testID={`remove-photo-${index}`} hitSlop={8} style={styles.removeBtn} onPress={() => removePhoto.mutate(item)}>
            <Icon name="close" size={16} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      </ScaleDecorator>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="portfolio-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <Pressable testID="portfolio-preview" onPress={gotoPreview} style={styles.iconBtn}>
          <Icon name="eye-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <DraggableFlatList
          data={items}
          keyExtractor={(item) => item}
          onDragEnd={({ data: newOrder }) => {
            setItems(newOrder);
            reorder.mutate(newOrder);
          }}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              <Pressable testID="add-portfolio" style={styles.addCard} onPress={onAdd} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.brandPrimary} /> : (
                  <>
                    <Icon name="image-plus" size={28} color={colors.brandPrimary} />
                    <Text style={styles.addText}>Upload a work photo</Text>
                  </>
                )}
              </Pressable>
              <Pressable testID="preview-public" style={styles.previewBtn} onPress={gotoPreview}>
                <Icon name="account-eye-outline" size={18} color={colors.brandPrimary} />
                <Text style={styles.previewText}>Preview how clients see your profile</Text>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
              {items.length ? <Text style={styles.hint}>The first photo is your hero shot. Hold & drag to reorder.</Text> : null}
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No photos yet — add your best work.</Text>}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  addCard: { height: 110, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed", backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 8 },
  addText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 },
  previewText: { flex: 1, color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  rowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  heroText: { color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 11 },
  rowIndex: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  rowHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  removeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(10,10,10,0.7)", alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center", paddingVertical: 24 },
}));
