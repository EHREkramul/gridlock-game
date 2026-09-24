import { NAME_MAX } from '@gridlock/engine';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Logo } from '@/components/Logo';
import { Button, Screen, T, tap } from '@/components/ui';
import { setName, useName } from '@/lib/profile';
import { pingServer, session } from '@/lib/session';
import { alpha, colors, fonts, radius, space } from '@/lib/theme';

export default function Home() {
  const name = useName();
  const [editing, setEditing] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => pingServer().then((ok) => alive && setOnline(ok));
    check();
    const id = setInterval(check, 10_000);
    // a game that was running when the app closed? jump straight back in
    session.tryResume().then((ok) => {
      if (ok && alive) router.push('/game');
    });
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <View style={styles.brand}>
            <Logo size={34} />
            <T variant="heading" style={styles.wordmark}>
              GRIDLOCK
            </T>
          </View>
          <Pressable
            style={styles.namePill}
            onPress={() => {
              tap();
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Nickname ${name}. Tap to change`}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: online === false ? colors.danger : online ? colors.primaryAlt : colors.textDim },
              ]}
            />
            <T variant="label" numberOfLines={1} style={styles.nameText}>
              {name}
            </T>
            <T variant="caption">✎</T>
          </Pressable>
        </View>

        <T variant="title" style={styles.headline}>
          Outwalk them.{'\n'}Outwall them.
        </T>
        <T variant="body" style={styles.sub}>
          Race your pawn home while blocking everyone else. 2 to 6 players, one move or one wall per turn.
        </T>

        {online === false ? (
          <View style={styles.offline}>
            <T variant="caption" style={{ color: colors.danger }}>
              Game server unreachable — online modes will fail until it is back.
            </T>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap('medium');
            router.push({ pathname: '/setup', params: { mode: 'quick' } });
          }}
          style={({ pressed }) => [styles.hero, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroGrid} pointerEvents="none">
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={styles.heroTile} />
            ))}
          </View>
          <T style={styles.heroKicker}>⚡ PLAY NOW</T>
          <T style={styles.heroTitle}>Quick match</T>
          <T style={styles.heroSub}>Pick a table size, we find the players</T>
        </Pressable>

        <View style={styles.grid}>
          <Tile
            icon="🤝"
            title="Play friends"
            sub="Private room code"
            href={{ pathname: '/setup', params: { mode: 'create' } }}
          />
          <Tile icon="🔑" title="Join by code" sub="Got an invite?" href="/join" />
          <Tile icon="🌐" title="Open tables" sub="Browse public rooms" href="/rooms" />
          <Tile
            icon="🤖"
            title="Practice"
            sub="Play against bots"
            href={{ pathname: '/setup', params: { mode: 'ai' } }}
          />
        </View>

        <Button
          title="How to play"
          variant="ghost"
          icon="📖"
          onPress={() => router.push('/rules')}
          style={{ marginTop: space.sm }}
        />
      </ScrollView>

      <NameModal visible={editing} initial={name} onClose={() => setEditing(false)} />
    </Screen>
  );
}

function Tile({ icon, title, sub, href }: { icon: string; title: string; sub: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        router.push(href);
      }}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }], borderColor: colors.borderHi }]}
    >
      <View style={styles.tileIcon}>
        <T style={{ fontSize: 22 }}>{icon}</T>
      </View>
      <T variant="label">{title}</T>
      <T variant="caption">{sub}</T>
    </Pressable>
  );
}

function NameModal({ visible, initial, onClose }: { visible: boolean; initial: string; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* mounted only while open, so every opening starts from the saved name */}
      {visible ? <NameForm initial={initial} onClose={onClose} /> : null}
    </Modal>
  );
}

function NameForm({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const save = () => {
    if (value.trim()) setName(value);
    onClose();
  };
  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <T variant="heading">Your nickname</T>
          <T variant="caption" style={{ marginTop: 4 }}>
            Shown to other players at the table.
          </T>
          <TextInput
            value={value}
            onChangeText={setValue}
            maxLength={NAME_MAX}
            autoFocus
            autoCorrect={false}
            onSubmitEditing={save}
            returnKeyType="done"
            placeholder="Nickname"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Button title="Save" onPress={save} />
        </Pressable>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wordmark: { letterSpacing: 3, fontSize: 18 },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: 190,
  },
  nameText: { flexShrink: 1, fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headline: { marginTop: space.xxl, fontSize: 36, lineHeight: 40 },
  sub: { color: colors.textMuted, marginTop: space.md, marginBottom: space.xl },
  offline: {
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.4),
    backgroundColor: alpha(colors.danger, 0.1),
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  hero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.xl,
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  heroGrid: {
    position: 'absolute',
    right: -12,
    top: -12,
    width: 150,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    opacity: 0.22,
    transform: [{ rotate: '12deg' }],
  },
  heroTile: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.onPrimary },
  heroKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, color: alpha(colors.onPrimary, 0.7) },
  heroTitle: { fontFamily: fonts.bold, fontSize: 30, color: colors.onPrimary, letterSpacing: -0.6, marginTop: 4 },
  heroSub: { fontFamily: fonts.medium, fontSize: 14, color: alpha(colors.onPrimary, 0.75), marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 2,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(3,4,12,0.7)', justifyContent: 'center', padding: space.xl },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderHi,
    padding: space.xl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  input: {
    marginTop: space.lg,
    marginBottom: space.lg,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: space.lg,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
});
