// Solano Heat — the dossier builder. Run it from the entry root:
//   MAKEFUN_OUTPUT_DIR=. node main.ts
// It writes dossier.json next to game/ and screenshots/, byte-identical on every run.
import { writeFileSync } from 'node:fs';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '.';
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(`${outDir}/dossier.json`, dossier);
console.log(`dossier.json written: ${dossier.length} bytes`);
// Dossier stats for the build log: text length and image count, so a too-long
// write-up or a missing screenshot is visible before the submit, not after it.
const parsed = JSON.parse(new TextDecoder().decode(dossier));
console.log(`dossier text: ${parsed.text.length} chars, images: ${parsed.images.length}`);
