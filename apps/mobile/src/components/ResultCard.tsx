import type { SyncedState } from '@gridlock/engine';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, T } from '@/components/ui';
import { OUT_REASONS } from '@/lib/format';
import { alpha, colors, playerColor, radius, space } from '@/lib/theme';

export function ResultCard({
  state,
  sessionId,
  onRematch,
  onLeave,
}: {
  state: SyncedState;
  sessionId: string | null;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const me = state.players.find((p) => p.sessionId === sessionId);
  const winner = state.players.find((p) => p.seat === state.winner);
  const iWon = !!me && me.seat === state.winner;
  const color = winner ? playerColor(winner.seat) : colors.textMuted;
  const humansHere = state.players.filter((p) => !p.bot).every((p) => p.connected);
  const ready = state.players.filter((p) => p.rematch).length;
  const standings = [...state.players].sort((a, b) => rank(a) - rank(b));

  return (
    <Animated.View style={styles.backdrop}>
      <Animated.View style={[styles.card, { borderColor: alpha(color, 0.6) }]}>
        <T style={styles.trophy}>{iWon ? '🏆' : winner ? '🏁' : '🤝'}</T>
        <T variant="title" style={{ textAlign: 'center', color: iWon ? color : colors.text }}>
          {iWon ? 'You win!' : winner ? `${winner.name} wins` : 'Game over'}
        </T>
        <T variant="caption" style={{ textAlign: 'center', marginTop: 4 }}>
          {state.moveCount} moves played
        </T>

        <View style={styles.list}>
          {standings.map((p) => (
            <View key={p.sessionId} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: playerColor(p.seat) }]} />
              <T variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {p.sessionId === sessionId ? 'You' : p.name}
              </T>
              <T variant="caption">
                {p.status === 'won' ? 'winner' : p.status === 'out' ? (OUT_REASONS[p.outReason] ?? 'out') : ''}
                {p.rematch ? '  ✓ again' : ''}
              </T>
            </View>
          ))}
        </View>

        <Button
          title={me?.rematch ? `Waiting… ${ready}/${state.players.length}` : 'Play again'}
          icon="🔁"
          onPress={onRematch}
          disabled={!humansHere || !!me?.rematch}
        />
        {!humansHere ? (
          <T variant="caption" style={{ textAlign: 'center', marginTop: space.sm }}>
            A player left, so a rematch isn&apos;t possible.
          </T>
        ) : null}
        <Button title="Leave table" variant="ghost" onPress={onLeave} style={{ marginTop: space.sm }} />
      </Animated.View>
    </Animated.View>
  );
}

function rank(p: { status: string }) {
  return p.status === 'won' ? 0 : p.status === 'active' ? 1 : 2;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,6,16,0.72)',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: space.xl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  trophy: { fontSize: 54, textAlign: 'center', marginBottom: space.sm },
  list: { marginVertical: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
