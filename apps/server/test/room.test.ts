import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { ROOM_NAME, START_COUNTDOWN_MS } from '@gridlock/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import appConfig from '../src/app.config';
import type { GameRoom } from '../src/rooms/GameRoom';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, timeout = 8000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await sleep(25);
  }
}

const bySeat = (room: GameRoom, seat: number) => room.state.players.find((p) => p.seat === seat)!;

describe('GameRoom', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(appConfig as any);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  it('starts a duel once both seats are taken and enforces turns', async () => {
    const room = await colyseus.createRoom<GameRoom>(ROOM_NAME, { name: 'Ada', players: 2 });
    const a = await colyseus.connectTo(room, { name: 'Ada' });
    expect(room.state.phase).toBe('lobby');
    const b = await colyseus.connectTo(room, { name: 'Bob' });

    expect(room.state.phase).toBe('countdown');
    await waitFor(() => room.state.phase === 'playing', START_COUNTDOWN_MS + 2000);

    const onTurn = bySeat(room, room.state.turn);
    const mover = onTurn.sessionId === a.sessionId ? a : b;
    const waiter = mover === a ? b : a;

    // out of turn → error, nothing changes
    const errorMsg = new Promise<{ code: string }>((resolve) => waiter.onMessage('error', resolve));
    waiter.send('move', { x: 4, y: 1 });
    expect((await errorMsg).code).toBe('not_your_turn');

    const target = onTurn.seat === 0 ? { x: 4, y: 7 } : { x: 4, y: 1 };
    mover.send('move', target);
    await waitFor(() => room.state.moveCount === 1);
    expect(bySeat(room, onTurn.seat).y).toBe(target.y);
    expect(room.state.turn).not.toBe(onTurn.seat);
  }, 15000);

  it('rejects illegal walls with a reason', async () => {
    const room = await colyseus.createRoom<GameRoom>(ROOM_NAME, { name: 'A', players: 2 });
    const a = await colyseus.connectTo(room, { name: 'A' });
    const b = await colyseus.connectTo(room, { name: 'B' });
    await waitFor(() => room.state.phase === 'playing', START_COUNTDOWN_MS + 2000);
    const mover = bySeat(room, room.state.turn).sessionId === a.sessionId ? a : b;
    const err = new Promise<{ code: string }>((resolve) => mover.onMessage('error', resolve));
    mover.send('wall', { x: 8, y: 0, o: 'h' });
    expect((await err).code).toBe('wall_out_of_bounds');
    mover.send('wall', { x: 3, y: 3, o: 'h' });
    await waitFor(() => room.state.walls.length === 1);
  }, 15000);

  it('practice rooms fill with bots, get a join code and play on their own', async () => {
    const room = await colyseus.createRoom<GameRoom>(ROOM_NAME, { name: 'Solo', players: 4, bots: 'easy' });
    expect(room.roomId).toMatch(/^[A-Z2-9]{6}$/);
    const me = await colyseus.connectTo(room, { name: 'Solo' });
    expect(room.state.players.length).toBe(4);
    expect(room.state.players.filter((p) => p.bot).length).toBe(3);
    await waitFor(() => room.state.phase === 'playing', START_COUNTDOWN_MS + 2000);

    // let the bots play; whenever it is my turn, just step towards the centre
    await waitFor(() => {
      const s = room.state;
      if (s.phase === 'playing' && bySeat(room, s.turn).sessionId === me.sessionId) {
        const p = bySeat(room, s.turn);
        const c = (s.size - 1) / 2;
        const dx = Math.sign(c - p.x);
        const dy = Math.sign(c - p.y);
        me.send('move', dy !== 0 ? { x: p.x, y: p.y + dy } : { x: p.x + dx, y: p.y });
      }
      return s.moveCount >= 6;
    }, 20000);
  }, 30000);

  it('a player leaving mid-game hands the win to the last one standing', async () => {
    const room = await colyseus.createRoom<GameRoom>(ROOM_NAME, { name: 'A', players: 2 });
    const a = await colyseus.connectTo(room, { name: 'A' });
    await colyseus.connectTo(room, { name: 'B' });
    await waitFor(() => room.state.phase === 'playing', START_COUNTDOWN_MS + 2000);
    const aSeat = room.state.players.find((p) => p.sessionId === a.sessionId)!.seat;
    await a.leave(true);
    await waitFor(() => room.state.phase === 'finished');
    expect(room.state.winner).toBe(1 - aSeat);
    expect(bySeat(room, aSeat).outReason).toBe('left');
  }, 15000);

  it('matchmaking only pairs players asking for the same table', async () => {
    const r1 = await colyseus.sdk.joinOrCreate(ROOM_NAME, { name: 'A', players: 3, time: 5, walls: 0 });
    const r2 = await colyseus.sdk.joinOrCreate(ROOM_NAME, { name: 'B', players: 2, time: 5, walls: 10 });
    const r3 = await colyseus.sdk.joinOrCreate(ROOM_NAME, { name: 'C', players: 3, time: 5, walls: 0 });
    expect(r1.roomId).toBe(r3.roomId);
    expect(r2.roomId).not.toBe(r1.roomId);

    const res = await colyseus.http.get<{ roomId: string }[]>('/api/rooms');
    const ids = res.data.map((r: { roomId: string }) => r.roomId).sort();
    expect(ids).toEqual([r1.roomId, r2.roomId].sort());
  }, 15000);

  it('private rooms are joinable by code but hidden from matchmaking', async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { name: 'Host', players: 2, private: true });
    expect(host.roomId).toMatch(/^[A-Z2-9]{6}$/);
    const other = await colyseus.sdk.joinOrCreate(ROOM_NAME, { name: 'Rand', players: 2, time: 5, walls: 10 });
    expect(other.roomId).not.toBe(host.roomId);
    const friend = await colyseus.sdk.joinById(host.roomId, { name: 'Friend' });
    expect(friend.roomId).toBe(host.roomId);
  }, 15000);
});
