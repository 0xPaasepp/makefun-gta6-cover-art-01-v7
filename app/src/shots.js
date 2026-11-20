// shots.js — deterministic ?shot= scenes for screenshots and tests.
// Each scene renders once, paints, then sets window.__shotReady.

import { defaultState, renderCover, exportPNG, geometryOf } from './cover.js';
import { initEditor } from './editor.js';

const SCENES = {
  cover: { template: 'golden', grade: 'sunset', w: 1920, h: 1080 },
  ink: { template: 'ink', grade: 'ink', halftone: true, w: 1920, h: 1080 },
  neon: { template: 'neon', grade: 'neon', w: 1080, h: 1350 },
};

export async function runShot(name, params) {
  if (name === 'editor') return runEditorShot(params);
  const scene = SCENES[name] || SCENES.cover;
  const state = defaultState();
  state.template = scene.template;
  state.grade = scene.grade;
  if (scene.halftone) state.halftone = true;
  if (params.get('photo')) {
    const src = params.get('photo');
    for (const s of state.slots) s.src = src;
  }
  if (params.get('caption')) state.title = params.get('caption');
  if (params.get('template')) state.template = params.get('template');
  if (params.get('grade')) state.grade = params.get('grade');

  document.body.classList.add('shot');
  const canvas = document.getElementById('cover');
  await renderCover(canvas, state, scene.w, scene.h);
  window.__cover = {
    state,
    canvas,
    render: () => renderCover(canvas, state, scene.w, scene.h),
    exportPNG: (w, h) => exportPNG(state, w, h),
    geometry: () => geometryOf(canvas),
  };
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__shotReady = true;
}

async function runEditorShot(params) {
  const api = initEditor();
  // Simulate a panel mid-drag: select the jetski panel, nudge its crop so
  // the selection overlay and the repositioned photo are both visible.
  // The helper chip flips below the selection when the panel sits near the
  // top of the cover, so it never covers the quote bar.
  await new Promise((r) => setTimeout(r, 300));
  const st = api.state;
  st.slots[1].focusX = 0.58;
  st.slots[1].focusY = 0.5;
  st.slots[1].zoom = 1.15;
  window.__cover.selectSlot(1);
  await api.render();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__shotReady = true;
}
