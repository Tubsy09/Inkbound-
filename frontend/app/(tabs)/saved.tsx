import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { HeartButton } from "@/src/components/HeartButton";
import { Icon } from "@/src/components/Icon";
import { Rating } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Artist, Parlour } from "@/src/types";

export default function Saved() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const { data, isLoading } = useQuery({
    queryKey: ["favourites", "list"],
    queryFn: () => api<{ parlours: Parlour[]; artists: Artist[] }>("/api/favourites"),
  });

  const parlours = data?.parlours ?? [];
  const artists = data?.artists ?? [];
  const empty = parlours.length === 0 && artists.length === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Saved</Text>
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : empty ? (
        <View style={styles.center}>
          <Icon name="heart-outline" size={44} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptySub}>Tap the heart on studios and artists you love.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: bottomChrome + 24, gap: 14 }} showsVerticalScrollIndicator={false}>
          {parlours.length ? <Text style={styles.section}>Studios</Text> : null}
          {parlours.map((p) => (
            <Pressable key={p.id} testID={`saved-parlour-${p.id}`} style={styles.row} onPress={() => router.push(`/parlour/${p.id}`)}>
              <Image source={{ uri: p.cover }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{p.address}</Text>
                <Rating value={p.rating} count={p.review_count} />
              </View>
              <HeartButton kind="parlour" itemId={p.id} active />
            </Pressable>
          ))}
          {artists.length ? <Text style={styles.section}>Artists</Text> : null}
          {artists.map((a) => (
            <Pressable key={a.id} testID={`saved-artist-${a.id}`} style={styles.row} onPress={() => router.push(`/artist/${a.id}`)}>
              <Image source={{ uri: a.avatar }} style={styles.avatar} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{a.specialty}</Text>
                <Rating value={a.rating} />
              </View>
              <HeartButton kind="artist" itemId={a.id} active />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 17, marginTop: 6 },
  emptySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center" },
  section: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary },
  name: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginBottom: 4 },
}));
