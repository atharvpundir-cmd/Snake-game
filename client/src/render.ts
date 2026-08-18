import { getSkin, type GameState } from '@shared';

export function renderState(canvas: HTMLCanvasElement, state: GameState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = state.config;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight) || canvas.clientWidth || 480;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  const cell = size / Math.max(width, height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0e1626';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, height * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(width * cell, y * cell);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffd166';
  for (const food of state.food) {
    const cx = food.x * cell + cell / 2;
    const cy = food.y * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const snake of state.snakes) {
    const skin = getSkin(snake.skinId);
    const pad = cell * 0.08;
    snake.body.forEach((seg, i) => {
      const isHead = i === 0;
      ctx.fillStyle = !snake.alive ? '#3a3f4b' : isHead ? skin.colors.head : skin.colors.body;
      const r = cell * 0.28;
      const x = seg.x * cell + pad;
      const y = seg.y * cell + pad;
      const w = cell - pad * 2;
      const h = cell - pad * 2;
      roundedRect(ctx, x, y, w, h, r);
      ctx.fill();
      if (isHead && snake.alive) {
        ctx.fillStyle = skin.colors.accent;
        const eyeR = cell * 0.08;
        ctx.beginPath();
        ctx.arc(seg.x * cell + cell * 0.35, seg.y * cell + cell * 0.35, eyeR, 0, Math.PI * 2);
        ctx.arc(seg.x * cell + cell * 0.65, seg.y * cell + cell * 0.35, eyeR, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (snake.body.length > 0) {
      const head = snake.body[0];
      ctx.fillStyle = 'rgba(231,237,247,0.85)';
      ctx.font = `${Math.max(10, cell * 0.32)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(snake.name, head.x * cell + cell / 2, head.y * cell - 4);
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
