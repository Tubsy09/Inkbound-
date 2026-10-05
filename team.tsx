import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { JoinRequest } from "@/src/types";
import { confirmAction } from "@/src/utils/confirm";

type Member = { id: string; name: string; avatar?: string | null; specialty?: string; is_owner: boolean };
type Data = { requests: JoinRequest[]; team: Member[] };

export default function StudioTeam() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["studio", "team"],
    queryFn: () => api<Data>("/api/studio/join-requests"),
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["studio"] });
    qc.invalidateQueries({ queryKey: ["parlour"] });
    qc.invalidateQueries({ queryKey: ["artist"] });
  };

  const respond = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/api/studio/join-requests/${id}/respond`, { method: "POST", body: JSON.stringify({ approve }) }),
    onSuccess: (_d, v) => {
      toast.show(v.approve ? "Artist added to your studio" : "Request declined", v.approve ? "success" : "info");
      refresh();
    },
    onError: (e: any) => {
      toast.show(e?.message ?? "Could not update the request", "error");
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/studio/team/${id}/remove`, { method: "POST" }),
    onSuccess: () => {
      toast.show("Removed from your studio", "info");
      refresh();
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not remove", "error"),
  });

  const askRemove = (m: Member) =>
    confirmAction(
      `Remove ${m.name}?`,
      `${m.name} will no longer appear on your studio page or take bookings there. They can ask to join again later.`,
      "Remove",
      () => remove.mutate(m.id),
      "Keep",
    );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="team-back" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Your team</Text>
        <View style={{ width: 42 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Icon name="lock-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Only the studio owner can see this</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 12 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.section}>Requests to join</Text>
          {data.requests.length === 0 ? (
            <Text style={styles.empty}>No one is waiting. When an artist asks to join your studio, it shows up here.</Text>
          ) : (
            data.requests.map((r) => (
              <View key={r.id} style={styles.card}>
                <Person name={r.artist_name} avatar={r.artist_avatar} sub={r.artist_specialty} />
                <View style={styles.btnRow}>
                  <Pressable
                    testID={`decline-${r.id}`}
                    style={[styles.btn, styles.declineBtn]}
                    disabled={respond.isPending}
                    onPress={() => respond.mutate({ id: r.id, approve: false })}
                  >
                    <Text style={[styles.btnText, { color: colors.onError }]}>Decline</Text>
                  </Pressable>
                  <Pressable
                    testID={`approve-${r.id}`}
                    style={[styles.btn, styles.approveBtn]}
                    disabled={respond.isPending}
                    onPress={() => respond.mutate({ id: r.id, approve: true })}
                  >
                    <Text style={[styles.btnText, { color: colors.onBrandPrimary }]}>Approve</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.section, { marginTop: 14 }]}>Artists at your studio</Text>
          {data.team.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Person name={m.name} avatar={m.avatar} sub={m.specialty} />
                </View>
                {m.is_owner ? (
                  <Text style={styles.ownerTag}>You</Text>
                ) : (
                  <Pressable testID={`remove-${m.id}`} onPress={() => askRemove(m)} hitSlop={8} style={styles.removeBtn}>
                    <Icon name="account-remove-outline" size={20} color={colors.onSurfaceSecondary} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Person({ name, avatar, sub }: { name: string; avatar?: string | null; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatar} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={styles.meta} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  section: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 16 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 16 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceTertiary },
  name: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  declineBtn: { backgroundColor: colors.error },
  approveBtn: { backgroundColor: colors.brandPrimary },
  btnText: { fontFamily: fonts.bold, fontSize: 14 },
  ownerTag: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
}));
