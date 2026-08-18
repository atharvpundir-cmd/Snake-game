export type BoardSizeKey = 'small' | 'medium' | 'large';
export type SpeedKey = 'slow' | 'normal' | 'fast';

export interface GameSettings {
  boardSize: BoardSizeKey;
  speed: SpeedKey;
  wrap: boolean;
}

const STORAGE_KEY = 'hidingsnake.settings.v1';

const DEFAULTS: GameSettings = { boardSize: 'medium', speed: 'normal', wrap: false };

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    // ignore corrupted storage
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const BOARD_SIZES: Record<BoardSizeKey, { width: number; height: number }> = {
  small: { width: 16, height: 16 },
  medium: { width: 24, height: 24 },
  large: { width: 32, height: 32 },
};

export const SPEEDS: Record<SpeedKey, number> = {
  slow: 220,
  normal: 150,
  fast: 90,
};
