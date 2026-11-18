// Solano Heat — the hand-in program (Node 22, standard library only).
//
// It takes the game in game/ and the screenshots in screenshots/ from
// beside this file, lays them out under the output folder the grader
// gives it, and writes the dossier.json the judge reads, using the
// make.fun library vendored under vendor/. The grader runs it twice and
// both runs must write the same bytes, so it does nothing time- or
// chance-dependent: copy files, write the dossier the library computes.
//
// Run it by hand like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and check out/ afterwards. With no MAKEFUN_OUTPUT_DIR set it writes to
// /output, which is where the grader points it.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputRoot = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own limits (reference/gate.json in the kit). The text cap
// shapes the dossier's bytes; the others refuse an entry the scorer
// would refuse — more than four screenshots or one over 256 KiB, more
// than 993 files under game/ or 48 MiB of game files in all, or a path
// under game/ longer than 1000 bytes. game/ is counted beside /output's
// own 1000-entry cap, together with screenshots/ and dossier.json, so the
// game stays well inside them.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function wipeOutput() {
  // A clean slate, so a second run writes exactly what the first did.
  rmSync(join(outputRoot, 'game'), { recursive: true, force: true });
  rmSync(join(outputRoot, 'screenshots'), { recursive: true, force: true });
  rmSync(join(outputRoot, 'dossier.json'), { force: true });
  mkdirSync(outputRoot, { recursive: true });
}

wipeOutput();
cpSync(join(repoRoot, 'game'), join(outputRoot, 'game'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputRoot, 'screenshots'), { recursive: true });
}
writeFileSync(join(outputRoot, 'dossier.json'), buildDossier(outputRoot, LIMITS));
