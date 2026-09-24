/**
 * Board coordinates
 * -----------------
 * Cells are addressed (x, y) with x = column (0..size-1, left → right) and
 * y = row (0..size-1, top → bottom).
 *
 * Walls sit in the grooves between cells and are always two cells long. A wall
 * is anchored at the groove intersection (x, y), 0..size-2 on both axes, which
 * is the point shared by cells (x, y), (x+1, y), (x, y+1) and (x+1, y+1).
 *  - 'h' (horizontal): lies between rows y and y+1, covering columns x and x+1.
 *  - 'v' (vertical):   lies between columns x and x+1, covering rows y and y+1.
 */

export type Orientation = 'h' | 'v';

export interface Cell {
  x: number;
  y: number;
}

export interface Wall {
  x: number;
  y: number;
  o: Orientation;
  /** Seat of the player who placed it. */
  owner: number;
}

/**
 * Duel: reach any cell of the far row.
 * Table: reach the single golden cell in the centre.
 */
export type Goal = { kind: 'row'; row: number } | { kind: 'cell'; x: number; y: number };

export type GameMode = 'duel' | 'table';

export type PlayerStatus = 'active' | 'out' | 'won';

export type OutReason = 'time' | 'left' | 'resigned';

export interface PlayerState {
  seat: number;
  x: number;
  y: number;
  wallsLeft: number;
  goal: Goal;
  status: PlayerStatus;
  outReason?: OutReason;
}

export interface GameConfig {
  mode: GameMode;
  playerCount: number;
  size: number;
  wallsPerPlayer: number;
}

export interface GameState {
  config: GameConfig;
  /** Indexed by seat. */
  players: PlayerState[];
  walls: Wall[];
  /** Seat whose turn it is. */
  turn: number;
  /** Number of actions taken (moves + walls). */
  moveCount: number;
  winner: number | null;
  finished: boolean;
}

export type Action = { type: 'move'; x: number; y: number } | { type: 'wall'; x: number; y: number; o: Orientation };

export type ActionError =
  | 'game_over'
  | 'not_your_turn'
  | 'player_out'
  | 'illegal_move'
  | 'no_walls_left'
  | 'wall_out_of_bounds'
  | 'wall_overlap'
  | 'wall_blocks_path';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: ActionError };
