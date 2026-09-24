import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@gridlock/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Banner, Button, Header, Screen, T } from '@/components/ui';
import { session, useSession } from '@/lib/session';
import { alpha, colors, fonts, radius, space } from '@/lib/theme';

const clean = (s: string) =>
  s
    .toUpperCase()
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);

/** Join a private room by its code. Also the target of invite links: gridlock://join?code=ABC123 */
export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => clean(params.code ?? ''));
  const [busy, setBusy] = useState(false);
  const { error } = useSession();
  const input = useRef<TextInput>(null);

  const join = async (value = code) => {
    if (value.length !== ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    const ok = await session.joinByCode(value);
    setBusy(false);
    if (ok) router.replace('/game');
  };

  // opened from an invite link: join straight away
  useEffect(() => {
    const fromLink = clean(params.code ?? '');
    if (fromLink.length !== ROOM_CODE_LENGTH) return;
    session.joinByCode(fromLink).then((ok) => {
      if (ok) router.replace('/game');
    });
  }, [params.code]);

  return (
    <Screen>
      <Header title="Join by code" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <T variant="body" style={{ color: colors.textMuted }}>
          Ask the host for their {ROOM_CODE_LENGTH}-character room code.
        </T>

        <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessibilityLabel="Room code">
          {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => (
            <View
              key={i}
              style={[styles.box, i === code.length && styles.boxActive, code[i] ? styles.boxFilled : null]}
            >
              <T style={styles.boxText}>{code[i] ?? ''}</T>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const next = clean(t);
            setCode(next);
            if (next.length === ROOM_CODE_LENGTH) join(next);
          }}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={ROOM_CODE_LENGTH}
          style={styles.hidden}
          caretHidden
        />

        {error ? <Banner text={error} /> : null}
        <View style={{ flex: 1 }} />
        <Button
          title="Join table"
          icon="🔑"
          onPress={() => join()}
          loading={busy}
          disabled={code.length !== ROOM_CODE_LENGTH}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: space.xl },
  boxes: { flexDirection: 'row', gap: space.sm, marginTop: space.xl, marginBottom: space.lg },
  box: {
    flex: 1,
    aspectRatio: 0.8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary },
  boxFilled: { borderColor: alpha(colors.primary, 0.5), backgroundColor: colors.surfaceHi },
  boxText: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
