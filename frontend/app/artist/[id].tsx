import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { HeartButton } from "@/src/components/HeartButton";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton, Rating } from "@/src/components/ui";
import { useFavIds } from "@/src/hooks/useFavourites";
import { shareProfile } from "@/src/utils/share";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Artist, Parlour, Service } from "@/src/types";

const { width } = Dimensions.get("window");

type Detail = { artist: Artist; parlour: Parlour; services: Service[] };

export default function ArtistProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const { data: favIds } = useFavIds();

  const { data, isLoading } = useQuery({
    queryKey: ["artist", id],
    queryFn: () => api<Detail>(`/api/artists/${id}`),
    enabled: !!id,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const { artist, parlour } = data;
  const col1 = artist.portfolio.filter((_, i) => i % 2 === 0);
  const col2 = artist.portfolio.filter((_, i) => i % 2 === 1);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Icon name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={styles.headerRight}>
            <Pressable
              testID="share-artist"
              style={styles.backBtn}
              onPress={async () => {
                const r = await shareProfile("artist", id as string, artist.name);
                if (r === "copied") toast.show("Profile link copied", "success");
              }}
            >
              <Icon name="share-variant" size={20} color={colors.onSurface} />
            </Pressable>
            <HeartButton kind="artist" itemId={id as string} active={(favIds?.artist ?? []).includes(id as string)} />
          </View>
        </View>

        <View style={styles.profile}>
          <Image source={{ uri: artist.avatar }} style={styles.avatar} contentFit="cover" transition={200} />
          <Text style={styles.name}>{artist.name}</Text>
          <Text style={styles.specialty}>{artist.specialty}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Rating value={artist.rating} size={16} />
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{artist.years}y</Text>
              <Text style={styles.statLabel}>Experience</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{artist.portfolio.length}</Text>
              <Text style={styles.statLabel}>Works</Text>
            </View>
          </View>
          <Pressable testID="parlour-link" style={styles.parlourChip} onPress={() => router.push(`/parlour/${parlour.id}`)}>
            <Icon name="storefront-outline" size={15} color={colors.brandPrimary} />
            <Text style={styles.parlourChipText}>{parlour.name}</Text>
          </Pressable>
        </View>

        <Text style={styles.bio}>{artist.bio}</Text>

        <View style={styles.tagRow}>
          {artist.styles.map((s) => (
            <View key={s} style={styles.tag}>
              <Text style={styles.tagText}>{s}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Portfolio</Text>
        <View style={styles.masonry}>
          <View style={styles.col}>
            {col1.map((u, i) => (
              <Image key={i} source={{ uri: u }} style={[styles.work, { height: 180 + (i % 2) * 60 }]} contentFit="cover" transition={200} />
            ))}
          </View>
          <View style={styles.col}>
            {col2.map((u, i) => (
              <Image key={i} source={{ uri: u }} style={[styles.work, { height: 220 - (i % 2) * 40 }]} contentFit="cover" transition={200} />
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton testID="book-artist-cta" label={`Book ${artist.name.split(" ")[0]}`} onPress={() => router.push(`/booking/${artist.id}`)} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 4 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  profile: { alignItems: "center", gap: 6, paddingTop: 8 },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: colors.brandTertiary },
  name: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 28, marginTop: 6 },
  specialty: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: 14 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14, backgroundColor: colors.surfaceSecondary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border },
  stat: { alignItems: "center", gap: 4 },
  statNum: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 16 },
  statLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  divider: { width: 1, height: 28, backgroundColor: colors.divider },
  parlourChip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  parlourChipText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 13 },
  bio: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, padding: 20 },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingHorizontal: 20 },
  tag: { backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: colors.onBrandTertiary, fontFamily: fonts.medium, fontSize: 12 },
  sectionTitle: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 22, paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  masonry: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  col: { flex: 1, gap: 8 },
  work: { width: (width - 40) / 2, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
}));
