// Bootstrap: a ?shot= scene renders one deterministic cover (or the editor
// mid-drag) and sets window.__shotReady; otherwise the full editor starts.
import { runShot } from './shots.js';
import { initEditor } from './editor.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

if (shot) {
  runShot(shot, params).catch((err) => {
    console.error('shot failed', err);
    window.__shotError = String(err);
  });
} else {
  initEditor();
}
