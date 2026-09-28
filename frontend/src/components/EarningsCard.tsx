import { useQuery } from "@tanstack/react-query";
import { View, Text } from "react-native";

import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Earnings = {
  today: number;
  week: number;
  total: number;
  today_count: number;
  week_count: number;
  pending_revenue: number;
  pending_count: number;
  chart: { date: string; label: string; amount: number }[];
};

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export function EarningsCard() {
  const styles = useStyles();
  const { colors } = useTheme();

  const { data } = useQuery({
    queryKey: ["studio", "earnings"],
    queryFn: () => api<Earnings>("/api/studio/earnings"),
  });

  const chart = data?.chart ?? [];
  const max = Math.max(1, ...chart.map((c) => c.amount));
  const todayKey = chart.length ? chart[chart.length - 1].date : "";

  return (
    <View style={styles.card} testID="earnings-card">
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon name="chart-line-variant" size={16} color={colors.brandPrimary} />
          <Text style={styles.headerText}>Earnings</Text>
        </View>
        {data?.pending_count ? (
          <Text style={styles.pending}>{money(data.pending_revenue)} pending</Text>
        ) : null}
      </View>

      <View style={styles.figuresRow}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>Today</Text>
          <Text style={styles.figureValue}>{money(data?.today ?? 0)}</Text>
          <Text style={styles.figureSub}>{data?.today_count ?? 0} appt{(data?.today_count ?? 0) === 1 ? "" : "s"}</Text>
        </View>
        <View style={styles.vline} />
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>This week</Text>
          <Text style={styles.figureValue}>{money(data?.week ?? 0)}</Text>
          <Text style={styles.figureSub}>{data?.week_count ?? 0} appt{(data?.week_count ?? 0) === 1 ? "" : "s"}</Text>
        </View>
      </View>

      <View style={styles.chart}>
        {chart.map((c) => {
          const h = Math.max(4, Math.round((c.amount / max) * 64));
          const isToday = c.date === todayKey;
          return (
            <View key={c.date} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: h, backgroundColor: isToday ? colors.brandPrimary : colors.brandTertiary }]} />
              </View>
              <Text style={[styles.barLabel, isToday && { color: colors.onSurface }]}>{c.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>All-time earned</Text>
        <Text style={styles.totalValue}>{money(data?.total ?? 0)}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    marginBottom: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6 },
  pending: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12 },
  figuresRow: { flexDirection: "row", alignItems: "center" },
  figure: { flex: 1, gap: 2 },
  figureLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  figureValue: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 34 },
  figureSub: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: 12 },
  vline: { width: 1, height: 52, backgroundColor: colors.divider, marginHorizontal: 12 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 88, gap: 6 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { height: 64, justifyContent: "flex-end" },
  bar: { width: 18, borderRadius: 6 },
  barLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 14 },
  totalLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  totalValue: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 18 },
}));
