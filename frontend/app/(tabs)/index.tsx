import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { DiscoverMap } from "@/src/components/DiscoverMap";
import { Icon } from "@/src/components/Icon";
import { GradientScrim, Rating, StyleChips } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Parlour } from "@/src/types";

export default function Discover() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [view, setView] = useState<"list" | "map">("list");
  const [style, setStyle] = useState("All");
  const [search, setSearch] = useState("");

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const { data: stylesData } = useQuery({
    queryKey: ["styles"],
    queryFn: () => api<{ styles: string[] }>("/api/styles"),
  });

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["parlours", style, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (style !== "All") params.set("style", style);
      if (search.trim()) params.set("q", search.trim());
      const qs = params.toString();
      return api<{ parlours: Parlour[] }>(`/api/parlours${qs ? `?${qs}` : ""}`);
    },
  });

  const parlours = data?.parlours ?? [];

  const openParlour = (p: Parlour) => router.push(`/parlour/${p.id}`);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Find your studio</Text>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search studios"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
        <View style={styles.toggle}>
          <Pressable
            testID="toggle-list"
            onPress={() => setView("list")}
            style={[styles.toggleBtn, view === "list" && styles.toggleActive]}
          >
            <Icon name="view-agenda-outline" size={18} color={view === "list" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
          </Pressable>
          <Pressable
            testID="toggle-map"
            onPress={() => setView("map")}
            style={[styles.toggleBtn, view === "map" && styles.toggleActive]}
          >
            <Icon name="map-outline" size={18} color={view === "map" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
          </Pressable>
        </View>
      </View>
      <StyleChips styles={stylesData?.styles ?? ["All"]} selected={style} onSelect={setStyle} />
    </View>
  );

  const renderCard = ({ item }: { item: Parlour }) => (
    <Pressable testID={`parlour-card-${item.id}`} style={styles.card} onPress={() => openParlour(item)}>
      <Image source={{ uri: item.cover }} style={styles.cardImage} contentFit="cover" transition={250} />
      <GradientScrim />
      <View style={styles.priceTag}>
        <Text style={styles.priceTagText}>{item.price_level}</Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTagRow}>
          {item.styles.slice(0, 2).map((s) => (
            <View key={s} style={styles.tag}>
              <Text style={styles.tagText}>{s}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardMeta}>
          <Icon name="map-marker" size={13} color={colors.muted} />
          <Text style={styles.cardAddr} numberOfLines={1}>
            {item.address}
          </Text>
        </View>
        <View style={styles.cardBottom}>
          <Rating value={item.rating} count={item.review_count} />
          <Text style={styles.hours}>{item.hours}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      {header}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Icon name="alert-circle-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Failed to load studios</Text>
          <Pressable testID="retry-btn" onPress={() => refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : view === "map" ? (
        <DiscoverMap parlours={parlours} onSelect={openParlour} />
      ) : parlours.length === 0 ? (
        <View style={styles.center}>
          <Icon name="map-marker-off-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>No studios found</Text>
          <Text style={styles.emptySub}>Try a different style or search.</Text>
        </View>
      ) : (
        <FlatList
          data={parlours}
          keyExtractor={(p) => p.id}
          renderItem={renderCard}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomChrome + 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingBottom: 8, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 30, paddingHorizontal: 20, marginBottom: 12 },
  searchRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: fonts.body, fontSize: 15, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },
  toggle: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleActive: { backgroundColor: colors.brandPrimary },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 16, marginTop: 4 },
  emptySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  retry: { marginTop: 12, backgroundColor: colors.brandPrimary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 14 },

  card: {
    height: 260,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any) },
  priceTag: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(10,10,10,0.7)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  priceTagText: { color: colors.brandPrimary, fontFamily: fonts.bold, fontSize: 13 },
  cardContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 18, gap: 6 },
  cardTagRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  tag: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.onBrandTertiary, fontFamily: fonts.medium, fontSize: 11 },
  cardName: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 24 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardAddr: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 13, flex: 1 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  hours: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
}));
