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
