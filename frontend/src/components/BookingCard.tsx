import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { StatusBadge } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking } from "@/src/types";

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function BookingCard({
  booking,
  perspective,
  actions,
}: {
  booking: Booking;
  perspective: "customer" | "artist";
  actions?: { label: string; onPress: () => void; variant?: "confirm" | "decline" }[];
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const title = perspective === "customer" ? booking.artist_name : booking.customer_name || "Client";
  const avatar = booking.artist_avatar;

  return (
    <View style={styles.card} testID={`booking-card-${booking.id}`}>
      <View style={styles.top}>
        {perspective === "customer" && avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Icon name={perspective === "customer" ? "brush-variant" : "account"} size={20} color={colors.brandPrimary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{title}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {booking.service_name} · {booking.parlour_name}
          </Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Icon name="calendar-blank-outline" size={15} color={colors.muted} />
          <Text style={styles.metaText}>{formatDate(booking.date)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="clock-outline" size={15} color={colors.muted} />
          <Text style={styles.metaText}>{booking.time}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="currency-usd" size={15} color={colors.muted} />
          <Text style={styles.metaText}>{booking.price === 0 ? "Free" : booking.price}</Text>
        </View>
      </View>

      {booking.note ? <Text style={styles.note}>“{booking.note}”</Text> : null}

      {actions && actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              testID={`booking-action-${a.label.toLowerCase()}-${booking.id}`}
              onPress={a.onPress}
              style={[
                styles.actionBtn,
                a.variant === "confirm" && styles.confirmBtn,
                a.variant === "decline" && styles.declineBtn,
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  a.variant === "confirm" && { color: colors.onBrandPrimary },
                  a.variant === "decline" && { color: colors.onError },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 18 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
  note: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 13, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmBtn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  declineBtn: { backgroundColor: colors.error, borderColor: colors.error },
  actionText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
}));
