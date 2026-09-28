import { Pressable } from "react-native";

import { Icon } from "@/src/components/Icon";
import { useToggleFavourite } from "@/src/hooks/useFavourites";
import { useTheme } from "@/src/theme";

export function HeartButton({
  kind,
  itemId,
  active,
  size = 22,
  onDark = false,
}: {
  kind: "parlour" | "artist";
  itemId: string;
  active: boolean;
  size?: number;
  onDark?: boolean;
}) {
  const { colors } = useTheme();
  const toggle = useToggleFavourite();
  return (
    <Pressable
      testID={`fav-${kind}-${itemId}`}
      hitSlop={10}
      onPress={() => toggle.mutate({ kind, item_id: itemId })}
      style={
        onDark
          ? {
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(10,10,10,0.6)",
              alignItems: "center",
              justifyContent: "center",
            }
          : undefined
      }
    >
      <Icon
        name={active ? "heart" : "heart-outline"}
        size={size}
        color={active ? colors.brandPrimary : onDark ? "#FFFFFF" : colors.onSurfaceSecondary}
      />
    </Pressable>
  );
}
