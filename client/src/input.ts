import type { Direction } from '@shared';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export type DirectionHandler = (dir: Direction) => void;

let activeHandler: DirectionHandler | null = null;

export function setInputHandler(handler: DirectionHandler | null): void {
  activeHandler = handler;
}

export function initInput(dpadEl: HTMLElement): void {
  window.addEventListener('keydown', (e) => {
    const dir = KEY_MAP[e.code];
    if (dir && activeHandler) {
      e.preventDefault();
      activeHandler(dir);
    }
  });
  dpadEl.querySelectorAll<HTMLButtonElement>('button[data-dir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir as Direction;
      if (activeHandler) activeHandler(dir);
    });
  });
}
