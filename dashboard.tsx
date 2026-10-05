import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/auth-context";
import { BookingCard } from "@/src/components/BookingCard";
import { EarningsCard } from "@/src/components/EarningsCard";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking, StudioMe } from "@/src/types";

const FILTERS = ["Pending", "Confirmed", "All"];

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [filter, setFilter] = useState("Pending");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["bookings", "artist"],
    queryFn: () => api<{ bookings: Booking[] }>("/api/bookings/artist"),
    enabled: !!user?.artist_id,
  });

  const { data: studio } = useQuery({
    queryKey: ["studio", "me"],
    queryFn: () => api<StudioMe>("/api/studio/me"),
    enabled: !!user?.artist_id,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_d, v) => {
      toast.show(v.status === "confirmed" ? "Booking confirmed" : "Booking declined", v.status === "confirmed" ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: any) => toast.show(e?.message ?? "Action failed", "error"),
  });

  const all = data?.bookings ?? [];
  const pendingCount = all.filter((b) => b.status === "pending").length;
  const confirmedCount = all.filter((b) => b.status === "confirmed").length;

  const filtered = useMemo(() => {
    if (filter === "Pending") return all.filter((b) => b.status === "pending");
    if (filter === "Confirmed") return all.filter((b) => b.status === "confirmed");
    return all;
  }, [all, filter]);

  if (!user?.artist_id) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Studio</Text>
        </View>
        <View style={styles.center}>
          <Icon name="storefront-plus-outline" size={48} color={colors.brandPrimary} />
          <Text style={styles.emptyTitle}>Set up your studio</Text>
          <Text style={styles.emptySub}>Create your studio profile, add your styles and services, and start taking bookings.</Text>
          <View style={{ width: "100%", marginTop: 16, gap: 10 }}>
            <PrimaryButton testID="setup-studio-cta" label="Create studio profile" onPress={() => router.push("/studio/setup")} />
            <Pressable testID="join-studio-cta" style={styles.secondaryBtn} onPress={() => router.push("/studio/join")}>
              <Text style={styles.secondaryText}>I work at an existing studio</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (studio && !studio.parlour) {
    const waiting = studio.pending_request;
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Studio</Text>
        </View>
        <View style={styles.center}>
          <Icon name={waiting ? "timer-sand" : "storefront-outline"} size={48} color={colors.brandPrimary} />
          <Text style={styles.emptyTitle}>{waiting ? "Waiting for approval" : "Choose your studio"}</Text>
          <Text style={styles.emptySub}>
            {waiting
              ? `${waiting.parlour_name} needs to approve you before you appear on their page and can take bookings.`
              : "Join the studio you work at, or create your own, to start taking bookings."}
          </Text>
          <View style={{ width: "100%", marginTop: 16, gap: 10 }}>
            <PrimaryButton testID="choose-studio-cta" label={waiting ? "View request" : "Find my studio"} onPress={() => router.push("/studio/join")} />
            <Pressable testID="create-own-studio" style={styles.secondaryBtn} onPress={() => router.push("/studio/setup")}>
              <Text style={styles.secondaryText}>Create my own studio instead</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const isOwner = !!studio?.is_owner;
  const requestCount = studio?.pending_requests_count ?? 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Studio</Text>
        {studio?.parlour ? (
          <Pressable testID="change-studio" onPress={() => router.push("/studio/join")} hitSlop={6}>
            <Text style={styles.studioLine}>
              {studio.parlour.name}
              {isOwner ? "" : "  ·  Change"}
            </Text>
          </Pressable>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.manageRow} style={{ marginTop: 14 }}>
          <Pressable testID="preview-profile" style={styles.manageBtn} onPress={() => user?.artist_id && router.push(`/artist/${user.artist_id}`)}>
            <Icon name="eye-outline" size={18} color={colors.onSurface} />
          </Pressable>
          {isOwner ? (
            <>
              <Pressable testID="edit-services" style={styles.manageBtn} onPress={() => router.push("/studio/services")}>
                <Icon name="tag-outline" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable testID="edit-hours" style={styles.manageBtn} onPress={() => router.push("/studio/hours")}>
                <Icon name="clock-outline" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable testID="manage-team" style={styles.manageBtn} onPress={() => router.push("/studio/team")}>
                <Icon name="account-group-outline" size={18} color={colors.onSurface} />
                {requestCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{requestCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </>
          ) : null}
          <Pressable testID="edit-studio" style={styles.manageBtn} onPress={() => router.push("/studio/setup")}>
            <Icon name="store-cog-outline" size={18} color={colors.onSurface} />
          </Pressable>
          <Pressable testID="manage-portfolio" style={styles.manageBtn} onPress={() => router.push("/studio/portfolio")}>
            <Icon name="image-multiple-outline" size={18} color={colors.onSurface} />
          </Pressable>
          {isOwner ? null : (
            <Pressable testID="switch-studio" style={styles.manageBtn} onPress={() => router.push("/studio/join")}>
              <Icon name="swap-horizontal" size={18} color={colors.onSurface} />
            </Pressable>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={isLoading ? [] : filtered}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 14 }}>
            <EarningsCard />
            <View style={styles.stats}>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{pendingCount}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{confirmedCount}</Text>
                <Text style={styles.statLabel}>Confirmed</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{all.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>
            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f}
                  testID={`filter-${f}`}
                  onPress={() => setFilter(f)}
                  style={[styles.filterChip, filter === f && styles.filterActive]}
                >
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            perspective="artist"
            actions={
              item.status === "pending"
                ? [
                    { label: "Decline", onPress: () => setStatus.mutate({ id: item.id, status: "declined" }), variant: "decline" },
                    { label: "Confirm", onPress: () => setStatus.mutate({ id: item.id, status: "confirmed" }), variant: "confirm" },
                  ]
                : item.status === "confirmed"
                ? [{ label: "Mark Completed", onPress: () => setStatus.mutate({ id: item.id, status: "completed" }), variant: "confirm" }]
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerInline}>
              <ActivityIndicator color={colors.brandPrimary} size="large" />
            </View>
          ) : (
            <View style={styles.centerInline}>
              <Icon name="calendar-check-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>No {filter.toLowerCase() !== "all" ? filter.toLowerCase() : ""} bookings</Text>
              <Text style={styles.emptySub}>New requests will appear here.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottomChrome + 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
        onRefresh={refetch}
        refreshing={isRefetching}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 30 },
  manageRow: { flexDirection: "row", gap: 10, paddingRight: 8 },
  studioLine: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: 2 },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 11 },
  secondaryBtn: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  manageBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 34 },
  statLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  filterText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary },
  filterTextActive: { color: colors.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  centerInline: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 48 },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 17, marginTop: 6 },
  emptySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
}));
