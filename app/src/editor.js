// editor.js — the Velvet Heat editor: template/grade controls, photo tray,
// per-panel crop/rotate/grade, undo/redo, PNG export. All state changes flow
// through commit() so history stays consistent.

import {
  TEMPLATES, GRADES, SAMPLE_PHOTOS, ALTERNATE_PHOTOS, defaultState,
  renderCover, exportPNG, geometryOf, EXPORT_SIZES, loadImage,
} from './cover.js';

const PREVIEW = { w: 1920, h: 1080 };

export function initEditor() {
  const state = defaultState();
  const canvas = document.getElementById('cover');
  const wrap = document.getElementById('canvas-wrap');
  const selection = document.getElementById('selection');
  const status = document.getElementById('export-status');

  const history = [JSON.stringify(state)];
  let hIndex = 0;
  let selectedSlot = 0;
  let pickedPhoto = null; // src picked in the tray, waiting for a panel click
  let dragging = null;
  const customPhotos = [];

  function snapshot() {
    return JSON.stringify(state);
  }
  function commit() {
    const s = snapshot();
    if (s === history[hIndex]) return;
    history.splice(hIndex + 1);
    history.push(s);
    hIndex = history.length - 1;
    syncUndoRedo();
  }
  function restore(i) {
    const s = JSON.parse(history[i]);
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, s);
    syncControls();
    render();
  }
  function undo() {
    if (hIndex > 0) {
      hIndex -= 1;
      restore(hIndex);
    }
  }
  function redo() {
    if (hIndex < history.length - 1) {
      hIndex += 1;
      restore(hIndex);
    }
  }
  function syncUndoRedo() {
    document.getElementById('btn-undo').disabled = hIndex === 0;
    document.getElementById('btn-redo').disabled = hIndex >= history.length - 1;
  }

  let renderQueued = false;
  async function render() {
    if (renderQueued) return;
    renderQueued = true;
    await renderCover(canvas, state, PREVIEW.w, PREVIEW.h);
    renderQueued = false;
    positionSelection();
  }

  function positionSelection() {
    const geom = geometryOf(canvas);
    if (!geom) return;
    const panel = geom.panels.find((p) => p.slot === state.slots[selectedSlot].label);
    const box = canvas.getBoundingClientRect();
    const wrapBox = wrap.getBoundingClientRect();
    if (!panel) {
      selection.hidden = true;
      return;
    }
    const r = panel.rect;
    const sx = box.width / PREVIEW.w;
    const sy = box.height / PREVIEW.h;
    selection.hidden = false;
    selection.style.left = `${box.left - wrapBox.left + r.x * sx}px`;
    selection.style.top = `${box.top - wrapBox.top + r.y * sy}px`;
    selection.style.width = `${r.w * sx}px`;
    selection.style.height = `${r.h * sy}px`;
    // Flip the helper chip below the selection when the panel sits near the
    // top of the cover, so it never covers the quote bar.
    const label = document.getElementById('selection-label');
    if (r.y * sy < 40) {
      label.style.top = 'calc(100% + 6px)';
    } else {
      label.style.top = '-26px';
    }
    document.getElementById('panel-info').textContent =
      `Panel: ${state.slots[selectedSlot].label} — ${SAMPLE_PHOTOS[selectedSlot]?.name ?? 'photo'} (slot ${selectedSlot + 1})`;
  }

  function panelAt(clientX, clientY) {
    const geom = geometryOf(canvas);
    if (!geom) return -1;
    const box = canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * PREVIEW.w;
    const y = ((clientY - box.top) / box.height) * PREVIEW.h;
    const hit = geom.panels.find((p) => x >= p.rect.x && x <= p.rect.x + p.rect.w && y >= p.rect.y && y <= p.rect.y + p.rect.h);
    if (!hit) return -1;
    return state.slots.findIndex((s) => s.label === hit.slot);
  }

  // ---- controls ---------------------------------------------------------
  const templatesEl = document.getElementById('templates');
  for (const t of TEMPLATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.name;
    b.dataset.template = t.id;
    b.addEventListener('click', () => {
      state.template = t.id;
      syncControls();
      commit();
      render();
    });
    templatesEl.appendChild(b);
  }
  const gradesEl = document.getElementById('grades');
  for (const g of GRADES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g.name;
    b.dataset.grade = g.id;
    b.addEventListener('click', () => {
      state.grade = g.id;
      state.halftone = g.id === 'ink' ? state.halftone : state.halftone;
      syncControls();
      commit();
      render();
    });
    gradesEl.appendChild(b);
  }

  function bindSlider(id, key) {
    const el = document.getElementById(id);
    const out = document.getElementById(`${id}-v`);
    el.addEventListener('input', () => {
      state[key] = Number(el.value);
      out.textContent = Number(el.value).toFixed(2);
      render();
    });
    el.addEventListener('change', () => commit());
  }
  bindSlider('sl-contrast', 'contrast');
  bindSlider('sl-saturation', 'saturation');
  bindSlider('sl-brightness', 'brightness');
  bindSlider('sl-temperature', 'temperature');

  function bindToggle(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      state[key] = el.checked;
      commit();
      render();
    });
  }
  bindToggle('tg-grain', 'grain');
  bindToggle('tg-vignette', 'vignette');
  bindToggle('tg-halftone', 'halftone');

  function bindText(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      state[key] = el.value;
      render();
    });
    el.addEventListener('change', () => commit());
  }
  bindText('in-title', 'title');
  bindText('in-subtitle', 'subtitle');
  bindText('in-tagline', 'tagline');
  bindText('in-eyebrow', 'eyebrow');
  bindText('in-quote', 'quote');

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
      exportAll();
    }
  });

  // ---- selected panel ---------------------------------------------------
  function syncPanelControls() {
    const slot = state.slots[selectedSlot];
    document.getElementById('sel-panel-grade').value = slot.grade || '';
    const sel = document.getElementById('sel-panel-photo');
    sel.value = slot.src;
  }
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const s = state.slots[selectedSlot];
    s.zoom = Math.min(3, (s.zoom || 1) + 0.15);
    commit();
    render();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const s = state.slots[selectedSlot];
    s.zoom = Math.max(1, (s.zoom || 1) - 0.15);
    commit();
    render();
  });
  document.getElementById('btn-rot-l').addEventListener('click', () => {
    state.slots[selectedSlot].rotate = (state.slots[selectedSlot].rotate || 0) - 5;
    commit();
    render();
  });
  document.getElementById('btn-rot-r').addEventListener('click', () => {
    state.slots[selectedSlot].rotate = (state.slots[selectedSlot].rotate || 0) + 5;
    commit();
    render();
  });
  document.getElementById('sel-panel-grade').addEventListener('change', (e) => {
    state.slots[selectedSlot].grade = e.target.value;
    commit();
    render();
  });
  document.getElementById('sel-panel-photo').addEventListener('change', (e) => {
    state.slots[selectedSlot].src = e.target.value;
    commit();
    render();
  });

  // ---- photo tray -------------------------------------------------------
  const tray = document.getElementById('tray');
  function allTrayPhotos() {
    return [
      ...SAMPLE_PHOTOS.map((p) => ({ src: p.src, name: p.name })),
      ...ALTERNATE_PHOTOS,
      ...customPhotos,
    ];
  }
  function buildTray() {
    tray.innerHTML = '';
    for (const p of allTrayPhotos()) {
      const fig = document.createElement('figure');
      fig.dataset.src = p.src;
      const img = document.createElement('img');
      img.src = p.src;
      img.alt = p.name;
      const cap = document.createElement('figcaption');
      cap.textContent = p.name;
      fig.append(img, cap);
      fig.addEventListener('click', () => {
        pickedPhoto = p.src;
        tray.querySelectorAll('figure').forEach((f) => f.classList.toggle('picked', f.dataset.src === p.src));
      });
      tray.appendChild(fig);
    }
    const sel = document.getElementById('sel-panel-photo');
    sel.innerHTML = '';
    for (const p of allTrayPhotos()) {
      const o = document.createElement('option');
      o.value = p.src;
      o.textContent = p.name;
      sel.appendChild(o);
    }
    syncPanelControls();
  }
  buildTray();

  document.getElementById('btn-fill-all').addEventListener('click', () => {
    const src = pickedPhoto || state.slots[0].src;
    for (const s of state.slots) s.src = src;
    commit();
    render();
  });
  document.getElementById('btn-sample').addEventListener('click', () => {
    const fresh = defaultState();
    state.slots = fresh.slots;
    pickedPhoto = null;
    commit();
    render();
  });
  document.getElementById('in-upload').addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    let done = 0;
    for (const f of files) {
      const r = new FileReader();
      r.onload = () => {
        customPhotos.push({ src: r.result, name: f.name.replace(/\.[^.]+$/, '') || 'Upload' });
        loadImage(r.result).catch(() => null);
        done += 1;
        if (done === files.length) buildTray();
      };
      r.readAsDataURL(f);
    }
  });

  // ---- canvas interaction: click to select, drag to reposition ----------
  canvas.addEventListener('pointerdown', (e) => {
    const i = panelAt(e.clientX, e.clientY);
    if (i < 0) return;
    if (pickedPhoto) {
      state.slots[i].src = pickedPhoto;
      pickedPhoto = null;
      tray.querySelectorAll('figure').forEach((f) => f.classList.remove('picked'));
      selectedSlot = i;
      syncPanelControls();
      commit();
      render();
      return;
    }
    selectedSlot = i;
    syncPanelControls();
    dragging = { x: e.clientX, y: e.clientY, slot: { ...state.slots[i] } };
    canvas.setPointerCapture(e.pointerId);
    positionSelection();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const box = canvas.getBoundingClientRect();
    const slot = state.slots[selectedSlot];
    const dx = (e.clientX - dragging.x) / box.width;
    const dy = (e.clientY - dragging.y) / box.height;
    // Dragging the photo right moves its focus left (the picture follows).
    slot.focusX = clamp01(dragging.slot.focusX - dx);
    slot.focusY = clamp01(dragging.slot.focusY - dy);
    render();
  });
  canvas.addEventListener('pointerup', () => {
    if (dragging) {
      dragging = null;
      commit();
      render();
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const slot = state.slots[selectedSlot];
    slot.zoom = Math.min(3, Math.max(1, (slot.zoom || 1) * (e.deltaY < 0 ? 1.08 : 0.93)));
    render();
  }, { passive: false });

  // ---- export -----------------------------------------------------------
  function download({ w, h, dataUrl }) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `velvet-heat-${w}x${h}.png`;
    a.click();
  }
  async function exportAll() {
    status.textContent = 'Exporting…';
    for (const s of EXPORT_SIZES) {
      const shot = await exportPNG(state, s.w, s.h);
      download(shot);
    }
    status.textContent = 'Exported 3 PNGs.';
  }
  document.getElementById('btn-export').addEventListener('click', exportAll);
  document.querySelectorAll('.size-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const [w, h] = b.dataset.size.split('x').map(Number);
      status.textContent = `Exporting ${w}×${h}…`;
      download(await exportPNG(state, w, h));
      status.textContent = `Exported ${w}×${h} PNG.`;
    });
  });

  window.addEventListener('resize', positionSelection);

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function syncControls() {
    document.querySelectorAll('#templates button').forEach((b) => b.classList.toggle('active', b.dataset.template === state.template));
    document.querySelectorAll('#grades button').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
    const setSlider = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      document.getElementById(`${id}-v`).textContent = Number(v).toFixed(2);
    };
    setSlider('sl-contrast', state.contrast);
    setSlider('sl-saturation', state.saturation);
    setSlider('sl-brightness', state.brightness);
    setSlider('sl-temperature', state.temperature);
    document.getElementById('tg-grain').checked = state.grain;
    document.getElementById('tg-vignette').checked = state.vignette;
    document.getElementById('tg-halftone').checked = state.halftone;
    document.getElementById('in-title').value = state.title;
    document.getElementById('in-subtitle').value = state.subtitle;
    document.getElementById('in-tagline').value = state.tagline;
    document.getElementById('in-eyebrow').value = state.eyebrow;
    document.getElementById('in-quote').value = state.quote;
    syncPanelControls();
    syncUndoRedo();
  }

  // Test + shot hooks.
  window.__cover = {
    state,
    canvas,
    render,
    exportPNG: (w, h) => exportPNG(state, w, h),
    geometry: () => geometryOf(canvas),
    undo,
    redo,
    historyLength: () => history.length,
    historyIndex: () => hIndex,
    selectSlot: (i) => {
      selectedSlot = i;
      syncPanelControls();
      positionSelection();
    },
    setPickedPhoto: (src) => { pickedPhoto = src; },
    get pickedPhoto() { return pickedPhoto; },
  };

  syncControls();
  render();
  return { state, render, undo, redo };
}
