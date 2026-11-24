// MEO Notes – Voice lookahead and the extended voice cache.
import * as F from './lookahead-core.js';

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

export function initLookahead(app) {
  const { state, db, C, touch, saveNote, saveSettings, markDirty, textField } = app;
  const idle = { busy: () => false, start() {}, cancel() {}, opened() {}, unlocked() {}, locked() {}, erase: async () => {} };
  if (PHONE) return idle;

  $('#la-advanced').hidden = false;
  const statusEl = $('#la-status'), sizeEl = $('#la-size'), wordsEl = $('#la-words');
  const packStatus = $('#la-pack-status'), packBtn = $('#la-pack-btn'), packDel = $('#la-pack-del');

  let statusTimer = null;
  function say(msg, clearAfter = 0) {
    clearTimeout(statusTimer); statusEl.textContent = msg;
    if (clearAfter) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, clearAfter);
  }
  const open = () => state.notes.get(state.openId);
  const undoOf = (n) => { if (!n.fmt) n.fmt = {}; if (!n.fmt.undo) n.fmt.undo = []; return n.fmt.undo; };
  const la = () => { if (!state.settings.lookahead) state.settings.lookahead = { size: 'medium', words: 150 }; return state.settings.lookahead; };

  function showSettings() {
    sizeEl.value = la().size; wordsEl.value = la().words || 150;
    $('#la-words-row').hidden = sizeEl.value !== 'custom';
  }
  sizeEl.addEventListener('change', () => { la().size = sizeEl.value; $('#la-words-row').hidden = sizeEl.value !== 'custom'; saveSettings(); });
  wordsEl.addEventListener('change', () => { la().words = F.blockWords({ size: 'custom', words: wordsEl.value }); wordsEl.value = la().words; saveSettings(); });

  /* ----- extended voice cache storage ----- */
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
    packBtn.textContent = got ? 'Resume download' : 'Download extended voice cache';
    packStatus.textContent = ready ? 'Extended voice cache installed.' : got ? `Extended voice cache paused at ${Math.floor((got / PACK.size) * 100)}%.` : `Extended voice cache not installed (${gb(PACK.size)}).`;
  }
  function stopFetch() { if (fetcher) { fetcher.terminate(); fetcher = null; } device.set({ fetching: false }); }
  async function startFetch() {
    if (fetcher) return;
    fetcher = new Worker('workers/cache-fetch.js');
    device.set({ fetching: true });
    packBtn.hidden = false; packBtn.textContent = 'Pause download'; packDel.hidden = true;
    packStatus.textContent = 'Downloading extended voice cache… 0%';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    fetcher.onmessage = async (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const pct = Math.floor((m.got / m.size) * 100);
        packStatus.textContent = m.phase === 'verify' ? `Checking extended voice cache… ${pct}%` : m.phase === 'retry' ? `Waiting for connection… ${pct}%` : `Downloading extended voice cache… ${pct}%`;
      } else {
        stopFetch(); await refreshPack();
        if (m.type === 'error') packStatus.textContent = m.code === 'damaged' ? 'The download was damaged. Please download it again.' : m.code === 'space' ? 'Not enough free drive space for the extended voice cache.' : m.code === 'offline' ? 'Connection lost. Press Resume download when you are back online.' : 'The download could not finish. Press Resume download to try again.';
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
    if (job) { say('Please wait until saving finishes.', 4000); return; }
    if (!(await app.confirmDanger('Delete the extended voice cache from this device? You can download it again later.', 'Delete'))) return;
    await removePack(); await refreshPack();
  });

  /* ----- device options ----- */
  const modeEl = $('#la-mode'), coresEl = $('#la-cores');
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
    const { Wllama } = await import('../vendor/cache/engine.js');
    const wasm = new URL('../vendor/cache/engine.wasm', import.meta.url).href;
    const file = await packFile();
    const hw = navigator.hardwareConcurrency || 4;
    const cores = device.get().cores || Math.max(2, Math.min(8, hw - 1));
    let lastErr = null;
    const t0 = Date.now();
    const plan = await layerPlan();
    for (const layers of plan) {
      const w = new Wllama({ default: wasm }, { suppressNativeLog: true, logger: quiet });
      try {
        await w.loadModel([file], { n_ctx: F.CONTEXT_SIZE, n_gpu_layers: layers, n_threads: layers ? Math.min(4, cores) : cores });
        device.set({ rung: [99, 24, 0].indexOf(layers) });
        engine = { w, layers };
        diag.load = `${layers ? 'graphics card (' + layers + ')' : 'CPU'}, ${Math.round((Date.now() - t0) / 1000)}s`;
        return engine;
      } catch (e) { lastErr = e; diag.loadErrors.push(`${layers ? 'graphics card (' + layers + ')' : 'CPU'}: ${short(e)}`); try { await w.exit(); } catch (x) { /* already stopped */ } }
    }
    throw lastErr || new Error('load failed');
  }

  /* ----- Alt+0: what happened last time (no note text is ever kept here) ----- */
  const short = (e) => String((e && (e.message || e.name)) || e || 'unknown').replace(/\s+/g, ' ').slice(0, 140);
  let diag = { loadErrors: [] };
  const saveDiag = (d) => device.set({ diag: d });
  function showDiag() {
    const d = device.get().diag;
    app.setVoiceStatus(d ? `Diagnostics (${d.when}): ${d.text}` : 'Diagnostics: nothing recorded yet.');
  }

  async function write(input, signal) {
    let maxChars = (F.CONTEXT_SIZE - F.replyLimit(input.words) - 520) * 3;
    for (let attempt = 0; ; attempt++) {
      const e = await loadEngine();
      const { prompt, prefill } = F.buildPrompt({ ...input, maxChars });
      const inner = new AbortController(), pass = () => inner.abort();
      signal.addEventListener('abort', pass, { once: true });
      let raw = '', reason = null, cueStop = false;
      try {
        const stream = await e.w.createCompletion({
          prompt, stream: true, abortSignal: inner.signal, max_tokens: F.replyLimit(input.words),
          temperature: 0.85, top_p: 0.95, min_p: 0.05, penalty_repeat: 1.1, penalty_last_n: 256,
          stop: ['<end_of_turn>', '<start_of_turn>'], cache_prompt: true,
        });
        for await (const c of stream) {
          const ch = c.choices && c.choices[0]; if (!ch || cueStop) continue;
          raw += ch.text || ''; reason = ch.finish_reason || reason;
          const at = F.cueCut(raw, input.speaker); // another character's line is starting: stop here
          if (at >= 0) { raw = raw.slice(0, at); cueStop = true; inner.abort(); }
        }
      } catch (x) {
        if (signal.aborted) throw x;
        if (!cueStop) {
          diag.runErrors.push(`${e.layers ? 'graphics card' : 'CPU'}: ${short(x)}`);
          if (attempt >= 2) throw x;
          if (/context|exceed|too long/i.test(String(x && x.message))) { maxChars = Math.floor(maxChars * 0.6); continue; }
          if (e.layers) device.set({ rung: Math.min(2, [99, 24, 0].indexOf(e.layers) + 1) }); // graphics memory ran out: use less next try
          await unload(); continue;
        }
      } finally { signal.removeEventListener('abort', pass); }
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const out = F.finishReply(input.ctx + input.prefix, raw, prefill, cueStop ? 'stop' : reason, input.speaker);
      diag.runs.push(`${e.layers ? 'graphics card' : 'CPU'}: ${raw.length} chars raw, ${out.length} kept, ended ${cueStop ? 'at a cue' : reason || 'unknown'}`);
      if (!out.trim() && e.layers && attempt < 2) {
        // Some graphics cards produce nothing usable: switch this device to the CPU and try again.
        device.set({ rung: 2 }); await unload(); continue;
      }
      return out;
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
        try { const { reply, meta } = await openSealed(rec); await insertReply(reply, meta); } catch (e) { console.warn('A saved item could not be opened.'); }
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
    const gone = meta.remove && n.text.startsWith(meta.remove, at) ? meta.remove.length : 0;
    const block = (meta.prefix || '') + reply;
    const caret = isOpen ? ta.selectionStart : 0, caretEnd = isOpen ? ta.selectionEnd : 0, top = isOpen ? ta.scrollTop : 0;
    n.text = n.text.slice(0, at) + block + n.text.slice(at + gone);
    const undo = undoOf(n);
    undo.push({ pos: at, text: block, restore: gone ? meta.remove : '' });
    n.fmt.undo = undo.slice(-5);
    touch(n);
    if (isOpen) {
      ta.value = n.text;
      const move = (p) => (p >= at + gone ? p - gone + block.length : p > at ? at + block.length : p);
      ta.setSelectionRange(move(caret), move(caretEnd));
      ta.scrollTop = move(caret) === n.text.length ? ta.scrollHeight : top;
      textField.render();
    }
    await saveNote(n); markDirty();
  }

  /* ----- start: Last Word button, Alt+5 or Alt+7 ----- */
  let job = null;
  async function start() {
    if (job) { say('Saving'); return; }
    const n = open(); if (!n) return;
    const { ready } = await packInfo();
    if (!ready) { app.setVoiceStatus('The extended voice cache isn’t installed. See Voice Settings.'); return; }
    if (!self.crossOriginIsolated) { app.setVoiceStatus('Please close and reopen the app once to finish updating.'); return; }
    const ta = $('#note-text'); n.text = ta.value;
    const req = F.prepare(n.text.slice(0, ta.selectionStart));
    if (!req.ctx.trim() && !req.direction) { say('Nothing to save', 3000); return; }
    const ctl = new AbortController();
    job = { ctl }; clearTimeout(unloadTimer); say('Saving');
    diag = { loadErrors: [], runErrors: [], runs: [], started: Date.now() };
    let adapterNote = '';
    try { const a = navigator.gpu && await navigator.gpu.requestAdapter(); adapterNote = a ? 'graphics card available' : 'no graphics card access'; } catch (x) { adapterNote = 'graphics check failed'; }
    try {
      const seal = await prepareSeal({ noteId: n.id, pos: req.pos, tail: req.tail, remove: req.remove, prefix: req.prefix });
      const reply = await write({ ctx: req.ctx, prefix: req.prefix, direction: req.direction, speaker: req.speaker, words: F.blockWords(la()) }, ctl.signal);
      if (!reply.trim()) throw new Error('empty');
      await storeSealed(seal, reply);
      if (state.unlocked) say('');
      diag.result = 'saved';
    } catch (e) {
      if (state.unlocked) say(ctl.signal.aborted ? '' : 'Not saved', 5000);
      diag.result = ctl.signal.aborted ? 'cancelled' : e && e.message === 'empty' ? 'nothing usable was written' : 'failed: ' + short(e);
    } finally {
      const secs = Math.round((Date.now() - diag.started) / 1000);
      saveDiag({ when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), text: [
        `${diag.result} after ${secs}s`, adapterNote, `isolated ${self.crossOriginIsolated}`, `${navigator.hardwareConcurrency || '?'} cores`,
        diag.load ? 'loaded on ' + diag.load : '', ...diag.loadErrors.map((x) => 'load error ' + x), ...diag.runErrors.map((x) => 'run error ' + x), ...diag.runs,
      ].filter(Boolean).join(' · ') });
      job = null;
      if (!state.unlocked) { await unload(); app.afterBackgroundWork(); }
      else { await deliverPending(); clearTimeout(unloadTimer); unloadTimer = setTimeout(() => { if (!job) unload(); }, IDLE_UNLOAD_MS); }
    }
  }

  /* Alt+9: take back the last reply in this note and bring back its bracket */
  async function undoLast() {
    const n = open(); if (!n) return;
    const undo = undoOf(n), last = undo.pop(); if (!last) return;
    const ta = $('#note-text'); n.text = ta.value;
    const next = F.removeBlock(n.text, last.pos, last.text);
    if (next === null) { undo.push(last); return; }
    const p = Math.min(last.pos, next.length);
    n.text = next.slice(0, p) + (last.restore || '') + next.slice(p);
    const end = p + (last.restore || '').length;
    ta.value = n.text; ta.setSelectionRange(end, end); touch(n); textField.render();
    await saveNote(n); markDirty();
  }
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !state.unlocked || !state.openId || document.querySelector('dialog[open]')) return;
    if (e.code === 'Digit7') { e.preventDefault(); start(); }
    else if (e.code === 'Digit9') { e.preventDefault(); undoLast(); }
    else if (e.code === 'Digit0') { e.preventDefault(); showDiag(); }
  });

  return {
    busy: () => !!job,
    start,
    cancel() { if (job) job.ctl.abort(); },
    opened() {},
    unlocked() {
      showSettings(); refreshPack(); deliverPending();
      if (job) say('Saving');
      if (device.get().fetching) startFetch();
    },
    locked() { statusEl.textContent = ''; },
    erase: removePack,
  };

}
