import type { Server, Socket } from 'socket.io';
import {
  chooseBotDirection,
  createInitialState,
  tick,
  xpFromMatch,
  type Direction,
  type GameState,
  type SnakeSpec,
} from '@hidingsnake/shared';
import { addLeaderboardScore, addXp, getTopScores } from './db.js';
import { randomBotName } from './botNames.js';

const ROOM_SIZE = 6;
const TICK_MS = 150;
const WAIT_MS = 6000;
const BOARD = { width: 26, height: 26, wrap: false };

interface QueuedPlayer {
  socket: Socket;
  deviceId: string;
  nickname: string;
  skinId: string;
}

interface RoomPlayer {
  deviceId: string | null; // null for pure bots
  nickname: string;
  skinId: string;
  socketId: string | null; // null once bot-controlled (disconnected or never human)
  isBot: boolean;
}

interface Room {
  id: string;
  state: GameState;
  players: Map<string, RoomPlayer>; // keyed by snakeId
  pendingDirection: Map<string, Direction>;
  interval: NodeJS.Timeout;
}

export function createMatchmaking(io: Server) {
  const queue: QueuedPlayer[] = [];
  const rooms = new Map<string, Room>();
  const socketToRoom = new Map<string, string>();
  let waitTimer: NodeJS.Timeout | null = null;

  function broadcastQueueStatus() {
    queue.forEach((p, idx) => {
      p.socket.emit('queueStatus', { position: idx + 1, size: queue.length, roomSize: ROOM_SIZE });
    });
  }

  function formRoom() {
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
    if (queue.length === 0) return;

    const humanCount = Math.min(queue.length, ROOM_SIZE);
    const humans = queue.splice(0, humanCount);
    const botCount = ROOM_SIZE - humanCount;

    const usedBotNames = new Set<string>();
    const specs: SnakeSpec[] = [];
    const meta: { deviceId: string | null; nickname: string; skinId: string; socketId: string | null; isBot: boolean }[] = [];

    for (const h of humans) {
      const snakeId = h.deviceId;
      specs.push({ id: snakeId, name: h.nickname, skinId: h.skinId, isBot: false });
      meta.push({ deviceId: h.deviceId, nickname: h.nickname, skinId: h.skinId, socketId: h.socket.id, isBot: false });
    }
    for (let i = 0; i < botCount; i++) {
      const snakeId = `bot-${Math.random().toString(36).slice(2, 10)}`;
      const name = randomBotName(usedBotNames);
      specs.push({ id: snakeId, name, skinId: 'classic-green', isBot: true });
      meta.push({ deviceId: null, nickname: name, skinId: 'classic-green', socketId: null, isBot: true });
    }

    const config = {
      ...BOARD,
      foodTarget: Math.max(4, specs.length * 2),
    };
    const initialState = createInitialState(config, specs);

    const roomId = `room-${Math.random().toString(36).slice(2, 10)}`;
    const players = new Map<string, RoomPlayer>();
    specs.forEach((spec, i) => {
      const m = meta[i];
      players.set(spec.id, { deviceId: m.deviceId, nickname: m.nickname, skinId: m.skinId, socketId: m.socketId, isBot: m.isBot });
    });

    const room: Room = {
      id: roomId,
      state: initialState,
      players,
      pendingDirection: new Map(),
      interval: setInterval(() => stepRoom(roomId), TICK_MS),
    };
    rooms.set(roomId, room);

    for (const h of humans) {
      h.socket.join(roomId);
      socketToRoom.set(h.socket.id, roomId);
      h.socket.emit('matchStart', { roomId, yourSnakeId: h.deviceId, state: room.state, players: serializePlayers(room) });
    }
    broadcastQueueStatus();
  }

  function serializePlayers(room: Room) {
    return Array.from(room.players.entries()).map(([snakeId, p]) => ({
      snakeId,
      nickname: p.nickname,
      skinId: p.skinId,
      isBot: p.isBot,
      connected: p.isBot ? true : p.socketId !== null,
    }));
  }

  function stepRoom(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;

    const inputs: Record<string, Direction | undefined> = {};
    for (const snake of room.state.snakes) {
      if (!snake.alive) continue;
      const player = room.players.get(snake.id);
      if (!player) continue;
      if (player.isBot) {
        inputs[snake.id] = chooseBotDirection(room.state, snake);
      } else {
        const pending = room.pendingDirection.get(snake.id);
        if (pending) inputs[snake.id] = pending;
      }
    }

    room.state = tick(room.state, inputs);
    io.to(roomId).emit('state', { state: room.state });

    if (room.state.finished) {
      finishRoom(room);
    }
  }

  function finishRoom(room: Room) {
    clearInterval(room.interval);
    rooms.delete(room.id);

    const aliveIds = room.state.snakes.filter((s) => s.alive).map((s) => s.id);
    const winnerId = aliveIds.length === 1 ? aliveIds[0] : null;

    const results: { nickname: string; score: number; won: boolean; isBot: boolean }[] = [];

    for (const snake of room.state.snakes) {
      const player = room.players.get(snake.id);
      if (!player) continue;
      const won = winnerId === snake.id;
      results.push({ nickname: player.nickname, score: snake.score, won, isBot: player.isBot });

      if (!player.isBot && player.deviceId) {
        const xp = xpFromMatch(snake.score, won, true);
        addXp(player.deviceId, player.nickname, xp);
        addLeaderboardScore(player.deviceId, player.nickname, snake.score);
      }
    }

    io.to(room.id).emit('matchEnd', { results, leaderboard: getTopScores(20) });

    for (const player of room.players.values()) {
      if (player.socketId) socketToRoom.delete(player.socketId);
    }
    io.socketsLeave(room.id);
  }

  io.on('connection', (socket) => {
    socket.on('findMatch', (payload: { deviceId?: string; nickname?: string; skinId?: string }) => {
      const deviceId = String(payload?.deviceId ?? '').slice(0, 64);
      if (!deviceId) {
        socket.emit('matchError', { error: 'deviceId is required' });
        return;
      }
      const nickname = String(payload?.nickname ?? 'Player').slice(0, 24) || 'Player';
      const skinId = String(payload?.skinId ?? 'classic-green');

      if (queue.some((p) => p.deviceId === deviceId) || socketToRoom.has(socket.id)) {
        return; // already queued or in a match
      }

      queue.push({ socket, deviceId, nickname, skinId });
      broadcastQueueStatus();

      if (queue.length >= ROOM_SIZE) {
        formRoom();
      } else if (!waitTimer) {
        waitTimer = setTimeout(formRoom, WAIT_MS);
      }
    });

    socket.on('cancelFindMatch', () => {
      const idx = queue.findIndex((p) => p.socket.id === socket.id);
      if (idx >= 0) queue.splice(idx, 1);
      broadcastQueueStatus();
    });

    socket.on('input', (payload: { direction?: Direction }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const direction = payload?.direction;
      if (!direction) return;

      for (const [snakeId, player] of room.players) {
        if (player.socketId === socket.id) {
          room.pendingDirection.set(snakeId, direction);
          break;
        }
      }
    });

    socket.on('disconnect', () => {
      const idx = queue.findIndex((p) => p.socket.id === socket.id);
      if (idx >= 0) {
        queue.splice(idx, 1);
        broadcastQueueStatus();
      }

      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      socketToRoom.delete(socket.id);
      const room = rooms.get(roomId);
      if (!room) return;
      for (const [snakeId, player] of room.players) {
        if (player.socketId === socket.id) {
          // hand control to the bot AI so the match continues
          room.players.set(snakeId, { ...player, socketId: null, isBot: true });
          break;
        }
      }
    });
  });
}
