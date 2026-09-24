import type { BotLevel } from '@gridlock/engine';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ACTION_ERRORS: Record<string, string> = {
  not_your_turn: "It's not your turn yet.",
  illegal_move: "You can't move there.",
  no_walls_left: 'You have no walls left.',
  wall_out_of_bounds: "A wall can't go there.",
  wall_overlap: 'That spot is taken by another wall.',
  wall_blocks_path: "Walls can't cut anyone off completely.",
  game_over: 'The game is over.',
  player_out: "You're out of this game.",
  rematch_unavailable: 'A player left — rematch is not possible.',
  not_playing: 'The game has not started.',
  bad_request: 'Something went wrong. Try again.',
};

export const describeActionError = (code: string) => ACTION_ERRORS[code] ?? 'That action is not allowed.';

export const OUT_REASONS: Record<string, string> = {
  time: 'ran out of time',
  left: 'left the game',
  resigned: 'resigned',
};

export const BOT_LEVEL_INFO: Record<BotLevel, { label: string; emoji: string; blurb: string }> = {
  easy: { label: 'Easy', emoji: '🙂', blurb: 'Learning the ropes' },
  medium: { label: 'Medium', emoji: '😎', blurb: 'Knows a trick or two' },
  hard: { label: 'Hard', emoji: '🔥', blurb: 'Blocks with purpose' },
  expert: { label: 'Expert', emoji: '💀', blurb: 'Thinks a move ahead' },
};

export function describeTable(players: number, time: number, walls: number, wallsPerPlayer?: number) {
  if (players === 2) {
    return `Duel · 9×9 · ${walls || wallsPerPlayer} walls · ${time ? `${time} min` : 'no clock'}`;
  }
  return `Table of ${players} · ${wallsPerPlayer ?? ''}${wallsPerPlayer ? ' walls · ' : ''}5 min`;
}
