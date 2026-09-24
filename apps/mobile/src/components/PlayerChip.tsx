import type { SyncedPlayer, SyncedState } from '@gridlock/engine';
import { StyleSheet, View } from 'react-native';
import { T } from '@/components/ui';
import { formatClock, OUT_REASONS } from '@/lib/format';
import { alpha, colors, fonts, playerColor, radius, space } from '@/lib/theme';

/** Remaining game clock and move time for a player, as of `now` (server time). */
export function timeLeft(state: SyncedState, p: SyncedPlayer, now: number) {
  const onTurn = state.phase === 'playing' && state.turn === p.seat && p.status === 'active';
  const elapsed = onTurn ? Math.max(0, now - state.turnStartedAt) : 0;
  const clock = state.timeMs > 0 ? Math.max(0, p.clockMs - elapsed) : Infinity;
  const move = onTurn ? Math.max(0, state.moveMs - elapsed) : state.moveMs;
  return { onTurn, clock, move };
}

export function PlayerChip({
  state,
  player,
  now,
  isMe,
  large,
  emote,
}: {
  state: SyncedState;
  player: SyncedPlayer;
  now: number;
  isMe: boolean;
  large?: boolean;
  emote?: string;
}) {
  const color = playerColor(player.seat);
  const { onTurn, clock, move } = timeLeft(state, player, now);
  const out = player.status === 'out';
  const won = player.status === 'won';
  const urgent = onTurn && Math.min(move, clock) < 10_000;
  const bot = player.bot;
  // share of this move's 30 s still left (or less, if the game clock runs out first)
  const progress = onTurn && !bot ? Math.min(1, Math.min(move, clock) / state.moveMs) : 0;

  return (
    <View
      style={[
        styles.chip,
        large && styles.large,
        onTurn && { borderColor: color, backgroundColor: alpha(color, 0.1) },
        out && styles.out,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.pawn, { backgroundColor: color, shadowColor: color }, large && styles.pawnLarge]} />
        <View style={styles.nameCol}>
          <T variant="label" numberOfLines={1} style={[styles.name, large && { fontSize: 16 }, out && styles.strike]}>
            {isMe ? 'You' : player.name}
            {bot ? ' 🤖' : ''}
          </T>
          <T variant="caption" numberOfLines={1} style={styles.meta}>
            {out
              ? (OUT_REASONS[player.outReason] ?? 'out')
              : won
                ? 'winner 👑'
                : !player.connected
                  ? '📶 reconnecting…'
                  : `🧱 ${player.wallsLeft}`}
          </T>
        </View>
        {!out && !bot && state.timeMs > 0 ? (
          <T style={[styles.clock, urgent && { color: colors.danger }, large && { fontSize: 18 }]}>
            {formatClock(clock)}
          </T>
        ) : null}
        {!out && onTurn && (bot || state.timeMs === 0) ? (
          <T style={[styles.clock, urgent && { color: colors.danger }]}>{bot ? '…' : formatClock(move)}</T>
        ) : null}
      </View>
      {onTurn && !bot ? (
        <View style={styles.track}>
          <View
            style={[styles.bar, { width: `${progress * 100}%`, backgroundColor: urgent ? colors.danger : color }]}
          />
        </View>
      ) : null}
      {emote ? (
        <View style={styles.emote} pointerEvents="none">
          <T style={{ fontSize: 22 }}>{emote}</T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    overflow: 'visible',
  },
  large: { flexGrow: 0, flexBasis: 'auto', paddingHorizontal: space.md, paddingVertical: space.md },
  out: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pawn: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  pawnLarge: { width: 18, height: 18, borderRadius: 9 },
  nameCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 13.5 },
  strike: { textDecorationLine: 'line-through' },
  meta: { fontSize: 11.5, marginTop: 1 },
  clock: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm, overflow: 'hidden' },
  bar: { height: 3, borderRadius: 2 },
  emote: {
    position: 'absolute',
    right: -6,
    top: -16,
    backgroundColor: colors.surfaceHi,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
});
