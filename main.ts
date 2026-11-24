// Kota Senja — a make.fun gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js vendored
// under game/vendor/, no network request). This program hands it in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// The game itself: an original open-world crime game set in Kota Senja, an
// Indonesian dusk city. Explore on foot and by car, steal cars, dodge the
// Patroli (wanted system + police chase), fight Geng Purnama, and run six
// story missions from the flower market to the pier. HUD with minimap, start
// menu, pause, save/load in localStorage, synthesized sound.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast with a clear message when a deliverable is missing, instead of
// handing the scorer a half-empty /output.
const required = [
  'game/index.html',
  'game/vendor/three.module.min.js',
  'game/src/main.js',
  'LICENSE',
  '.makefun/owner.json',
];
for (const rel of required) {
  if (!existsSync(join(here, rel))) throw new Error(`Kota Senja: missing required file ${rel}`);
}
const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f))
  : [];
if (shots.length < 3) throw new Error(`Kota Senja: expected at least 3 screenshots, found ${shots.length}`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
console.log(`Kota Senja: copied game/ + ${shots.length} screenshots to ${out}`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
