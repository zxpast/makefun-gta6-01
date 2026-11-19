// Solano Heat — the entry program for make.fun gta6-01.
//
// It hands the game in: copies this repository's game/ and screenshots/ into
// the output directory and writes dossier.json there with the kit's vendored
// buildDossier library. game/ and screenshots/ are always read from beside
// this file, never from the output directory, so the program works the same
// when the grader runs it with an empty output directory.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');

if (!existsSync(join(gameSrc, 'index.html'))) {
  process.stderr.write('solano heat: game/index.html is missing next to main.ts\n');
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
// When the output directory IS this repository (MAKEFUN_OUTPUT_DIR=.),
// the game and screenshots are already in place — copying them onto
// themselves is an error, so skip the copy and just write the dossier.
const inPlace = resolve(outDir) === resolve(repoRoot);
if (!inPlace) {
  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (existsSync(shotsSrc)) cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, from the competition kit: at most 4 screenshots of at
// most 256 KiB, at most 993 files and 48 MiB under game/, and a dossier text
// cap of 160 KiB. The gate rebuilds the dossier with the same library and
// compares the two byte for byte, so these numbers must stay as the kit has
// them — change nothing here without re-checking the kit's RULES.txt.
const dossierText = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossierText);
const dossierBytes = statSync(dossierPath).size;
process.stdout.write(`solano heat: wrote ${dossierPath} (${dossierBytes} bytes)\n`);
