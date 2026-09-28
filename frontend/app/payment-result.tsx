import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pollStatus } from "@/src/api/payments";
import { Icon } from "@/src/components/Icon";
import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function PaymentResult() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ session_id?: string; cancelled?: string }>();
  const [state, setState] = useState<"checking" | "paid" | "cancelled" | "failed">("checking");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (params.cancelled) {
      setState("cancelled");
      return;
    }
    if (!params.session_id) {
      setState("failed");
      return;
    }
    (async () => {
      const s = await pollStatus(params.session_id!);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setState(s.payment_status === "paid" ? "paid" : "failed");
    })();
  }, [params.session_id, params.cancelled, qc]);

  const content = {
    checking: { icon: "progress-clock" as const, title: "Confirming payment…", sub: "Hang tight while we verify your deposit." },
    paid: { icon: "check-circle" as const, title: "Deposit paid", sub: "Your appointment is confirmed. See you soon!" },
    cancelled: { icon: "close-circle-outline" as const, title: "Payment cancelled", sub: "No worries — your booking is still saved as pending." },
    failed: { icon: "alert-circle-outline" as const, title: "Payment not completed", sub: "You can try paying the deposit again from My Bookings." },
  }[state];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.center}>
        {state === "checking" ? (
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        ) : (
          <Icon name={content.icon} size={72} color={state === "paid" ? colors.success : colors.brandPrimary} />
        )}
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.sub}>{content.sub}</Text>
      </View>
      {state !== "checking" ? (
        <View style={styles.cta}>
          <PrimaryButton testID="go-bookings" label="Go to My Bookings" onPress={() => router.replace("/(tabs)/bookings")} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24, justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 28, textAlign: "center", marginTop: 8 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, textAlign: "center", lineHeight: 22 },
  cta: {},
}));
