import { describe, expect, it } from 'vitest';
import { createInitialState, tick, type GameConfig, type SnakeSpec } from '../src/engine.js';

function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const config: GameConfig = { width: 10, height: 10, wrap: false, foodTarget: 1 };

describe('createInitialState', () => {
  it('creates snakes with growth pending and no food overlap', () => {
    const specs: SnakeSpec[] = [
      { id: 'a', name: 'A', skinId: 'classic-green', isBot: false },
      { id: 'b', name: 'B', skinId: 'classic-green', isBot: true },
    ];
    const state = createInitialState(config, specs, seededRng(1));
    expect(state.snakes).toHaveLength(2);
    expect(state.snakes[0].body).toHaveLength(1);
    expect(state.snakes[0].growthPending).toBe(3);
    expect(state.food).toHaveLength(1);
  });
});

describe('tick', () => {
  it('moves a snake forward one cell per tick', () => {
    const specs: SnakeSpec[] = [{ id: 'a', name: 'A', skinId: 'classic-green', isBot: false }];
    let state = createInitialState(config, specs, seededRng(2));
    const start = state.snakes[0].body[0];
    state = tick(state, {}, seededRng(2));
    const head = state.snakes[0].body[0];
    expect(Math.abs(head.x - start.x) + Math.abs(head.y - start.y)).toBe(1);
  });

  it('kills a snake that hits the wall when wrap is disabled', () => {
    const specs: SnakeSpec[] = [{ id: 'a', name: 'A', skinId: 'classic-green', isBot: false }];
    let state = createInitialState({ ...config, width: 10, height: 10 }, specs, seededRng(3));
    // drive the snake left off the edge
    for (let i = 0; i < 20 && state.snakes[0].alive; i++) {
      state = tick(state, { a: 'left' }, seededRng(3));
    }
    expect(state.snakes[0].alive).toBe(false);
  });

  it('wraps around the board when wrap is enabled instead of dying', () => {
    const specs: SnakeSpec[] = [{ id: 'a', name: 'A', skinId: 'classic-green', isBot: false }];
    let state = createInitialState({ ...config, wrap: true }, specs, seededRng(4));
    for (let i = 0; i < 30; i++) {
      state = tick(state, { a: 'left' }, seededRng(4));
    }
    expect(state.snakes[0].alive).toBe(true);
  });

  it('grows and scores when eating food', () => {
    const specs: SnakeSpec[] = [{ id: 'a', name: 'A', skinId: 'classic-green', isBot: false }];
    let state = createInitialState(config, specs, seededRng(5));
    // wait out the initial growth so length is stable, then force food onto the next cell
    for (let i = 0; i < 3; i++) state = tick(state, {}, seededRng(5));
    const head = state.snakes[0].body[0];
    const dir = state.snakes[0].direction;
    const vec = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir];
    state.food = [{ x: head.x + vec.x, y: head.y + vec.y }];
    const lengthBefore = state.snakes[0].body.length;
    const scoreBefore = state.snakes[0].score;
    state = tick(state, {}, seededRng(5));
    expect(state.snakes[0].score).toBe(scoreBefore + 10);
    expect(state.snakes[0].body.length).toBe(lengthBefore + 1);
  });

  it('kills both snakes on a head-to-head collision', () => {
    const specs: SnakeSpec[] = [
      { id: 'a', name: 'A', skinId: 'classic-green', isBot: false },
      { id: 'b', name: 'B', skinId: 'classic-green', isBot: false },
    ];
    let state = createInitialState({ width: 10, height: 3, wrap: false, foodTarget: 0 }, specs, seededRng(6));
    state.snakes[0].body = [{ x: 4, y: 1 }];
    state.snakes[0].direction = 'right';
    state.snakes[0].growthPending = 0;
    state.snakes[1].body = [{ x: 6, y: 1 }];
    state.snakes[1].direction = 'left';
    state.snakes[1].growthPending = 0;
    state.food = [];
    state = tick(state, {}, seededRng(6));
    expect(state.snakes[0].alive).toBe(false);
    expect(state.snakes[1].alive).toBe(false);
  });

  it('marks the game finished when only one snake remains of several', () => {
    const specs: SnakeSpec[] = [
      { id: 'a', name: 'A', skinId: 'classic-green', isBot: false },
      { id: 'b', name: 'B', skinId: 'classic-green', isBot: false },
    ];
    let state = createInitialState({ width: 10, height: 10, wrap: false, foodTarget: 0 }, specs, seededRng(7));
    state.snakes[1].alive = false;
    state.food = [];
    state = tick(state, {}, seededRng(7));
    expect(state.finished).toBe(true);
  });
});
