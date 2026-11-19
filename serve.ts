// A tiny static server for local playtesting: serves this entry directory on
// http://localhost:8080 — open /game/ to play Solano Heat in the browser.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const PORT = 8080;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css',
  '.ts': 'text/plain',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url ?? '/').split('?')[0];
  const path = join(ROOT, url === '/' ? 'game/index.html' : url);
  if (!path.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const st = statSync(path);
    if (st.isDirectory()) {
      res.writeHead(302, { Location: `${url}/index.html` });
      res.end();
      return;
    }
    // No caching: a playtester must never see last build's game after a rebuild.
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`Solano Heat at http://localhost:${PORT}/game/`);
});
