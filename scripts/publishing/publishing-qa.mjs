import { emitCompiledArticles } from './article-compiler.mjs';

const initial = await emitCompiledArticles({ check: true });
const compile = await emitCompiledArticles();
const final = await emitCompiledArticles({ check: true });
if (compile.changed || JSON.stringify(initial.normalized) !== JSON.stringify(final.normalized)) {
  throw new Error('Two clean publishing compilations produced different semantic output.');
}
process.stdout.write(`Publishing QA passed for ${final.compiled.length} article package(s).\n`);
