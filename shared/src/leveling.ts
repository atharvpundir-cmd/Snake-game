const BASE_XP = 100;
const GROWTH = 1.35;
const MAX_LEVEL = 100;

const LEVEL_XP_THRESHOLDS: number[] = (() => {
  const arr: number[] = [0, 0]; // index 0 unused; level 1 starts at 0 xp
  let req = BASE_XP;
  for (let level = 2; level <= MAX_LEVEL; level++) {
    arr[level] = arr[level - 1] + req;
    req = Math.round(req * GROWTH);
  }
  return arr;
})();

export function xpForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(level, MAX_LEVEL));
  return LEVEL_XP_THRESHOLDS[lvl];
}

export function getLevel(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (LEVEL_XP_THRESHOLDS[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface LevelProgress {
  level: number;
  currentLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  maxLevel: boolean;
}

export function getLevelProgress(xp: number): LevelProgress {
  const level = getLevel(xp);
  const currentLevelXp = xpForLevel(level);
  const maxLevel = level >= MAX_LEVEL;
  const xpForNextLevel = maxLevel ? 0 : xpForLevel(level + 1) - currentLevelXp;
  return {
    level,
    currentLevelXp,
    xpIntoLevel: xp - currentLevelXp,
    xpForNextLevel,
    maxLevel,
  };
}

export function xpFromMatch(score: number, won: boolean, isOnline: boolean): number {
  const base = Math.round(score * (isOnline ? 2 : 1));
  const winBonus = won && isOnline ? 50 : 0;
  return base + winBonus;
}
