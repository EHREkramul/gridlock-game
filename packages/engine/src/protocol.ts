/**
 * Wire contract between the game server and clients. Both sides import this
 * file, so a rename here is a compile error everywhere instead of a silent bug.
 */
import type { BotLevel } from './bot';
import type { Orientation } from './types';

export const ROOM_NAME = 'game';

/** Time control: whole-game clock per player, in minutes. 0 = no game clock. */
export const TIME_OPTIONS = [0, 3, 5] as const;
export type TimeOption = (typeof TIME_OPTIONS)[number];

/** Every single move must be made within this many seconds (WallRush rule). */
export const MOVE_SECONDS = 30;
/** Seconds a dropped player has to come back before they are out. */
export const RECONNECT_SECONDS = 30;
/** Countdown shown once the table is full, before the first move. */
export const START_COUNTDOWN_MS = 3000;

export const NAME_MAX = 16;
export const ROOM_CODE_LENGTH = 6;
/** No 0/O/1/I/L so codes can be read aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const EMOTES = ['😂', '🫡', '🤝', '😡', '🔥', '🏆'] as const;
export type Emote = (typeof EMOTES)[number];

export const PLAYER_COLORS = ['#3DDCFF', '#FF5C8A', '#FFC53D', '#7CFF6B', '#B98CFF', '#FF8A3D'] as const;

/** Options sent with create / joinOrCreate. */
export interface CreateRoomOptions {
  name: string;
  players: number;
  /** minutes per player, 0 = unlimited (duel only; tables are always 5) */
  time?: number;
  /** duel only: 10 or 15 */
  walls?: number;
  /** private rooms get a short join code and never show up in matchmaking */
  private?: boolean;
  /** fill every other seat with bots of this level and start immediately */
  bots?: BotLevel;
  /** client build, for future compatibility checks */
  clientVersion?: string;
}

/**
 * Canonical room settings. Clients and server both run options through this so
 * that matchmaking filters (players/time/walls) compare equal values: tables
 * always play 5 minutes, and only duels have a wall option.
 */
export function normalizeRoomOptions(o: Partial<CreateRoomOptions>): { players: number; time: number; walls: number } {
  const players = Number.isInteger(o.players) && o.players! >= 2 && o.players! <= 6 ? o.players! : 2;
  if (players !== 2) return { players, time: 5, walls: 0 };
  const time = (TIME_OPTIONS as readonly number[]).includes(o.time as number) ? (o.time as number) : 5;
  const walls = o.walls === 15 ? 15 : 10;
  return { players, time, walls };
}

export function sanitizeName(raw: unknown): string {
  const name =
    typeof raw === 'string'
      ? raw
          .replace(/[\u0000-\u001f\u007f<>]/g, '')
          .trim()
          .slice(0, NAME_MAX)
      : '';
  return name || 'Player';
}

export interface JoinRoomOptions {
  name: string;
  clientVersion?: string;
}

/** Metadata attached to every room listing (public rooms screen). */
export interface RoomMetadata {
  players: number;
  time: number;
  walls: number;
  host: string;
  phase: RoomPhase;
}

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'finished';

// ---- client → server messages ----
export type ClientMessages = {
  move: { x: number; y: number };
  wall: { x: number; y: number; o: Orientation };
  resign: undefined;
  emote: { e: Emote };
  rematch: undefined;
  /** host only, lobby only: fill empty seats with bots and start */
  fillBots: { level: BotLevel };
  /** host only, lobby only: remove a bot seat */
  kick: { seat: number };
};

// ---- server → client messages ----
export interface ServerHello {
  serverNow: number;
}
export interface ServerError {
  code: string;
}
export interface ServerEmote {
  seat: number;
  e: Emote;
}

/** Plain-object shape of the synchronized room state (what `state.toJSON()` returns). */
export interface SyncedPlayer {
  sessionId: string;
  name: string;
  seat: number;
  x: number;
  y: number;
  wallsLeft: number;
  status: 'waiting' | 'active' | 'out' | 'won';
  outReason: string;
  connected: boolean;
  bot: string;
  /** ms left on the whole-game clock at the start of the current turn (0 when unlimited) */
  clockMs: number;
  rematch: boolean;
}

export interface SyncedWall {
  x: number;
  y: number;
  o: Orientation;
  owner: number;
}

export interface SyncedState {
  code: string;
  isPrivate: boolean;
  hostId: string;
  phase: RoomPhase;
  playerCount: number;
  size: number;
  wallsPerPlayer: number;
  timeMs: number;
  moveMs: number;
  players: SyncedPlayer[];
  walls: SyncedWall[];
  turn: number;
  /** server epoch ms at which the current turn started */
  turnStartedAt: number;
  /** server epoch ms at which the countdown ends and play begins */
  startsAt: number;
  moveCount: number;
  winner: number;
  round: number;
}
