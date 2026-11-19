// Solano Heat — the hand-in program. Node 22, standard library only.
//
// It gathers the game (game/) and the screenshots (screenshots/) from
// beside this file, lays them out under the output folder, and writes the
// dossier.json the judge reads, using the make.fun library vendored under
// vendor/. The grader runs it twice and both runs must write the same
// bytes, so it does nothing time- or chance-dependent: wipe, copy, write.
//
// Run it by hand like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// With no MAKEFUN_OUTPUT_DIR set it writes to /output, where the grader
// points it.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json in the kit). Only the text
// cap shapes the dossier bytes; the others refuse an entry the scorer
// would refuse: more than 4 screenshots or one over 256 KiB, more than
// 993 files under game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes. game/ counts beside /output's own 1000-entry
// cap, together with screenshots/ and dossier.json.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Start from a clean slate, so a second run writes exactly what the
// first did — byte for byte.
rmSync(join(dest, 'game'), { recursive: true, force: true });
rmSync(join(dest, 'screenshots'), { recursive: true, force: true });
rmSync(join(dest, 'dossier.json'), { force: true });
mkdirSync(dest, { recursive: true });

cpSync(join(root, 'game'), join(dest, 'game'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(dest, 'screenshots'), { recursive: true });
}
writeFileSync(join(dest, 'dossier.json'), buildDossier(dest, CAPS));
