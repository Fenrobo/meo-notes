// MEO Notes – Snippets.
import * as F from './snippet-core.js';

const PACK = { a: 'MhUcHwVHq6T67MfAx9vbpauyvfGFgtuRdWxjYy0WA1RfLCUue25JXxBU7vLi+bHQ2tDb2uustreLnZWFn3FpdzdzeAJBTy0/NytNICkgOqz49OvwytvRlK+oubnxgomel2AlPDspRgZcTCwrYyYsAgkUVR7k4f3vx9vRw9uh4aSoiJyKhNB1P01yf0oAUls2LA==', size: 2489893792, sha: '53f19aabc95198462e063573ae6603b982b1bc0331ff4312230c3c05b1552a36' }; // PACK
const PHONE = /Android/i.test(navigator.userAgent);
const IDLE_UNLOAD_MS = 10 * 60000;
const SEALED = 'fmt-sealed';
const $ = (s) => document.querySelector(s);
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const device = {
  get() { try { return JSON.parse(localStorage.getItem('meo-fmt') || '{}'); } catch (e) { return {}; } },
  set(patch) { try { localStorage.setItem('meo-fmt', JSON.stringify({ ...device.get(), ...patch })); } catch (e) { /* not saved */ } },
};

export function initSnippets(app) {
  const { state, db, C, bump, touch, saveNote, markDirty, MaskedField, textField } = app;
  const idle = { busy: () => false, opened() {}, unlocked() {}, locked() {}, erase: async () => {} };
  if (PHONE) return idle;

  for (const id of ['#snip-row', '#snip-status', '#snip-menu', '#snip-hint']) $(id).hidden = false;
  const applyBtn = $('#snip-apply'), revertBtn = $('#snip-revert'), statusEl = $('#snip-status');
  const notesEl = $('#snip-notes'), keepEl = $('#snip-keep'), sizeEl = $('#snip-size'), wordsEl = $('#snip-words');
  const packStatus = $('#snip-pack-status'), packBtn = $('#snip-pack-btn'), packDel = $('#snip-pack-del');

  /* ----- masked Keywords box: follows the same display settings as the note ----- */
  const notesField = new MaskedField($('#snip-notes-wrap'), () => ({ ...state.settings.textDisplay, all: state.revealText }), false);
  const renderText = textField.render.bind(textField);
  textField.render = () => { renderText(); notesField.render(); };

  let statusTimer = null;
  function say(msg, clearAfter = 0) {
    clearTimeout(statusTimer); statusEl.textContent = msg;
    if (clearAfter) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, clearAfter);
  }
  const open = () => state.notes.get(state.openId);
  const fmtOf = (n) => { if (!n.fmt) n.fmt = { notes: '', keep: true, size: 'medium', words: 150, undo: [] }; if (!n.fmt.undo) n.fmt.undo = []; return n.fmt; };
  function saveFmt(n) { bump(n); saveNote(n); markDirty(); }

  function showNote(n) {
    const f = n ? fmtOf(n) : null;
    notesEl.value = f ? f.notes : ''; keepEl.checked = f ? f.keep !== false : true;
    sizeEl.value = f ? f.size : 'medium'; wordsEl.value = f ? (f.words || 150) : 150;
    $('#snip-words-row').hidden = sizeEl.value !== 'custom';
    revertBtn.disabled = !(f && f.undo.length);
    notesField.render();
  }
  notesEl.addEventListener('input', () => { const n = open(); if (!n) return; fmtOf(n).notes = notesEl.value.replace(/\r\n?/g, '\n'); notesField.render(); saveFmt(n); });
  keepEl.addEventListener('change', () => { const n = open(); if (n) { fmtOf(n).keep = keepEl.checked; saveFmt(n); } });
  sizeEl.addEventListener('change', () => { const n = open(); if (n) { fmtOf(n).size = sizeEl.value; $('#snip-words-row').hidden = sizeEl.value !== 'custom'; saveFmt(n); } });
  wordsEl.addEventListener('change', () => { const n = open(); if (n) { fmtOf(n).words = F.blockWords({ size: 'custom', words: wordsEl.value }); wordsEl.value = fmtOf(n).words; saveFmt(n); } });

  /* ----- snippet library storage ----- */
  async function packDir(create = false) {
    try { return await (await navigator.storage.getDirectory()).getDirectoryHandle('fmt', { create }); } catch (e) { return null; }
  }
  async function packInfo() {
    const dir = await packDir();
    if (!dir) return { ready: false, got: 0 };
    let got = 0, ready = false;
    try { got = (await (await dir.getFileHandle('pack.bin')).getFile()).size; } catch (e) { /* none yet */ }
    try { ready = (await (await (await dir.getFileHandle('pack.ok')).getFile()).text()) === PACK.sha && got === PACK.size; } catch (e) { /* not finished */ }
    return { ready, got };
  }
  const packFile = async () => (await (await packDir()).getFileHandle('pack.bin')).getFile();
  const gb = (n) => (n / 1e9).toFixed(n < 1e10 ? 2 : 1) + ' GB';

  let fetcher = null;
  async function refreshPack() {
    if (fetcher) return;
    const { ready, got } = await packInfo();
    packDel.hidden = !(ready || got);
    packBtn.hidden = ready;
    packBtn.textContent = got ? 'Resume download' : 'Download snippet library';
    packStatus.textContent = ready ? 'Snippet library installed.' : got ? `Snippet library paused at ${Math.floor((got / PACK.size) * 100)}%.` : `Snippet library not installed (${gb(PACK.size)}).`;
  }
  function stopFetch() { if (fetcher) { fetcher.terminate(); fetcher = null; } device.set({ fetching: false }); }
  async function startFetch() {
    if (fetcher) return;
    fetcher = new Worker('workers/pack-fetch.js');
    device.set({ fetching: true });
    packBtn.hidden = false; packBtn.textContent = 'Pause download'; packDel.hidden = true;
    packStatus.textContent = 'Downloading snippet library… 0%';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    fetcher.onmessage = async (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const pct = Math.floor((m.got / m.size) * 100);
        packStatus.textContent = m.phase === 'verify' ? `Checking snippet library… ${pct}%` : m.phase === 'retry' ? `Waiting for connection… ${pct}%` : `Downloading snippet library… ${pct}%`;
      } else {
        stopFetch(); await refreshPack();
        if (m.type === 'error') packStatus.textContent = m.code === 'damaged' ? 'The download was damaged. Please download it again.' : m.code === 'space' ? 'Not enough free drive space for the snippet library.' : m.code === 'offline' ? 'Connection lost. Press Resume download when you are back online.' : 'The download could not finish. Press Resume download to try again.';
      }
    };
    fetcher.onerror = () => { stopFetch(); refreshPack(); };
    fetcher.postMessage({ url: F.unscramble(PACK.a), size: PACK.size, sha: PACK.sha });
  }
  packBtn.addEventListener('click', () => { if (fetcher) { stopFetch(); refreshPack(); } else startFetch(); });
  async function removePack() {
    stopFetch(); await unload();
    try { await (await navigator.storage.getDirectory()).removeEntry('fmt', { recursive: true }); } catch (e) { /* nothing stored */ }
  }
  packDel.addEventListener('click', async () => {
    if (job) { say('Please wait for the current snippet to finish.', 4000); return; }
    if (!(await app.confirmDanger('Delete the snippet library from this device? You can download it again later.', 'Delete'))) return;
    await removePack(); await refreshPack();
  });

  /* ----- device options ----- */
  const modeEl = $('#snip-mode'), coresEl = $('#snip-cores');
  modeEl.value = device.get().mode || 'auto'; coresEl.value = String(device.get().cores || 0);
  modeEl.addEventListener('change', async () => { device.set({ mode: modeEl.value, rung: 0 }); if (!job) await unload(); });
  coresEl.addEventListener('change', async () => { device.set({ cores: Number(coresEl.value) }); if (!job) await unload(); });

  /* ----- engine ----- */
  let engine = null, unloadTimer = null;
  const quiet = { debug() {}, log() {}, warn() {}, error() {} };
  async function unload() {
    clearTimeout(unloadTimer);
    const e = engine; engine = null;
    if (e) { try { await Promise.race([e.w.exit(), new Promise((r) => setTimeout(r, 4000))]); } catch (x) { /* already stopped */ } }
  }
  async function layerPlan() {
    const mode = device.get().mode || 'auto';
    if (mode === 'cpu') return [0];
    let adapter = null;
    try { adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null; } catch (e) { /* unavailable */ }
    if (!adapter) return [0];
    return [99, 24, 0].slice(Math.min(device.get().rung || 0, 2));
  }
  async function loadEngine() {
    if (engine) return engine;
    const { Wllama } = await import('../vendor/fmt/engine.js');
    const wasm = new URL('../vendor/fmt/engine.wasm', import.meta.url).href;
    const file = await packFile();
    const hw = navigator.hardwareConcurrency || 4;
    const cores = device.get().cores || Math.max(2, Math.min(8, hw - 1));
    let lastErr = null;
    const plan = await layerPlan();
    for (const layers of plan) {
      const w = new Wllama({ default: wasm }, { suppressNativeLog: true, logger: quiet });
      try {
        await w.loadModel([file], { n_ctx: F.CONTEXT_SIZE, n_gpu_layers: layers, n_threads: layers ? Math.min(4, cores) : cores });
        device.set({ rung: [99, 24, 0].indexOf(layers) });
        engine = { w, layers };
        return engine;
      } catch (e) { lastErr = e; try { await w.exit(); } catch (x) { /* already stopped */ } }
    }
    throw lastErr || new Error('load failed');
  }

  async function write(input, signal) {
    let maxChars = (F.CONTEXT_SIZE - F.replyLimit(input.words) - 420) * 3;
    for (let attempt = 0; ; attempt++) {
      const e = await loadEngine();
      const { prompt, prefill } = F.buildPrompt({ ...input, maxChars });
      let raw = '', reason = null;
      try {
        const stream = await e.w.createCompletion({
          prompt, stream: true, abortSignal: signal, max_tokens: F.replyLimit(input.words),
          temperature: 0.85, top_p: 0.95, min_p: 0.05, penalty_repeat: 1.1, penalty_last_n: 256,
          stop: ['<end_of_turn>', '<start_of_turn>'], cache_prompt: true,
        });
        for await (const c of stream) { const ch = c.choices && c.choices[0]; if (ch) { raw += ch.text || ''; reason = ch.finish_reason || reason; } }
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        return F.finishReply(input.before, raw, prefill, reason);
      } catch (x) {
        if (signal.aborted || (x && x.name && /Abort/.test(x.name))) throw x;
        if (attempt >= 2) throw x;
        if (/context|exceed|too long/i.test(String(x && x.message))) { maxChars = Math.floor(maxChars * 0.6); continue; }
        if (e.layers) device.set({ rung: Math.min(2, [99, 24, 0].indexOf(e.layers) + 1) }); // graphics memory ran out: use less next try
        await unload();
      }
    }
  }

  /* ----- finished replies are encrypted before they are stored, even while the notebook is locked ----- */
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  async function prepareSeal(meta) {
    const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
    return {
      pub: pair.publicKey,
      wrapped: await C.encryptJSON(state.key, await crypto.subtle.exportKey('jwk', pair.privateKey)),
      meta: await C.encryptJSON(state.key, meta),
    };
  }
  let sealedQueue = Promise.resolve();
  const inQueue = (fn) => { const p = sealedQueue.then(fn, fn); sealedQueue = p.catch(() => {}); return p; };
  function storeSealed(seal, reply) {
    return inQueue(async () => {
      const eph = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']);
      const aes = await crypto.subtle.deriveKey({ name: 'ECDH', public: seal.pub }, eph.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(reply)));
      const rec = { w: seal.wrapped, m: seal.meta, epk: b64(new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))), iv: b64(iv), ct: b64(ct) };
      await db.put('kv', [...((await db.get('kv', SEALED)) || []), rec], SEALED);
    });
  }
  async function openSealed(rec) {
    const priv = await crypto.subtle.importKey('jwk', await C.decryptJSON(state.key, rec.w), ECDH, false, ['deriveKey']);
    const pub = await crypto.subtle.importKey('raw', unb64(rec.epk), ECDH, false, []);
    const aes = await crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const reply = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, aes, unb64(rec.ct)));
    return { reply, meta: await C.decryptJSON(state.key, rec.m) };
  }
  function deliverPending() {
    return inQueue(async () => {
      if (!state.unlocked || !state.key) return;
      const list = (await db.get('kv', SEALED)) || [];
      for (const rec of list) {
        try { const { reply, meta } = await openSealed(rec); await insertReply(reply, meta); } catch (e) { console.warn('A snippet could not be opened.'); }
      }
      if (list.length) await db.del('kv', SEALED);
    });
  }

  async function insertReply(reply, meta) {
    const n = state.notes.get(meta.noteId);
    if (!n) return;
    const isOpen = state.openId === n.id;
    const ta = $('#note-text');
    if (isOpen) n.text = ta.value;
    const at = F.locate(n.text, meta.pos, meta.tail);
    const caret = isOpen ? ta.selectionStart : 0, caretEnd = isOpen ? ta.selectionEnd : 0, top = isOpen ? ta.scrollTop : 0;
    n.text = n.text.slice(0, at) + reply + n.text.slice(at);
    const f = fmtOf(n);
    f.undo = [...f.undo, { pos: at, text: reply }].slice(-5);
    if (meta.clearNotes) f.notes = '';
    touch(n);
    if (isOpen) {
      ta.value = n.text;
      const move = (p) => (p >= at ? p + reply.length : p);
      ta.setSelectionRange(move(caret), move(caretEnd));
      ta.scrollTop = caret === at && at + reply.length === n.text.length ? ta.scrollHeight : top;
      showNote(n); textField.render();
    }
    await saveNote(n); markDirty();
    say(isOpen ? 'Snippet inserted.' : 'Snippet inserted in another note.', 5000);
  }

  /* ----- Insert / Cancel ----- */
  let job = null;
  function setBusy(on) { applyBtn.textContent = on ? 'Cancel' : 'Insert snippet'; }

  async function apply() {
    if (job) { job.ctl.abort(); say('Cancelling…'); return; }
    const n = open(); if (!n) return;
    const { ready } = await packInfo();
    if (!ready) { $('#snip-menu').open = true; await refreshPack(); say('Download the snippet library first, under Snippets.', 6000); return; }
    if (!self.crossOriginIsolated) { say('Please close and reopen the app once to finish updating.', 8000); return; }
    const ta = $('#note-text'); n.text = ta.value;
    const f = fmtOf(n), pos = ta.selectionStart, before = n.text.slice(0, pos);
    if (!before.trim() && !f.notes.trim()) { say('Type some text or keywords first.', 5000); return; }
    const ctl = new AbortController();
    job = { ctl }; setBusy(true); clearTimeout(unloadTimer); say('Finding snippet…');
    let locked = false;
    try {
      const seal = await prepareSeal({ noteId: n.id, pos, tail: before.slice(-160), clearNotes: f.keep === false });
      const reply = await write({ before, notes: f.notes, words: F.blockWords(f) }, ctl.signal);
      if (!reply.trim()) throw new Error('empty');
      await storeSealed(seal, reply);
    } catch (e) {
      if (state.unlocked) say(ctl.signal.aborted ? 'Snippet cancelled.' : e && e.message === 'empty' ? 'No snippet found. Please try again.' : 'Snippet could not load. Please try again.', 6000);
    } finally {
      job = null; locked = !state.unlocked; setBusy(false);
      if (locked) { await unload(); app.afterBackgroundWork(); }
      else { await deliverPending(); clearTimeout(unloadTimer); unloadTimer = setTimeout(() => { if (!job) unload(); }, IDLE_UNLOAD_MS); }
    }
  }
  applyBtn.addEventListener('mousedown', (e) => e.preventDefault());
  applyBtn.addEventListener('click', apply);

  revertBtn.addEventListener('mousedown', (e) => e.preventDefault());
  revertBtn.addEventListener('click', async () => {
    const n = open(); if (!n) return;
    const f = fmtOf(n), last = f.undo.pop(); if (!last) return;
    const ta = $('#note-text'); n.text = ta.value;
    const next = F.removeBlock(n.text, last.pos, last.text);
    if (next === null) say('That block was edited, so it can’t be reverted.', 6000);
    else {
      const p = Math.min(last.pos, next.length);
      n.text = next; ta.value = next; ta.setSelectionRange(p, p); touch(n); textField.render(); say('Snippet removed.', 4000);
    }
    revertBtn.disabled = !f.undo.length;
    await saveNote(n); markDirty();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Digit7' || !e.altKey || e.ctrlKey || e.metaKey || !state.unlocked || !state.openId || document.querySelector('dialog[open]')) return;
    e.preventDefault(); apply();
  });

  return {
    busy: () => !!job,
    opened: (n) => showNote(n),
    unlocked() {
      setBusy(!!job); refreshPack(); deliverPending();
      if (device.get().fetching) startFetch();
    },
    locked() { notesEl.value = ''; notesField.layer.textContent = ''; statusEl.textContent = ''; },
    erase: removePack,
  };
}
