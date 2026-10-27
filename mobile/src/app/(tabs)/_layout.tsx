import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { MiniPlayer } from '@/components/MiniPlayer';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      // Mini player sits directly above the tab bar on every tab.
      tabBar={(props) => (
        <View style={{ backgroundColor: colors.background }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Your Library', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'library' : 'library-outline'} size={24} color={color} /> }} />
    </Tabs>
  );
}
