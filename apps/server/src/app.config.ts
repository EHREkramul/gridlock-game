import { RedisDriver } from '@colyseus/redis-driver';
import { RedisPresence } from '@colyseus/redis-presence';
import { ROOM_NAME, type RoomMetadata } from '@gridlock/engine';
import { defineRoom, defineServer, matchMaker, monitor } from 'colyseus';
import type { NextFunction, Request, Response } from 'express';
import { GameRoom } from './rooms/GameRoom';

const redisUrl = process.env.REDIS_URL;
const allowedOrigins = (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim());

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return void res.sendStatus(204);
  next();
}

const server = defineServer({
  rooms: {
    // Quick match groups players by table size and time control; private rooms
    // never take part in matchmaking and are joined by code.
    [ROOM_NAME]: defineRoom(GameRoom).filterBy(['players', 'time', 'walls']).sortBy({ clients: -1 }),
  },

  // Horizontal scaling: with Redis, any number of processes share matchmaking
  // and room discovery. Without it everything runs in a single process.
  ...(redisUrl
    ? {
        presence: new RedisPresence(redisUrl),
        driver: new RedisDriver(redisUrl),
        publicAddress: process.env.PUBLIC_ADDRESS || undefined,
      }
    : {}),

  express: (app) => {
    app.use('/api', cors);
    app.get('/health', (_req, res) => {
      res.json({ ok: true, uptime: Math.round(process.uptime()) });
    });

    /** Open public tables that are still waiting for players. */
    app.get('/api/rooms', async (req, res) => {
      const wanted = Number(req.query.players);
      const rooms = await matchMaker.query({ name: ROOM_NAME, private: false, locked: false });
      res.json(
        rooms
          .filter((r) => !wanted || (r.metadata as RoomMetadata | undefined)?.players === wanted)
          .map((r) => ({
            roomId: r.roomId,
            clients: r.clients,
            maxClients: r.maxClients,
            metadata: r.metadata,
          })),
      );
    });

    if (process.env.NODE_ENV !== 'production') {
      app.use('/monitor', monitor());
    }
  },
});

export default server;
