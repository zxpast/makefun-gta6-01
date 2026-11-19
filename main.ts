// Solano Heat — dossier builder. Copies the playable game and its four
// screenshots into the output directory, then writes dossier.json with the
// kit's own buildDossier. Run from the repository root:
//
//   MAKEFUN_OUTPUT_DIR=. node main.ts        (dossier in place)
//   MAKEFUN_OUTPUT_DIR=out node main.ts      (dossier in out/)
//
// The output directory is the source of truth for the dossier: buildDossier
// reads game/ and screenshots/ from the directory it is given, so the copy
// happens first and the dossier second. When the output directory IS the
// repository root the copy is skipped — the files are already there — and
// the dossier is built in place. Either way the bytes are identical.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || 'out');
const sameDir = out === resolve(here);

if (!existsSync(join(here, 'game'))) {
  throw new Error('no game/ directory beside main.ts — run from the repository root');
}

// The scorer's own caps: only text_max_bytes shapes the bytes; the rest
// refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game in total).
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

if (!sameDir) {
  mkdirSync(join(out, 'game'), { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
}

const dossier = buildDossier(out, caps);
writeFileSync(join(out, 'dossier.json'), dossier);

const parsed = JSON.parse(new TextDecoder('utf-8').decode(dossier));
const textBytes = Buffer.byteLength(parsed.text || '', 'utf8');
console.log(`dossier: ${dossier.length} bytes in ${out}`);
console.log(`dossier text: ${textBytes} bytes (cap ${caps.text_max_bytes})`);
console.log(`screenshots: ${Object.keys(parsed.images || {}).length}, cover: ${parsed.cover}`);
