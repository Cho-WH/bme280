import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = new URL('../../vendor/microbit-usb-1.0.0.js', import.meta.url);
const result = await build({
  absWorkingDir: root, entryPoints: ['entry.js'], bundle: true, format: 'esm',
  platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline',
  outfile: fileURLToPath(output), metafile: true,
  banner: { js: '// Micro:bit Foundation USB library 1.0.0. See microbit-usb-LICENSES.md and microbit-usb-manifest.json.' },
});
const lock = JSON.parse(await readFile(new URL('package-lock.json', import.meta.url), 'utf8'));
const licenses = new Map([
  ['@microbit/microbit-connection', 'LICENSE.md'],
  ['@microbit/microbit-universal-hex', 'LICENSE.md'],
  ['nrf-intel-hex', 'LICENSE'],
]);
const bundled = new Set(Object.keys(result.metafile.inputs).filter(p => p.startsWith('node_modules/'))
  .map(p => p.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)[1]));
const packages = [];
let notices = '# Bundled USB library licenses\n\n';
for (const name of [...bundled].sort()) {
  if (!licenses.has(name)) throw new Error(`Review license for new bundled dependency: ${name}`);
  const info = lock.packages[`node_modules/${name}`];
  packages.push({ name, version: info.version, source: info.resolved, integrity: info.integrity });
  notices += `## ${name} ${info.version}\n\n${await readFile(new URL(`node_modules/${name}/${licenses.get(name)}`, import.meta.url), 'utf8')}\n`;
}
const noticesPath = new URL('../../vendor/microbit-usb-LICENSES.md', import.meta.url);
await writeFile(noticesPath, notices);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = { packages, build: { tool: 'esbuild', version: lock.packages['node_modules/esbuild'].version },
  files: { 'microbit-usb-1.0.0.js': hash(await readFile(output)), 'microbit-usb-LICENSES.md': hash(notices) } };
await writeFile(new URL('../../vendor/microbit-usb-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bundled ${packages.length} packages, ${(await readFile(output)).length} bytes`);
