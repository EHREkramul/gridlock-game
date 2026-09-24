import {
  BOT_LEVELS,
  createConfig,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MOVE_SECONDS,
  TIME_OPTIONS,
  type BotLevel,
} from '@gridlock/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TablePreview } from '@/components/TablePreview';
import { Banner, Button, Card, Chip, Header, Screen, SectionLabel, T } from '@/components/ui';
import { BOT_LEVEL_INFO } from '@/lib/format';
import { session, useSession } from '@/lib/session';
import { colors, playerColor, space } from '@/lib/theme';

type Mode = 'quick' | 'create' | 'ai';

const COPY: Record<Mode, { title: string; cta: string; icon: string }> = {
  quick: { title: 'Quick match', cta: 'Find players', icon: '⚡' },
  create: { title: 'Play with friends', cta: 'Create private room', icon: '🤝' },
  ai: { title: 'Practice vs bots', cta: 'Start practice', icon: '🤖' },
};

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function Setup() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === 'create' || params.mode === 'ai' ? params.mode : 'quick';
  const copy = COPY[mode];
  const { width } = useWindowDimensions();
  const { error } = useSession();

  const [players, setPlayers] = useState(2);
  const [time, setTime] = useState<number>(5);
  const [walls, setWalls] = useState(10);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [busy, setBusy] = useState(false);

  const config = createConfig(players, walls);
  const isDuel = players === 2;
  const previewWidth = Math.min(width - 2 * space.xl, 360) * 0.62;

  const go = async () => {
    setBusy(true);
    const opts = { players, time: isDuel ? time : 5, walls: isDuel ? walls : 0 };
    const ok =
      mode === 'quick'
        ? await session.quickMatch(opts)
        : mode === 'create'
          ? await session.createRoom({ ...opts, private: true })
          : await session.practice({ ...opts, level });
    setBusy(false);
    if (ok) router.replace('/game');
  };

  return (
    <Screen>
      <Header title={copy.title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionLabel>Players at the table</SectionLabel>
        <View style={styles.row}>
          {PLAYER_COUNTS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              selected={players === n}
              color={playerColor(n - 1)}
              onPress={() => setPlayers(n)}
              style={styles.countChip}
            />
          ))}
        </View>

        <Card style={styles.previewCard}>
          <TablePreview players={players} walls={walls} width={previewWidth} />
          <View style={styles.previewInfo}>
            <T variant="heading">{isDuel ? 'Duel' : `Table of ${players}`}</T>
            <T variant="caption" style={styles.facts}>
              {config.size}×{config.size} board{'\n'}
              {config.wallsPerPlayer} walls each{'\n'}
              {isDuel ? 'Reach the far side' : 'Race to the gold ★'}
            </T>
            <View style={styles.seats}>
              {Array.from({ length: players }, (_, i) => (
                <View key={i} style={[styles.seatDot, { backgroundColor: playerColor(i) }]} />
              ))}
            </View>
          </View>
        </Card>

        {isDuel ? (
          <>
            <SectionLabel>Game clock (per player)</SectionLabel>
            <View style={styles.row}>
              {TIME_OPTIONS.map((t) => (
                <Chip
                  key={t}
                  label={t === 0 ? '∞' : `${t} min`}
                  sub={t === 0 ? 'no clock' : undefined}
                  selected={time === t}
                  onPress={() => setTime(t)}
                  style={styles.flexChip}
                />
              ))}
            </View>
            <SectionLabel>Walls each</SectionLabel>
            <View style={styles.row}>
              {[10, 15].map((w) => (
                <Chip
                  key={w}
                  label={`${w} 🧱`}
                  selected={walls === w}
                  onPress={() => setWalls(w)}
                  style={styles.flexChip}
                />
              ))}
            </View>
          </>
        ) : (
          <T variant="caption" style={styles.note}>
            Tables always play a 5 minute game clock per player. Miss a move and you are out — the others play on.
          </T>
        )}
        <T variant="caption" style={styles.note}>
          Every move must be made within {MOVE_SECONDS} seconds.
        </T>

        {mode === 'ai' ? (
          <>
            <SectionLabel>Bot difficulty</SectionLabel>
            <View style={styles.row}>
              {BOT_LEVELS.map((l) => (
                <Chip
                  key={l}
                  label={`${BOT_LEVEL_INFO[l].emoji}`}
                  sub={BOT_LEVEL_INFO[l].label}
                  selected={level === l}
                  onPress={() => setLevel(l)}
                  style={styles.flexChip}
                />
              ))}
            </View>
            <T variant="caption" style={styles.note}>
              {BOT_LEVEL_INFO[level].blurb}. You play against {players - 1} bot{players > 2 ? 's' : ''}.
            </T>
          </>
        ) : null}

        {error ? <Banner text={error} /> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button title={copy.cta} icon={copy.icon} onPress={go} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  countChip: { flex: 1, minWidth: 48 },
  flexChip: { flex: 1 },
  previewCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.lg, padding: space.md },
  previewInfo: { flex: 1, gap: space.xs },
  facts: { lineHeight: 20, color: colors.textMuted },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  seatDot: { width: 12, height: 12, borderRadius: 6 },
  note: { marginTop: space.md, lineHeight: 18 },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, paddingTop: space.sm },
});
