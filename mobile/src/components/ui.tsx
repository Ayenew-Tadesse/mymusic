/** Small shared building blocks. */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type ImageStyle, type PressableProps, type TextInputProps, type ViewStyle } from 'react-native';
import { useStyles } from '@/hooks/useStyles';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.accent, secondary: 'transparent', ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: colors.accentText, secondary: colors.text, ghost: colors.text, danger: colors.danger }[variant];
  const border = variant === 'secondary' ? colors.textMuted : variant === 'danger' ? colors.danger : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingVertical: 13,
          paddingHorizontal: spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      {!loading && <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function IconButton({ name, onPress, size = 24, color, label, active, ...rest }: { name: IconName; size?: number; color?: string; label: string; active?: boolean } & PressableProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color ?? (active ? colors.accent : colors.text)} />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  const s = useStyles((c) => ({
    label: { color: c.text, fontWeight: '700' as const, marginBottom: spacing.sm },
    input: { backgroundColor: c.card, color: c.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16 },
  }));
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={s.input} {...props} />
    </View>
  );
}

export function Artwork({ uri, size, round, style }: { uri: string | null | undefined; size: number; round?: boolean; style?: ImageStyle }) {
  const { colors } = useTheme();
  const shape = { width: size, height: size, borderRadius: round ? size / 2 : size > 100 ? radius.md : radius.sm, backgroundColor: colors.card };
  if (!uri) {
    return (
      <View style={[shape, { alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="musical-notes" size={size * 0.4} color={colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[shape, style]} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={uri} accessibilityIgnoresInvertColors />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md, paddingHorizontal: spacing.lg }}>
      <Text accessibilityRole="header" style={[font.h2, { color: colors.text }]}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: spacing.xxl, gap: spacing.md }}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={[font.h3, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {body && <Text style={[font.body, { color: colors.textSecondary, textAlign: 'center' }]}>{body}</Text>}
      {action}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Empty icon="cloud-offline-outline" title="Couldn’t load this" body={message} action={onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />} />;
}

/** "E" explicit marker and YouTube source marker shown next to subtitles. */
export function Tag({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: color ?? colors.textMuted, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1, marginRight: 6 }}>
      <Text style={{ color: color ? '#fff' : colors.background, fontSize: 9, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}
