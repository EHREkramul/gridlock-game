import { createConfig, goalFor, startCells } from '@gridlock/engine';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { alpha, colors, playerColor } from '@/lib/theme';

/** Miniature board showing the board size, where each seat starts and where they race to. */
export function TablePreview({ players, walls = 10, width }: { players: number; walls?: number; width: number }) {
  const config = useMemo(() => createConfig(players, walls), [players, walls]);
  const starts = useMemo(() => startCells(config), [config]);
  const n = config.size;
  const gap = Math.max(1.5, width / n / 6);
  const cell = (width - gap * (n + 1)) / n;
  const c = (n - 1) / 2;

  const starMap = new Map(starts.map((s, seat) => [`${s.x},${s.y}`, seat]));
  const goalRows = new Map<number, number>();
  if (config.mode === 'duel') {
    for (let seat = 0; seat < 2; seat++) {
      const g = goalFor(config, seat);
      if (g.kind === 'row') goalRows.set(g.row, seat);
    }
  }

  return (
    <Animated.View
      key={players}
      entering={FadeIn.duration(250)}
      style={{
        width,
        height: width,
        borderRadius: cell * 0.6,
        backgroundColor: colors.boardBg,
        padding: gap,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {Array.from({ length: n * n }, (_, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        const seat = starMap.get(`${x},${y}`);
        const isCenter = config.mode === 'table' && x === c && y === c;
        const goalSeat = goalRows.get(y);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: gap + x * (cell + gap),
              top: gap + y * (cell + gap),
              width: cell,
              height: cell,
              borderRadius: cell * 0.25,
              backgroundColor: isCenter
                ? colors.gold
                : goalSeat !== undefined
                  ? alpha(playerColor(goalSeat), 0.22)
                  : colors.tile,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {seat !== undefined ? (
              <View
                style={{
                  width: cell * 0.8,
                  height: cell * 0.8,
                  borderRadius: cell,
                  backgroundColor: playerColor(seat),
                  shadowColor: playerColor(seat),
                  shadowOpacity: 0.9,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );
}
