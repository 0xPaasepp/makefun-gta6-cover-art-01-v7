// cover.js — Velvet Heat cover render engine.
// Pure canvas, no libraries, no network at runtime. Every layout is computed
// from the canvas size in fractions, so one renderer serves the live preview
// and all three export sizes (1920x1080, 1080x1080, 1080x1350).

export const TEMPLATES = [
  { id: 'golden', name: 'Golden Hour Hero' },
  { id: 'ink', name: 'Ink Heat' },
  { id: 'neon', name: 'Neon Tilt' },
  { id: 'sunset', name: 'Sunset Sleeve' },
  { id: 'palm', name: 'Palm Grid' },
  { id: 'vice', name: 'Vice Magazine' },
];

export const GRADES = [
  { id: 'sunset', name: 'Sunset' },
  { id: 'golden', name: 'Golden' },
  { id: 'neon', name: 'Neon' },
  { id: 'ink', name: 'Ink' },
  { id: 'duotone', name: 'Duotone' },
];

// Photo slots: index 0..8. Labels are the fresh role names for this cover.
export const SAMPLE_PHOTOS = [
  { src: 'samples/boombox.jpg', name: 'Boombox', label: 'THE STAR', focusY: 0.47 },
  { src: 'samples/jetski.jpg', name: 'Jetski', label: 'THE ROOKIE', focusY: 0.48 },
  { src: 'samples/rooftop.jpg', name: 'Rooftop', label: 'THE DEALER' },
  { src: 'samples/boardwalk.jpg', name: 'Boardwalk', label: 'THE SIREN' },
  { src: 'samples/wheelman.jpg', name: 'Wheelman', label: 'THE WHEELMAN' },
  { src: 'samples/skateboarder.jpg', name: 'Skateboarder', label: 'THE FIXER' },
  { src: 'samples/convertible.jpg', name: 'Convertible', label: 'THE LOOKOUT' },
  { src: 'samples/palm-boulevard.jpg', name: 'Boulevard', label: 'THE CAPTAIN' },
  { src: 'samples/pier.jpg', name: 'Pier', label: 'THE MECHANIC', focusY: 0.3 },
];

// Kit alternates: loadable from the tray, not default slots.
export const ALTERNATE_PHOTOS = [
  { src: 'samples/boulevard.jpg', name: 'Boulevard II' },
];

export function defaultState() {
  return {
    template: 'golden',
    grade: 'sunset',
    contrast: 1,
    saturation: 1,
    brightness: 1,
    temperature: 0,
    grain: true,
    vignette: true,
    halftone: false,
    title: 'VELVET HEAT',
    subtitle: 'last light in Miramar',
    tagline: 'ONE CITY. EVERY SUMMER ENDS.',
    eyebrow: 'WELCOME TO MIRAMAR',
    quote: 'VELVET SKIES, LOUD NIGHTS.',
    quoteSource: 'THE MIRAMAR GAZETTE',
    production: 'A VELVET PICTURES PRODUCTION · STARRING YOU · SHOT ON YOUR OWN CAMERA · GRADED BY HAND',
    // One slot per photo: focus is the point of the source photo that the
    // panel centres on (0..1), zoom >= 1, rotate in degrees.
    slots: SAMPLE_PHOTOS.map((p) => ({
      src: p.src,
      label: p.label,
      focusX: 0.5,
      focusY: p.focusY ?? 0.42,
      zoom: 1,
      rotate: 0,
      grade: '',
    })),
  };
}

// ---------------------------------------------------------------- images

const imageCache = new Map();

export function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      p._img = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error(`cannot load ${src}`));
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

export async function loadAllPhotos(state) {
  const seen = new Set();
  const jobs = [];
  for (const s of state.slots) {
    if (s.src && !seen.has(s.src)) {
      seen.add(s.src);
      jobs.push(loadImage(s.src).catch(() => null));
    }
  }
  await Promise.all(jobs);
}

export function getImage(src) {
  const p = imageCache.get(src);
  return p && p._img ? p._img : null;
}

// ---------------------------------------------------------------- grades

function gradeFilter(grade, st, slot) {
  const g = slot.grade || grade;
  const c = st.contrast;
  const s = st.saturation;
  const b = st.brightness * (slot.bright || 1);
  switch (g) {
    case 'sunset':
      return `brightness(${b * 1.06}) contrast(${c * 1.08}) saturate(${s * 1.25}) sepia(0.18)`;
    case 'golden':
      return `brightness(${b * 1.08}) contrast(${c * 1.05}) saturate(${s * 1.15}) sepia(0.28)`;
    case 'neon':
      return `brightness(${b * 1.02}) contrast(${c * 1.14}) saturate(${s * 1.5}) hue-rotate(-14deg)`;
    case 'ink':
      return `brightness(${b * 1.05}) contrast(${c * 1.35}) saturate(${s * 0.22})`;
    case 'duotone':
      return `brightness(${b * 1.04}) contrast(${c * 1.22}) saturate(${s * 0.05})`;
    default:
      return `brightness(${b}) contrast(${c}) saturate(${s})`;
  }
}

function gradeTint(grade) {
  // [colour, alpha, composite] overlays applied after the filtered photo.
  switch (grade) {
    case 'sunset': return [['#ff7a3c', 0.10, 'overlay'], ['#c026d3', 0.06, 'overlay']];
    case 'golden': return [['#ffb347', 0.12, 'overlay']];
    case 'neon': return [['#ff2d78', 0.10, 'overlay'], ['#22d3ee', 0.08, 'overlay']];
    case 'ink': return [['#d63384', 0.14, 'overlay']];
    case 'duotone': return [['#7c3aed', 0.38, 'overlay'], ['#f5e9d0', 0.10, 'screen']];
    default: return [];
  }
}

// Face-aware halftone: sparse dots, capped radius, so eyes and lips stay
// modelled. Strength is deliberately low — ink is a look, not a shredder.
function applyHalftone(octx, w, h, strength) {
  const step = Math.max(7, Math.round(Math.min(w, h) / 90));
  const data = octx.getImageData(0, 0, w, h).data;
  octx.save();
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
      const r = Math.min(step * 0.48, (1 - lum) * step * 0.42 * strength);
      if (r < 0.6) continue;
      octx.beginPath();
      octx.fillStyle = `rgba(24, 4, 32, ${0.34 * strength})`;
      octx.arc(x, y, r, 0, Math.PI * 2);
      octx.fill();
    }
  }
  octx.restore();
}

let noisePattern = null;
function grainCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.floor(Math.random() * 40);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Render one photo into an offscreen canvas the size of its panel, with the
// grade filter, tint overlays and (for ink) the capped halftone applied.
function renderPanelImage(img, rect, slot, st) {
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d');
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const zoom = (slot.zoom || 1) * ((slot.rotate || 0) !== 0 ? 1.09 : 1);
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  let dx = w / 2 - (slot.focusX ?? 0.5) * dw;
  let dy = h / 2 - (slot.focusY ?? 0.42) * dh;
  dx = Math.min(0, Math.max(w - dw, dx));
  dy = Math.min(0, Math.max(h - dh, dy));
  o.filter = gradeFilter(st.grade, st, slot);
  o.drawImage(img, dx, dy, dw, dh);
  o.filter = 'none';
  const g = slot.grade || st.grade;
  for (const [colour, alpha, comp] of gradeTint(g)) {
    o.globalCompositeOperation = comp;
    o.globalAlpha = alpha;
    o.fillStyle = colour;
    o.fillRect(0, 0, w, h);
  }
  o.globalCompositeOperation = 'source-over';
  o.globalAlpha = 1;
  // Temperature wash.
  if (st.temperature > 0) {
    o.globalAlpha = st.temperature * 0.10;
    o.fillStyle = '#ff9a3c';
    o.fillRect(0, 0, w, h);
    o.globalAlpha = 1;
  } else if (st.temperature < 0) {
    o.globalAlpha = -st.temperature * 0.10;
    o.fillStyle = '#3b82f6';
    o.fillRect(0, 0, w, h);
    o.globalAlpha = 1;
  }
  if (g === 'ink' || st.halftone) applyHalftone(o, w, h, g === 'ink' ? 1 : 0.7);
  return off;
}

// Draw a panel: photo (rotated when the template asks), a thin inked edge,
// and its role label fully inside the panel. Returns the label rect.
function drawPanel(ctx, img, rect, slot, st, geom, labelAtTop = true) {
  const off = renderPanelImage(img, rect, slot, st);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (slot.rotate) ctx.rotate((slot.rotate * Math.PI) / 180);
  ctx.drawImage(off, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
  ctx.restore();
  // Inked edge.
  ctx.save();
  ctx.strokeStyle = 'rgba(12, 4, 22, 0.85)';
  ctx.lineWidth = Math.max(2, rect.w * 0.006);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
  ctx.restore();

  const label = drawLabel(ctx, rect, slot.label, labelAtTop);
  geom.panels.push({ rect: { ...rect }, slot: slot.label });
  geom.labels.push({ text: slot.label, panel: { ...rect }, label });
  return label;
}

// A role label: black pill, white caps, always fully inside its panel with
// margin from every edge. `atTop` puts it at the panel top (used when the
// panel bottom sits under the title band); otherwise at the bottom.
function drawLabel(ctx, rect, text, atTop = true) {
  const padX = Math.max(8, rect.w * 0.03);
  const padY = Math.max(6, rect.h * 0.03);
  const fontPx = Math.max(13, Math.min(30, rect.w * 0.055, rect.h * 0.14));
  ctx.save();
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const bw = Math.min(tw + padX * 2, rect.w - 16);
  const bh = fontPx + padY * 1.4;
  const bx = rect.x + (rect.w - bw) / 2;
  const by = atTop ? rect.y + 10 : rect.y + rect.h - bh - 10;
  ctx.fillStyle = 'rgba(8, 2, 16, 0.82)';
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
  ctx.restore();
  return { x: bx, y: by, w: bw, h: bh };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, r, colour) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStars(ctx, x, y, size, n, colour) {
  for (let i = 0; i < n; i++) drawStar(ctx, x + i * size * 1.35, y, size / 2, colour);
}

function drawStarburst(ctx, cx, cy, r, text, sub) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.78;
    const a = (Math.PI / spikes) * i;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3b0a1e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${r * 0.34}px system-ui, sans-serif`;
  ctx.fillText(text, 0, -r * 0.1);
  if (sub) {
    ctx.font = `700 ${r * 0.24}px system-ui, sans-serif`;
    ctx.fillText(sub, 0, r * 0.28);
  }
  ctx.restore();
}

function drawSeal(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.2);
  ctx.beginPath();
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.86;
    const a = (Math.PI / spikes) * i;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#ffe9a3');
  g.addColorStop(0.6, '#f5b942');
  g.addColorStop(1, '#b45309');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(124, 45, 18, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#3b0a1e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${r * 0.26}px system-ui, sans-serif`;
  ctx.fillText('ORIGINAL', 0, -r * 0.28);
  ctx.fillText('COVER', 0, r * 0.02);
  ctx.fillText('ART', 0, r * 0.32);
  ctx.restore();
}

// Deterministic barcode: same bars every render.
function drawBarcode(ctx, x, y, w, h, seed = 7) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 16);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.fillStyle = '#111';
  let bx = x;
  while (bx < x + w - 3) {
    const bw = 1 + Math.floor(rnd() * 4);
    if (rnd() > 0.42) ctx.fillRect(bx, y, bw, h);
    bx += bw + 1 + Math.floor(rnd() * 3);
  }
  ctx.fillStyle = '#111';
  ctx.font = `${Math.max(9, h * 0.16)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('8 52119 135429', x + w / 2, y + h + 2);
  ctx.restore();
  return { x: x - 4, y: y - 4, w: w + 8, h: h + 16 };
}

function gradientTitle(ctx, text, cx, y, fontPx, maxW) {
  ctx.save();
  ctx.font = `${fontPx}px Anton, 'Arial Narrow', sans-serif`;
  let w = ctx.measureText(text).width;
  let px = fontPx;
  while (w > maxW && px > 20) {
    px -= 4;
    ctx.font = `${px}px Anton, 'Arial Narrow', sans-serif`;
    w = ctx.measureText(text).width;
  }
  const g = ctx.createLinearGradient(cx - w / 2, y, cx + w / 2, y);
  g.addColorStop(0, '#ffe066');
  g.addColorStop(0.35, '#ff9e3d');
  g.addColorStop(0.62, '#ff5e8a');
  g.addColorStop(1, '#c026d3');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10, 2, 20, 0.92)';
  ctx.lineWidth = Math.max(3, px * 0.09);
  ctx.strokeText(text, cx, y);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = px * 0.12;
  ctx.shadowOffsetY = px * 0.04;
  ctx.fillStyle = g;
  ctx.fillText(text, cx, y);
  ctx.restore();
  return { x: cx - w / 2, y, w, h: px * 1.05, fontPx: px };
}

// ---------------------------------------------------------------- furniture

function drawQuoteBar(ctx, W, H, st, geom) {
  const y = H * 0.018;
  const h = H * 0.048;
  const starSize = h * 0.52;
  let x = W * 0.02;
  drawStars(ctx, x, y + h / 2, starSize, 5, '#ffd166');
  x += starSize * 1.35 * 5 + W * 0.012;
  ctx.save();
  // VOL. 1 badge first: the quote must shrink to end before it, never run
  // underneath it (portrait covers are narrow).
  const badge = 'VOL. 1';
  let badgePx = Math.round(h * 0.4);
  ctx.font = `700 ${badgePx}px system-ui, sans-serif`;
  const bw = ctx.measureText(badge).width + h * 0.7;
  const bx = W * 0.98 - bw;
  const avail = bx - W * 0.015 - x;
  const quote = `“${st.quote}” — ${st.quoteSource}`;
  let quotePx = Math.round(h * 0.42);
  ctx.font = `600 ${quotePx}px system-ui, sans-serif`;
  while (ctx.measureText(quote).width > avail && quotePx > 10) {
    quotePx -= 1;
    ctx.font = `600 ${quotePx}px system-ui, sans-serif`;
  }
  ctx.fillStyle = '#ffe9f2';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(quote, x, y + h / 2 + 1);
  ctx.font = `700 ${badgePx}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffd166';
  roundRect(ctx, bx, y + h * 0.08, bw, h * 0.84, 4);
  ctx.fill();
  ctx.fillStyle = '#3b0a1e';
  ctx.textAlign = 'center';
  ctx.fillText(badge, bx + bw / 2, y + h / 2 + 1);
  ctx.restore();
  geom.quoteBar = { x: W * 0.015, y, w: W * 0.97, h };
}

// Full-width title band: eyebrow, huge gradient Anton title, Pacifico script
// overlapping the title's lower edge, and a tagline pill at the band bottom.
function drawTitleBand(ctx, W, H, st, rect, geom, opts = {}) {
  const { scriptOverlap = true, twoLine = false, noScript = false, noTagline = false } = opts;
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  g.addColorStop(0, '#2a0f45');
  g.addColorStop(0.55, '#4a1042');
  g.addColorStop(1, '#7c1d4e');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(rect.x, rect.y, rect.w, 2);
  ctx.fillRect(rect.x, rect.y + rect.h - 2, rect.w, 2);
  ctx.restore();

  const cx = rect.x + rect.w / 2;
  const pad = rect.h * 0.08;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  const ebPx = Math.max(13, rect.h * 0.085);
  ctx.font = `700 ${ebPx}px system-ui, sans-serif`;
  ctx.fillText(st.eyebrow, cx, rect.y + pad + ebPx * 0.5);
  ctx.restore();

  let titleBottom;
  if (twoLine) {
    const linePx = Math.min(rect.h * 0.30, (rect.w * 0.42) / 6);
    const t1 = gradientTitle(ctx, 'VELVET', cx, rect.y + pad + ebPx + rect.h * 0.05, linePx, rect.w * 0.9);
    const t2 = gradientTitle(ctx, 'HEAT', cx, t1.y + t1.h * 0.92, linePx, rect.w * 0.9);
    titleBottom = t2.y + t2.h;
  } else {
    const titlePx = Math.min(rect.h * 0.44, rect.w * 0.115);
    const t = gradientTitle(ctx, st.title, cx, rect.y + pad + ebPx + rect.h * 0.03, titlePx, rect.w * 0.94);
    titleBottom = t.y + t.h;
  }

  // Script subtitle. In a two-line band it sits below the title instead of
  // overlapping it, so neither line is obscured. Short bands skip it.
  if (!noScript) {
    const scPx = Math.max(20, rect.h * (twoLine ? 0.15 : 0.17));
    ctx.save();
    ctx.font = `${scPx}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff8fb3';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const scY = scriptOverlap ? titleBottom - scPx * 0.28 : titleBottom + scPx * 0.75;
    ctx.fillText(st.subtitle, cx, scY);
    ctx.restore();
  }

  // Tagline pill.
  if (!noTagline) {
    const tgPx = Math.max(13, rect.h * 0.085);
    ctx.save();
    ctx.font = `700 ${tgPx}px system-ui, sans-serif`;
    const tw = ctx.measureText(st.tagline).width;
    const bw = Math.min(tw + tgPx * 2.4, rect.w * 0.9);
    const bh = tgPx * 1.9;
    const bx = cx - bw / 2;
    const by = rect.y + rect.h - bh - rect.h * 0.06;
    ctx.fillStyle = 'rgba(8, 2, 16, 0.85)';
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9f2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.tagline, cx, by + bh / 2 + 1);
    ctx.restore();
  }

  geom.titleBand = { ...rect };
  return rect;
}

// Bottom credits strip — the ONLY place the production line lives.
// Left: SUMMER 2026. Centre: production line (wraps to two lines when
// needed). Right: barcode, fully inside the frame with margin.
function drawFooter(ctx, W, H, st, geom, opts = {}) {
  const y = H * (opts.top ?? 0.9);
  const h = H - y - H * 0.012;
  const rect = { x: 0, y, w: W, h };
  ctx.save();
  ctx.fillStyle = '#160a26';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(rect.x, rect.y, rect.w, 1);
  ctx.restore();

  const midY = y + h / 2;
  const margin = W * 0.018;
  // Left: SUMMER 2026.
  const yrPx = Math.max(13, h * 0.30);
  ctx.save();
  ctx.font = `700 ${yrPx}px system-ui, sans-serif`;
  ctx.fillStyle = '#ff8fb3';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUMMER 2026', margin, midY);
  const leftW = ctx.measureText('SUMMER 2026').width;
  ctx.restore();

  // Right: barcode, fully inside with margin.
  const bcW = Math.min(W * 0.085, 150);
  const bcH = h * 0.52;
  const bc = drawBarcode(ctx, W - margin - bcW, midY - bcH / 2, bcW, bcH);

  // Centre: production line, wrapped to fit between left and right furniture.
  // Shrink the font until the text fits on at most two lines, so the line
  // block always stays inside the footer band.
  const avail = W - margin - leftW - W * 0.03 - (W - bc.x) - W * 0.03;
  let prodPx = Math.max(12, h * 0.24);
  let lines = [];
  ctx.save();
  while (prodPx > 11) {
    ctx.font = `${prodPx}px system-ui, sans-serif`;
    lines = wrapText(ctx, st.production, avail);
    if (lines.length <= 2) break;
    prodPx -= 1;
  }
  ctx.font = `${prodPx}px system-ui, sans-serif`;
  ctx.fillStyle = '#d9c8ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineH = prodPx * 1.35;
  // Centre the lines inside the free region between SUMMER 2026 and the
  // barcode — never on the full canvas centre, or the first line runs over
  // the left furniture.
  const centerX = margin + leftW + W * 0.03 + avail / 2;
  const startY = midY - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, centerX, startY + i * lineH));
  ctx.restore();

  geom.footer = { ...rect };
  geom.productionLine = {
    x: centerX - avail / 2,
    y: startY - prodPx / 2,
    w: avail,
    h: lines.length * lineH,
  };
  return rect;
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function finishCover(ctx, W, H, st) {
  // Grain + vignette over the whole cover.
  if (st.grain) {
    if (!noisePattern) noisePattern = ctx.createPattern(grainCanvas(160, 160), 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = noisePattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (st.vignette) {
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(10, 2, 20, 0)');
    v.addColorStop(1, 'rgba(10, 2, 20, 0.34)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Outer frame.
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.restore();
}

// ---------------------------------------------------------------- templates

function slotImg(state, i) {
  const slot = state.slots[i];
  return slot ? getImage(slot.src) : null;
}

function layoutGolden(ctx, W, H, st, geom) {
  drawQuoteBar(ctx, W, H, st, geom);
  const hero = { x: W * 0.015, y: H * 0.075, w: W * 0.40, h: H * 0.565 };
  const gx = W * 0.425;
  const gw = W * 0.275;
  const gh = H * 0.275;
  const cells = [
    { r: { x: gx, y: H * 0.075, w: gw, h: gh }, slot: 1 },
    { r: { x: gx + gw + W * 0.01, y: H * 0.075, w: gw, h: gh }, slot: 2 },
    { r: { x: gx, y: H * 0.365, w: gw, h: gh }, slot: 3 },
    { r: { x: gx + gw + W * 0.01, y: H * 0.365, w: gw, h: gh }, slot: 4 },
  ];
  const heroImg = slotImg(st, 0);
  if (heroImg) drawPanel(ctx, heroImg, hero, st.slots[0], st, geom, true);
  for (const c of cells) {
    const img = slotImg(st, c.slot);
    if (img) drawPanel(ctx, img, c.r, st.slots[c.slot], st, geom, true);
  }
  drawTitleBand(ctx, W, H, st, { x: 0, y: H * 0.66, w: W, h: H * 0.225 }, geom);
  // Fill the band's empty left side with a small gold MIRAMAR mark so the
  // band reads as designed furniture, not blank space.
  ctx.save();
  const bandY = H * 0.66;
  const bandH = H * 0.225;
  ctx.fillStyle = '#ffd166';
  ctx.font = `700 ${Math.max(14, bandH * 0.11)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('M I R A M A R', W * 0.03, bandY + bandH * 0.52);
  ctx.fillStyle = 'rgba(255, 209, 102, 0.7)';
  ctx.fillRect(W * 0.03, bandY + bandH * 0.36, W * 0.085, 2);
  ctx.fillRect(W * 0.03, bandY + bandH * 0.68, W * 0.085, 2);
  ctx.restore();
  drawFooter(ctx, W, H, st, geom, { top: 0.9 });
  // Gold seal at the right end of the title band.
  drawSeal(ctx, W * 0.935, H * 0.772, Math.min(W, H) * 0.052);
  // Starburst on the hero's top corner.
  drawStarburst(ctx, W * 0.375, H * 0.115, Math.min(W, H) * 0.038, 'EST.', '2026');
}

function layoutInk(ctx, W, H, st, geom) {
  drawQuoteBar(ctx, W, H, st, geom);
  const gap = W * 0.008;
  const cw = (W * 0.97 - gap * 2) / 3;
  const ch = (H * 0.685 - gap * 2) / 3;
  const x0 = W * 0.015;
  const y0 = H * 0.075;
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const rect = { x: x0 + col * (cw + gap), y: y0 + row * (ch + gap), w: cw, h: ch };
    const img = slotImg(st, i);
    if (img) drawPanel(ctx, img, rect, st.slots[i], st, geom, true);
  }
  // Short band: eyebrow + title + tagline only, no script — the script
  // collided with the tagline pill here in v6's sister build.
  drawTitleBand(ctx, W, H, st, { x: 0, y: H * 0.78, w: W, h: H * 0.13 }, geom, { scriptOverlap: false, noScript: true });
  drawFooter(ctx, W, H, st, geom, { top: 0.92 });
  drawSeal(ctx, W * 0.935, H * 0.845, Math.min(W, H) * 0.042);
}

function layoutNeon(ctx, W, H, st, geom) {
  // Portrait-first tilted layout. Panels never overlap: rotation is small
  // (<=3 deg) and gaps are wide, so no seam can cross a face. The production
  // line lives ONLY in the footer band at the very bottom.
  drawQuoteBar(ctx, W, H, st, geom);
  const topA = { x: W * 0.04, y: H * 0.062, w: W * 0.56, h: H * 0.30 };
  const topB = { x: W * 0.63, y: H * 0.078, w: W * 0.33, h: H * 0.28 };
  const botC = { x: W * 0.04, y: H * 0.578, w: W * 0.30, h: H * 0.265 };
  const botD = { x: W * 0.36, y: H * 0.583, w: W * 0.30, h: H * 0.265 };
  const botE = { x: W * 0.68, y: H * 0.578, w: W * 0.28, h: H * 0.265 };
  const jobs = [
    { r: topA, slot: 0, rot: -2.5 },
    { r: topB, slot: 4, rot: 3 },
    { r: botC, slot: 2, rot: 2 },
    { r: botD, slot: 5, rot: -2, bright: 1.30 },
    { r: botE, slot: 1, rot: 2.5 },
  ];
  for (const j of jobs) {
    const img = slotImg(st, j.slot);
    if (!img) continue;
    const slot = { ...st.slots[j.slot], rotate: j.rot, bright: j.bright || 1 };
    drawPanel(ctx, img, j.r, slot, st, geom, true);
  }
  // Stacked two-line title with the script below it (never overlapping the
  // title), and no tagline pill in the band — Neon draws its own tagline
  // strip below the bottom panels, and a second pill here would duplicate it.
  drawTitleBand(ctx, W, H, st, { x: 0, y: H * 0.378, w: W, h: H * 0.185 }, geom, { twoLine: true, scriptOverlap: false, noTagline: true });
  // Tagline pill sits in its own strip between the bottom panels and footer.
  const tgPx = Math.max(13, H * 0.016);
  ctx.save();
  ctx.font = `700 ${tgPx}px system-ui, sans-serif`;
  const tw = ctx.measureText(st.tagline).width;
  const bw = Math.min(tw + tgPx * 2.4, W * 0.9);
  const bh = tgPx * 1.9;
  ctx.fillStyle = 'rgba(8, 2, 16, 0.85)';
  roundRect(ctx, W / 2 - bw / 2, H * 0.858, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = '#ffe9f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(st.tagline, W / 2, H * 0.858 + bh / 2 + 1);
  ctx.restore();
  geom.taglineBar = { x: W / 2 - bw / 2, y: H * 0.858, w: bw, h: bh };
  drawFooter(ctx, W, H, st, geom, { top: 0.895 });
}

function layoutSunset(ctx, W, H, st, geom) {
  drawQuoteBar(ctx, W, H, st, geom);
  const hero = { x: W * 0.015, y: H * 0.075, w: W * 0.50, h: H * 0.545 };
  const heroImg = slotImg(st, 0);
  if (heroImg) drawPanel(ctx, heroImg, hero, st.slots[0], st, geom, true);
  const gx = W * 0.525;
  const gw = W * 0.225;
  const cells = [
    { r: { x: gx, y: H * 0.075, w: gw, h: H * 0.265 }, slot: 1 },
    { r: { x: gx + gw + W * 0.01, y: H * 0.075, w: gw, h: H * 0.265 }, slot: 2 },
    { r: { x: gx, y: H * 0.35, w: gw, h: H * 0.27 }, slot: 4 },
    { r: { x: gx + gw + W * 0.01, y: H * 0.35, w: gw, h: H * 0.27 }, slot: 3 },
  ];
  for (const c of cells) {
    const img = slotImg(st, c.slot);
    if (img) drawPanel(ctx, img, c.r, st.slots[c.slot], st, geom, true);
  }
  // Full-bleed bottom strip, title laid over it with a scrim for legibility.
  const strip = { x: W * 0.015, y: H * 0.635, w: W * 0.97, h: H * 0.245 };
  const stripImg = slotImg(st, 7);
  if (stripImg) {
    const off = renderPanelImage(stripImg, strip, st.slots[7], st);
    ctx.save();
    ctx.drawImage(off, strip.x, strip.y, strip.w, strip.h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(12, 4, 22, 0.85)';
    ctx.lineWidth = Math.max(2, strip.w * 0.003);
    ctx.strokeRect(strip.x, strip.y, strip.w, strip.h);
    ctx.restore();
    geom.panels.push({ rect: { ...strip }, slot: st.slots[7].label });
  }
  const scrim = ctx.createLinearGradient(0, strip.y, 0, strip.y + strip.h);
  scrim.addColorStop(0, 'rgba(20, 4, 34, 0.15)');
  scrim.addColorStop(0.5, 'rgba(20, 4, 34, 0.55)');
  scrim.addColorStop(1, 'rgba(20, 4, 34, 0.72)');
  ctx.save();
  ctx.fillStyle = scrim;
  ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
  ctx.restore();
  const t = gradientTitle(ctx, st.title, W / 2, strip.y + strip.h * 0.10, Math.min(strip.h * 0.42, W * 0.085), W * 0.94);
  ctx.save();
  ctx.font = `${Math.max(18, strip.h * 0.14)}px Pacifico, cursive`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff8fb3';
  ctx.fillText(st.subtitle, W / 2, t.y + t.h + strip.h * 0.13);
  ctx.font = `700 ${Math.max(12, strip.h * 0.09)}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffe9f2';
  ctx.fillText(st.tagline, W / 2, strip.y + strip.h * 0.88);
  ctx.restore();
  geom.titleBand = { ...strip };
  drawFooter(ctx, W, H, st, geom, { top: 0.9 });
  drawSeal(ctx, W * 0.935, H * 0.70, Math.min(W, H) * 0.042);
}

function layoutPalm(ctx, W, H, st, geom) {
  drawQuoteBar(ctx, W, H, st, geom);
  const gap = W * 0.008;
  const cw = (W * 0.97 - gap * 2) / 3;
  const ch = (H * 0.80 - gap * 2) / 3;
  const x0 = W * 0.015;
  const y0 = H * 0.075;
  const order = [0, 1, 2, 3, null, 4, 5, 6, 7];
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const rect = { x: x0 + col * (cw + gap), y: y0 + row * (ch + gap), w: cw, h: ch };
    if (order[i] === null) {
      // Centre title block.
      ctx.save();
      const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      g.addColorStop(0, '#3d1650');
      g.addColorStop(1, '#7c1d4e');
      ctx.fillStyle = g;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
      ctx.restore();
      const t1 = gradientTitle(ctx, 'VELVET', rect.x + rect.w / 2, rect.y + rect.h * 0.10, Math.min(rect.h * 0.20, rect.w * 0.16), rect.w * 0.92);
      const t2 = gradientTitle(ctx, 'HEAT', rect.x + rect.w / 2, t1.y + t1.h * 0.9, Math.min(rect.h * 0.20, rect.w * 0.16), rect.w * 0.92);
      ctx.save();
      ctx.font = `${Math.max(14, rect.h * 0.09)}px Pacifico, cursive`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8fb3';
      ctx.fillText(st.subtitle, rect.x + rect.w / 2, t2.y + t2.h + rect.h * 0.10);
      ctx.restore();
      drawStars(ctx, rect.x + rect.w / 2 - rect.w * 0.14, rect.y + rect.h * 0.82, Math.max(10, rect.h * 0.07), 5, '#ffd166');
      geom.titleBand = { ...rect };
      continue;
    }
    const img = slotImg(st, order[i]);
    if (img) drawPanel(ctx, img, rect, st.slots[order[i]], st, geom, true);
  }
  drawFooter(ctx, W, H, st, geom, { top: 0.9 });
  drawStarburst(ctx, W * 0.03, H * 0.10, Math.min(W, H) * 0.032, 'EST.', '2026');
}

function layoutVice(ctx, W, H, st, geom) {
  // Magazine cover: cream paper, black masthead, hero + two side panels.
  ctx.save();
  ctx.fillStyle = '#f5ead6';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const cx = W / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#160a26';
  const mastPx = Math.min(H * 0.115, W * 0.085);
  ctx.font = `${mastPx}px Anton, 'Arial Narrow', sans-serif`;
  ctx.fillText(st.title, cx, H * 0.028);
  ctx.fillStyle = '#d63384';
  ctx.fillRect(W * 0.06, H * 0.155, W * 0.88, Math.max(3, H * 0.006));
  ctx.font = `700 ${Math.max(13, H * 0.022)}px system-ui, sans-serif`;
  ctx.fillStyle = '#160a26';
  ctx.fillText(`${st.eyebrow}  ·  ISSUE 01 — SUMMER 2026`, cx, H * 0.175);
  ctx.restore();
  geom.quoteBar = { x: W * 0.06, y: H * 0.02, w: W * 0.88, h: H * 0.18 };

  const hero = { x: W * 0.06, y: H * 0.215, w: W * 0.56, h: H * 0.60 };
  const heroImg = slotImg(st, 0);
  if (heroImg) drawPanel(ctx, heroImg, hero, st.slots[0], st, geom, true);
  const side = [
    { r: { x: W * 0.64, y: H * 0.215, w: W * 0.30, h: H * 0.29 }, slot: 1 },
    { r: { x: W * 0.64, y: H * 0.525, w: W * 0.30, h: H * 0.29 }, slot: 4 },
  ];
  for (const c of side) {
    const img = slotImg(st, c.slot);
    if (img) drawPanel(ctx, img, c.r, st.slots[c.slot], st, geom, true);
  }
  // Cover lines as pills over the hero's lower-left, inside the panel.
  const lines = ['INSIDE: THE LAST SUMMER', 'THE WHEELMAN SPEAKS', 'NEON NIGHTS AFTER DARK'];
  ctx.save();
  const clPx = Math.max(12, H * 0.02);
  ctx.font = `700 ${clPx}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let ly = hero.y + hero.h - lines.length * (clPx * 1.9) - 14;
  for (const line of lines) {
    const lw = ctx.measureText(line).width + clPx * 1.6;
    ctx.fillStyle = 'rgba(8, 2, 16, 0.85)';
    roundRect(ctx, hero.x + 12, ly, lw, clPx * 1.6, 4);
    ctx.fill();
    ctx.fillStyle = '#ffe9f2';
    ctx.fillText(line, hero.x + 12 + clPx * 0.8, ly + clPx * 0.82);
    ly += clPx * 1.9;
  }
  ctx.restore();
  // Script subtitle under the masthead rule, right side.
  ctx.save();
  ctx.font = `${Math.max(18, H * 0.032)}px Pacifico, cursive`;
  ctx.fillStyle = '#d63384';
  ctx.textAlign = 'right';
  ctx.fillText(st.subtitle, W * 0.94, H * 0.155 + H * 0.045);
  ctx.restore();
  geom.titleBand = { x: W * 0.06, y: H * 0.02, w: W * 0.88, h: H * 0.18 };

  // Footer: issue line left, production centre, barcode right.
  const fy = H * 0.845;
  ctx.save();
  ctx.fillStyle = '#160a26';
  ctx.fillRect(0, fy, W, H - fy);
  ctx.restore();
  const yrPx = Math.max(13, H * 0.024);
  ctx.save();
  ctx.font = `700 ${yrPx}px system-ui, sans-serif`;
  ctx.fillStyle = '#ff8fb3';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUMMER 2026', W * 0.02, fy + (H - fy) / 2);
  ctx.restore();
  const bcW = Math.min(W * 0.085, 150);
  const bcH = (H - fy) * 0.52;
  drawBarcode(ctx, W * 0.98 - bcW, fy + (H - fy) / 2 - bcH / 2, bcW, bcH);
  ctx.save();
  ctx.font = `${Math.max(12, H * 0.02)}px system-ui, sans-serif`;
  ctx.fillStyle = '#d9c8ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines2 = wrapText(ctx, st.production, W * 0.55);
  const lineH = Math.max(12, H * 0.02) * 1.35;
  const startY = fy + (H - fy) / 2 - ((lines2.length - 1) * lineH) / 2;
  lines2.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineH));
  ctx.restore();
  geom.footer = { x: 0, y: fy, w: W, h: H - fy };
  geom.productionLine = { x: W * 0.225, y: startY - 8, w: W * 0.55, h: lines2.length * lineH };
}

const LAYOUTS = {
  golden: layoutGolden,
  ink: layoutInk,
  neon: layoutNeon,
  sunset: layoutSunset,
  palm: layoutPalm,
  vice: layoutVice,
};

// ---------------------------------------------------------------- entry

export async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch {
    // Fallback fonts still render; the cover stays legible.
  }
}

// Render the cover into `canvas` at (w, h). Returns the geometry record:
// every label's box, its panel's box, the title band and the footer band —
// the geometry test asserts labels sit inside their panels and the
// production line sits inside the footer only.
export async function renderCover(canvas, state, w, h) {
  await ensureFonts();
  await loadAllPhotos(state);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const geom = { labels: [], panels: [], titleBand: null, footer: null, productionLine: null, quoteBar: null, taglineBar: null };
  ctx.save();
  ctx.fillStyle = '#1a0b2e';
  ctx.fillRect(0, 0, w, h);
  const layout = LAYOUTS[state.template] || LAYOUTS.golden;
  layout(ctx, w, h, state, geom);
  finishCover(ctx, w, h, state);
  ctx.restore();
  canvas._geometry = geom;
  return geom;
}

export function geometryOf(canvas) {
  return canvas._geometry || null;
}

// Export one PNG size. Returns { w, h, dataUrl }.
export async function exportPNG(state, w, h) {
  const canvas = document.createElement('canvas');
  await renderCover(canvas, state, w, h);
  const dataUrl = await new Promise((resolve) => canvas.toBlob((b) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(b);
  }, 'image/png'));
  return { w, h, dataUrl };
}

export const EXPORT_SIZES = [
  { w: 1920, h: 1080, label: '1920 × 1080' },
  { w: 1080, h: 1080, label: '1080 × 1080' },
  { w: 1080, h: 1350, label: '1080 × 1350' },
];
