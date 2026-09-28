import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { HeartButton } from "@/src/components/HeartButton";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton, Rating } from "@/src/components/ui";
import { useFavIds } from "@/src/hooks/useFavourites";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Artist, Parlour, Review, Service } from "@/src/types";

const { width } = Dimensions.get("window");
const TABS = ["Gallery", "Artists", "Reviews"] as const;

type Detail = { parlour: Parlour; artists: Artist[]; services: Service[]; reviews: Review[] };

export default function ParlourDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<(typeof TABS)[number]>("Gallery");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const { data: favIds } = useFavIds();
  const isFav = (favIds?.parlour ?? []).includes(id as string);

  const { data, isLoading } = useQuery({
    queryKey: ["parlour", id],
    queryFn: () => api<Detail>(`/api/parlours/${id}`),
    enabled: !!id,
  });

  const addReview = useMutation({
    mutationFn: () =>
      api("/api/reviews", { method: "POST", body: JSON.stringify({ parlour_id: id, rating, comment }) }),
    onSuccess: () => {
      toast.show("Review posted", "success");
      setComment("");
      qc.invalidateQueries({ queryKey: ["parlour", id] });
      qc.invalidateQueries({ queryKey: ["parlours"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not post review", "error"),
  });

  if (isLoading || !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const { parlour, artists, services, reviews } = data;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: parlour.cover }} style={styles.hero} contentFit="cover" transition={250} />
          <LinearGradient
            colors={["rgba(10,10,10,0.4)", "transparent", "rgba(10,10,10,0.98)"]}
            locations={[0, 0.4, 1]}
            style={styles.heroScrim}
          />
          <Pressable
            testID="back-btn"
            onPress={() => router.back()}
            style={[styles.backBtn, { top: insets.top + 8 }]}
          >
            <Icon name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={[styles.favFloat, { top: insets.top + 8 }]}>
            <HeartButton kind="parlour" itemId={id as string} active={isFav} onDark />
          </View>
          <View style={styles.heroContent}>
            <View style={styles.tagRow}>
              {parlour.styles.map((s) => (
                <View key={s} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.name}>{parlour.name}</Text>
            <Text style={styles.tagline}>{parlour.tagline}</Text>
            <View style={styles.heroMeta}>
              <Rating value={parlour.rating} count={parlour.review_count} size={15} />
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>{parlour.price_level}</Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>{parlour.hours}</Text>
            </View>
          </View>
        </View>

        <View style={styles.addressRow}>
          <Icon name="map-marker" size={18} color={colors.brandPrimary} />
          <Text style={styles.address}>{parlour.address}</Text>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t} testID={`detail-tab-${t}`} onPress={() => setTab(t)} style={styles.tabBtn}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
              {tab === t ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          ))}
        </View>

        {tab === "Gallery" ? (
          <View style={styles.gallery}>
            {parlour.gallery.map((g, i) => (
              <Image key={i} source={{ uri: g }} style={styles.galleryImg} contentFit="cover" transition={200} />
            ))}
          </View>
        ) : null}

        {tab === "Artists" ? (
          <View style={styles.section}>
            {artists.map((a) => (
              <View key={a.id} style={styles.artistRow}>
                <Pressable style={styles.artistTap} testID={`artist-row-${a.id}`} onPress={() => router.push(`/artist/${a.id}`)}>
                  <Image source={{ uri: a.avatar }} style={styles.artistAvatar} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{a.name}</Text>
                    <Text style={styles.artistSpec}>{a.specialty}</Text>
                    <Rating value={a.rating} size={13} />
                  </View>
                </Pressable>
                <Pressable testID={`book-artist-${a.id}`} style={styles.bookMini} onPress={() => router.push(`/booking/${a.id}`)}>
                  <Text style={styles.bookMiniText}>Book</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "Reviews" ? (
          <View style={styles.section}>
            <View style={styles.reviewForm}>
              <Text style={styles.reviewFormTitle}>Leave a review</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} testID={`star-${n}`} onPress={() => setRating(n)}>
                    <Icon name={n <= rating ? "star" : "star-outline"} size={28} color={colors.brandPrimary} />
                  </Pressable>
                ))}
              </View>
              <TextInput
                testID="review-input"
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience"
                placeholderTextColor={colors.muted}
                style={styles.reviewInput}
                multiline
              />
              <PrimaryButton testID="submit-review" label="Post Review" onPress={() => addReview.mutate()} loading={addReview.isPending} />
            </View>
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewName}>{r.user_name}</Text>
                  <Rating value={r.rating} size={13} />
                </View>
                <Text style={styles.reviewComment}>{r.comment}</Text>
              </View>
            ))}
            {reviews.length === 0 ? <Text style={styles.empty}>No reviews yet. Be the first!</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={styles.ctaLabel}>Starting from</Text>
          <Text style={styles.ctaPrice}>${Math.min(...services.filter((s) => s.price > 0).map((s) => s.price))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            testID="book-now"
            label="Book Now"
            onPress={() => {
              setTab("Artists");
              toast.show("Pick your artist below", "info");
            }}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  heroWrap: { height: 420, width },
  hero: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as any) },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(10,10,10,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 6 },
  favFloat: { position: "absolute", right: 16 },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.onBrandTertiary, fontFamily: fonts.medium, fontSize: 11 },
  name: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 34, marginTop: 4 },
  tagline: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 14 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  dot: { color: colors.muted },
  metaText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 20, paddingBottom: 8 },
  address: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 14, flex: 1 },
  tabs: { flexDirection: "row", paddingHorizontal: 20, gap: 24, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabBtn: { paddingVertical: 14, alignItems: "center" },
  tabText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 15 },
  tabTextActive: { color: colors.onSurface },
  tabIndicator: { position: "absolute", bottom: -1, height: 2, width: "100%", backgroundColor: colors.brandPrimary },
  gallery: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 8 },
  galleryImg: { width: (width - 40) / 2, height: 180, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  section: { padding: 20, gap: 14 },
  artistRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
  artistTap: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  artistAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary },
  artistName: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  artistSpec: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginBottom: 2 },
  bookMini: { backgroundColor: colors.brandPrimary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  bookMiniText: { color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 13 },
  reviewForm: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  reviewFormTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 16 },
  starsRow: { flexDirection: "row", gap: 8 },
  reviewInput: { backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 14, color: colors.onSurface, fontFamily: fonts.body, fontSize: 14, minHeight: 70, textAlignVertical: "top" },
  reviewCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border },
  reviewTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewName: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  reviewComment: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center", paddingVertical: 20 },
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ctaLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  ctaPrice: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 22 },
}));
