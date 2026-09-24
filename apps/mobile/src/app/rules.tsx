import { MOVE_SECONDS, RECONNECT_SECONDS } from '@gridlock/engine';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TablePreview } from '@/components/TablePreview';
import { Card, Header, Screen, T } from '@/components/ui';
import { colors, space } from '@/lib/theme';

const SECTIONS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🎯',
    title: 'The goal',
    body: 'Duel (2 players): be first to reach the far side of the 9×9 board. Tables (3–6 players): everyone races to the golden ★ cell in the centre. One winner.',
  },
  {
    icon: '👣',
    title: 'One turn, one action',
    body: 'Each turn you either move your pawn one square (up, down, left or right) or place one wall. Never both.',
  },
  {
    icon: '🧱',
    title: 'Walls',
    body: 'Walls are two squares long and sit in the grooves between squares. Nobody can jump them — only walk around. When your supply runs out, you can only move.',
  },
  {
    icon: '🦘',
    title: 'Jumping',
    body: 'When a pawn stands right next to you, jump over it. If a wall, the board edge or another pawn is behind it, jump diagonally to either side instead.',
  },
  {
    icon: '🚫',
    title: 'No full block',
    body: 'You can never place a wall that leaves any player without a route to their goal. The game simply refuses it.',
  },
  {
    icon: '⏱️',
    title: 'Time',
    body: `Every move must be made within ${MOVE_SECONDS} seconds, and there is a game clock per player (duels choose ∞, 3 or 5 minutes; tables always play 5). Run out and you are out — the others play on, your walls stay.`,
  },
  {
    icon: '📶',
    title: 'Connection',
    body: `Drop out and you have ${RECONNECT_SECONDS} seconds to come back. If only one player is left at the table, they win.`,
  },
];

export default function Rules() {
  return (
    <Screen>
      <Header title="How to play" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.previews}>
          {[2, 4, 6].map((n) => (
            <View key={n} style={{ alignItems: 'center', gap: space.xs }}>
              <TablePreview players={n} width={96} />
              <T variant="caption">{n === 2 ? 'Duel' : `${n} players`}</T>
            </View>
          ))}
        </View>
        {SECTIONS.map((s) => (
          <Card key={s.title} style={styles.card}>
            <T style={styles.icon}>{s.icon}</T>
            <View style={{ flex: 1 }}>
              <T variant="label">{s.title}</T>
              <T variant="body" style={styles.body}>
                {s.body}
              </T>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.xl, gap: space.md },
  previews: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md },
  card: { flexDirection: 'row', gap: space.md },
  icon: { fontSize: 24 },
  body: { color: colors.textMuted, marginTop: 4, fontSize: 14, lineHeight: 21 },
});
