import type { Cell, GameConfig, GameState, Goal, PlayerState } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Board size and wall supply per player count. Table modes follow WallRush's 4-player
 * table (11×11, 7 walls) and scale up so bigger tables stay roomy. */
const TABLE_PRESETS: Record<number, { size: number; walls: number }> = {
  3: { size: 11, walls: 8 },
  4: { size: 11, walls: 7 },
  5: { size: 13, walls: 7 },
  6: { size: 13, walls: 6 },
};

export const DUEL_WALL_OPTIONS = [10, 15] as const;

export function isValidPlayerCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= MIN_PLAYERS && (n as number) <= MAX_PLAYERS;
}

export function createConfig(playerCount: number, duelWalls = 10): GameConfig {
  if (!isValidPlayerCount(playerCount)) {
    throw new Error(`playerCount must be ${MIN_PLAYERS}..${MAX_PLAYERS}`);
  }
  if (playerCount === 2) {
    const walls = (DUEL_WALL_OPTIONS as readonly number[]).includes(duelWalls) ? duelWalls : 10;
    return { mode: 'duel', playerCount, size: 9, wallsPerPlayer: walls };
  }
  const preset = TABLE_PRESETS[playerCount];
  return { mode: 'table', playerCount, size: preset.size, wallsPerPlayer: preset.walls };
}

export function centerCell(size: number): Cell {
  const c = (size - 1) / 2;
  return { x: c, y: c };
}

/**
 * Starting cells for each seat.
 *
 * Duel: seat 0 bottom-centre racing up, seat 1 top-centre racing down.
 *
 * Table: seats are spread evenly around a diamond (all cells at Manhattan
 * distance R from the centre, R = half the board). Every pawn therefore starts
 * exactly R steps from the golden cell, so no seat has a head start. Seat 0 is
 * bottom-centre; the rest follow clockwise at 360°/n intervals. With four
 * players this is exactly one pawn in the middle of each side.
 */
export function startCells(config: GameConfig): Cell[] {
  const { size, playerCount } = config;
  const c = (size - 1) / 2;
  if (config.mode === 'duel') {
    return [
      { x: c, y: size - 1 },
      { x: c, y: 0 },
    ];
  }
  const R = c;
  const cells: Cell[] = [];
  for (let i = 0; i < playerCount; i++) {
    const theta = (2 * Math.PI * i) / playerCount;
    // screen coordinates: +y is down, seat 0 at the bottom, angles advance clockwise
    const sx = -Math.sin(theta);
    const sy = Math.cos(theta);
    const norm = Math.abs(sx) + Math.abs(sy);
    let dx = Math.round((R * sx) / norm);
    if (Object.is(dx, -0)) dx = 0;
    const rest = R - Math.abs(dx);
    const dy = Math.abs(sy) < 1e-9 ? 0 : Math.sign(sy) * rest;
    // if sy≈0 we are on the horizontal axis and |dx| is already R
    cells.push({ x: c + dx, y: c + dy });
  }
  return cells;
}

export function goalFor(config: GameConfig, seat: number): Goal {
  if (config.mode === 'duel') {
    return { kind: 'row', row: seat === 0 ? 0 : config.size - 1 };
  }
  const center = centerCell(config.size);
  return { kind: 'cell', x: center.x, y: center.y };
}

export function isGoal(goal: Goal, x: number, y: number): boolean {
  return goal.kind === 'row' ? y === goal.row : x === goal.x && y === goal.y;
}

export function createGame(config: GameConfig, firstTurn = 0): GameState {
  const starts = startCells(config);
  const players: PlayerState[] = starts.map((cell, seat) => ({
    seat,
    x: cell.x,
    y: cell.y,
    wallsLeft: config.wallsPerPlayer,
    goal: goalFor(config, seat),
    status: 'active',
  }));
  return {
    config,
    players,
    walls: [],
    turn: firstTurn % config.playerCount,
    moveCount: 0,
    winner: null,
    finished: false,
  };
}
