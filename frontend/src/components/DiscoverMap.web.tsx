import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { Rating } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Parlour } from "@/src/types";

// Web fallback for the map view — react-native-maps has no web renderer.
export function DiscoverMap({
  parlours,
  onSelect,
}: {
  parlours: Parlour[];
  onSelect: (p: Parlour) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container} testID="discover-map-web">
      <View style={styles.banner}>
        <Icon name="map-marker-radius" size={20} color={colors.brandPrimary} />
        <Text style={styles.bannerText}>
          Interactive map runs on the mobile app. Tap a studio below to view it.
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {parlours.map((p) => (
          <Pressable
            key={p.id}
            testID={`map-pin-${p.id}`}
            style={styles.row}
            onPress={() => onSelect(p)}
          >
            <Image source={{ uri: p.cover }} style={styles.thumb} contentFit="cover" transition={200} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.addr} numberOfLines={1}>
                {p.address}
              </Text>
              <Rating value={p.rating} count={p.review_count} />
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  name: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  addr: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginBottom: 4 },
}));
