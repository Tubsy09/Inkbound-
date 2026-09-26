import { useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";

import { fonts, useTheme } from "@/src/theme";
import type { Parlour } from "@/src/types";

const DARK_MAP = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#808080" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

export function DiscoverMap({
  parlours,
  onSelect,
}: {
  parlours: Parlour[];
  onSelect: (p: Parlour) => void;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  const region = {
    latitude: parlours[0]?.latitude ?? 34.0448,
    longitude: parlours[0]?.longitude ?? -118.2352,
    latitudeDelta: 0.18,
    longitudeDelta: 0.18,
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={region}
        customMapStyle={DARK_MAP}
        showsPointsOfInterest={false}
      >
        {parlours.map((p) => (
          <Marker
            key={p.id}
            testID={`map-pin-${p.id}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            onPress={() => onSelect(p)}
            pinColor={colors.brandPrimary}
          >
            <View
              style={{
                backgroundColor: colors.brandPrimary,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 12 }}>
                {p.price_level}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
