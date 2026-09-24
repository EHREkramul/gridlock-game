import { legalMoves, type GameState, type SyncedState } from '@gridlock/engine';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { alpha, colors, playerColor } from '@/lib/theme';
import { toScreenCell, toScreenWall, toModelCell, type BoardView, type WallPos } from '@/lib/view';

export type InputMode = 'move' | 'wall';

interface Props {
  state: SyncedState;
  game: GameState;
  view: BoardView;
  width: number;
  mySeat: number | null;
  /** true when it is my turn and I can act */
  interactive: boolean;
  mode: InputMode;
  /** wall being positioned, in screen coordinates */
  draft: WallPos | null;
  draftValid: boolean;
  onDraft: (draft: WallPos) => void;
  onMove: (cell: { x: number; y: number }) => void;
}

const GAP_RATIO = 0.24;

export function boardMetrics(size: number, width: number) {
  const cell = width / (size + (size + 1) * GAP_RATIO);
  const gap = cell * GAP_RATIO;
  const step = cell + gap;
  return { cell, gap, step, pad: gap };
}

function wallRect(m: ReturnType<typeof boardMetrics>, w: WallPos) {
  const inset = m.gap * 0.08;
  if (w.o === 'h') {
    return {
      left: m.pad + w.x * m.step + inset,
      top: m.pad + (w.y + 1) * m.step - m.gap + inset,
      width: 2 * m.cell + m.gap - 2 * inset,
      height: m.gap - 2 * inset,
    };
  }
  return {
    left: m.pad + (w.x + 1) * m.step - m.gap + inset,
    top: m.pad + w.y * m.step + inset,
    width: m.gap - 2 * inset,
    height: 2 * m.cell + m.gap - 2 * inset,
  };
}

function BoardImpl({ state, game, view, width, mySeat, interactive, mode, draft, draftValid, onDraft, onMove }: Props) {
  const n = state.size;
  const m = useMemo(() => boardMetrics(n, width), [n, width]);

  const targets = useMemo(() => {
    if (!interactive || mode !== 'move' || mySeat === null) return [];
    return legalMoves(game, mySeat).map((c) => toScreenCell(view, c.x, c.y));
  }, [interactive, mode, mySeat, game, view]);

  const tileTint = useMemo(() => {
    // goal areas: the far row for each duel player, the golden centre for tables
    const tint = new Map<string, string>();
    if (game.config.mode === 'duel') {
      for (const p of game.players) {
        if (p.goal.kind !== 'row' || p.status !== 'active') continue;
        for (let x = 0; x < n; x++) {
          const s = toScreenCell(view, x, p.goal.row);
          tint.set(`${s.x},${s.y}`, alpha(playerColor(p.seat), p.seat === mySeat ? 0.26 : 0.12));
        }
      }
    }
    return tint;
  }, [game, n, view, mySeat]);

  const center = (n - 1) / 2;

  const pointToCell = (px: number, py: number) => ({
    x: Math.min(n - 1, Math.max(0, Math.floor((px - m.pad + m.gap / 2) / m.step))),
    y: Math.min(n - 1, Math.max(0, Math.floor((py - m.pad + m.gap / 2) / m.step))),
  });

  const pointToWall = (px: number, py: number): WallPos => {
    const x = Math.min(n - 2, Math.max(0, Math.round((px - m.pad + m.gap / 2) / m.step - 1)));
    const y = Math.min(n - 2, Math.max(0, Math.round((py - m.pad + m.gap / 2) / m.step - 1)));
    // which groove is the finger closer to: a horizontal one (between rows) or a vertical one?
    const nearestGroove = (p: number) => {
      const k = Math.min(n - 1, Math.max(1, Math.round((p - m.pad + m.gap / 2) / m.step)));
      return m.pad + k * m.step - m.gap / 2;
    };
    const dH = Math.abs(py - nearestGroove(py));
    const dV = Math.abs(px - nearestGroove(px));
    return { x, y, o: dH <= dV ? 'h' : 'v' };
  };

  const handle = (e: GestureResponderEvent, phase: 'start' | 'move' | 'end') => {
    const { locationX, locationY } = e.nativeEvent;
    if (mode === 'wall') {
      const w = pointToWall(locationX, locationY);
      if (!draft || draft.x !== w.x || draft.y !== w.y || draft.o !== w.o) onDraft(w);
      return;
    }
    if (phase === 'end') {
      const c = pointToCell(locationX, locationY);
      if (targets.some((t) => t.x === c.x && t.y === c.y)) onMove(toModelCell(view, c.x, c.y));
    }
  };

  const me = mySeat !== null ? playerColor(mySeat) : colors.primary;

  return (
    <View style={[styles.board, { width, height: width, borderRadius: m.cell * 0.5 }]}>
      {Array.from({ length: n * n }, (_, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        const isCenter = game.config.mode === 'table' && x === center && y === center;
        const tint = tileTint.get(`${x},${y}`);
        return (
          <View
            key={i}
            style={[
              styles.tile,
              {
                left: m.pad + x * m.step,
                top: m.pad + y * m.step,
                width: m.cell,
                height: m.cell,
                borderRadius: m.cell * 0.22,
                backgroundColor: (x + y) % 2 ? colors.tile : colors.tileAlt,
              },
              tint ? { backgroundColor: tint } : null,
              isCenter ? styles.goldTile : null,
            ]}
          >
            {isCenter ? <Text style={[styles.star, { fontSize: m.cell * 0.5 }]}>★</Text> : null}
          </View>
        );
      })}

      {targets.map((t) => (
        <View
          key={`t${t.x},${t.y}`}
          pointerEvents="none"
          style={[
            styles.target,
            {
              left: m.pad + t.x * m.step + m.cell * 0.32,
              top: m.pad + t.y * m.step + m.cell * 0.32,
              width: m.cell * 0.36,
              height: m.cell * 0.36,
              borderRadius: m.cell,
              backgroundColor: alpha(me, 0.55),
              borderColor: me,
            },
          ]}
        />
      ))}

      {state.walls.map((w, i) => {
        const s = toScreenWall(view, w);
        const c = playerColor(w.owner);
        return <WallBar key={`w${i}`} rect={wallRect(m, s)} color={c} radius={m.gap} />;
      })}

      {draft && mode === 'wall' ? (
        <View
          pointerEvents="none"
          style={[
            styles.wall,
            styles.draft,
            wallRect(m, draft),
            {
              borderRadius: m.gap,
              backgroundColor: alpha(draftValid ? me : colors.danger, 0.55),
              borderColor: draftValid ? me : colors.danger,
            },
          ]}
        />
      ) : null}

      {state.players
        .filter((p) => p.status === 'active' || p.status === 'won')
        .map((p) => {
          const s = toScreenCell(view, p.x, p.y);
          return (
            <Pawn
              key={p.sessionId}
              left={m.pad + s.x * m.step}
              top={m.pad + s.y * m.step}
              size={m.cell}
              color={playerColor(p.seat)}
              active={state.phase === 'playing' && state.turn === p.seat}
              isMe={p.seat === mySeat}
              won={p.status === 'won'}
            />
          );
        })}

      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => interactive}
        onMoveShouldSetResponder={() => interactive}
        onResponderGrant={(e) => handle(e, 'start')}
        onResponderMove={(e) => handle(e, 'move')}
        onResponderRelease={(e) => handle(e, 'end')}
      />
    </View>
  );
}

/** A placed wall. Pops in once on mount (plain shared values: layout
 * animations can stall on Android when patches arrive in quick succession). */
function WallBar({ rect, color, radius }: { rect: ReturnType<typeof wallRect>; color: string; radius: number }) {
  const scale = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 220 });
  }, [scale]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: Math.min(1, scale.value * 1.4),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wall, rect, { backgroundColor: color, borderRadius: radius, shadowColor: color }, anim]}
    />
  );
}

function Pawn({
  left,
  top,
  size,
  color,
  active,
  isMe,
  won,
}: {
  left: number;
  top: number;
  size: number;
  color: string;
  active: boolean;
  isMe: boolean;
  won: boolean;
}) {
  const x = useSharedValue(left);
  const y = useSharedValue(top);
  const pulse = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(left, { damping: 16, stiffness: 190 });
    y.value = withSpring(top, { damping: 16, stiffness: 190 });
  }, [left, top, x, y]);

  useEffect(() => {
    pulse.value = active
      ? withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [active, pulse]);

  const pos = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const ring = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.55,
    transform: [{ scale: 1 + pulse.value * 0.12 }],
  }));

  const d = size * 0.72;
  return (
    <Animated.View pointerEvents="none" style={[styles.pawnWrap, { width: size, height: size }, pos]}>
      <Animated.View
        style={[styles.ring, { width: size * 0.98, height: size * 0.98, borderRadius: size, borderColor: color }, ring]}
      />
      <View
        style={[
          styles.pawn,
          {
            width: d,
            height: d,
            borderRadius: d,
            backgroundColor: color,
            shadowColor: color,
            borderWidth: isMe ? 3 : 2,
            borderColor: isMe ? '#FFFFFF' : alpha('#FFFFFF', 0.35),
          },
        ]}
      >
        <View style={[styles.shine, { width: d * 0.34, height: d * 0.34, borderRadius: d }]} />
      </View>
      {won ? <Text style={[styles.crown, { fontSize: size * 0.5, top: -size * 0.42 }]}>👑</Text> : null}
    </Animated.View>
  );
}

export const Board = memo(BoardImpl);

const styles = StyleSheet.create({
  board: {
    backgroundColor: colors.boardBg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'visible',
  },
  tile: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  goldTile: {
    backgroundColor: alpha(colors.gold, 0.22),
    borderWidth: 1.5,
    borderColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  star: { color: colors.gold },
  target: { position: 'absolute', borderWidth: 1.5 },
  wall: {
    position: 'absolute',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  draft: { borderWidth: 1.5, borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  pawnWrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2.5 },
  pawn: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  shine: { backgroundColor: 'rgba(255,255,255,0.55)', marginLeft: '18%', marginTop: '14%' },
  crown: { position: 'absolute' },
});
