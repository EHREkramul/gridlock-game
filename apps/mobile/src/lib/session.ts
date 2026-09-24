import { Client, type Room } from '@colyseus/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeRoomOptions,
  ROOM_NAME,
  type BotLevel,
  type ClientMessages,
  type CreateRoomOptions,
  type Emote,
  type ServerEmote,
  type SyncedState,
} from '@gridlock/engine';
import { useSyncExternalStore } from 'react';
import { APP_VERSION, serverUrl } from './config';
import { getName } from './profile';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface FloatingEmote {
  id: number;
  seat: number;
  e: Emote;
}

export interface SessionSnapshot {
  status: ConnectionStatus;
  state: SyncedState | null;
  sessionId: string | null;
  /** why joining failed or why we got disconnected */
  error: string | null;
  /** last rejected action, e.g. an illegal wall */
  actionError: { code: string; at: number } | null;
  emotes: FloatingEmote[];
  /** serverTime ≈ Date.now() + serverOffset */
  serverOffset: number;
}

const RESUME_KEY = 'gridlock.resume';
const RESUME_MAX_AGE_MS = 5 * 60_000;

const initial: SessionSnapshot = {
  status: 'idle',
  state: null,
  sessionId: null,
  error: null,
  actionError: null,
  emotes: [],
  serverOffset: 0,
};

function describeJoinError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/not found|invalid/i.test(msg)) return 'No table with that code. Check it and try again.';
  if (/already_started|locked|full/i.test(msg)) return 'That table is already full or playing.';
  if (/network|fetch|ECONNREFUSED|failed|timeout|websocket/i.test(msg)) {
    return "Can't reach the game server. Check your connection and try again.";
  }
  return msg || 'Something went wrong. Please try again.';
}

/**
 * Owns the connection to the game server and the one room a player can be in.
 * Screens read it through `useSession()`; every change produces a new snapshot
 * object so React re-renders exactly when something changed.
 */
class GameSession {
  private client: Client | null = null;
  private room: Room | null = null;
  private snapshot: SessionSnapshot = initial;
  private listeners = new Set<() => void>();
  private emoteId = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private getClient() {
    this.client ??= new Client(serverUrl());
    return this.client;
  }

  // ------------------------------------------------------------ joining

  quickMatch(opts: { players: number; time?: number; walls?: number }) {
    const norm = normalizeRoomOptions(opts);
    return this.join((c) => c.joinOrCreate(ROOM_NAME, this.options(norm)));
  }

  createRoom(opts: { players: number; time?: number; walls?: number; private?: boolean }) {
    const norm = normalizeRoomOptions(opts);
    return this.join((c) => c.create(ROOM_NAME, this.options({ ...norm, private: opts.private ?? true })));
  }

  practice(opts: { players: number; time?: number; walls?: number; level: BotLevel }) {
    const norm = normalizeRoomOptions(opts);
    return this.join((c) => c.create(ROOM_NAME, this.options({ ...norm, bots: opts.level })));
  }

  joinByCode(code: string) {
    const id = code.trim().toUpperCase();
    return this.join((c) => c.joinById(id, { name: getName(), clientVersion: APP_VERSION }));
  }

  /** Rejoins the game this device was in before the app was closed, if it is still running. */
  async tryResume(): Promise<boolean> {
    if (this.room) return true;
    try {
      const raw = await AsyncStorage.getItem(RESUME_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw) as { token: string; at: number };
      if (Date.now() - saved.at > RESUME_MAX_AGE_MS) {
        await AsyncStorage.removeItem(RESUME_KEY);
        return false;
      }
      return await this.join((c) => c.reconnect(saved.token), { silent: true });
    } catch {
      return false;
    }
  }

  private options(o: Omit<CreateRoomOptions, 'name'>): CreateRoomOptions {
    return { ...o, name: getName(), clientVersion: APP_VERSION };
  }

  private async join(connect: (c: Client) => Promise<Room>, { silent = false } = {}): Promise<boolean> {
    await this.leave();
    this.set({ ...initial, status: 'connecting' });
    try {
      const room = await connect(this.getClient());
      this.attach(room);
      return true;
    } catch (e) {
      this.set({ status: 'closed', error: silent ? null : describeJoinError(e) });
      if (silent) AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
      return false;
    }
  }

  private attach(room: Room) {
    this.room = room;
    this.set({ status: 'connected', sessionId: room.sessionId, error: null });
    this.saveResume(room);

    room.onStateChange((s: { toJSON(): unknown }) => {
      if (this.room !== room) return;
      this.set({ state: s.toJSON() as SyncedState });
    });
    room.onMessage('hello', (m: { serverNow: number }) => {
      this.set({ serverOffset: m.serverNow - Date.now() });
    });
    room.onMessage('error', (m: { code: string }) => {
      this.set({ actionError: { code: m.code, at: Date.now() } });
    });
    room.onMessage('emote', (m: ServerEmote) => {
      const id = ++this.emoteId;
      this.set({ emotes: [...this.snapshot.emotes, { id, seat: m.seat, e: m.e }].slice(-8) });
      setTimeout(() => this.set({ emotes: this.snapshot.emotes.filter((x) => x.id !== id) }), 2600);
    });
    room.onDrop(() => {
      if (this.room === room) this.set({ status: 'reconnecting' });
    });
    room.onReconnect(() => {
      if (this.room !== room) return;
      this.set({ status: 'connected', sessionId: room.sessionId });
      this.saveResume(room);
    });
    room.onLeave((code: number) => {
      if (this.room !== room) return;
      this.room = null;
      const consented = code === 4000 || code === 1000;
      this.set({ status: 'closed', error: consented ? null : 'Connection to the table was lost.' });
      AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
    });
  }

  private saveResume(room: Room) {
    AsyncStorage.setItem(RESUME_KEY, JSON.stringify({ token: room.reconnectionToken, at: Date.now() })).catch(() => {});
  }

  async leave() {
    const room = this.room;
    this.room = null;
    AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
    if (room) {
      try {
        await room.leave(true);
      } catch {}
    }
    this.set({ ...initial });
  }

  // ------------------------------------------------------------ actions

  send<K extends keyof ClientMessages>(
    type: K,
    ...payload: ClientMessages[K] extends undefined ? [] : [ClientMessages[K]]
  ) {
    this.room?.send(type, payload[0]);
  }

  clearActionError() {
    this.set({ actionError: null });
  }

  inRoom() {
    return !!this.room;
  }
}

export const session = new GameSession();

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** Fetches open public tables from the server's HTTP API. */
export async function fetchPublicRooms(players?: number) {
  const url = `${serverUrl()}/api/rooms${players ? `?players=${players}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as {
    roomId: string;
    clients: number;
    maxClients: number;
    metadata?: { players: number; time: number; walls: number; host: string; phase: string };
  }[];
}

export async function pingServer(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${serverUrl()}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
