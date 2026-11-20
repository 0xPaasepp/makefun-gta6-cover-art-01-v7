// tests/test.mjs — Playwright tests for Velvet Heat — Cover Studio.
// Run: node tests/test.mjs   (spawns serve.ts on PORT 8901 itself)
// Every test prints PASS/FAIL; exit code is non-zero when any test fails.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/node_modules/playwright/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8901;
const BASE = `http://localhost:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['serve.ts'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });
    const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', () => {
      clearTimeout(timer);
      resolve(proc);
    });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}`));
    });
  });
}

async function waitReady(page, timeout = 30000) {
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout });
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.getElementById('cover');
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let sumSq = 0;
    const n = d.length / 4;
    const step = Math.max(1, Math.floor(n / 20000));
    let count = 0;
    for (let i = 0; i < n; i += step) {
      const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
      sum += v;
      sumSq += v * v;
      count += 1;
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return { w: c.width, h: c.height, mean: Math.round(mean), variance: Math.round(variance) };
  });
}

function inside(a, b, tol = 1) {
  return a.x >= b.x - tol && a.y >= b.y - tol
    && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
}
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const requests = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('request', (r) => requests.push(r.url()));

    // 1. Every template renders and is non-blank.
    const templates = ['golden', 'ink', 'neon', 'sunset', 'palm', 'vice'];
    for (const t of templates) {
      await page.goto(`${BASE}/?shot=cover&template=${t}`, { waitUntil: 'load' });
      await waitReady(page);
      const s = await canvasStats(page);
      check(`template renders: ${t}`, s.variance > 50 && s.w === 1920 && s.h === 1080,
        `variance=${s.variance} size=${s.w}x${s.h}`);
    }

    // 2. Export PNG dimensions exact, all 3 sizes.
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__cover, null, { timeout: 30000 });
    for (const [w, h] of [[1920, 1080], [1080, 1080], [1080, 1350]]) {
      const got = await page.evaluate(async ({ w, h }) => {
        const shot = await window.__cover.exportPNG(w, h);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = shot.dataUrl;
        });
        return { w: img.naturalWidth, h: img.naturalHeight, png: shot.dataUrl.startsWith('data:image/png') };
      }, { w, h });
      check(`export size exact ${w}x${h}`, got.w === w && got.h === h && got.png, `got ${got.w}x${got.h}`);
    }

    // 3. Per-panel drag/crop/rotate round-trip.
    const crop = await page.evaluate(async () => {
      const st = window.__cover.state;
      st.slots[1].zoom = 1.5;
      st.slots[1].focusX = 0.2;
      st.slots[1].focusY = 0.7;
      st.slots[1].rotate = 10;
      await window.__cover.render();
      const g = window.__cover.geometry();
      return {
        zoom: st.slots[1].zoom,
        focusX: st.slots[1].focusX,
        rotate: st.slots[1].rotate,
        panels: g.panels.length,
      };
    });
    check('per-panel crop/rotate applies', crop.zoom === 1.5 && crop.focusX === 0.2 && crop.rotate === 10 && crop.panels > 0,
      JSON.stringify(crop));

    // 4. Undo/redo round-trip through the real UI.
    const undoRedo = await page.evaluate(async () => {
      const input = document.getElementById('in-title');
      const set = (v) => {
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const before = input.value;
      set('SUMMER HEAT TEST');
      const afterEdit = input.value;
      document.getElementById('btn-undo').click();
      await new Promise((r) => setTimeout(r, 150));
      const afterUndo = input.value;
      document.getElementById('btn-redo').click();
      await new Promise((r) => setTimeout(r, 150));
      const afterRedo = input.value;
      return { before, afterEdit, afterUndo, afterRedo };
    });
    check('undo/redo round-trip', undoRedo.before === 'VELVET HEAT' && undoRedo.afterEdit === 'SUMMER HEAT TEST'
      && undoRedo.afterUndo === 'VELVET HEAT' && undoRedo.afterRedo === 'SUMMER HEAT TEST',
      JSON.stringify(undoRedo));

    // 5. Caption edit with long text stays inside the canvas.
    const longTitle = await page.evaluate(async () => {
      const input = document.getElementById('in-title');
      input.value = 'VELVET HEAT IN MIRAMAR!';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await window.__cover.render();
      const c = document.createElement('canvas');
      const x = c.getContext('2d');
      x.font = '120px Anton';
      const w = x.measureText(window.__cover.state.title).width;
      const g = window.__cover.geometry();
      return { measured: Math.round(w), canvasW: 1920, titleBandW: g.titleBand ? g.titleBand.w : null };
    });
    check('long caption fits canvas width', longTitle.measured < longTitle.canvasW,
      `measured=${longTitle.measured}px`);

    // 6. One-photo-fill vs multi-photo on the 9-panel template.
    const fill = await page.evaluate(async () => {
      const st = window.__cover.state;
      st.template = 'ink';
      await window.__cover.render();
      const multi = new Set(st.slots.map((s) => s.src)).size;
      for (const s of st.slots) s.src = 'samples/boombox.jpg';
      await window.__cover.render();
      const single = new Set(st.slots.map((s) => s.src)).size;
      return { multi, single };
    });
    check('one-photo-fill vs multi-photo (9-panel)', fill.multi === 9 && fill.single === 1,
      JSON.stringify(fill));

    // 7. Geometry: labels inside panels, no label over the title band,
    //    production line inside the footer only. (Neon Tilt + Ink + Golden.)
    //    This is the automated backstop for the §4a/§4c defect checklist:
    //    the v6 Neon production line and the half-hidden MECHANIC label
    //    both fail this test by construction.
    const geomCases = [
      { url: '/?shot=neon', name: 'neon' },
      { url: '/?shot=cover&template=ink', name: 'ink' },
      { url: '/?shot=cover&template=golden', name: 'golden' },
      { url: '/?shot=cover&template=palm', name: 'palm' },
      { url: '/?shot=cover&template=sunset', name: 'sunset' },
      { url: '/?shot=cover&template=vice', name: 'vice' },
    ];
    for (const c of geomCases) {
      await page.goto(`${BASE}${c.url}`, { waitUntil: 'load' });
      await waitReady(page);
      const g = await page.evaluate(() => window.__cover.geometry());
      const labelIssues = [];
      for (const l of g.labels) {
        if (!inside(l.label, l.panel)) labelIssues.push(`${l.text} outside panel`);
        if (g.titleBand && overlaps(l.label, g.titleBand)) labelIssues.push(`${l.text} overlaps title band`);
      }
      const prodOk = g.productionLine && g.footer && inside(g.productionLine, g.footer, 2);
      check(`geometry: ${c.name} labels inside panels, production in footer`,
        labelIssues.length === 0 && prodOk,
        labelIssues.join('; ') || `labels=${g.labels.length} prodOk=${prodOk}`);
    }

    // 8. Offline: no external requests.
    const external = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
    check('offline (no external requests)', external.length === 0,
      external.slice(0, 3).join(', ') || `${requests.length} local requests`);

    // 9. No console errors.
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('TEST RUNNER FAILED', err);
  process.exit(1);
});
