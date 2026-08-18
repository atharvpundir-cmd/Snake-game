export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface Snake {
  id: string;
  name: string;
  skinId: string;
  body: Position[]; // body[0] is the head
  direction: Direction;
  alive: boolean;
  score: number;
  growthPending: number;
  isBot: boolean;
}

export interface GameConfig {
  width: number;
  height: number;
  wrap: boolean;
  foodTarget: number;
}

export interface GameState {
  config: GameConfig;
  snakes: Snake[];
  food: Position[];
  tickNumber: number;
  finished: boolean;
}

export interface SnakeSpec {
  id: string;
  name: string;
  skinId: string;
  isBot: boolean;
}

export type TickInputs = Record<string, Direction | undefined>;

const DIRECTION_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const START_LENGTH = 4;

export const DEFAULT_CONFIG: GameConfig = {
  width: 30,
  height: 30,
  wrap: false,
  foodTarget: 4,
};

function key(p: Position): string {
  return `${p.x},${p.y}`;
}

function startingSpots(count: number, config: GameConfig): { x: number; y: number; dir: Direction }[] {
  const w = config.width;
  const h = config.height;
  const margin = Math.max(2, Math.floor(Math.min(w, h) * 0.15));
  const anchors: { x: number; y: number; dir: Direction }[] = [
    { x: margin, y: margin, dir: 'right' },
    { x: w - 1 - margin, y: h - 1 - margin, dir: 'left' },
    { x: w - 1 - margin, y: margin, dir: 'down' },
    { x: margin, y: h - 1 - margin, dir: 'up' },
    { x: Math.floor(w / 2), y: margin, dir: 'down' },
    { x: Math.floor(w / 2), y: h - 1 - margin, dir: 'up' },
    { x: margin, y: Math.floor(h / 2), dir: 'right' },
    { x: w - 1 - margin, y: Math.floor(h / 2), dir: 'left' },
  ];
  return anchors.slice(0, count);
}

function createSnake(spec: SnakeSpec, spot: { x: number; y: number; dir: Direction }): Snake {
  return {
    id: spec.id,
    name: spec.name,
    skinId: spec.skinId,
    body: [{ x: spot.x, y: spot.y }],
    direction: spot.dir,
    alive: true,
    score: 0,
    growthPending: START_LENGTH - 1,
    isBot: spec.isBot,
  };
}

function inBounds(p: Position, config: GameConfig): boolean {
  return p.x >= 0 && p.x < config.width && p.y >= 0 && p.y < config.height;
}

function wrapPosition(p: Position, config: GameConfig): Position {
  if (!config.wrap) return p;
  return {
    x: (p.x + config.width) % config.width,
    y: (p.y + config.height) % config.height,
  };
}

function occupiedCells(snakes: Snake[]): Set<string> {
  const occ = new Set<string>();
  for (const s of snakes) {
    if (!s.alive) continue;
    for (const seg of s.body) occ.add(key(seg));
  }
  return occ;
}

export function spawnFood(state: GameState, rng: () => number = Math.random): void {
  const occupied = occupiedCells(state.snakes);
  for (const f of state.food) occupied.add(key(f));

  const { width, height } = state.config;
  const maxAttempts = width * height * 2;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate: Position = {
      x: Math.floor(rng() * width),
      y: Math.floor(rng() * height),
    };
    const k = key(candidate);
    if (!occupied.has(k)) {
      state.food.push(candidate);
      return;
    }
  }
  // board is essentially full; skip spawning this cycle
}

export function createInitialState(
  config: GameConfig,
  specs: SnakeSpec[],
  rng: () => number = Math.random,
): GameState {
  const spots = startingSpots(specs.length, config);
  const snakes = specs.map((spec, i) => createSnake(spec, spots[i]));
  const state: GameState = { config, snakes, food: [], tickNumber: 0, finished: false };
  while (state.food.length < config.foodTarget) {
    spawnFood(state, rng);
  }
  return state;
}

export function tick(state: GameState, inputs: TickInputs, rng: () => number = Math.random): GameState {
  if (state.finished) return state;
  const { config } = state;

  const snakesAfterInput = state.snakes.map((s) => {
    if (!s.alive) return s;
    const requested = inputs[s.id];
    if (requested && requested !== OPPOSITE[s.direction]) {
      return { ...s, direction: requested };
    }
    return s;
  });

  // Cells that will be vacated this tick (tails of snakes that aren't growing) are safe to move into.
  const vacating = new Set<string>();
  for (const s of snakesAfterInput) {
    if (!s.alive) continue;
    if (s.growthPending === 0 && s.body.length > 0) {
      vacating.add(key(s.body[s.body.length - 1]));
    }
  }

  const staticOccupied = occupiedCells(snakesAfterInput);
  for (const c of vacating) staticOccupied.delete(c);

  const newHeads = new Map<string, Position>();
  for (const s of snakesAfterInput) {
    if (!s.alive) continue;
    const vec = DIRECTION_VECTORS[s.direction];
    const raw = { x: s.body[0].x + vec.x, y: s.body[0].y + vec.y };
    newHeads.set(s.id, wrapPosition(raw, config));
  }

  const deaths = new Set<string>();

  // Out of bounds (only relevant without wrap, since wrap already normalizes coords)
  for (const s of snakesAfterInput) {
    if (!s.alive) continue;
    const head = newHeads.get(s.id)!;
    if (!config.wrap && !inBounds(head, config)) deaths.add(s.id);
  }

  // Head-to-head collisions: any cell claimed by more than one new head
  const headCounts = new Map<string, string[]>();
  for (const [id, head] of newHeads) {
    if (deaths.has(id)) continue;
    const k = key(head);
    const list = headCounts.get(k) ?? [];
    list.push(id);
    headCounts.set(k, list);
  }
  for (const [, ids] of headCounts) {
    if (ids.length > 1) ids.forEach((id) => deaths.add(id));
  }

  // Collisions into bodies (self or other), excluding tails that vacate
  for (const s of snakesAfterInput) {
    if (!s.alive || deaths.has(s.id)) continue;
    const head = newHeads.get(s.id)!;
    if (staticOccupied.has(key(head))) deaths.add(s.id);
  }

  const foodByKey = new Map(state.food.map((f) => [key(f), f]));
  const eatenThisTick = new Set<string>();

  const resultSnakes: Snake[] = snakesAfterInput.map((s) => {
    if (!s.alive) return s;
    if (deaths.has(s.id)) {
      return { ...s, alive: false };
    }
    const head = newHeads.get(s.id)!;
    const headKey = key(head);
    const ateFood = foodByKey.has(headKey) && !eatenThisTick.has(headKey);
    let score = s.score;
    let growthPending = s.growthPending;
    if (ateFood) {
      eatenThisTick.add(headKey);
      score += 10;
      growthPending += 1;
    }

    const newBody = [head, ...s.body];
    if (growthPending > 0) {
      growthPending -= 1;
    } else {
      newBody.pop();
    }

    return { ...s, body: newBody, score, growthPending };
  });

  const remainingFood = state.food.filter((f) => !eatenThisTick.has(key(f)));
  const nextState: GameState = {
    config,
    snakes: resultSnakes,
    food: remainingFood,
    tickNumber: state.tickNumber + 1,
    finished: false,
  };

  while (nextState.food.length < config.foodTarget) {
    spawnFood(nextState, rng);
  }

  const aliveCount = resultSnakes.filter((s) => s.alive).length;
  nextState.finished = resultSnakes.length > 1 ? aliveCount <= 1 : aliveCount === 0;

  return nextState;
}
