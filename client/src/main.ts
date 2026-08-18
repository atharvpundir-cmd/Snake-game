import './style.css';
import { getLevelProgress, xpFromMatch } from '@shared';
import { loadProfile, saveProfile, type Profile } from './state/profile';
import { loadSettings, saveSettings, type GameSettings } from './state/settings';
import { initInput } from './input';
import { renderSkinsScreen } from './ui/skins';
import { renderLeaderboardScreen } from './ui/leaderboard';
import { startOfflineGame, type OfflineResult } from './modes/offline';
import { startOnlineMatch, type MatchPlayer, type MatchResult, type LeaderboardRow } from './modes/online';

const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

const profile: Profile = loadProfile();
const settings: GameSettings = loadSettings();

let stopCurrentGame: (() => void) | null = null;
let onlineDidFinish = false;

// ---- screen navigation ----
type ScreenName = 'menu' | 'settings' | 'skins' | 'leaderboard' | 'game' | 'gameover';

function showScreen(name: ScreenName): void {
  document.querySelectorAll<HTMLElement>('.screen').forEach((s) => s.classList.remove('active'));
  el(`screen-${name}`).classList.add('active');
}

function updateProfileChip(): void {
  el('profile-nickname').textContent = profile.nickname;
  const progress = getLevelProgress(profile.xp);
  el('profile-level').textContent = `Lv ${progress.level}`;
  const fill = el<HTMLDivElement>('xp-bar-fill');
  const pct = progress.maxLevel ? 100 : Math.round((progress.xpIntoLevel / Math.max(1, progress.xpForNextLevel)) * 100);
  fill.style.width = `${pct}%`;
  el('xp-bar-label').textContent = progress.maxLevel
    ? `Max level — ${profile.xp} XP total`
    : `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP`;
}

async function syncProfileToServer(xpDelta: number): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: profile.deviceId, nickname: profile.nickname, xpDelta }),
    });
    if (res.ok) {
      const data = (await res.json()) as { xp: number };
      profile.xp = Math.max(profile.xp, data.xp);
      saveProfile(profile);
      updateProfileChip();
    }
  } catch {
    // offline — local xp already applied, will sync next time we're online
  }
}

async function refreshProfileFromServer(): Promise<void> {
  try {
    const res = await fetch(
      `${SERVER_URL}/api/profile?deviceId=${encodeURIComponent(profile.deviceId)}&nickname=${encodeURIComponent(profile.nickname)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { xp: number };
      profile.xp = Math.max(profile.xp, data.xp);
      saveProfile(profile);
      updateProfileChip();
    }
  } catch {
    // offline, ignore
  }
}

// ---- menu ----
el('btn-play-offline').addEventListener('click', () => beginOffline());
el('btn-play-online').addEventListener('click', () => beginOnline());
el('btn-skins').addEventListener('click', () => {
  renderSkinsScreen(el('skins-grid'), profile, updateProfileChip);
  showScreen('skins');
});
el('btn-settings').addEventListener('click', () => {
  el<HTMLInputElement>('setting-nickname').value = profile.nickname;
  el<HTMLSelectElement>('setting-board-size').value = settings.boardSize;
  el<HTMLSelectElement>('setting-speed').value = settings.speed;
  el<HTMLInputElement>('setting-wrap').checked = settings.wrap;
  showScreen('settings');
});
el('btn-leaderboard').addEventListener('click', () => {
  showScreen('leaderboard');
  void renderLeaderboardScreen(el('leaderboard-list'));
});

// ---- settings screen ----
el('btn-settings-back').addEventListener('click', () => {
  const nickname = el<HTMLInputElement>('setting-nickname').value.trim();
  profile.nickname = nickname || profile.nickname;
  saveProfile(profile);

  settings.boardSize = el<HTMLSelectElement>('setting-board-size').value as GameSettings['boardSize'];
  settings.speed = el<HTMLSelectElement>('setting-speed').value as GameSettings['speed'];
  settings.wrap = el<HTMLInputElement>('setting-wrap').checked;
  saveSettings(settings);

  updateProfileChip();
  showScreen('menu');
});

// ---- skins screen ----
el('btn-skins-back').addEventListener('click', () => showScreen('menu'));

// ---- leaderboard screen ----
el('btn-leaderboard-back').addEventListener('click', () => showScreen('menu'));

// ---- game screen ----
const canvas = el<HTMLCanvasElement>('game-canvas');
initInput(el('dpad'));

el('btn-quit').addEventListener('click', () => {
  stopCurrentGame?.();
  stopCurrentGame = null;
  showScreen('menu');
});

el('btn-cancel-find').addEventListener('click', () => {
  stopCurrentGame?.();
  stopCurrentGame = null;
  showScreen('menu');
});

function showGameOver(title: string, lines: string[]): void {
  el('gameover-title').textContent = title;
  el('gameover-stats').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  showScreen('gameover');
}

el('btn-gameover-menu').addEventListener('click', () => showScreen('menu'));

// ---- offline mode ----
function beginOffline(): void {
  showScreen('game');
  el('waiting-overlay').classList.add('hidden');
  el('hud-status').textContent = `Offline · ${settings.boardSize} board`;
  el('hud-score').textContent = 'Score: 0';

  stopCurrentGame = startOfflineGame(
    canvas,
    profile,
    settings,
    (score) => {
      el('hud-score').textContent = `Score: ${score}`;
    },
    (result: OfflineResult) => {
      stopCurrentGame = null;
      const earned = xpFromMatch(result.score, result.won, false);
      profile.xp += earned;
      profile.offlineHighScore = Math.max(profile.offlineHighScore, result.score);
      saveProfile(profile);
      updateProfileChip();
      void syncProfileToServer(earned);
      showGameOver(result.won ? 'You Win!' : 'Game Over', [
        `Score: ${result.score}`,
        `XP earned: +${earned}`,
        `Offline best: ${profile.offlineHighScore}`,
      ]);
    },
  );
}

// ---- online mode ----
function beginOnline(): void {
  showScreen('game');
  onlineDidFinish = false;
  const overlay = el('waiting-overlay');
  overlay.classList.remove('hidden');
  el('waiting-text').textContent = 'Looking for players…';
  el('hud-status').textContent = 'Connecting…';
  el('hud-score').textContent = 'Score: 0';

  stopCurrentGame = startOnlineMatch(canvas, profile, {
    onQueueStatus: (position, size, roomSize) => {
      el('waiting-text').textContent = `Waiting for players… (${size} in queue, room fills to ${roomSize})`;
      void position;
    },
    onMatchStart: (players: MatchPlayer[]) => {
      overlay.classList.add('hidden');
      const botCount = players.filter((p) => p.isBot).length;
      const humanCount = players.length - botCount;
      el('hud-status').textContent = `${humanCount} player${humanCount === 1 ? '' : 's'} + ${botCount} bot${botCount === 1 ? '' : 's'}`;
    },
    onState: (state) => {
      const mine = state.snakes.find((s) => s.id === profile.deviceId);
      if (mine) el('hud-score').textContent = `Score: ${mine.score}`;
      const alive = state.snakes.filter((s) => s.alive).length;
      el('hud-status').textContent = `${alive} / ${state.snakes.length} alive`;
    },
    onMatchEnd: (results: MatchResult[], leaderboard: LeaderboardRow[]) => {
      onlineDidFinish = true;
      stopCurrentGame = null;
      void leaderboard;
      void refreshProfileFromServer();
      const mine = results.find((r) => r.nickname === profile.nickname);
      const sorted = [...results].sort((a, b) => b.score - a.score);
      const lines = sorted.map(
        (r, i) => `#${i + 1} ${r.nickname}${r.isBot ? ' (bot)' : ''} — ${r.score}${r.won ? ' 🏆' : ''}`,
      );
      showGameOver(mine?.won ? 'Victory!' : 'Match Over', lines);
    },
    onError: (message: string) => {
      if (onlineDidFinish) return;
      stopCurrentGame = null;
      showGameOver('Connection Problem', [message]);
    },
  });
}

// ---- boot ----
updateProfileChip();
showScreen('menu');
void refreshProfileFromServer();
