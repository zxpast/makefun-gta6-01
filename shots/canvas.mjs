// A tiny software canvas: an RGB buffer with polygon fills, circles, lines and a
// 5x7 bitmap font. The screenshot painter draws the game into this, then png.mjs
// encodes it. No dependency, deterministic pixels.
const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001',
  O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011101110001', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
  '2': '01110100010000100110010001000011111', '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '1111100001000100010001000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
  ' ': '00000000000000000000000000000000000', '$': '0010001111101000111000101111100100',
  ':': '00000001000000000000000000100000000', '.': '0000000000000000000000000010000100',
  '-': '00000000000000001110000000000000000', '!': '00100001000010000100001000000000100',
  '+': '00000001000010001110001000010000000', '/': '0000100010000100010001000100010000',
  "'": '00100001000000000000000000000000000', '(': '00010001000100001000010000010000010',
  ')': '01000001000001000010000100010001000', '%': '11001110100001000100010000101110011',
  '*': '00100011101111101110101011000110001',
};

function parseColor(color) {
  if (Array.isArray(color)) return color;
  const hex = color.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
  }

  set(x, y, rgb, alpha = 1) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const at = (iy * this.width + ix) * 3;
    if (alpha >= 1) {
      this.pixels[at] = rgb[0];
      this.pixels[at + 1] = rgb[1];
      this.pixels[at + 2] = rgb[2];
    } else {
      this.pixels[at] = Math.round(this.pixels[at] * (1 - alpha) + rgb[0] * alpha);
      this.pixels[at + 1] = Math.round(this.pixels[at + 1] * (1 - alpha) + rgb[1] * alpha);
      this.pixels[at + 2] = Math.round(this.pixels[at + 2] * (1 - alpha) + rgb[2] * alpha);
    }
  }

  fill(color) {
    const rgb = parseColor(color);
    for (let i = 0; i < this.pixels.length; i += 3) {
      this.pixels[i] = rgb[0];
      this.pixels[i + 1] = rgb[1];
      this.pixels[i + 2] = rgb[2];
    }
  }

  fillRect(x, y, w, h, color, alpha = 1) {
    const rgb = parseColor(color);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.set(px, py, rgb, alpha);
    }
  }

  fillPolygon(points, color, alpha = 1) {
    const rgb = parseColor(color);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y += 1) {
      const xs = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          const t = (y - a.y) / (b.y - a.y);
          xs.push(a.x + (b.x - a.x) * t);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k]));
        const x1 = Math.min(this.width - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x += 1) this.set(x, y, rgb, alpha);
      }
    }
  }

  fillCircle(cx, cy, r, color, alpha = 1) {
    const rgb = parseColor(color);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, rgb, alpha);
      }
    }
  }

  drawLine(x0, y0, x1, y1, color, width = 1, alpha = 1) {
    const rgb = parseColor(color);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + (dx * i) / steps;
      const y = y0 + (dy * i) / steps;
      const half = Math.floor(width / 2);
      for (let oy = -half; oy <= half; oy += 1) {
        for (let ox = -half; ox <= half; ox += 1) this.set(x + ox, y + oy, rgb, alpha);
      }
    }
  }

  drawText(x, y, text, scale, color) {
    const rgb = parseColor(color);
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch];
      if (glyph === undefined) {
        cx += 6 * scale;
        continue;
      }
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (glyph[row * 5 + col] === '1') {
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, rgb);
          }
        }
      }
      cx += 6 * scale;
    }
    return cx - x;
  }
}
