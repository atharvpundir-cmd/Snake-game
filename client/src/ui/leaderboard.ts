const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

interface ScoreRow {
  nickname: string;
  score: number;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function renderLeaderboardScreen(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch(`${SERVER_URL}/api/leaderboard?limit=25`);
    if (!res.ok) throw new Error('bad response');
    const data = (await res.json()) as { scores: ScoreRow[] };
    const scores = data.scores ?? [];
    if (scores.length === 0) {
      container.innerHTML = '<p class="hint">No scores yet — be the first to finish an online match!</p>';
      return;
    }
    container.innerHTML = scores
      .map(
        (s, i) => `
      <div class="lb-row">
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-name">${escapeHtml(s.nickname)}</span>
        <span class="lb-score">${s.score}</span>
      </div>`,
      )
      .join('');
  } catch {
    container.innerHTML = '<p class="hint">Could not reach the leaderboard. You may be offline.</p>';
  }
}
