import {
  applyAction,
  checkWall,
  indexWalls,
  legalMoves,
  shortestDistance,
  shortestPath,
  type WallIndex,
} from './rules';
import type { Action, GameState, Orientation } from './types';

export type BotLevel = 'easy' | 'medium' | 'hard' | 'expert';

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'medium', 'hard', 'expert'];

export function isBotLevel(v: unknown): v is BotLevel {
  return typeof v === 'string' && (BOT_LEVELS as readonly string[]).includes(v);
}

type Rng = () => number;

interface Scored {
  action: Action;
  score: number;
}

/** A wall left in hand is worth a little: keeps bots from spending walls for nothing. */
const WALL_IN_HAND = 0.15;

function distances(state: GameState, walls: WallIndex): number[] {
  return state.players.map((p) =>
    p.status === 'active' ? shortestDistance(state.config.size, walls, p.x, p.y, p.goal) : Infinity,
  );
}

/** Higher is better for `seat`: how far the most dangerous opponent is, minus how far I am. */
export function evaluate(state: GameState, seat: number): number {
  if (state.finished) return state.winner === seat ? 1000 : -1000;
  const me = state.players[seat];
  if (me.status !== 'active') return -1000;
  const d = distances(state, indexWalls(state.walls));
  let opp = Infinity;
  for (let s = 0; s < d.length; s++) if (s !== seat) opp = Math.min(opp, d[s]);
  if (opp === Infinity) return 1000;
  return opp - d[seat] + WALL_IN_HAND * me.wallsLeft;
}

/** Walls that would cut the first steps of an opponent's shortest route, plus close neighbours. */
function candidateWalls(state: GameState, seat: number, walls: WallIndex, depth: number): Action[] {
  const size = state.config.size;
  const seen = new Set<string>();
  const out: Action[] = [];
  const add = (x: number, y: number, o: Orientation) => {
    const k = `${o}${x},${y}`;
    if (seen.has(k) || x < 0 || y < 0 || x > size - 2 || y > size - 2) return;
    seen.add(k);
    out.push({ type: 'wall', x, y, o });
  };
  for (const p of state.players) {
    if (p.seat === seat || p.status !== 'active') continue;
    const path = shortestPath(size, walls, p.x, p.y, p.goal).slice(0, depth);
    let px = p.x;
    let py = p.y;
    for (const step of path) {
      if (step.x === px) {
        const y0 = Math.min(py, step.y);
        for (const dx of [-2, -1, 0, 1]) add(px + dx, y0, 'h');
        add(px, y0, 'v');
        add(px - 1, y0, 'v');
      } else {
        const x0 = Math.min(px, step.x);
        for (const dy of [-2, -1, 0, 1]) add(x0, py + dy, 'v');
        add(x0, py, 'h');
        add(x0, py - 1, 'h');
      }
      px = step.x;
      py = step.y;
    }
  }
  return out;
}

function candidateActions(state: GameState, seat: number, depth: number): Action[] {
  const walls = indexWalls(state.walls);
  const actions: Action[] = legalMoves(state, seat, walls).map((c) => ({ type: 'move', x: c.x, y: c.y }));
  if (state.players[seat].wallsLeft > 0) {
    for (const w of candidateWalls(state, seat, walls, depth)) {
      if (w.type === 'wall' && !checkWall(state, seat, w.x, w.y, w.o, walls)) actions.push(w);
    }
  }
  return actions;
}

function scoreAll(state: GameState, seat: number, actions: Action[]): Scored[] {
  const scored: Scored[] = [];
  for (const action of actions) {
    const res = applyAction(state, seat, action);
    if (res.ok) scored.push({ action, score: evaluate(res.state, seat) });
  }
  return scored;
}

function pickBest(scored: Scored[], rng: Rng, noise = 0): Action {
  let best: Scored | null = null;
  let bestValue = -Infinity;
  for (const s of scored) {
    const v = s.score + (noise ? (rng() - 0.5) * noise : 0) + rng() * 1e-3;
    if (v > bestValue) {
      bestValue = v;
      best = s;
    }
  }
  return best!.action;
}

/** Best greedy step along my own shortest route. */
function bestMove(state: GameState, seat: number, rng: Rng): Action | null {
  const walls = indexWalls(state.walls);
  const me = state.players[seat];
  const moves = legalMoves(state, seat, walls);
  if (moves.length === 0) return null;
  const scored = moves.map((c) => ({
    action: { type: 'move', x: c.x, y: c.y } as Action,
    score: -shortestDistance(state.config.size, walls, c.x, c.y, me.goal),
  }));
  return pickBest(scored, rng);
}

/**
 * Chooses an action for a bot seat. Always returns a legal action as long as the
 * seat can act at all (the engine guarantees an active seat on turn can).
 */
export function chooseBotAction(state: GameState, seat: number, level: BotLevel, rng: Rng = Math.random): Action {
  const fallback = (): Action => {
    const all = candidateActions(state, seat, 99);
    if (all.length) return all[Math.floor(rng() * all.length)];
    throw new Error('bot has no legal action');
  };

  switch (level) {
    case 'easy': {
      const walls = indexWalls(state.walls);
      if (rng() < 0.25) {
        const moves = legalMoves(state, seat, walls);
        if (moves.length) {
          const c = moves[Math.floor(rng() * moves.length)];
          return { type: 'move', x: c.x, y: c.y };
        }
      }
      if (rng() < 0.2 && state.players[seat].wallsLeft > 0) {
        const scored = scoreAll(
          state,
          seat,
          candidateActions(state, seat, 3).filter((a) => a.type === 'wall'),
        );
        if (scored.length) return pickBest(scored, rng, 2);
      }
      return bestMove(state, seat, rng) ?? fallback();
    }
    case 'medium': {
      const scored = scoreAll(state, seat, candidateActions(state, seat, 4));
      return scored.length ? pickBest(scored, rng, 0.9) : fallback();
    }
    case 'hard': {
      const scored = scoreAll(state, seat, candidateActions(state, seat, 8));
      return scored.length ? pickBest(scored, rng, 0.2) : fallback();
    }
    case 'expert': {
      const scored = scoreAll(state, seat, candidateActions(state, seat, 12));
      if (!scored.length) return fallback();
      // Look one reply ahead: assume the next player answers with their own best
      // greedy action, then keep the line that leaves me best off.
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 10);
      let best = top[0];
      let bestValue = -Infinity;
      for (const s of top) {
        const after = applyAction(state, seat, s.action);
        if (!after.ok) continue;
        let value = evaluate(after.state, seat);
        if (!after.state.finished) {
          const replySeat = after.state.turn;
          const replies = scoreAll(after.state, replySeat, candidateActions(after.state, replySeat, 6));
          if (replies.length) {
            const reply = pickBest(replies, rng);
            const res = applyAction(after.state, replySeat, reply);
            if (res.ok) value = evaluate(res.state, seat);
          }
        }
        value += rng() * 1e-3;
        if (value > bestValue) {
          bestValue = value;
          best = s;
        }
      }
      return best.action;
    }
  }
}
