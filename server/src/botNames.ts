export const BOT_NAMES = [
  'Viper',
  'Slink',
  'Nibbles',
  'Cobra',
  'Rattler',
  'Noodle',
  'Fang',
  'Sidewinder',
  'Python',
  'Mamba',
  'Hiss',
  'Scale',
];

export function randomBotName(used: Set<string>): string {
  const available = BOT_NAMES.filter((n) => !used.has(n));
  const pool = available.length > 0 ? available : BOT_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  used.add(name);
  return name;
}
