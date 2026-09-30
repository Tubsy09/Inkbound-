import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

type Day = { open: boolean; start: string; end: string };
type Config = Record<string, Day>;

const MIN_H = 8;
const MAX_H = 23;

function hourOf(t: string) {
  return parseInt(t.split(":")[0], 10);
}
function fmt(h: number) {
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? "am" : "pm";
  return `${hh}${ampm}`;
}

export default function StudioHours() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["studio", "me"],
    queryFn: () => api<{ artist: any; parlour: any }>("/api/studio/me"),
  });

  const [cfg, setCfg] = useState<Config>({});

  useEffect(() => {
    if (data?.parlour?.hours_config) setCfg(data.parlour.hours_config);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api("/api/studio/hours", { method: "POST", body: JSON.stringify({ hours_config: cfg }) }),
    onSuccess: () => {
      toast.show("Hours saved", "success");
      qc.invalidateQueries({ queryKey: ["studio", "me"] });
      qc.invalidateQueries({ queryKey: ["artist"] });
      router.back();
    },
    onError: (e: any) => toast.show(e?.message ?? "Could not save", "error"),
  });

  const update = (key: string, patch: Partial<Day>) =>
    setCfg((c) => ({ ...c, [key]: { ...(c[key] ?? { open: true, start: "11:00", end: "20:00" }), ...patch } }));

  const stepStart = (key: string, dir: number) => {
    const d = cfg[key];
    let h = Math.min(MAX_H - 1, Math.max(MIN_H, hourOf(d.start) + dir));
    if (h >= hourOf(d.end)) h = hourOf(d.end) - 1;
    update(key, { start: `${h.toString().padStart(2, "0")}:00` });
  };
  const stepEnd = (key: string, dir: number) => {
    const d = cfg[key];
    let h = Math.min(MAX_H, Math.max(MIN_H + 1, hourOf(d.end) + dir));
    if (h <= hourOf(d.start)) h = hourOf(d.start) + 1;
    update(key, { end: `${h.toString().padStart(2, "0")}:00` });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="hours-back" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Opening hours</Text>
        <View style={{ width: 42 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, gap: 12 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sub}>Clients can only book on days and times your studio is open.</Text>
          {DAYS.map(({ key, label }) => {
            const d = cfg[key] ?? { open: false, start: "11:00", end: "20:00" };
            return (
              <View key={key} style={styles.dayCard}>
                <View style={styles.dayTop}>
                  <Text style={styles.dayLabel}>{label}</Text>
                  <Switch
                    testID={`hours-toggle-${key}`}
                    value={d.open}
                    onValueChange={(v) => update(key, { open: v })}
                    trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
                    thumbColor={"#FFFFFF"}
                  />
                </View>
                {d.open ? (
                  <View style={styles.timeRow}>
                    <View style={styles.stepper}>
                      <Text style={styles.stepLabel}>Open</Text>
                      <Pressable testID={`start-minus-${key}`} onPress={() => stepStart(key, -1)} style={styles.stepBtn}><Icon name="minus" size={16} color={colors.onSurface} /></Pressable>
                      <Text style={styles.timeText}>{fmt(hourOf(d.start))}</Text>
                      <Pressable testID={`start-plus-${key}`} onPress={() => stepStart(key, 1)} style={styles.stepBtn}><Icon name="plus" size={16} color={colors.onSurface} /></Pressable>
                    </View>
                    <View style={styles.stepper}>
                      <Text style={styles.stepLabel}>Close</Text>
                      <Pressable testID={`end-minus-${key}`} onPress={() => stepEnd(key, -1)} style={styles.stepBtn}><Icon name="minus" size={16} color={colors.onSurface} /></Pressable>
                      <Text style={styles.timeText}>{fmt(hourOf(d.end))}</Text>
                      <Pressable testID={`end-plus-${key}`} onPress={() => stepEnd(key, 1)} style={styles.stepBtn}><Icon name="plus" size={16} color={colors.onSurface} /></Pressable>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.closed}>Closed</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton testID="save-hours" label="Save hours" onPress={() => save.mutate()} loading={save.isPending} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginBottom: 4 },
  dayCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  dayTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayLabel: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  timeRow: { flexDirection: "row", gap: 12 },
  stepper: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceTertiary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  stepLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginRight: 2 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  timeText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 15, minWidth: 42, textAlign: "center" },
  closed: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14 },
  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
}));
