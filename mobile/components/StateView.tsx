import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, subtleShadow } from '../styles/theme';

type StateViewProps = {
  title: string;
  detail?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'error';
};

export function StateView({
  title,
  detail,
  loading,
  actionLabel,
  onAction,
  tone = 'default'
}: StateViewProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.panel}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        <Text style={[styles.title, tone === 'error' && styles.errorTitle]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable style={styles.action} onPress={onAction}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 90,
    paddingHorizontal: 18
  },
  panel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    width: '100%',
    ...subtleShadow
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center'
  },
  errorTitle: {
    color: colors.danger
  },
  detail: {
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center'
  },
  action: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  actionText: {
    color: colors.text,
    fontWeight: '900'
  }
});
