// Solano Heat — the hand-in program (Node 22, standard library only).
//
// It gathers the game (game/) and the screenshots (screenshots/) from beside
// this file, lays them out under the output folder, and writes the
// dossier.json the judge reads, using the make.fun library vendored under
// vendor/. The grader runs it twice and both runs must write the same bytes,
// so it does nothing time- or chance-dependent: wipe, copy, write.
//
// Run it by hand like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// With no MAKEFUN_OUTPUT_DIR set it writes to /output, where the grader
// points it.
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// The four shots the painter renders. The hand-in checks them before the
// dossier is built: a missing shot, a non-PNG, or one over the cap should
// fail here with a plain message, not deep inside buildDossier.
const EXPECTED_SHOTS = ['1-chase.png', '2-heli.png', '3-roadblock.png', '4-finale.png'];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function checkShots() {
  for (const name of EXPECTED_SHOTS) {
    const path = join(root, 'screenshots', name);
    if (!existsSync(path)) throw new Error(`missing screenshot: screenshots/${name} — run node shots/render-shots.mjs first`);
    const bytes = statSync(path).size;
    if (bytes > CAPS.screenshots.max_bytes) throw new Error(`screenshot over the cap: ${name} is ${bytes} bytes, cap ${CAPS.screenshots.max_bytes}`);
    const head = Buffer.alloc(8);
    const fd = openSync(path, 'r');
    try {
      readSync(fd, head, 0, 8, 0);
    } finally {
      closeSync(fd);
    }
    if (!head.equals(PNG_MAGIC)) throw new Error(`screenshot is not a PNG: screenshots/${name}`);
  }
}

function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = walk(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

// Start from a clean slate, so a second run writes exactly what the
// first did — byte for byte.
rmSync(join(dest, 'game'), { recursive: true, force: true });
rmSync(join(dest, 'screenshots'), { recursive: true, force: true });
rmSync(join(dest, 'dossier.json'), { force: true });
mkdirSync(dest, { recursive: true });

checkShots();
cpSync(join(root, 'game'), join(dest, 'game'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(dest, 'screenshots'), { recursive: true });
}
const game = walk(join(dest, 'game'));
if (game.files > CAPS.game_max_files) throw new Error(`game has ${game.files} files, cap ${CAPS.game_max_files}`);
if (game.bytes > CAPS.game_max_bytes) throw new Error(`game is ${game.bytes} bytes, cap ${CAPS.game_max_bytes}`);
const dossier = buildDossier(dest, CAPS);
// buildDossier returns bytes, not a string: turn them into text so the
// length check below reads the JSON, not a comma-joined byte list.
const dossierText = Buffer.from(dossier).toString('utf8');
writeFileSync(join(dest, 'dossier.json'), dossierText);
const text = JSON.parse(dossierText).text.length;
console.log(`Solano Heat: ${game.files} game files (${game.bytes} bytes), 4 screenshots, dossier text ${text} chars (cap ${CAPS.text_max_bytes})`);
