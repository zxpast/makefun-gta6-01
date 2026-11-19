// A tiny software canvas: an RGBA byte buffer with filled rectangles,
// lines, polygons and circles. No dependencies — the screenshot painter
// draws the staged game state into this and hands it to the PNG encoder.
export function createCanvas(width, height) {
  const data = new Uint8Array(width * height * 4);

  function blend(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.floor(y) * width + Math.floor(x)) * 4;
    if (a >= 255) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      return;
    }
    const f = a / 255;
    data[i] = Math.round(data[i] * (1 - f) + r * f);
    data[i + 1] = Math.round(data[i + 1] * (1 - f) + g * f);
    data[i + 2] = Math.round(data[i + 2] * (1 - f) + b * f);
    data[i + 3] = 255;
  }

  function fillRect(x, y, w, h, color) {
    const [r, g, b, a = 255] = color;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) blend(px, py, r, g, b, a);
    }
  }

  function drawLine(x0, y0, x1, y1, color, thickness = 1) {
    const [r, g, b, a = 255] = color;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const half = Math.floor(thickness / 2);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      for (let oy = -half; oy <= half; oy += 1) {
        for (let ox = -half; ox <= half; ox += 1) blend(cx + ox, cy + oy, r, g, b, a);
      }
    }
  }

  function fillPolygon(points, color) {
    const [r, g, b, a = 255] = color;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(height - 1, Math.ceil(maxY)); y += 1) {
      const xs = [];
      for (let i = 0; i < points.length; i += 1) {
        const p0 = points[i];
        const p1 = points[(i + 1) % points.length];
        if ((p0.y <= y && p1.y > y) || (p1.y <= y && p0.y > y)) {
          xs.push(p0.x + ((y - p0.y) * (p1.x - p0.x)) / (p1.y - p0.y));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xStart = Math.max(0, Math.ceil(xs[k]));
        const xEnd = Math.min(width - 1, Math.floor(xs[k + 1]));
        for (let x = xStart; x <= xEnd; x += 1) blend(x, y, r, g, b, a);
      }
    }
  }

  function fillCircle(cx, cy, radius, color) {
    const [r, g, b, a = 255] = color;
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) blend(x, y, r, g, b, a);
      }
    }
  }

  return {
    width, height, data,
    setPixel: blend, fillRect, drawLine, fillPolygon, fillCircle,
  };
}

/** Parse '#rrggbb' (or '#rgb') into [r, g, b, a]. */
export function hexColor(hex, alpha = 255) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha];
}
