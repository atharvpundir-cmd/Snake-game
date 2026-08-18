import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { profileRouter } from './routes/profile.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { createMatchmaking } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/profile', profileRouter);
app.use('/api/leaderboard', leaderboardRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

createMatchmaking(io);

httpServer.listen(PORT, () => {
  console.log(`hidingsnake.io server listening on :${PORT}`);
});
