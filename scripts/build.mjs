import { build } from 'esbuild';
import { cp, mkdir, readFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/background.ts'], outfile: 'dist/background.js', bundle: true, format: 'iife', target: 'chrome116', legalComments: 'none' });
await build({ entryPoints: ['src/entry.ts'], outfile: 'dist/player.js', bundle: true, format: 'iife', globalName: 'BetterMiniPlayer', target: 'chrome116', loader: { '.css': 'text' }, legalComments: 'none', footer: { js: 'BetterMiniPlayer.toggle();' } });
await cp('extension/manifest.json', 'dist/manifest.json');
await cp('extension/icons', 'dist/icons', { recursive: true });
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.permissions.join(',') !== 'activeTab,scripting') throw new Error('Unexpected extension permissions.');
console.log('Built unpacked extension in dist/');
