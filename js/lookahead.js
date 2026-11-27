// MEO Notes – Voice lookahead: sends the text before the cursor to the voice engine on this PC.
import * as F from './lookahead-core.js';

const SETUP = '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'; // SETUP
const PHONE = /Android/i.test(navigator.userAgent);
const SEALED = 'fmt-sealed';
const $ = (s) => document.querySelector(s);
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomText = (n) => { const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % a.length]).join(''); };

const device = {
  get() { try { return JSON.parse(localStorage.getItem('meo-fmt') || '{}'); } catch (e) { return {}; } },
  set(patch) { try { localStorage.setItem('meo-fmt', JSON.stringify({ ...device.get(), ...patch })); } catch (e) { /* not saved */ } },
};

export function initLookahead(app) {
  const { state, db, C, touch, saveNote, saveSettings, markDirty, textField } = app;
  const idle = { busy: () => false, start() {}, cancel() {}, opened() {}, unlocked() {}, locked() {}, erase: async () => {} };
  if (PHONE) return idle;

  $('#la-advanced').hidden = false;
  const statusEl = $('#la-status'), sizeEl = $('#la-size'), wordsEl = $('#la-words'), engineStatus = $('#la-engine-status');

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

  /* ----- the voice engine on this PC ----- */
  const engineCfg = () => state.settings && state.settings.voiceEngine;
  const base = () => `http://127.0.0.1:${engineCfg().port}`;
  const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + engineCfg().key });
  const short = (e) => String((e && (e.message || e.name)) || e || 'unknown').replace(/\s+/g, ' ').slice(0, 140);

  async function call(path, body, signal) {
    const res = await fetch(base() + path, body === undefined
      ? { headers: authHeaders(), cache: 'no-store', signal }
      : { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), cache: 'no-store', signal });
    if (res.status === 401) throw new Error('key');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  async function check() {
    if (!engineCfg()) { engineStatus.textContent = 'Voice engine not set up on this PC.'; return 'none'; }
    engineStatus.textContent = 'Checking voice engine…';
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    try {
      await call('/api/v1/model', undefined, ctl.signal);
      engineStatus.textContent = 'Voice engine ready.'; return 'ready';
    } catch (e) {
      const why = e.message === 'key' ? 'key' : 'off';
      engineStatus.textContent = why === 'key' ? 'Voice engine found, but its setup doesn’t match. Run the setup again.' : 'Voice engine isn’t running. It may still be starting up.';
      return why;
    } finally { clearTimeout(t); }
  }
  $('#la-check-btn').addEventListener('click', check);

  $('#la-setup-btn').addEventListener('click', async () => {
    if (!engineCfg()) {
      state.settings.voiceEngine = { port: 40000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000), key: randomText(24) };
      await saveSettings();
    }
    const cfg = engineCfg();
    const text = F.unscramble(SETUP).replaceAll('{{PORT}}', String(cfg.port)).replaceAll('{{KEY}}', cfg.key).replace(/\r?\n/g, '\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = 'MEO Voice Setup.cmd';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    engineStatus.textContent = 'Setup downloaded. Open it from your downloads to install the voice engine.';
  });

  /* The old in-app voice cache is no longer used: free its space. */
  async function removeOldCache() {
    try { await (await navigator.storage.getDirectory()).removeEntry('fmt', { recursive: true }); } catch (e) { /* nothing stored */ }
  }

  /* ----- Alt+0: what happened last time (no note text is ever kept here) ----- */
  let diag = { notes: [] };
  function showDiag() {
    const d = device.get().diag;
    app.setVoiceStatus(d ? `Diagnostics (${d.when}): ${d.text}` : 'Diagnostics: nothing recorded yet.');
  }

  function stopGen(genkey) {
    return fetch(base() + '/api/extra/abort', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ genkey }), keepalive: true }).catch(() => {});
  }
  async function cancel() {
    if (!job) return;
    const j = job;
    const sent = j.genkey ? stopGen(j.genkey) : Promise.resolve();
    j.ctl.abort();
    await Promise.race([sent, new Promise((r) => setTimeout(r, 1500))]);
  }

  async function write(input, signal) {
    const words = input.words, limit = F.replyLimit(words);
    const maxChars = (F.CONTEXT_SIZE - limit - 700) * 3;
    const { prompt, prefill } = F.buildPrompt({ ...input, maxChars });
    const others = F.cueNames(input.ctx + input.prefix, input.speaker);
    const genkey = 'KCPP' + randomText(8);
    if (job) job.genkey = genkey;
    const stopEngine = () => { stopGen(genkey); };
    signal.addEventListener('abort', stopEngine, { once: true });
    const t0 = Date.now();
    try {
      const out = await call('/api/v1/generate', {
        prompt, genkey, max_length: limit, max_context_length: F.CONTEXT_SIZE,
        temperature: 1.0, min_p: 0.05, top_p: 1, top_k: 0, typical: 1, tfs: 1,
        rep_pen: 1.03, rep_pen_range: 1024, rep_pen_slope: 0.7,
        dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: 0, dry_sequence_breakers: ['\n', ':', '"', '*'],
        stop_sequence: ['[INST]', '[/INST]', ...others.map((n) => '\n' + n + ':')], trim_stop: true, quiet: true,
      }, signal);
      const r = (out.results && out.results[0]) || {};
      let raw = r.text || '';
      const at = F.cueCut(raw, input.speaker);
      if (at >= 0) raw = raw.slice(0, at);
      const reason = at >= 0 || (r.finish_reason && r.finish_reason !== 'length') ? 'stop' : 'length';
      const text = F.finishReply(input.ctx + input.prefix, raw, prefill, reason, input.speaker);
      diag.notes.push(`${Math.round((Date.now() - t0) / 1000)}s writing, ${raw.length} chars written, ${text.length} kept, ended ${r.finish_reason || 'unknown'}`);
      return text;
    } finally { signal.removeEventListener('abort', stopEngine); }
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
    if (!engineCfg()) { app.setVoiceStatus('The voice engine isn’t set up on this PC. See Voice Settings.'); return; }
    const ta = $('#note-text'); n.text = ta.value;
    const req = F.prepare(n.text.slice(0, ta.selectionStart));
    if (!req.ctx.trim() && !req.direction) { say('Nothing to save', 3000); return; }
    const ctl = new AbortController();
    job = { ctl }; say('Saving');
    diag = { notes: [], started: Date.now() };
    try {
      const seal = await prepareSeal({ noteId: n.id, pos: req.pos, tail: req.tail, remove: req.remove, prefix: req.prefix });
      const reply = await write({ ctx: req.ctx, prefix: req.prefix, direction: req.direction, speaker: req.speaker, words: F.blockWords(la()) }, ctl.signal);
      if (!reply.trim()) throw new Error('empty');
      await storeSealed(seal, reply);
      if (state.unlocked) say('');
      diag.result = 'saved';
    } catch (e) {
      const off = e instanceof TypeError; // the engine couldn't be reached
      if (state.unlocked) {
        say(ctl.signal.aborted ? '' : 'Not saved', 5000);
        if (off) app.setVoiceStatus('The voice engine isn’t running. It may still be starting up.');
        if (e.message === 'key') app.setVoiceStatus('The voice engine’s setup doesn’t match. Run the setup again from Voice Settings.');
      }
      diag.result = ctl.signal.aborted ? 'cancelled' : off ? 'voice engine not reachable' : e.message === 'empty' ? 'nothing usable was written' : e.message === 'key' ? 'voice engine key mismatch' : 'failed: ' + short(e);
    } finally {
      job = null;
      device.set({ diag: { when: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        text: [`${diag.result} after ${Math.round((Date.now() - diag.started) / 1000)}s`, ...diag.notes].join(' · ') } });
      if (!state.unlocked) app.afterBackgroundWork();
      else await deliverPending();
    }
  }
  // Closing the app stops the engine too, so it doesn't keep working for nothing.
  window.addEventListener('pagehide', () => { if (job) job.ctl.abort(); });

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
    cancel,
    opened() {},
    unlocked() {
      showSettings(); deliverPending(); removeOldCache(); check();
      if (job) say('Saving');
    },
    locked() { statusEl.textContent = ''; },
    erase: removeOldCache,
  };
}
