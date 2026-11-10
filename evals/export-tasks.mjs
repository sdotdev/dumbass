import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function exportTasks(split = 'dev', origin = 'http://127.0.0.1:4173') {
  if (!['dev', 'validation', 'held-out', 'adversarial'].includes(split)) throw new Error('Unknown split');
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Origin must be HTTP(S) without credentials');
  const corpus = JSON.parse(await readFile(new URL('./cases/tasks.json', import.meta.url), 'utf8'));
  return corpus.cases.filter(task => task.split === split).map(({route, goal, viewport, budget}) => ({
    url: new URL(route, base.origin).href, goal, viewport, budget,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg, i) => i % 2 === 0 && !['--split', '--origin'].includes(arg)) || args.length % 2) throw new Error('Usage: node evals/export-tasks.mjs [--split dev|validation|held-out|adversarial] [--origin http://127.0.0.1:4173]');
    const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    console.log(JSON.stringify(await exportTasks(value('--split'), value('--origin')), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
