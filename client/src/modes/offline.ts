import { chooseBotDirection, createInitialState, tick, type Direction, type GameState, type SnakeSpec } from '@shared';
import { renderState } from '../render';
import { setInputHandler } from '../input';
import { BOARD_SIZES, SPEEDS, type GameSettings } from '../state/settings';
import type { Profile } from '../state/profile';

export interface OfflineResult {
  score: number;
  won: boolean;
}

const BOT_NAMES = ['Viper', 'Rattler', 'Cobra', 'Mamba', 'Fang'];

export function startOfflineGame(
  canvas: HTMLCanvasElement,
  profile: Profile,
  settings: GameSettings,
  onScoreChange: (score: number) => void,
  onGameOver: (result: OfflineResult) => void,
): () => void {
  const board = BOARD_SIZES[settings.boardSize];
  const botCount = board.width <= 16 ? 2 : 3;
  const config = { width: board.width, height: board.height, wrap: settings.wrap, foodTarget: Math.max(4, botCount + 3) };
  const humanId = 'you';

  const specs: SnakeSpec[] = [
    { id: humanId, name: profile.nickname || 'You', skinId: profile.skinId, isBot: false },
    ...BOT_NAMES.slice(0, botCount).map((name, i) => ({
      id: `bot-${i}`,
      name,
      skinId: 'classic-green',
      isBot: true,
    })),
  ];

  let state: GameState = createInitialState(config, specs);
  let pendingDirection: Direction | undefined;
  let stopped = false;

  setInputHandler((dir) => {
    pendingDirection = dir;
  });

  renderState(canvas, state);

  const intervalMs = SPEEDS[settings.speed];
  const interval = setInterval(() => {
    if (stopped) return;

    const inputs: Record<string, Direction | undefined> = {};
    if (pendingDirection) inputs[humanId] = pendingDirection;
    for (const snake of state.snakes) {
      if (!snake.alive || snake.id === humanId) continue;
      inputs[snake.id] = chooseBotDirection(state, snake);
    }

    state = tick(state, inputs);
    renderState(canvas, state);

    const human = state.snakes.find((s) => s.id === humanId);
    if (!human) return;
    onScoreChange(human.score);

    if (!human.alive) {
      const finalScore = human.score;
      stop();
      onGameOver({ score: finalScore, won: false });
    } else if (state.finished) {
      const finalScore = human.score;
      stop();
      onGameOver({ score: finalScore, won: true });
    }
  }, intervalMs);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    setInputHandler(null);
  }

  return stop;
}
