export interface SkinColors {
  head: string;
  body: string;
  accent: string;
}

export interface Skin {
  id: string;
  name: string;
  minLevel: number;
  colors: SkinColors;
}

export const SKINS: Skin[] = [
  { id: 'classic-green', name: 'Classic Green', minLevel: 1, colors: { head: '#3ddc84', body: '#1f9e56', accent: '#0b5c30' } },
  { id: 'ocean-blue', name: 'Ocean Blue', minLevel: 3, colors: { head: '#4fc3f7', body: '#0288d1', accent: '#01579b' } },
  { id: 'sunset-orange', name: 'Sunset Orange', minLevel: 5, colors: { head: '#ffb74d', body: '#f57c00', accent: '#e65100' } },
  { id: 'royal-purple', name: 'Royal Purple', minLevel: 8, colors: { head: '#ba68c8', body: '#7b1fa2', accent: '#4a148c' } },
  { id: 'crimson', name: 'Crimson', minLevel: 12, colors: { head: '#ef5350', body: '#c62828', accent: '#8e0000' } },
  { id: 'gold', name: 'Gold', minLevel: 16, colors: { head: '#ffe082', body: '#ffb300', accent: '#ff6f00' } },
  { id: 'neon-cyber', name: 'Neon Cyber', minLevel: 20, colors: { head: '#e040fb', body: '#00e5ff', accent: '#1a1a1a' } },
  { id: 'obsidian', name: 'Obsidian', minLevel: 25, colors: { head: '#b0bec5', body: '#37474f', accent: '#000000' } },
];

export const DEFAULT_SKIN_ID = SKINS[0].id;

export function getSkin(skinId: string): Skin {
  return SKINS.find((s) => s.id === skinId) ?? SKINS[0];
}

export function getUnlockedSkins(level: number): Skin[] {
  return SKINS.filter((s) => s.minLevel <= level);
}

export function isSkinUnlocked(skinId: string, level: number): boolean {
  const skin = SKINS.find((s) => s.id === skinId);
  return skin ? skin.minLevel <= level : false;
}
