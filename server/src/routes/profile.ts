import { Router } from 'express';
import { getLevelProgress } from '@hidingsnake/shared';
import { addXp, getOrCreatePlayer } from '../db.js';

export const profileRouter = Router();

function serialize(player: { device_id: string; nickname: string; xp: number; level: number }) {
  return {
    deviceId: player.device_id,
    nickname: player.nickname,
    xp: player.xp,
    level: player.level,
    progress: getLevelProgress(player.xp),
  };
}

profileRouter.get('/', (req, res) => {
  const deviceId = String(req.query.deviceId ?? '');
  const nickname = String(req.query.nickname ?? 'Player');
  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }
  const player = getOrCreatePlayer(deviceId, nickname);
  res.json(serialize(player));
});

profileRouter.post('/', (req, res) => {
  const { deviceId, nickname, xpDelta } = req.body ?? {};
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }
  const safeNickname = typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 24) : 'Player';
  const delta = Number.isFinite(xpDelta) ? Math.max(0, Math.floor(xpDelta)) : 0;
  const player = delta > 0 ? addXp(deviceId, safeNickname, delta) : getOrCreatePlayer(deviceId, safeNickname);
  res.json(serialize(player));
});
