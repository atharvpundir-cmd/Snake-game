import type { Direction, GameState, Position, Snake } from './engine.js';

const DIRS: Direction[] = ['up', 'down', 'left', 'right'];

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const VEC: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function key(p: Position): string {
  return `${p.x},${p.y}`;
}

function inBounds(p: Position, state: GameState): boolean {
  return p.x >= 0 && p.x < state.config.width && p.y >= 0 && p.y < state.config.height;
}

function wrapPosition(p: Position, state: GameState): Position {
  if (!state.config.wrap) return p;
  return {
    x: (p.x + state.config.width) % state.config.width,
    y: (p.y + state.config.height) % state.config.height,
  };
}

function buildOccupied(state: GameState): Set<string> {
  const occ = new Set<string>();
  for (const s of state.snakes) {
    if (!s.alive) continue;
    for (const seg of s.body) occ.add(key(seg));
  }
  return occ;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findNearestFood(head: Position, food: Position[]): Position | null {
  let best: Position | null = null;
  let bestDist = Infinity;
  for (const f of food) {
    const d = manhattan(head, f);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

function floodFillSize(start: Position, occupied: Set<string>, state: GameState, limit: number): number {
  const seen = new Set<string>([key(start)]);
  const queue: Position[] = [start];
  let count = 0;
  while (queue.length > 0 && count < limit) {
    const cur = queue.shift()!;
    count++;
    for (const dir of DIRS) {
      const raw = { x: cur.x + VEC[dir].x, y: cur.y + VEC[dir].y };
      const np = wrapPosition(raw, state);
      if (!inBounds(np, state)) continue;
      const k = key(np);
      if (seen.has(k) || occupied.has(k)) continue;
      seen.add(k);
      queue.push(np);
    }
  }
  return count;
}

/** Heuristic bot: seeks the nearest food while avoiding immediate collisions
 * and preferring moves that keep more open space (rough lookahead via flood fill). */
export function chooseBotDirection(state: GameState, snake: Snake): Direction {
  const occupied = buildOccupied(state);
  const head = snake.body[0];
  const tailKey = snake.body.length > 0 ? key(snake.body[snake.body.length - 1]) : null;
  if (tailKey && snake.growthPending === 0) occupied.delete(tailKey);

  const nearestFood = findNearestFood(head, state.food);
  const candidates = DIRS.filter((d) => d !== OPPOSITE[snake.direction]);

  let best: { dir: Direction; score: number } | null = null;
  for (const dir of candidates) {
    const raw = { x: head.x + VEC[dir].x, y: head.y + VEC[dir].y };
    const np = wrapPosition(raw, state);
    if (!inBounds(np, state)) continue;
    if (occupied.has(key(np))) continue;

    const space = floodFillSize(np, occupied, state, 40);
    const distScore = nearestFood ? -manhattan(np, nearestFood) : 0;
    const score = space * 2 + distScore * 5;
    if (!best || score > best.score) best = { dir, score };
  }

  return best ? best.dir : snake.direction;
}
