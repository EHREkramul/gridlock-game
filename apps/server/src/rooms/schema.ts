import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * Synchronized room state. Field names mirror `SyncedState` in
 * @gridlock/engine/protocol so clients can read `state.toJSON()` directly.
 */
export const PlayerSchema = schema({
  sessionId: t.string().default(''),
  name: t.string().default(''),
  seat: t.int8().default(0),
  x: t.int8().default(0),
  y: t.int8().default(0),
  wallsLeft: t.uint8().default(0),
  /** waiting | active | out | won */
  status: t.string().default('waiting'),
  outReason: t.string().default(''),
  connected: t.boolean().default(true),
  /** bot difficulty, empty for humans */
  bot: t.string().default(''),
  clockMs: t.number().default(0),
  rematch: t.boolean().default(false),
});
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const WallSchema = schema({
  x: t.int8().default(0),
  y: t.int8().default(0),
  o: t.string().default('h'),
  owner: t.int8().default(0),
});
export type WallSchema = SchemaType<typeof WallSchema>;

export const GameRoomState = schema({
  code: t.string().default(''),
  isPrivate: t.boolean().default(false),
  hostId: t.string().default(''),
  /** lobby | countdown | playing | finished */
  phase: t.string().default('lobby'),
  playerCount: t.uint8().default(2),
  size: t.uint8().default(9),
  wallsPerPlayer: t.uint8().default(10),
  timeMs: t.number().default(0),
  moveMs: t.number().default(0),
  players: t.array(PlayerSchema),
  walls: t.array(WallSchema),
  turn: t.int8().default(0),
  turnStartedAt: t.number().default(0),
  startsAt: t.number().default(0),
  moveCount: t.uint16().default(0),
  winner: t.int8().default(-1),
  round: t.uint16().default(0),
});
export type GameRoomState = SchemaType<typeof GameRoomState>;
