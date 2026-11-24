// Kota Senja — make.fun gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder, plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js
// vendored under game/vendor/, no network request), and this program hands
// it in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. Put 3 or 4 JPEG screenshots in screenshots/
// (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Everything the entry must ship: the game, its modules, the plumbing, the
// license, the readme and the payout wallet. Fail loudly instead of handing
// in an entry that is missing a piece.
const required = [
  'game/index.html',
  'game/src/main.js',
  'game/src/util.js',
  'game/src/city.js',
  'game/src/vehicles.js',
  'game/src/actors.js',
  'game/src/missions.js',
  'game/src/audio.js',
  'game/src/hud.js',
  'game/src/shots.js',
  'game/vendor/three.module.min.js',
  'vendor/makefun-game.ts',
  'LICENSE',
  'README.md',
  '.makefun/owner.json',
];
for (const rel of required) {
  if (!existsSync(join(here, rel))) throw new Error(`missing required file: ${rel}`);
}

// At least 3 screenshots, each at most 256 KiB — the scorer refuses more
// than 4, or any one over the cap.
const shotDir = join(here, 'screenshots');
const shots = existsSync(shotDir)
  ? readdirSync(shotDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
  : [];
if (shots.length < 3) throw new Error(`need at least 3 screenshots, found ${shots.length}`);
for (const shot of shots) {
  const size = statSync(join(shotDir, shot)).size;
  if (size > 262144) throw new Error(`screenshot over 256 KiB: ${shot} (${size} bytes)`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
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

// Read the dossier back and make sure it is the summary the judge reads:
// a cover index, at least 3 images, and the entry text inside its cap.
// A silently broken dossier would hand in an entry nobody can grade.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
if (typeof dossier.cover !== 'number') throw new Error('dossier.json has no cover index');
if (!Array.isArray(dossier.images) || dossier.images.length < 3) {
  throw new Error(`dossier.json has ${dossier.images?.length ?? 0} images, need at least 3`);
}
if (typeof dossier.text !== 'string' || dossier.text.length > 163840) {
  throw new Error('dossier.json text is missing or over its 163840-byte cap');
}
console.log(`dossier.json ok: cover ${dossier.cover}, ${dossier.images.length} images, ${dossier.text.length} text bytes`);
