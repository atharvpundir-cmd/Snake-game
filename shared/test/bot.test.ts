import { describe, expect, it } from 'vitest';
import { chooseBotDirection } from '../src/bot.js';
import { createInitialState, tick, type GameConfig, type SnakeSpec } from '../src/engine.js';

function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const config: GameConfig = { width: 20, height: 20, wrap: false, foodTarget: 3 };

describe('chooseBotDirection', () => {
  it('never picks the reverse of the current direction', () => {
    const specs: SnakeSpec[] = [{ id: 'bot', name: 'Bot', skinId: 'classic-green', isBot: true }];
    const state = createInitialState(config, specs, seededRng(11));
    const snake = state.snakes[0];
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    const dir = chooseBotDirection(state, snake);
    expect(dir).not.toBe(opposite[snake.direction]);
  });

  it('survives many ticks without immediately dying (basic self-preservation)', () => {
    const specs: SnakeSpec[] = [{ id: 'bot', name: 'Bot', skinId: 'classic-green', isBot: true }];
    let state = createInitialState(config, specs, seededRng(12));
    for (let i = 0; i < 100 && state.snakes[0].alive; i++) {
      const dir = chooseBotDirection(state, state.snakes[0]);
      state = tick(state, { bot: dir }, seededRng(12 + i));
    }
    expect(state.snakes[0].alive).toBe(true);
  });
});
