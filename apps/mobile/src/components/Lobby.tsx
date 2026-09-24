import { BOT_LEVELS, type BotLevel, type SyncedState } from '@gridlock/engine';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { TablePreview } from '@/components/TablePreview';
import { Button, Card, Chip, IconButton, SectionLabel, T, tap } from '@/components/ui';
import { BOT_LEVEL_INFO, describeTable } from '@/lib/format';
import { session } from '@/lib/session';
import { alpha, colors, fonts, playerColor, radius, space } from '@/lib/theme';

export function Lobby({
  state,
  sessionId,
  onLeave,
}: {
  state: SyncedState;
  sessionId: string | null;
  onLeave: () => void;
}) {
  const isHost = state.hostId === sessionId;
  const open = state.playerCount - state.players.length;
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState<BotLevel>('medium');

  const invite = `Join my Gridlock table! Code: ${state.code}\n\ngridlock://join?code=${state.code}`;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <T variant="caption" style={styles.kicker}>
          {state.isPrivate ? 'PRIVATE ROOM' : 'PUBLIC TABLE'}
        </T>
        <T variant="title">{open > 0 ? 'Waiting for players' : 'Table is full!'}</T>
        <T variant="body" style={{ color: colors.textMuted, marginTop: 4 }}>
          {describeTable(state.playerCount, state.timeMs / 60_000, state.wallsPerPlayer, state.wallsPerPlayer)}
        </T>
      </Animated.View>

      {state.isPrivate ? (
        <Card style={styles.codeCard}>
          <T variant="caption">Share this code with friends</T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Room code ${state.code}. Tap to copy`}
            onPress={async () => {
              tap();
              await Clipboard.setStringAsync(state.code).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <T style={styles.code}>{state.code.split('').join(' ')}</T>
          </Pressable>
          <View style={styles.codeActions}>
            <Button
              title={copied ? 'Copied!' : 'Copy'}
              icon="📋"
              variant="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(state.code).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{ flex: 1 }}
            />
            <Button
              title="Invite"
              icon="📤"
              variant="secondary"
              onPress={() => Share.share({ message: invite }).catch(() => {})}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : null}

      <SectionLabel>
        Seats · {state.players.length}/{state.playerCount}
      </SectionLabel>
      <View style={styles.seatRow}>
        <View style={{ flex: 1, gap: space.sm }}>
          {Array.from({ length: state.playerCount }, (_, i) => {
            const p = state.players[i];
            const color = playerColor(i);
            return p ? (
              <Animated.View
                key={p.sessionId}
                entering={FadeIn}
                style={[styles.seat, { borderColor: alpha(color, 0.5) }]}
              >
                <View style={[styles.seatPawn, { backgroundColor: color, shadowColor: color }]} />
                <T variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {p.sessionId === sessionId ? `${p.name} (you)` : p.name}
                  {p.bot ? ` · ${BOT_LEVEL_INFO[p.bot as BotLevel]?.emoji ?? '🤖'}` : ''}
                </T>
                {p.sessionId === state.hostId ? <T variant="caption">host</T> : null}
                {isHost && p.bot && state.phase === 'lobby' ? (
                  <IconButton
                    label="✕"
                    size={30}
                    accessibilityLabel={`Remove ${p.name}`}
                    onPress={() => session.send('kick', { seat: p.seat })}
                  />
                ) : null}
              </Animated.View>
            ) : (
              <EmptySeat key={`empty${i}`} color={color} />
            );
          })}
        </View>
        <TablePreview players={state.playerCount} walls={state.wallsPerPlayer} width={96} />
      </View>

      {isHost && open > 0 && state.phase === 'lobby' ? (
        <Card style={{ marginTop: space.xl, gap: space.md }}>
          <T variant="label">Don&apos;t want to wait?</T>
          <T variant="caption">
            Fill the {open} empty seat{open > 1 ? 's' : ''} with bots and start right away.
          </T>
          <View style={styles.levels}>
            {BOT_LEVELS.map((l) => (
              <Chip
                key={l}
                label={BOT_LEVEL_INFO[l].emoji}
                sub={BOT_LEVEL_INFO[l].label}
                selected={level === l}
                onPress={() => setLevel(l)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
          <Button
            title="Fill with bots"
            icon="🤖"
            variant="secondary"
            onPress={() => session.send('fillBots', { level })}
          />
        </Card>
      ) : null}

      <Button title="Leave" variant="ghost" onPress={onLeave} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

function EmptySeat({ color }: { color: string }) {
  const pulse = useSharedValue(0.3);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={[styles.seat, styles.emptySeat]}>
      <Animated.View
        style={[styles.seatPawn, { backgroundColor: 'transparent', borderWidth: 2, borderColor: color }, style]}
      />
      <T variant="caption">Waiting for a player…</T>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  kicker: { letterSpacing: 1.6, marginBottom: space.xs, color: colors.primary },
  codeCard: { marginTop: space.xl, alignItems: 'center', gap: space.md },
  code: { fontFamily: fonts.bold, fontSize: 40, letterSpacing: 2, color: colors.text },
  codeActions: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  seatRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: 50,
  },
  emptySeat: { borderStyle: 'dashed' },
  seatPawn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  levels: { flexDirection: 'row', gap: space.sm },
});
