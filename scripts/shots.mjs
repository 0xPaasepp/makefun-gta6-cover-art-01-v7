// scripts/shots.mjs — renders the 4 screenshots with Playwright.
// Run: node scripts/shots.mjs   (spawns serve.ts on PORT 8902 itself)
// Screenshots are JPEG, capped at 256 KiB (quality drops if needed).

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/node_modules/playwright/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8902;
const BASE = `http://localhost:${PORT}`;
const SHOTS = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8')).shots;
const MAX_BYTES = 262144;

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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(`${BASE}${shot.url}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
      const shotError = await page.evaluate(() => window.__shotError || null);
      if (shotError) throw new Error(`shot error: ${shotError}`);
      const out = join(ROOT, 'screenshots', shot.name);
      let quality = 84;
      let buf = await page.screenshot({ path: out, type: 'jpeg', quality });
      while (buf.length > MAX_BYTES && quality > 55) {
        quality -= 8;
        buf = await page.screenshot({ path: out, type: 'jpeg', quality });
      }
      const size = statSync(out).size;
      console.log(`${shot.name}  ${shot.width}x${shot.height}  ${Math.round(size / 1024)} KiB  quality=${quality}${errors.length ? `  CONSOLE ERRORS: ${errors.join(' | ')}` : ''}`);
      if (size > MAX_BYTES) throw new Error(`${shot.name} exceeds 256 KiB at quality ${quality}`);
      await page.close();
    }
    console.log('All 4 screenshots rendered.');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('SHOTS FAILED', err);
  process.exit(1);
});
