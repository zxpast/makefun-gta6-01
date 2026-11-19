// Solano Heat — a small software canvas for the screenshot painter: an
// RGBA buffer with filled rectangles, scanline-filled polygons (with an
// alpha blend for translucent shapes), lines, circles and text. The painter
// draws the world into this, then the PNG encoder writes it out.

import { drawText, textWidth } from './font.mjs';

export { drawText, textWidth };

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

export function shade(hex, factor) {
  const [r, g, b] = Array.isArray(hex) ? hex : hexToRgb(hex);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(r * factor), clamp(g * factor), clamp(b * factor)];
}

export function lerpColor(a, b, t) {
  const ca = Array.isArray(a) ? a : hexToRgb(a);
  const cb = Array.isArray(b) ? b : hexToRgb(b);
  return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  setPixel(x, y, r, g, b, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.pixels[i] = r * alpha + this.pixels[i] * (1 - alpha);
    this.pixels[i + 1] = g * alpha + this.pixels[i + 1] * (1 - alpha);
    this.pixels[i + 2] = b * alpha + this.pixels[i + 2] * (1 - alpha);
    this.pixels[i + 3] = 255;
  }

  fillRect(x, y, w, h, color, alpha = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.setPixel(px, py, r, g, b, alpha);
    }
  }

  /** A horizontal band of sky: `top` and `bottom` colours, `y0..y1`. */
  vband(y0, y1, top, bottom) {
    const span = Math.max(1, y1 - y0);
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y += 1) {
      const [r, g, b] = lerpColor(top, bottom, (y - y0) / span);
      this.fillRect(0, y, this.width, 1, [r, g, b]);
    }
  }

  line(x0, y0, x1, y1, color, alpha = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= steps; i += 1) {
      this.setPixel(Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps), r, g, b, alpha);
    }
  }

  circle(cx, cy, radius, color, alpha = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) this.setPixel(x, y, r, g, b, alpha);
      }
    }
  }

  /** Fill a convex polygon (screen points [x, y]) by scanlines. */
  fillPolygon(points, color, alpha = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(this.height - 1, Math.floor(maxY)); y += 1) {
      const xs = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      xs.sort((a, b2) => a - b2);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(this.width - 1, Math.floor(xs[k + 1])); x += 1) {
          this.setPixel(x, y, r, g, b, alpha);
        }
      }
    }
  }

  strokePolygon(points, color, alpha = 1) {
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      this.line(x1, y1, x2, y2, color, alpha);
    }
  }
}
