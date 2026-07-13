import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const temporaryClient = join(root, '.sites-client-build');
const hosting = join(root, '.openai', 'hosting.json');

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('Run the normal Astro build before preparing the Sites bundle.');
}

const workerSource = readFileSync(join(dist, '_worker.js'), 'utf8');

rmSync(temporaryClient, { force: true, recursive: true });
renameSync(dist, temporaryClient);
mkdirSync(join(dist, 'client'), { recursive: true });

for (const entry of readdirSync(temporaryClient)) {
  if (entry === '_worker.js') continue;
  renameSync(join(temporaryClient, entry), join(dist, 'client', entry));
}
rmSync(temporaryClient, { force: true, recursive: true });

mkdirSync(join(dist, 'server'), { recursive: true });
writeFileSync(join(dist, 'server', 'index.js'), workerSource);
writeFileSync(
  join(dist, 'server', 'wrangler.json'),
  JSON.stringify({
    name: 'howbiscuit-field-guide',
    main: 'index.js',
    compatibility_date: '2026-07-13',
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    assets: {
      directory: '../client',
      binding: 'ASSETS',
      html_handling: 'auto-trailing-slash',
      not_found_handling: '404-page',
      run_worker_first: ['/api/*'],
    },
    no_bundle: true,
  }),
);

mkdirSync(join(dist, '.openai'), { recursive: true });
copyFileSync(hosting, join(dist, '.openai', 'hosting.json'));
if (existsSync(join(root, 'drizzle'))) {
  cpSync(join(root, 'drizzle'), join(dist, '.openai', 'drizzle'), { recursive: true });
}

console.log('Prepared Astro static output for Sites.');
