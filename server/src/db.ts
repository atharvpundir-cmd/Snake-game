import Database from 'better-sqlite3';
import { getLevel } from '@hidingsnake/shared';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'hidingsnake.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    device_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard_scores (score DESC);
`);

export interface PlayerRow {
  device_id: string;
  nickname: string;
  xp: number;
  level: number;
  created_at: string;
}

const getPlayerStmt = db.prepare<{ deviceId: string }, PlayerRow>(
  'SELECT * FROM players WHERE device_id = @deviceId',
);
const insertPlayerStmt = db.prepare(
  'INSERT INTO players (device_id, nickname, xp, level) VALUES (@deviceId, @nickname, 0, 1)',
);
const updateNicknameStmt = db.prepare(
  'UPDATE players SET nickname = @nickname WHERE device_id = @deviceId',
);
const addXpStmt = db.prepare(
  'UPDATE players SET xp = xp + @xpDelta, level = @level WHERE device_id = @deviceId',
);

export function getOrCreatePlayer(deviceId: string, nickname: string): PlayerRow {
  let player = getPlayerStmt.get({ deviceId });
  if (!player) {
    insertPlayerStmt.run({ deviceId, nickname });
    player = getPlayerStmt.get({ deviceId });
  } else if (nickname && nickname !== player.nickname) {
    updateNicknameStmt.run({ deviceId, nickname });
    player = getPlayerStmt.get({ deviceId });
  }
  return player!;
}

export function addXp(deviceId: string, nickname: string, xpDelta: number): PlayerRow {
  const player = getOrCreatePlayer(deviceId, nickname);
  const newXp = player.xp + xpDelta;
  const newLevel = getLevel(newXp);
  addXpStmt.run({ deviceId, xpDelta, level: newLevel });
  return getPlayerStmt.get({ deviceId })!;
}

const insertScoreStmt = db.prepare(
  'INSERT INTO leaderboard_scores (device_id, nickname, score) VALUES (@deviceId, @nickname, @score)',
);

export function addLeaderboardScore(deviceId: string, nickname: string, score: number): void {
  insertScoreStmt.run({ deviceId, nickname, score });
}

const topScoresStmt = db.prepare<{ limit: number }, { nickname: string; score: number; created_at: string }>(
  'SELECT nickname, score, created_at FROM leaderboard_scores ORDER BY score DESC LIMIT @limit',
);

export function getTopScores(limit = 50) {
  return topScoresStmt.all({ limit });
}
