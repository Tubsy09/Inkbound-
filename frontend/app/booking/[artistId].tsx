import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Artist, Parlour, Service } from "@/src/types";

type Detail = { artist: Artist; parlour: Parlour; services: Service[] };

function nextDays(n: number) {
  const out: { iso: string; dow: string; day: string; month: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    out.push({
      iso: cur.toISOString().slice(0, 10),
      dow: cur.toLocaleDateString(undefined, { weekday: "short" }),
      day: String(cur.getDate()),
      month: cur.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  return out;
}

const STEPS = ["Service", "Date", "Time", "Confirm"];

export default function BookingFlow() {
  const { artistId } = useLocalSearchParams<{ artistId: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const days = nextDays(14);

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => api<Detail>(`/api/artists/${artistId}`),
    enabled: !!artistId,
  });

  const { data: slotData, isLoading: slotsLoading } = useQuery({
    queryKey: ["slots", artistId, date],
    queryFn: () => api<{ slots: { time: string; available: boolean }[] }>(`/api/bookings/slots?artist_id=${artistId}&date=${date}`),
    enabled: !!artistId && !!date && step === 2,
  });

  const book = useMutation({
    mutationFn: () =>
      api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ artist_id: artistId, service_id: serviceId, date, time, note }),
      }),
    onSuccess: () => {
      toast.show("Appointment requested!", "success");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      router.replace("/(tabs)/bookings");
    },
    onError: (e: any) => toast.show(e?.message ?? "Booking failed", "error"),
  });

  if (isLoading || !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const { artist, parlour, services } = data;
  const service = services.find((s) => s.id === serviceId) ?? null;

  const canNext =
    (step === 0 && !!serviceId) ||
    (step === 1 && !!date) ||
    (step === 2 && !!time) ||
    step === 3;

  const onNext = () => {
    if (step < 3) setStep(step + 1);
    else book.mutate();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          testID="booking-back"
          onPress={() => (step === 0 ? router.back() : setStep(step - 1))}
          style={styles.backBtn}
        >
          <Icon name={step === 0 ? "close" : "chevron-left"} size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Book {artist.name.split(" ")[0]}</Text>
        <View style={{ width: 42 }} />
      </View>

      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.progressItem}>
            <View style={[styles.progressDot, i <= step && styles.progressDotActive]}>
              {i < step ? (
                <Icon name="check" size={14} color={colors.onBrandPrimary} />
              ) : (
                <Text style={[styles.progressNum, i <= step && styles.progressNumActive]}>{i + 1}</Text>
              )}
            </View>
            {i < STEPS.length - 1 ? <View style={[styles.progressLine, i < step && styles.progressLineActive]} /> : null}
          </View>
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bottomOffset={20}>
        {step === 0
          ? services.map((s) => {
              const active = s.id === serviceId;
              return (
                <Pressable key={s.id} testID={`service-${s.id}`} onPress={() => setServiceId(s.id)} style={[styles.optionCard, active && styles.optionActive]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{s.name}</Text>
                    <Text style={styles.optionSub}>
                      {s.style} · {s.duration_min} min
                    </Text>
                  </View>
                  <Text style={styles.optionPrice}>{s.price === 0 ? "Free" : `$${s.price}`}</Text>
                </Pressable>
              );
            })
          : null}

        {step === 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((d) => {
              const active = d.iso === date;
              return (
                <Pressable key={d.iso} testID={`date-${d.iso}`} onPress={() => setDate(d.iso)} style={[styles.dayCard, active && styles.dayActive]}>
                  <Text style={[styles.dayDow, active && styles.dayTextActive]}>{d.dow}</Text>
                  <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.day}</Text>
                  <Text style={[styles.dayMonth, active && styles.dayTextActive]}>{d.month}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {step === 2 ? (
          slotsLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.slotGrid}>
              {(slotData?.slots ?? []).map((s) => {
                const active = s.time === time;
                return (
                  <Pressable
                    key={s.time}
                    testID={`slot-${s.time}`}
                    disabled={!s.available}
                    onPress={() => setTime(s.time)}
                    style={[styles.slot, active && styles.slotActive, !s.available && styles.slotDisabled]}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextActive, !s.available && styles.slotTextDisabled]}>{s.time}</Text>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}

        {step === 3 ? (
          <View style={styles.summary}>
            <View style={styles.summaryHead}>
              <Image source={{ uri: artist.avatar }} style={styles.summaryAvatar} contentFit="cover" />
              <View>
                <Text style={styles.summaryName}>{artist.name}</Text>
                <Text style={styles.summaryParlour}>{parlour.name}</Text>
              </View>
            </View>
            <SummaryRow icon="palette-outline" label="Service" value={service?.name ?? ""} />
            <SummaryRow icon="calendar-blank-outline" label="Date" value={date ?? ""} />
            <SummaryRow icon="clock-outline" label="Time" value={time ?? ""} />
            <SummaryRow icon="currency-usd" label="Price" value={service?.price === 0 ? "Free" : `$${service?.price}`} />
            <Text style={styles.noteLabel}>Notes for your artist</Text>
            <TextInput
              testID="booking-note"
              value={note}
              onChangeText={setNote}
              placeholder="Describe your idea, placement, size…"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              multiline
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          testID="booking-next"
          label={step === 3 ? "Confirm Booking" : "Continue"}
          onPress={onNext}
          disabled={!canNext}
          loading={book.isPending}
        />
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Icon name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.summaryRowLabel}>{label}</Text>
      <Text style={styles.summaryRowValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  progress: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, marginTop: 8 },
  progressItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  progressDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  progressDotActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  progressNum: { color: colors.muted, fontFamily: fonts.bold, fontSize: 13 },
  progressNumActive: { color: colors.onBrandPrimary },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  progressLineActive: { backgroundColor: colors.brandPrimary },
  stepLabel: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 26, paddingHorizontal: 24, marginTop: 18 },
  content: { padding: 20, gap: 12 },

  optionCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border },
  optionActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  optionTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 16 },
  optionSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  optionPrice: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 20 },

  dayRow: { gap: 12, paddingVertical: 4 },
  dayCard: { width: 64, height: 88, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 2, borderWidth: 1, borderColor: colors.border },
  dayActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  dayDow: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  dayNum: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 22 },
  dayMonth: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  dayTextActive: { color: colors.onBrandPrimary },

  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  slot: { width: "30%", height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  slotActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  slotDisabled: { opacity: 0.35 },
  slotText: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  slotTextActive: { color: colors.onBrandPrimary },
  slotTextDisabled: { color: colors.muted },

  summary: { gap: 4 },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  summaryAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary },
  summaryName: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 17 },
  summaryParlour: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  summaryRowLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, width: 70 },
  summaryRowValue: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: 15, flex: 1, textAlign: "right" },
  noteLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 14, marginTop: 18, marginBottom: 8 },
  noteInput: { backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 14, color: colors.onSurface, fontFamily: fonts.body, fontSize: 14, minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border },

  ctaBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
}));
