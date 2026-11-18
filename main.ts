// main.ts — Frostpeak Drift entry program for the make.fun GTA 6 bounty.
// Copies game/ and screenshots/ from this repository into the output directory
// and writes the dossier.json that vendor/makefun-game.ts builds from them.
// Runs on Node 22 with the standard library only; no install, no network.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

mkdirSync(outDir, { recursive: true });

// Start clean so a stale game/ or screenshots/ from an earlier run can never
// leak into this entry.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(outDir, name), { recursive: true, force: true });
}

cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Frostpeak Drift dossier written: ${dossier.length} bytes -> ${join(outDir, 'dossier.json')}`);
