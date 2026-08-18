import { Router } from 'express';
import { getTopScores } from '../db.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  res.json({ scores: getTopScores(limit) });
});
