// Solano Heat — the hand-in program (Node 22, standard library only).
//
// What it does, in plain terms: it takes the game in game/ and the screenshots in
// screenshots/ from beside this file, lays them out under the output folder the
// grader gives it, and writes the dossier.json the judge reads, using the
// make.fun library vendored under vendor/. It runs twice in the grader and both
// runs must write the same bytes, so it does nothing time- or chance-dependent:
// it copies files and writes the dossier the library computes from them.
//
// Run it by hand like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and check out/ afterwards. With no MAKEFUN_OUTPUT_DIR set it writes to /output,
// which is where the grader points it.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, and the folder to hand the entry into.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputRoot = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own limits (reference/gate.json in the kit): the text cap shapes the
// dossier's bytes, the others refuse an entry the scorer would refuse — more than
// four screenshots or one over 256 KiB, more than 993 files under game/ or 48 MiB
// of game files in all, or a path under game/ longer than 1000 bytes. game/ is
// counted beside /output's own 1000-entry cap, together with screenshots/ and
// dossier.json, so the game stays well inside them.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function clearOutputFolder() {
  // Start from a clean slate so a second run writes exactly what the first did.
  rmSync(join(outputRoot, 'game'), { recursive: true, force: true });
  rmSync(join(outputRoot, 'screenshots'), { recursive: true, force: true });
  rmSync(join(outputRoot, 'dossier.json'), { force: true });
  mkdirSync(outputRoot, { recursive: true });
}

function handIn() {
  clearOutputFolder();
  cpSync(join(repoRoot, 'game'), join(outputRoot, 'game'), { recursive: true });
  if (existsSync(join(repoRoot, 'screenshots'))) {
    cpSync(join(repoRoot, 'screenshots'), join(outputRoot, 'screenshots'), {
      recursive: true,
    });
  }
  const dossier = buildDossier(outputRoot, DOSSIER_LIMITS);
  writeFileSync(join(outputRoot, 'dossier.json'), dossier);
}

handIn();
