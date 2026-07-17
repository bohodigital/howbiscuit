import { readFile } from 'node:fs/promises';

import ts from 'typescript';

export async function loadTypeScriptModule(filePath) {
  const source = await readFile(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      verbatimModuleSyntax: true,
    },
  });
  const errors = (result.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const message = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    )).join('\n');
    throw new Error(`TypeScript contract transpilation failed for ${filePath}:\n${message}`);
  }
  const payload = Buffer.from(`${result.outputText}\n//# sourceURL=${filePath.replaceAll('\\', '/')}\n`).toString('base64');
  return import(`data:text/javascript;base64,${payload}`);
}
