// A tiny software canvas for the screenshot painter: an RGBA buffer with
// the few operations a 3D scene needs — fill a rectangle, fill a polygon,
// fill a circle, draw a line, and draw text with the 5x7 bitmap font.
// No dependencies, no browser: the painter runs in Node and writes PNGs
// of the same staged game states the browser shows.
import { drawText } from './font.mjs';

export function createCanvas(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;

  function setPixel(x, y, r, g, b, a) {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return;
    const o = (yi * width + xi) * 4;
    if (a === undefined || a >= 255) {
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    } else {
      const t = a / 255;
      data[o] = Math.round(data[o] * (1 - t) + r * t);
      data[o + 1] = Math.round(data[o + 1] * (1 - t) + g * t);
      data[o + 2] = Math.round(data[o + 2] * (1 - t) + b * t);
    }
  }

  function fillRect(x, y, w, h, color, alpha) {
    const [r, g, b] = color;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) setPixel(xx, yy, r, g, b, alpha);
    }
  }

  // Scanline polygon fill for a convex or concave polygon of {x, y} points.
  function fillPolygon(points, color, alpha) {
    const [r, g, b] = color;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y += 1) {
      const xs = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const c = points[(i + 1) % points.length];
        if ((a.y <= y && c.y > y) || (c.y <= y && a.y > y)) {
          const t = (y - a.y) / (c.y - a.y);
          xs.push(a.x + (c.x - a.x) * t);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.floor(xs[k]));
        const x1 = Math.min(width - 1, Math.ceil(xs[k + 1]));
        for (let x = x0; x <= x1; x += 1) setPixel(x, y, r, g, b, alpha);
      }
    }
  }

  function fillCircle(cx, cy, radius, color, alpha) {
    const [r, g, b] = color;
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) setPixel(x, y, r, g, b, alpha);
      }
    }
  }

  function line(x0, y0, x1, y1, color, thickness) {
    const [r, g, b] = color;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const half = Math.floor((thickness || 1) / 2);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      for (let ox = -half; ox <= half; ox += 1) {
        for (let oy = -half; oy <= half; oy += 1) setPixel(cx + ox, cy + oy, r, g, b);
      }
    }
  }

  function text(str, x, y, scale, color) {
    drawText(data, width, height, String(str).toUpperCase(), x, y, scale || 2, color);
  }

  function textWidth(str, scale) {
    return String(str).length * 6 * (scale || 2);
  }

  return { width, height, data, setPixel, fillRect, fillPolygon, fillCircle, line, text, textWidth };
}
