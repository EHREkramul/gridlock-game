import { startCells, type Cell, type GameConfig, type Orientation } from '@gridlock/engine';

/**
 * Every player sees the board turned so that their own pawn starts at (or
 * nearest to) the bottom. The engine always works in model coordinates; these
 * helpers convert to and from what is drawn on screen.
 *
 * `rot` is the number of clockwise quarter turns applied model → screen.
 */
export interface BoardView {
  size: number;
  rot: 0 | 1 | 2 | 3;
}

const cwCell = (n: number, x: number, y: number): Cell => ({ x: n - 1 - y, y: x });
const ccwCell = (n: number, x: number, y: number): Cell => ({ x: y, y: n - 1 - x });
const flip = (o: Orientation): Orientation => (o === 'h' ? 'v' : 'h');

export function toScreenCell(v: BoardView, x: number, y: number): Cell {
  let c = { x, y };
  for (let i = 0; i < v.rot; i++) c = cwCell(v.size, c.x, c.y);
  return c;
}

export function toModelCell(v: BoardView, x: number, y: number): Cell {
  let c = { x, y };
  for (let i = 0; i < v.rot; i++) c = ccwCell(v.size, c.x, c.y);
  return c;
}

export interface WallPos {
  x: number;
  y: number;
  o: Orientation;
}

export function toScreenWall(v: BoardView, w: WallPos): WallPos {
  let r = { x: w.x, y: w.y, o: w.o };
  for (let i = 0; i < v.rot; i++) r = { x: v.size - 2 - r.y, y: r.x, o: flip(r.o) };
  return r;
}

export function toModelWall(v: BoardView, w: WallPos): WallPos {
  let r = { x: w.x, y: w.y, o: w.o };
  for (let i = 0; i < v.rot; i++) r = { x: r.y, y: v.size - 2 - r.x, o: flip(r.o) };
  return r;
}

/** Picks the rotation that brings `seat`'s starting cell closest to bottom-centre. */
export function viewFor(config: GameConfig, seat: number | null): BoardView {
  const size = config.size;
  if (seat === null || seat < 0) return { size, rot: 0 };
  const start = startCells(config)[seat];
  const c = (size - 1) / 2;
  let best: BoardView = { size, rot: 0 };
  let bestScore = Infinity;
  for (const rot of [0, 1, 2, 3] as const) {
    const s = toScreenCell({ size, rot }, start.x, start.y);
    const score = (size - 1 - s.y) * 10 + Math.abs(s.x - c);
    if (score < bestScore) {
      bestScore = score;
      best = { size, rot };
    }
  }
  return best;
}
