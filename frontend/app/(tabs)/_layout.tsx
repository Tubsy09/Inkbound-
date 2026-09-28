import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { useAuth } from "@/src/auth/auth-context";
import { Icon } from "@/src/components/Icon";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isArtist = user?.role === "artist";

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="map.fill" />
          <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {!isArtist ? (
          <NativeTabs.Trigger name="saved">
            <NativeTabs.Trigger.Icon sf="heart.fill" />
            <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ) : null}
        <NativeTabs.Trigger name="bookings">
          <NativeTabs.Trigger.Icon sf="calendar" />
          <NativeTabs.Trigger.Label>Bookings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {isArtist ? (
          <NativeTabs.Trigger name="dashboard">
            <NativeTabs.Trigger.Icon sf="briefcase.fill" />
            <NativeTabs.Trigger.Label>Studio</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ) : null}
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf="person.crop.circle" />
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discover",
          tabBarIcon: ({ color }) => <Icon name="map-marker-radius" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          href: isArtist ? null : "/(tabs)/saved",
          tabBarIcon: ({ color }) => <Icon name="heart-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color }) => <Icon name="calendar-blank-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Studio",
          href: isArtist ? "/(tabs)/dashboard" : null,
          tabBarIcon: ({ color }) => <Icon name="briefcase-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Icon name="account-circle-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
