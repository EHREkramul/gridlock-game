import { isGoal } from './setup';
import type {
  Action,
  ActionError,
  ActionResult,
  Cell,
  GameState,
  Goal,
  Orientation,
  OutReason,
  PlayerState,
  Wall,
} from './types';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Fast lookup of placed walls, keyed by `${o}${x},${y}`. */
export type WallIndex = Set<string>;

const wallKey = (o: Orientation, x: number, y: number) => `${o}${x},${y}`;

export function indexWalls(walls: readonly Pick<Wall, 'x' | 'y' | 'o'>[]): WallIndex {
  const set: WallIndex = new Set();
  for (const w of walls) set.add(wallKey(w.o, w.x, w.y));
  return set;
}

export function inBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

/** True if a wall sits between two orthogonally adjacent cells. */
export function isBlocked(walls: WallIndex, ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx) {
    // vertical step: crosses a horizontal groove
    const y = Math.min(ay, by);
    return walls.has(wallKey('h', ax, y)) || walls.has(wallKey('h', ax - 1, y));
  }
  // horizontal step: crosses a vertical groove
  const x = Math.min(ax, bx);
  return walls.has(wallKey('v', x, ay)) || walls.has(wallKey('v', x, ay - 1));
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.status === 'active');
}

function occupant(state: GameState, x: number, y: number): PlayerState | undefined {
  return state.players.find((p) => p.status === 'active' && p.x === x && p.y === y);
}

/**
 * Cells the given seat may move its pawn to.
 * - step one cell up/down/left/right unless a wall is in the way;
 * - if that cell holds a pawn, jump straight over it;
 * - if the straight jump is blocked (wall, board edge or another pawn), jump
 *   diagonally to either side of the pawn instead.
 */
export function legalMoves(state: GameState, seat: number, walls: WallIndex = indexWalls(state.walls)): Cell[] {
  const me = state.players[seat];
  if (!me || me.status !== 'active') return [];
  const { size } = state.config;
  const out: Cell[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ x, y });
    }
  };

  for (const [dx, dy] of DIRS) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (!inBounds(size, nx, ny) || isBlocked(walls, me.x, me.y, nx, ny)) continue;
    if (!occupant(state, nx, ny)) {
      push(nx, ny);
      continue;
    }
    const jx = nx + dx;
    const jy = ny + dy;
    if (inBounds(size, jx, jy) && !isBlocked(walls, nx, ny, jx, jy) && !occupant(state, jx, jy)) {
      push(jx, jy);
      continue;
    }
    // straight jump impossible → diagonal side-steps around the pawn
    for (const [px, py] of [
      [dy, dx],
      [-dy, -dx],
    ] as const) {
      const sx = nx + px;
      const sy = ny + py;
      if (inBounds(size, sx, sy) && !isBlocked(walls, nx, ny, sx, sy) && !occupant(state, sx, sy)) {
        push(sx, sy);
      }
    }
  }
  return out;
}

/**
 * Length of the shortest route from (x, y) to the goal, ignoring pawns
 * (pawns move; walls don't). Returns Infinity if the goal is unreachable.
 */
export function shortestDistance(size: number, walls: WallIndex, x: number, y: number, goal: Goal): number {
  if (isGoal(goal, x, y)) return 0;
  const dist = new Int16Array(size * size).fill(-1);
  const queue = new Int16Array(size * size);
  let head = 0;
  let tail = 0;
  dist[y * size + x] = 0;
  queue[tail++] = y * size + x;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % size;
    const cy = (cur - cx) / size;
    const d = dist[cur];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(size, nx, ny)) continue;
      const ni = ny * size + nx;
      if (dist[ni] !== -1 || isBlocked(walls, cx, cy, nx, ny)) continue;
      if (isGoal(goal, nx, ny)) return d + 1;
      dist[ni] = d + 1;
      queue[tail++] = ni;
    }
  }
  return Infinity;
}

/** One shortest route (list of cells, excluding the start) or [] if unreachable. */
export function shortestPath(size: number, walls: WallIndex, x: number, y: number, goal: Goal): Cell[] {
  if (isGoal(goal, x, y)) return [];
  const prev = new Int16Array(size * size).fill(-1);
  const queue: number[] = [y * size + x];
  prev[y * size + x] = y * size + x;
  let found = -1;
  for (let head = 0; head < queue.length && found < 0; head++) {
    const cur = queue[head];
    const cx = cur % size;
    const cy = (cur - cx) / size;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(size, nx, ny)) continue;
      const ni = ny * size + nx;
      if (prev[ni] !== -1 || isBlocked(walls, cx, cy, nx, ny)) continue;
      prev[ni] = cur;
      if (isGoal(goal, nx, ny)) {
        found = ni;
        break;
      }
      queue.push(ni);
    }
  }
  if (found < 0) return [];
  const path: Cell[] = [];
  for (let i = found; i !== y * size + x; i = prev[i]) {
    path.push({ x: i % size, y: Math.floor(i / size) });
  }
  return path.reverse();
}

/** Geometry checks only (bounds + overlap/crossing), no path check. */
export function wallFits(size: number, walls: WallIndex, x: number, y: number, o: Orientation): ActionError | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > size - 2 || y > size - 2) {
    return 'wall_out_of_bounds';
  }
  if (walls.has(wallKey('h', x, y)) || walls.has(wallKey('v', x, y))) return 'wall_overlap'; // same spot or crossing
  if (o === 'h' && (walls.has(wallKey('h', x - 1, y)) || walls.has(wallKey('h', x + 1, y)))) return 'wall_overlap';
  if (o === 'v' && (walls.has(wallKey('v', x, y - 1)) || walls.has(wallKey('v', x, y + 1)))) return 'wall_overlap';
  return null;
}

/** Full wall legality for `seat`, including "nobody may be sealed off". */
export function checkWall(
  state: GameState,
  seat: number,
  x: number,
  y: number,
  o: Orientation,
  walls: WallIndex = indexWalls(state.walls),
): ActionError | null {
  const me = state.players[seat];
  if (me.wallsLeft <= 0) return 'no_walls_left';
  const geometry = wallFits(state.config.size, walls, x, y, o);
  if (geometry) return geometry;
  const next = new Set(walls);
  next.add(wallKey(o, x, y));
  for (const p of state.players) {
    if (p.status !== 'active') continue;
    if (shortestDistance(state.config.size, next, p.x, p.y, p.goal) === Infinity) return 'wall_blocks_path';
  }
  return null;
}

export function validateAction(state: GameState, seat: number, action: Action): ActionError | null {
  if (state.finished) return 'game_over';
  if (state.turn !== seat) return 'not_your_turn';
  const me = state.players[seat];
  if (!me || me.status !== 'active') return 'player_out';
  if (action.type === 'move') {
    const ok = legalMoves(state, seat).some((c) => c.x === action.x && c.y === action.y);
    return ok ? null : 'illegal_move';
  }
  if (action.o !== 'h' && action.o !== 'v') return 'wall_out_of_bounds';
  return checkWall(state, seat, action.x, action.y, action.o);
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    walls: state.walls.slice(),
  };
}

/** Next active seat after `from`, clockwise. Returns `from` if nobody else is active. */
export function nextActiveSeat(state: GameState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const s = (from + i) % n;
    if (state.players[s].status === 'active') return s;
  }
  return from;
}

function finishIfLastStanding(state: GameState): void {
  if (state.finished) return;
  const alive = activePlayers(state);
  if (alive.length === 1) {
    alive[0].status = 'won';
    state.winner = alive[0].seat;
    state.finished = true;
  } else if (alive.length === 0) {
    state.finished = true;
  }
}

/** True if the seat can do anything at all (move or place a legal wall). */
export function hasAnyAction(state: GameState, seat: number): boolean {
  const walls = indexWalls(state.walls);
  if (legalMoves(state, seat, walls).length > 0) return true;
  const me = state.players[seat];
  if (me.wallsLeft <= 0) return false;
  const last = state.config.size - 2;
  for (let y = 0; y <= last; y++) {
    for (let x = 0; x <= last; x++) {
      for (const o of ['h', 'v'] as const) {
        if (!checkWall(state, seat, x, y, o, walls)) return true;
      }
    }
  }
  return false;
}

/** Passes the turn on, skipping any seat that is completely stuck (it can
 * happen with several pawns crowding the same corridor). */
function advanceTurn(state: GameState): void {
  if (state.finished) return;
  let seat = state.turn;
  for (let tries = 0; tries < state.players.length; tries++) {
    seat = nextActiveSeat(state, seat);
    if (hasAnyAction(state, seat)) {
      state.turn = seat;
      return;
    }
  }
  // nobody can act: extremely unlikely, keep the turn cycling so timers resolve it
  state.turn = nextActiveSeat(state, state.turn);
}

export function applyAction(state: GameState, seat: number, action: Action): ActionResult {
  const error = validateAction(state, seat, action);
  if (error) return { ok: false, error };
  const next = clone(state);
  const me = next.players[seat];
  if (action.type === 'move') {
    me.x = action.x;
    me.y = action.y;
    next.moveCount++;
    if (isGoal(me.goal, me.x, me.y)) {
      me.status = 'won';
      next.winner = seat;
      next.finished = true;
      return { ok: true, state: next };
    }
  } else {
    next.walls.push({ x: action.x, y: action.y, o: action.o, owner: seat });
    me.wallsLeft--;
    next.moveCount++;
  }
  advanceTurn(next);
  return { ok: true, state: next };
}

/** Takes a player out (timeout, disconnect, resignation). Their walls stay on the board. */
export function eliminate(state: GameState, seat: number, reason: OutReason): GameState {
  const p = state.players[seat];
  if (state.finished || !p || p.status !== 'active') return state;
  const next = clone(state);
  next.players[seat].status = 'out';
  next.players[seat].outReason = reason;
  finishIfLastStanding(next);
  if (!next.finished && next.turn === seat) advanceTurn(next);
  return next;
}
