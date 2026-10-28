// Bundles the engine modules and UI into one self-contained dist/index.html.
// No dependencies: strips the engine's import/export lines and wraps the code
// in a single scope that exposes every exported name on `Engine`.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MODULES = ['data', 'stats', 'floors', 'model', 'sim', 'optimizer', 'presets'];

const exported = [];
const declared = new Map();
let code = '';
for (const m of MODULES) {
  let src = read(`src/engine/${m}.js`);
  src = src.replace(/^import [^;]+;\n/gm, '');
  src = src.replace(/^export (async function|function|const|let|class) ([A-Za-z0-9_$]+)/gm, (_, kw, name) => {
    exported.push(name);
    return `${kw} ${name}`;
  });
  if (/^export /m.test(src)) throw new Error(`Unhandled export form in ${m}.js`);
  for (const [, name] of src.matchAll(/^(?:async function|function|const|let|class) ([A-Za-z0-9_$]+)/gm)) {
    if (declared.has(name)) throw new Error(`Top-level name "${name}" in ${m}.js clashes with ${declared.get(name)}.js`);
    declared.set(name, m);
  }
  code += `// ---- ${m}.js ----\n${src}\n`;
}
const engine = `var Engine = (function () {\n'use strict';\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;

const page = read('src/ui/template.html')
  .replace('/*STYLE*/', () => read('src/ui/style.css'))
  .replace('/*ENGINE*/', () => engine)
  .replace('/*WORKER*/', () => read('src/ui/worker.js'))
  .replace('/*APP*/', () => read('src/ui/app.js'));

// dist/artifact.html: page body for a claude.ai artifact (the host adds the document shell).
// dist/index.html: complete standalone page (GitHub Pages, opening the file locally).
const split = page.indexOf('<div class="wrap">');
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Finds the best Obelisk Miner Archaeology skill point split for highest floor, fragments or experience.">
${page.slice(0, split)}</head>
<body>
${page.slice(split)}</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), page);
fs.writeFileSync(path.join(root, 'dist/index.html'), standalone);
console.log(`dist/index.html and dist/artifact.html written (${(page.length / 1024).toFixed(0)} KB, ${exported.length} engine exports)`);
