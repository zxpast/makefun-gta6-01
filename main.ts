// Solano Heat — the dossier builder. Run it from anywhere:
//   MAKEFUN_OUTPUT_DIR=/output node main.ts
// It reads game/ and screenshots/ from the entry root (this file's directory,
// or MAKEFUN_BOT_DIR when the grader sets it) and writes dossier.json to
// MAKEFUN_OUTPUT_DIR, byte-identical on every run.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The entry root is where this file lives, so game/ and screenshots/ are found
// even when the output directory is a separate empty directory, as in the
// grader (MAKEFUN_BOT_DIR=/bot, MAKEFUN_OUTPUT_DIR=/output). The bot directory
// wins when the grader sets it; otherwise this file's own directory is the root.
const entryDir = process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url));

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? entryDir;
const dossier = buildDossier(entryDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier.json written to ${join(outDir, 'dossier.json')}: ${dossier.length} bytes`);
// Dossier stats for the build log: text length and image count, so a too-long
// write-up or a missing screenshot is visible before the submit, not after it.
const parsed = JSON.parse(new TextDecoder().decode(dossier));
console.log(`dossier text: ${parsed.text.length} chars, images: ${parsed.images.length}`);
