import {build} from 'esbuild';
import {mkdir, copyFile, rm, writeFile, cp} from 'node:fs/promises';

await rm('dist', {recursive: true, force: true});
await mkdir('dist', {recursive: true});
await build({
  entryPoints: ['src/app.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/app.js',
  minify: true,
  platform: 'browser',
  external: ['node:*', 'fs', 'path', 'module', 'url'],
});
for (const n of ['index.html', 'style.css']) await copyFile(n, 'dist/' + n);
await copyFile('node_modules/manifold-3d/manifold.wasm', 'dist/manifold.wasm');
if (process.argv.includes('--pages')) {
  await rm('docs', {recursive: true, force: true});
  await cp('dist', 'docs', {recursive: true});
  await writeFile('docs/.nojekyll', '');
}
console.log('已建置靜態網站' + (process.argv.includes('--pages') ? '（含 docs/）' : ''));
