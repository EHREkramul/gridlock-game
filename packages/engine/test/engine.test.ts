import { describe, expect, it } from 'vitest';
import {
  applyAction,
  chooseBotAction,
  createConfig,
  createGame,
  eliminate,
  indexWalls,
  legalMoves,
  shortestDistance,
  startCells,
  type BotLevel,
  type GameState,
} from '../src';

const sortCells = (cells: { x: number; y: number }[]) => cells.map((c) => `${c.x},${c.y}`).sort();

function withPawns(state: GameState, pawns: [number, number][]): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => ({ ...p, x: pawns[i][0], y: pawns[i][1] })),
  };
}

describe('setup', () => {
  it('uses the classic 9×9 duel for two players', () => {
    const c = createConfig(2);
    expect(c).toMatchObject({ mode: 'duel', size: 9, wallsPerPlayer: 10 });
    expect(createConfig(2, 15).wallsPerPlayer).toBe(15);
    expect(createConfig(2, 99).wallsPerPlayer).toBe(10);
    expect(startCells(c)).toEqual([
      { x: 4, y: 8 },
      { x: 4, y: 0 },
    ]);
  });

  it('rejects player counts outside 2..6', () => {
    expect(() => createConfig(1)).toThrow();
    expect(() => createConfig(7)).toThrow();
  });

  it('puts four players in the middle of each side', () => {
    const c = createConfig(4);
    expect(c.size).toBe(11);
    expect(sortCells(startCells(c))).toEqual(
      sortCells([
        { x: 5, y: 10 },
        { x: 0, y: 5 },
        { x: 5, y: 0 },
        { x: 10, y: 5 },
      ]),
    );
  });

  for (const n of [3, 4, 5, 6]) {
    it(`gives every seat the same distance to the centre with ${n} players`, () => {
      const c = createConfig(n);
      const cells = startCells(c);
      const g = createGame(c);
      const walls = indexWalls([]);
      const dists = g.players.map((p) => shortestDistance(c.size, walls, p.x, p.y, p.goal));
      expect(new Set(dists).size).toBe(1);
      expect(dists[0]).toBe((c.size - 1) / 2);
      expect(new Set(cells.map((p) => `${p.x},${p.y}`)).size).toBe(n);
      for (const p of cells) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(c.size);
      }
    });
  }
});

describe('pawn moves', () => {
  it('steps orthogonally and respects walls', () => {
    const g = createGame(createConfig(2));
    expect(sortCells(legalMoves(g, 0))).toEqual(
      sortCells([
        { x: 4, y: 7 },
        { x: 3, y: 8 },
        { x: 5, y: 8 },
      ]),
    );
    const walled = { ...g, walls: [{ x: 3, y: 7, o: 'h' as const, owner: 1 }] };
    expect(sortCells(legalMoves(walled, 0))).toEqual(
      sortCells([
        { x: 3, y: 8 },
        { x: 5, y: 8 },
      ]),
    );
  });

  it('jumps straight over an adjacent pawn', () => {
    const g = withPawns(createGame(createConfig(2)), [
      [4, 5],
      [4, 4],
    ]);
    expect(sortCells(legalMoves(g, 0))).toContain('4,3');
    expect(sortCells(legalMoves(g, 0))).not.toContain('4,4');
  });

  it('jumps diagonally when a wall is behind the pawn', () => {
    const base = withPawns(createGame(createConfig(2)), [
      [4, 5],
      [4, 4],
    ]);
    const g = { ...base, walls: [{ x: 4, y: 3, o: 'h' as const, owner: 0 }] };
    const moves = sortCells(legalMoves(g, 0));
    expect(moves).not.toContain('4,3');
    expect(moves).toContain('3,4');
    expect(moves).toContain('5,4');
  });

  it('jumps diagonally at the board edge', () => {
    const g = withPawns(createGame(createConfig(2)), [
      [4, 1],
      [4, 0],
    ]);
    const moves = sortCells(legalMoves(g, 0));
    expect(moves).toContain('3,0');
    expect(moves).toContain('5,0');
  });
});

describe('walls', () => {
  it('places a wall, spends the supply and passes the turn', () => {
    const g = createGame(createConfig(2));
    const r = applyAction(g, 0, { type: 'wall', x: 3, y: 0, o: 'h' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0].wallsLeft).toBe(9);
    expect(r.state.turn).toBe(1);
    expect(r.state.walls).toHaveLength(1);
  });

  it('rejects overlapping and crossing walls', () => {
    let g = createGame(createConfig(2));
    const r = applyAction(g, 0, { type: 'wall', x: 3, y: 3, o: 'h' });
    if (!r.ok) throw new Error();
    g = r.state;
    expect(applyAction(g, 1, { type: 'wall', x: 3, y: 3, o: 'v' })).toEqual({ ok: false, error: 'wall_overlap' });
    expect(applyAction(g, 1, { type: 'wall', x: 4, y: 3, o: 'h' })).toEqual({ ok: false, error: 'wall_overlap' });
    expect(applyAction(g, 1, { type: 'wall', x: 2, y: 3, o: 'h' })).toEqual({ ok: false, error: 'wall_overlap' });
    expect(applyAction(g, 1, { type: 'wall', x: 5, y: 3, o: 'h' }).ok).toBe(true);
    expect(applyAction(g, 1, { type: 'wall', x: 8, y: 3, o: 'h' })).toEqual({ ok: false, error: 'wall_out_of_bounds' });
  });

  it('never allows sealing a player off', () => {
    const g = createGame(createConfig(2));
    // seat 1 sits at (4,0) inside a corridor walled on both sides for rows 0..1
    const walls = [
      { x: 3, y: 0, o: 'v' as const, owner: 0 },
      { x: 4, y: 0, o: 'v' as const, owner: 0 },
    ];
    const s = { ...g, walls };
    // capping the corridor would leave seat 1 no route to row 8
    expect(applyAction(s, 0, { type: 'wall', x: 3, y: 1, o: 'h' })).toEqual({ ok: false, error: 'wall_blocks_path' });
    expect(applyAction(s, 0, { type: 'wall', x: 4, y: 1, o: 'h' })).toEqual({ ok: false, error: 'wall_blocks_path' });
    expect(applyAction(s, 0, { type: 'wall', x: 3, y: 2, o: 'h' }).ok).toBe(true);
  });

  it('refuses walls when the supply is empty', () => {
    const g = createGame(createConfig(2));
    const s = { ...g, players: g.players.map((p) => ({ ...p, wallsLeft: 0 })) };
    expect(applyAction(s, 0, { type: 'wall', x: 0, y: 0, o: 'h' })).toEqual({ ok: false, error: 'no_walls_left' });
  });
});

describe('turns and endings', () => {
  it('rejects out-of-turn actions', () => {
    const g = createGame(createConfig(2));
    expect(applyAction(g, 1, { type: 'move', x: 4, y: 1 })).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('wins on reaching the goal row', () => {
    const g = withPawns(createGame(createConfig(2)), [
      [0, 1],
      [8, 8],
    ]);
    const r = applyAction(g, 0, { type: 'move', x: 0, y: 0 });
    expect(r.ok && r.state.finished && r.state.winner === 0).toBe(true);
  });

  it('wins on reaching the centre in table mode', () => {
    const g = withPawns(createGame(createConfig(4)), [
      [5, 6],
      [0, 5],
      [5, 0],
      [10, 5],
    ]);
    const r = applyAction(g, 0, { type: 'move', x: 5, y: 5 });
    expect(r.ok && r.state.winner === 0).toBe(true);
  });

  it('skips eliminated seats and ends when one player is left', () => {
    let g = createGame(createConfig(3));
    g = eliminate(g, 1, 'time');
    const r = applyAction(g, 0, { type: 'move', x: g.players[0].x, y: g.players[0].y - 1 });
    expect(r.ok && r.state.turn).toBe(2);
    g = eliminate(g, 2, 'left');
    expect(g.finished).toBe(true);
    expect(g.winner).toBe(0);
  });

  it('eliminating the player on turn hands the turn on', () => {
    const g = eliminate(createGame(createConfig(4)), 0, 'time');
    expect(g.turn).toBe(1);
    expect(g.players[0].status).toBe('out');
  });
});

describe('bots', () => {
  const levels: BotLevel[] = ['easy', 'medium', 'hard', 'expert'];
  for (const n of [2, 3, 4, 5, 6]) {
    it(`finish a ${n}-player game with legal actions only`, () => {
      let seed = 42 + n;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let g = createGame(createConfig(n));
      for (let i = 0; i < 600 && !g.finished; i++) {
        const seat = g.turn;
        const action = chooseBotAction(g, seat, levels[seat % levels.length], rng);
        const r = applyAction(g, seat, action);
        expect(r.ok, JSON.stringify({ action, error: !r.ok && r.error })).toBe(true);
        if (r.ok) g = r.state;
      }
      expect(g.finished).toBe(true);
      expect(g.winner).not.toBeNull();
    });
  }

  it('a hard bot beats an easy bot most of the time', () => {
    let wins = 0;
    for (let game = 0; game < 10; game++) {
      let seed = 1000 + game;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let g = createGame(createConfig(2), game % 2);
      while (!g.finished) {
        const seat = g.turn;
        const r = applyAction(g, seat, chooseBotAction(g, seat, seat === 0 ? 'hard' : 'easy', rng));
        if (!r.ok) throw new Error(r.error);
        g = r.state;
      }
      if (g.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  });
});
