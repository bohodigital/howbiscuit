import { emitCompiledArticles } from './article-compiler.mjs';

const [command, ...flags] = process.argv.slice(2);
const check = flags.includes('--check');
if (!['validate', 'compile'].includes(command) || flags.some((flag) => flag !== '--check')) {
  throw new Error('Usage: node scripts/publishing/article-cli.mjs <validate|compile> [--check]');
}
if (command === 'validate') {
  const { compiled } = await emitCompiledArticles({ check: true });
  process.stdout.write(`Validated ${compiled.length} article package(s); generated outputs are current.\n`);
} else {
  const { compiled, changed } = await emitCompiledArticles({ check });
  process.stdout.write(`${check ? 'Checked' : 'Compiled'} ${compiled.length} article package(s); ${changed ? 'outputs updated' : 'outputs current'}.\n`);
}
