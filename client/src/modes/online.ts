import { io, type Socket } from 'socket.io-client';
import type { Direction, GameState } from '@shared';
import { renderState } from '../render';
import { setInputHandler } from '../input';
import type { Profile } from '../state/profile';

const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export interface MatchPlayer {
  snakeId: string;
  nickname: string;
  isBot: boolean;
}

export interface MatchResult {
  nickname: string;
  score: number;
  won: boolean;
  isBot: boolean;
}

export interface LeaderboardRow {
  nickname: string;
  score: number;
}

export interface OnlineCallbacks {
  onQueueStatus: (position: number, size: number, roomSize: number) => void;
  onMatchStart: (players: MatchPlayer[]) => void;
  onState: (state: GameState) => void;
  onMatchEnd: (results: MatchResult[], leaderboard: LeaderboardRow[]) => void;
  onError: (message: string) => void;
}

export function startOnlineMatch(canvas: HTMLCanvasElement, profile: Profile, callbacks: OnlineCallbacks): () => void {
  const socket: Socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
  let stopped = false;

  socket.on('connect', () => {
    socket.emit('findMatch', { deviceId: profile.deviceId, nickname: profile.nickname, skinId: profile.skinId });
  });

  socket.on('queueStatus', (s: { position: number; size: number; roomSize: number }) => {
    callbacks.onQueueStatus(s.position, s.size, s.roomSize);
  });

  socket.on('matchStart', (m: { state: GameState; players: MatchPlayer[] }) => {
    callbacks.onMatchStart(m.players);
    renderState(canvas, m.state);
  });

  socket.on('state', (payload: { state: GameState }) => {
    renderState(canvas, payload.state);
    callbacks.onState(payload.state);
  });

  socket.on('matchEnd', (payload: { results: MatchResult[]; leaderboard: LeaderboardRow[] }) => {
    callbacks.onMatchEnd(payload.results, payload.leaderboard);
  });

  socket.on('connect_error', () => {
    if (!stopped) callbacks.onError('Could not reach the online server. Check your connection and try again.');
  });

  socket.on('matchError', (e: { error: string }) => callbacks.onError(e.error));

  setInputHandler((dir: Direction) => {
    socket.emit('input', { direction: dir });
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    socket.emit('cancelFindMatch');
    setInputHandler(null);
    socket.disconnect();
  }

  return stop;
}
