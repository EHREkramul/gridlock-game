import type { SyncedState } from './protocol';
import { createConfig, goalFor } from './setup';
import type { GameConfig, GameState, OutReason, PlayerStatus } from './types';

export function configFromSynced(s: Pick<SyncedState, 'playerCount' | 'wallsPerPlayer'>): GameConfig {
  return createConfig(s.playerCount, s.wallsPerPlayer);
}

/**
 * Rebuilds an engine GameState from the synchronized room state so clients can
 * run the exact same rules as the server (legal-move highlights, wall previews).
 * Returns null while the room is still filling up.
 */
export function gameStateFromSynced(s: SyncedState): GameState | null {
  if (s.phase === 'lobby' || s.players.length !== s.playerCount) return null;
  const config: GameConfig = { ...configFromSynced(s), size: s.size, wallsPerPlayer: s.wallsPerPlayer };
  const players = [...s.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      seat: p.seat,
      x: p.x,
      y: p.y,
      wallsLeft: p.wallsLeft,
      goal: goalFor(config, p.seat),
      status: (p.status === 'waiting' ? 'active' : p.status) as PlayerStatus,
      outReason: (p.outReason || undefined) as OutReason | undefined,
    }));
  return {
    config,
    players,
    walls: s.walls.map((w) => ({ x: w.x, y: w.y, o: w.o, owner: w.owner })),
    turn: s.turn,
    moveCount: s.moveCount,
    winner: s.winner >= 0 ? s.winner : null,
    finished: s.phase === 'finished',
  };
}
