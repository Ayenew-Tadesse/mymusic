/**
 * Generic bottom action sheet. Android's Alert shows at most three buttons,
 * so menus with more options use this instead.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean; selected?: boolean };

const useSheet = create<{ title?: string; actions: SheetAction[] | null }>(() => ({ actions: null }));
export const showActionSheet = (title: string | undefined, actions: SheetAction[]) => useSheet.setState({ title, actions });
const close = () => useSheet.setState({ actions: null });

export function ActionSheetHost() {
  const { title, actions } = useSheet();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!actions) return null;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={close} accessibilityLabel="Close" />
      <View style={{ backgroundColor: colors.elevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + spacing.sm }}>
        {title && <Text style={[font.h3, { color: colors.text, textAlign: 'center', padding: spacing.lg }]}>{title}</Text>}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityState={{ selected: a.selected }}
            onPress={() => {
              close();
              a.onPress();
            }}
            style={({ pressed }) => ({ paddingVertical: 16, paddingHorizontal: spacing.xl, backgroundColor: pressed ? colors.cardPressed : 'transparent' })}
          >
            <Text style={[font.body, { color: a.destructive ? colors.danger : a.selected ? colors.accent : colors.text, fontWeight: a.selected ? '700' : '400' }]}>{a.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={close} style={{ paddingVertical: 16, alignItems: 'center' }} accessibilityRole="button">
          <Text style={[font.body, { color: colors.textSecondary, fontWeight: '700' }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
