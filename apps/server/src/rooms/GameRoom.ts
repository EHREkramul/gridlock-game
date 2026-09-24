import { matchMaker, Room, type Client, type Delayed } from 'colyseus';
import {
  applyAction,
  chooseBotAction,
  createConfig,
  createGame,
  eliminate,
  EMOTES,
  isBotLevel,
  MOVE_SECONDS,
  normalizeRoomOptions,
  RECONNECT_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  sanitizeName,
  START_COUNTDOWN_MS,
  type Action,
  type BotLevel,
  type CreateRoomOptions,
  type GameConfig,
  type GameState,
  type JoinRoomOptions,
  type OutReason,
  type RoomMetadata,
  type RoomPhase,
} from '@gridlock/engine';
import { GameRoomState, PlayerSchema, WallSchema } from './schema';

const BOT_NAMES = ['Nova', 'Pixel', 'Bolt', 'Echo', 'Juno', 'Rex', 'Orbit', 'Zed', 'Kite', 'Mochi'];
const BOT_THINK_MS: Record<BotLevel, [number, number]> = {
  easy: [500, 1100],
  medium: [600, 1300],
  hard: [700, 1500],
  expert: [800, 1700],
};
const EMOTE_COOLDOWN_MS = 1500;

const isInt = (v: unknown): v is number => Number.isInteger(v);

function randomCode(): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return s;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * One table, 2–6 seats. The server owns the only real GameState (`this.game`);
 * the synchronized schema is a projection of it that clients render from.
 * Clients only ever *ask* for actions — every rule is checked here with the
 * shared engine before anything changes.
 */
export class GameRoom extends Room<{ state: GameRoomState; metadata: RoomMetadata }> {
  state = new GameRoomState();

  private config!: GameConfig;
  private game: GameState | null = null;
  private autoBots: BotLevel | null = null;
  private turnTimer?: Delayed;
  private botTimer?: Delayed;
  private startTimer?: Delayed;
  private lastEmote = new Map<string, number>();

  messages = {
    move: (client: Client, msg: { x: number; y: number }) => {
      if (!msg || !isInt(msg.x) || !isInt(msg.y)) return this.fail(client, 'bad_request');
      this.act(client, { type: 'move', x: msg.x, y: msg.y });
    },
    wall: (client: Client, msg: { x: number; y: number; o: 'h' | 'v' }) => {
      if (!msg || !isInt(msg.x) || !isInt(msg.y) || (msg.o !== 'h' && msg.o !== 'v')) {
        return this.fail(client, 'bad_request');
      }
      this.act(client, { type: 'wall', x: msg.x, y: msg.y, o: msg.o });
    },
    resign: (client: Client) => {
      const p = this.playerOf(client);
      if (!p || !this.game || this.state.phase !== 'playing') return;
      this.takeOut(p.seat, 'resigned');
    },
    emote: (client: Client, msg: { e: string }) => {
      const p = this.playerOf(client);
      if (!p || !msg || !(EMOTES as readonly string[]).includes(msg.e)) return;
      const now = Date.now();
      if (now - (this.lastEmote.get(client.sessionId) ?? 0) < EMOTE_COOLDOWN_MS) return;
      this.lastEmote.set(client.sessionId, now);
      this.broadcast('emote', { seat: p.seat, e: msg.e });
    },
    rematch: (client: Client) => {
      const p = this.playerOf(client);
      if (!p || this.state.phase !== 'finished') return;
      const humans = this.state.players.filter((x) => !x.bot);
      if (humans.some((h) => !h.connected)) return this.fail(client, 'rematch_unavailable');
      p.rematch = true;
      if (this.state.players.every((x) => x.rematch)) this.startCountdown();
    },
    fillBots: (client: Client, msg: { level: string }) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      if (!msg || !isBotLevel(msg.level)) return this.fail(client, 'bad_request');
      this.fillWithBots(msg.level);
    },
    kick: (client: Client, msg: { seat: number }) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby' || !msg || !isInt(msg.seat)) return;
      const idx = this.state.players.findIndex((p) => p.seat === msg.seat && !!p.bot);
      if (idx < 0) return;
      this.state.players.splice(idx, 1);
      this.reseat();
      this.maxClients = this.state.playerCount;
    },
  };

  async onCreate(options: CreateRoomOptions) {
    const { players, time, walls } = normalizeRoomOptions(options ?? ({} as CreateRoomOptions));
    this.config = createConfig(players, walls || 10);
    this.autoBots = isBotLevel(options?.bots) ? options.bots : null;

    const isPrivate = !!options?.private || !!this.autoBots;
    if (isPrivate) {
      this.roomId = await this.uniqueCode();
      await this.setPrivate(true);
    }

    // a practice room is just the creator + bots
    this.maxClients = this.autoBots ? 1 : players;

    const s = this.state;
    s.code = this.roomId;
    s.isPrivate = isPrivate;
    s.playerCount = players;
    s.size = this.config.size;
    s.wallsPerPlayer = this.config.wallsPerPlayer;
    s.timeMs = time * 60_000;
    s.moveMs = MOVE_SECONDS * 1000;
    await this.setMetadata({ players, time, walls, host: sanitizeName(options?.name), phase: 'lobby' });
  }

  onJoin(client: Client, options: JoinRoomOptions) {
    if (this.state.phase !== 'lobby') throw new Error('game_already_started');
    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.name = sanitizeName(options?.name);
    player.seat = this.state.players.length;
    player.connected = true;
    this.state.players.push(player);
    if (!this.state.hostId) this.state.hostId = client.sessionId;

    client.send('hello', { serverNow: Date.now() });

    if (this.autoBots) this.fillWithBots(this.autoBots);
    else this.maybeStart();
  }

  onDrop(client: Client) {
    const p = this.playerOf(client);
    if (p) p.connected = false;
    // not awaited: the framework routes the outcome to onReconnect() or onLeave()
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: Client) {
    const p = this.playerOf(client);
    if (p) p.connected = true;
    client.send('hello', { serverNow: Date.now() });
  }

  onLeave(client: Client) {
    const idx = this.state.players.findIndex((p) => p.sessionId === client.sessionId);
    if (idx < 0) return;
    const p = this.state.players[idx];
    p.connected = false;
    this.lastEmote.delete(client.sessionId);

    const phase = this.state.phase as RoomPhase;
    if (phase === 'lobby' || phase === 'countdown') {
      this.state.players.splice(idx, 1);
      if (phase === 'countdown') this.cancelCountdown();
      this.reseat();
    } else if (phase === 'playing') {
      this.takeOut(p.seat, 'left');
    }
    // finished: keep the seat visible on the result screen, rematch is off

    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.find((x) => !x.bot && x.connected);
      this.state.hostId = next?.sessionId ?? '';
    }
  }

  onDispose() {
    this.clearTimers();
    this.startTimer?.clear();
  }

  onUncaughtException(error: unknown, method: string) {
    console.error(`[room ${this.roomId}] uncaught in ${method}:`, error);
  }

  // ---------------------------------------------------------------- lobby

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = randomCode();
      const taken = await matchMaker.query({ roomId: code });
      if (taken.length === 0) return code;
    }
    throw new Error('could_not_allocate_room_code');
  }

  private reseat() {
    this.state.players.forEach((p, i) => (p.seat = i));
    if (this.state.phase === 'lobby' && this.locked && this.state.players.length < this.state.playerCount) {
      void this.unlock();
    }
  }

  private fillWithBots(level: BotLevel) {
    const used = new Set(this.state.players.map((p) => p.name));
    const names = shuffle(BOT_NAMES.filter((n) => !used.has(n)));
    while (this.state.players.length < this.state.playerCount) {
      const bot = new PlayerSchema();
      bot.sessionId = `bot-${this.state.players.length}-${Math.random().toString(36).slice(2, 8)}`;
      bot.name = names.pop() ?? 'Bot';
      bot.bot = level;
      bot.seat = this.state.players.length;
      bot.connected = true;
      this.state.players.push(bot);
    }
    this.maybeStart();
  }

  private maybeStart() {
    if (this.state.phase === 'lobby' && this.state.players.length === this.state.playerCount) {
      this.startCountdown();
    }
  }

  private startCountdown() {
    void this.lock();
    this.clearTimers();
    this.state.phase = 'countdown';
    this.state.startsAt = Date.now() + START_COUNTDOWN_MS;
    void this.updatePhase('countdown');
    this.startTimer?.clear();
    this.startTimer = this.clock.setTimeout(() => this.startGame(), START_COUNTDOWN_MS);
  }

  private cancelCountdown() {
    this.startTimer?.clear();
    this.state.phase = 'lobby';
    this.state.startsAt = 0;
    void this.updatePhase('lobby');
  }

  private async updatePhase(phase: RoomPhase) {
    if (!this.metadata) return;
    await this.setMetadata({ ...this.metadata, phase });
  }

  // ---------------------------------------------------------------- game

  private startGame() {
    const s = this.state;
    // random seating every round, so nobody keeps the first move. The synced
    // array keeps join order; `seat` is what the engine and clients go by.
    const seats = shuffle(s.players.map((_, i) => i));
    s.players.forEach((p, i) => (p.seat = seats[i]));

    this.game = createGame(this.config, 0);
    s.walls.clear();
    for (const gp of this.game.players) {
      const p = this.bySeat(gp.seat);
      p.x = gp.x;
      p.y = gp.y;
      p.wallsLeft = gp.wallsLeft;
      p.status = 'active';
      p.outReason = '';
      p.rematch = false;
      p.clockMs = s.timeMs;
    }
    s.winner = -1;
    s.moveCount = 0;
    s.round++;
    s.phase = 'playing';
    void this.updatePhase('playing');

    // a player who dropped during the countdown and never came back is out from the start
    s.players.forEach((p) => {
      if (!p.bot && !p.connected && !this.clients.some((c) => c.sessionId === p.sessionId)) {
        this.game = eliminate(this.game!, p.seat, 'left');
      }
    });
    this.sync();
    if (this.game.finished) this.finish();
    else this.beginTurn();
  }

  private beginTurn() {
    const game = this.game!;
    const s = this.state;
    this.clearTimers();
    s.turn = game.turn;
    s.turnStartedAt = Date.now();

    const current = this.bySeat(game.turn);
    if (current.bot) {
      const [min, max] = BOT_THINK_MS[current.bot as BotLevel] ?? [600, 1200];
      this.botTimer = this.clock.setTimeout(() => this.botMove(current.seat), min + Math.random() * (max - min));
      return;
    }
    let limit = s.moveMs;
    if (s.timeMs > 0) limit = Math.min(limit, current.clockMs);
    this.turnTimer = this.clock.setTimeout(() => this.takeOut(current.seat, 'time'), Math.max(0, limit));
  }

  private botMove(seat: number) {
    const game = this.game;
    if (!game || game.finished || game.turn !== seat) return;
    const level = this.bySeat(seat).bot as BotLevel;
    let action: Action;
    try {
      action = chooseBotAction(game, seat, level);
    } catch (e) {
      console.error(`[room ${this.roomId}] bot failed`, e);
      this.takeOut(seat, 'left');
      return;
    }
    const res = applyAction(game, seat, action);
    if (res.ok) this.commit(res.state, seat);
    else this.takeOut(seat, 'left');
  }

  private act(client: Client, action: Action) {
    const p = this.playerOf(client);
    if (!p || !this.game || this.state.phase !== 'playing') return this.fail(client, 'not_playing');
    const res = applyAction(this.game, p.seat, action);
    if (process.env.DEBUG_ACTIONS)
      console.log(`[room ${this.roomId}] seat ${p.seat}`, action, res.ok ? 'ok' : res.error);
    if (!res.ok) return this.fail(client, res.error);
    this.commit(res.state, p.seat);
  }

  private commit(next: GameState, actor: number) {
    const s = this.state;
    const player = this.bySeat(actor);
    if (s.timeMs > 0 && !player.bot) {
      player.clockMs = Math.max(0, player.clockMs - (Date.now() - s.turnStartedAt));
    }
    this.game = next;
    this.sync();
    if (next.finished) this.finish();
    else this.beginTurn();
  }

  private takeOut(seat: number, reason: OutReason) {
    if (!this.game || this.game.finished) return;
    const wasTurn = this.game.turn === seat;
    const p = this.bySeat(seat);
    if (wasTurn && reason === 'time') p.clockMs = Math.max(0, p.clockMs - (Date.now() - this.state.turnStartedAt));
    this.game = eliminate(this.game, seat, reason);
    this.sync();
    if (this.game.finished) this.finish();
    else if (wasTurn) this.beginTurn();
  }

  private finish() {
    this.clearTimers();
    this.state.phase = 'finished';
    this.state.players.forEach((p) => (p.rematch = !!p.bot));
    void this.updatePhase('finished');
  }

  /** Projects the engine state onto the synchronized schema. */
  private sync() {
    const game = this.game!;
    const s = this.state;
    for (const gp of game.players) {
      const p = this.bySeat(gp.seat);
      p.x = gp.x;
      p.y = gp.y;
      p.wallsLeft = gp.wallsLeft;
      p.status = gp.status;
      p.outReason = gp.outReason ?? '';
    }
    for (let i = s.walls.length; i < game.walls.length; i++) {
      const w = game.walls[i];
      const ws = new WallSchema();
      ws.x = w.x;
      ws.y = w.y;
      ws.o = w.o;
      ws.owner = w.owner;
      s.walls.push(ws);
    }
    s.turn = game.turn;
    s.moveCount = game.moveCount;
    s.winner = game.winner ?? -1;
  }

  private clearTimers() {
    this.turnTimer?.clear();
    this.botTimer?.clear();
    this.turnTimer = undefined;
    this.botTimer = undefined;
  }

  private bySeat(seat: number) {
    return this.state.players.find((p) => p.seat === seat)!;
  }

  private playerOf(client: Client) {
    return this.state.players.find((p) => p.sessionId === client.sessionId);
  }

  private fail(client: Client, code: string) {
    client.send('error', { code });
  }
}
