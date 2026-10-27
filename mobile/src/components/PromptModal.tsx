/** Cross-platform text prompt (Alert.prompt is iOS only). */
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';
import { Button } from './ui';

type Props = {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export function PromptModal(props: Props) {
  // Mounting the body only while visible resets the text each time it opens.
  return props.visible ? <PromptBody {...props} /> : null;
}

function PromptBody({
  title,
  initial = '',
  placeholder,
  confirmLabel = 'Save',
  onCancel,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initial);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl }} onPress={onCancel}>
        <Pressable style={{ backgroundColor: colors.elevated, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg }}>
          <Text style={[font.h2, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            maxLength={100}
            onSubmitEditing={() => value.trim() && onSubmit(value.trim())}
            style={{ color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center', borderBottomWidth: 1, borderColor: colors.textMuted, paddingVertical: spacing.sm }}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, justifyContent: 'center' }}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} />
            <Button title={confirmLabel} onPress={() => onSubmit(value.trim())} disabled={!value.trim()} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
