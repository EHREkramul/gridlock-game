import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alpha, colors, fonts, radius, space } from '@/lib/theme';

export function tap(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (Platform.OS === 'web') return;
  const map = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
  };
  Haptics.impactAsync(map[style]).catch(() => {});
}

export function notify(kind: 'success' | 'error' | 'warning') {
  if (Platform.OS === 'web') return;
  const map = {
    success: Haptics.NotificationFeedbackType.Success,
    error: Haptics.NotificationFeedbackType.Error,
    warning: Haptics.NotificationFeedbackType.Warning,
  };
  Haptics.notificationAsync(map[kind]).catch(() => {});
}

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

const textStyles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: -0.8, color: colors.text },
  heading: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.3, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted, letterSpacing: 0.2 },
  mono: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});

export function T({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: Variant; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[textStyles[variant], style]} />;
}

/** Full-screen background with a soft glow and safe-area padding. */
export function Screen({
  children,
  style,
  edges,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.bgGlowA, colors.bgGlowB, colors.bgGlowB]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={edges ?? ['top', 'bottom']} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function Header({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton
        label="‹"
        accessibilityLabel="Back"
        onPress={() => {
          if (onBack) onBack();
          else if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      />
      <T variant="heading" style={styles.headerTitle} numberOfLines={1}>
        {title}
      </T>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function IconButton({
  label,
  onPress,
  accessibilityLabel,
  size = 42,
  tint,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  tint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2.6 },
        pressed && { transform: [{ scale: 0.94 }], backgroundColor: colors.surfaceHi },
      ]}
    >
      <Text style={[styles.iconLabel, { fontSize: size * 0.5, color: tint ?? colors.text }]}>{label}</Text>
    </Pressable>
  );
}

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
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const content = (
    <View style={styles.btnInner}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.text} />
      ) : (
        <>
          {icon ? <Text style={styles.btnIcon}>{icon}</Text> : null}
          <Text
            style={[
              styles.btnText,
              variant === 'primary' && { color: colors.onPrimary },
              variant === 'danger' && { color: colors.danger },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        inactive && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={[colors.primary, colors.primaryAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
        />
      ) : null}
      {content}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.primary,
  style,
  sub,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
  sub?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && { borderColor: color, backgroundColor: alpha(color, 0.14) },
        pressed && { transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      <Text style={[styles.chipText, selected && { color }]}>{label}</Text>
      {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <T variant="caption" style={styles.section}>
      {children}
    </T>
  );
}

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  const c = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <View style={[styles.banner, { borderColor: alpha(c, 0.4), backgroundColor: alpha(c, 0.1) }]}>
      <T variant="caption" style={{ color: c }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  headerTitle: { flex: 1 },
  headerRight: { minWidth: 42, alignItems: 'flex-end' },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconLabel: { fontFamily: fonts.semibold, marginTop: -2 },
  btn: {
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: space.xl,
  },
  btnSecondary: { backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: colors.borderHi },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: alpha(colors.danger, 0.1), borderWidth: 1, borderColor: alpha(colors.danger, 0.35) },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btnIcon: { fontSize: 18 },
  btnText: { fontFamily: fonts.bold, fontSize: 16.5, color: colors.text, letterSpacing: 0.2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.bold, fontSize: 16, color: colors.textMuted },
  chipSub: { fontFamily: fonts.medium, fontSize: 11, color: colors.textDim, marginTop: 2 },
  section: { textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: space.sm, marginTop: space.xl },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginVertical: space.sm },
});
