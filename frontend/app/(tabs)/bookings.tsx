import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { BookingCard } from "@/src/components/BookingCard";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking } from "@/src/types";

export default function Bookings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["bookings", "me"],
    queryFn: () => api<{ bookings: Booking[] }>("/api/bookings/me"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    onSuccess: () => {
      toast.show("Booking cancelled", "info");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not cancel", "error"),
  });

  const bookings = data?.bookings ?? [];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>My Bookings</Text>
        <Text style={styles.subtitle}>{bookings.length} appointment{bookings.length === 1 ? "" : "s"}</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Icon name="calendar-heart" size={44} color={colors.muted} />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptySub}>Find a studio and book your next piece.</Text>
          <Pressable testID="discover-cta" style={styles.cta} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.ctaText}>Discover studios</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              perspective="customer"
              actions={
                ["pending", "confirmed"].includes(item.status)
                  ? [{ label: "Cancel", onPress: () => cancel.mutate(item.id), variant: "decline" }]
                  : undefined
              }
            />
          )}
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: bottomChrome + 24, gap: 14 }}
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
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 30 },
  subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 17, marginTop: 6 },
  emptySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center" },
  cta: { marginTop: 16, backgroundColor: colors.brandPrimary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  ctaText: { color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 15 },
}));
