import { DEFAULT_SKIN_ID } from '@shared';

export interface Profile {
  deviceId: string;
  nickname: string;
  xp: number;
  offlineHighScore: number;
  skinId: string;
}

const STORAGE_KEY = 'hidingsnake.profile.v1';

function generateDeviceId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultProfile(): Profile {
  return {
    deviceId: generateDeviceId(),
    nickname: `Player${Math.floor(1000 + Math.random() * 9000)}`,
    xp: 0,
    offlineHighScore: 0,
    skinId: DEFAULT_SKIN_ID,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      const withDefaults = { ...defaultProfile(), ...parsed };
      if (!parsed.deviceId) saveProfile(withDefaults);
      return withDefaults;
    }
  } catch {
    // corrupted storage, fall through to a fresh profile
  }
  const fresh = defaultProfile();
  saveProfile(fresh);
  return fresh;
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
