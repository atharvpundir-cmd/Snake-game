import { SKINS, getLevel } from '@shared';
import { saveProfile, type Profile } from '../state/profile';

export function renderSkinsScreen(container: HTMLElement, profile: Profile, onChange: () => void): void {
  const level = getLevel(profile.xp);
  container.innerHTML = '';
  for (const skin of SKINS) {
    const unlocked = skin.minLevel <= level;
    const equipped = profile.skinId === skin.id;
    const card = document.createElement('div');
    card.className = ['skin-card', unlocked ? '' : 'locked', equipped ? 'selected' : ''].filter(Boolean).join(' ');

    const swatch = document.createElement('div');
    swatch.className = 'skin-swatch';
    swatch.style.background = skin.colors.head;

    const name = document.createElement('div');
    name.className = 'skin-name';
    name.textContent = skin.name;

    const lock = document.createElement('div');
    lock.className = 'skin-lock';
    lock.textContent = unlocked ? (equipped ? 'Equipped' : '') : `Unlocks at Lv ${skin.minLevel}`;

    card.append(swatch, name, lock);

    if (unlocked) {
      card.addEventListener('click', () => {
        profile.skinId = skin.id;
        saveProfile(profile);
        onChange();
        renderSkinsScreen(container, profile, onChange);
      });
    }
    container.appendChild(card);
  }
}
