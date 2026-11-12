// MEO Notes – main app.
import { db } from './db.js';
import * as C from './crypto.js';
import * as T from './text.js';
import { Speaker, PIPER_VOICES, KOKORO_VOICES } from './tts.js';
import { GitHubStore, SyncConflict, mergeNotebooks } from './sync.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const DEFAULT_SETTINGS = {
  textDisplay: { spaces: false, endPunct: false, firstLetters: false },
  nameDisplay: { spaces: false, endPunct: false, firstLetters: false },
  metaDefaults: { created: true, modified: true, size: true },
  sort: 'num-desc',
  noteCounter: 0,
  lockMinutes: 15,
  lockOnHide: false,
  sync: null, // { owner, repo, token } – kept encrypted on this device
  voice: {
    engine: 'piper', piperVoice: 'en_US-hfc_female-medium', piperSpeaker: 0,
    kokoroVoice: 'af_heart', systemVoice: '', speed: 1, autoRead: 'off',
  },
};

const state = {
  vault: null, key: null, settings: null, notes: new Map(), openId: null,
  revealText: false, revealNames: false, saveTimers: new Map(), unlocked: false,
  sync: { base: {}, tomb: {}, lastSync: 0 },
};
const bump = (n) => { n.rev = Math.max(Date.now(), (n.rev || 0) + 1); };
const speaker = new Speaker();

/* ---------------- helpers ---------------- */
function show(name) {
  for (const s of ['setup', 'login', 'app']) $('#screen-' + s).hidden = s !== name;
}
function merge(def, val) {
  const out = structuredClone(def);
  for (const k of Object.keys(val || {})) {
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...val[k] };
    else out[k] = val[k];
  }
  return out;
}
function fmtDate(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function toLocalInput(ms) {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function fmtSize(n) { return n < 1024 ? n + ' bytes' : (n / 1024).toFixed(1) + ' KB'; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- dialogs ---------------- */
function askPass(title, { confirm = false, validate = null, placeholder = 'Passphrase' } = {}) {
  const dlg = $('#pass-dialog'); const form = $('#pass-form');
  const in1 = $('#pass-input'); const in2 = $('#pass-input2'); const err = $('#pass-error');
  $('#pass-title').textContent = title;
  in1.value = ''; in2.value = ''; err.textContent = '';
  in1.placeholder = placeholder; in2.placeholder = 'Type it again'; in2.hidden = !confirm;
  return new Promise((resolve) => {
    const done = (v) => { form.removeEventListener('submit', onSubmit); dlg.removeEventListener('cancel', onCancel); in1.value = in2.value = ''; if (dlg.open) dlg.close(); resolve(v); };
    const onCancel = (e) => { e.preventDefault(); done(null); };
    const onSubmit = async (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value === 'cancel') { done(null); return; }
      const v = in1.value;
      if (!v) { err.textContent = 'Please type a passphrase.'; return; }
      if (confirm && v !== in2.value) { err.textContent = 'The two entries don’t match.'; return; }
      if (validate) {
        $('#pass-ok').disabled = true; err.textContent = 'Checking…';
        let msg = null;
        try { msg = await validate(v); } catch (x) { msg = String(x.message || x); }
        $('#pass-ok').disabled = false;
        if (msg) { err.textContent = msg; in1.select(); return; }
      }
      done(v);
    };
    form.addEventListener('submit', onSubmit); dlg.addEventListener('cancel', onCancel);
    dlg.showModal(); in1.focus();
  });
}

function askChoice(text, buttons) {
  const dlg = $('#choice-dialog'); const box = $('#choice-buttons');
  $('#choice-text').textContent = text; box.innerHTML = '';
  return new Promise((resolve) => {
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = b.label; btn.className = b.cls || '';
      btn.onclick = () => { dlg.close(); resolve(b.value); };
      box.appendChild(btn);
    }
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
  });
}
const confirmDanger = (text, okLabel) => askChoice(text, [{ label: 'Cancel', value: false, cls: 'ghost' }, { label: okLabel, value: true, cls: 'primary' }]);

/* ---------------- storage ---------------- */
async function saveSyncState() { await db.put('kv', await C.encryptJSON(state.key, state.sync), 'sync'); }
async function saveSettings() { await db.put('kv', await C.encryptJSON(state.key, state.settings), 'settings'); }
async function saveNote(note) { const rec = await C.encryptJSON(state.key, note); await db.put('notes', { id: note.id, ...rec }); }
function scheduleSave(note) {
  markDirty();
  clearTimeout(state.saveTimers.get(note.id));
  state.saveTimers.set(note.id, setTimeout(() => { state.saveTimers.delete(note.id); saveNote(note); }, 400));
}
async function flushSaves() {
  const ids = [...state.saveTimers.keys()];
  for (const id of ids) { clearTimeout(state.saveTimers.get(id)); state.saveTimers.delete(id); const n = state.notes.get(id); if (n) await saveNote(n); }
}
async function loadData() {
  const s = await db.get('kv', 'settings');
  state.settings = merge(DEFAULT_SETTINGS, s ? await C.decryptJSON(state.key, s) : {});
  state.notes = new Map();
  for (const rec of await db.all('notes')) {
    try { const n = await C.decryptJSON(state.key, rec); if (!n.rev) n.rev = n.meta.modified || n.meta.created || 1; state.notes.set(n.id, n); } catch (e) { console.warn('Could not decrypt a note', rec.id); }
  }
  const ss = await db.get('kv', 'sync');
  state.sync = ss ? { base: {}, tomb: {}, lastSync: 0, ...(await C.decryptJSON(state.key, ss)) } : { base: {}, tomb: {}, lastSync: 0 };
  speaker.setSettings(state.settings.voice);
}

/* ---------------- lock / inactivity ---------------- */
let lastActivity = Date.now();
for (const ev of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart', 'scroll']) {
  window.addEventListener(ev, () => { lastActivity = Date.now(); }, { capture: true, passive: true });
}
function checkIdle() {
  if (!state.unlocked) return;
  if (speaker.speaking) { lastActivity = Date.now(); return; } // listening counts as activity
  if (Date.now() - lastActivity > (state.settings.lockMinutes || 15) * 60000) lock();
}
setInterval(checkIdle, 10000);
/* Privacy cover: hide the screen whenever the app isn't in front (app switcher previews, Alt+Tab). */
function setCover(on) { $('#privacy-cover').hidden = !(on && state.unlocked); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (document.hasFocus()) setCover(false);
    checkIdle();
    if (state.unlocked) syncSoon(500);
  } else if (state.unlocked) {
    setCover(true);
    if (state.revealText) setRevealText(false);
    if (state.revealNames) setRevealNames(false);
    if (state.settings.lockOnHide) { lock(); return; }
    flushSaves().then(() => { if (dirty) syncNow(); });
  }
});
window.addEventListener('blur', () => setCover(true));
window.addEventListener('focus', () => setCover(false));
$('#privacy-cover').addEventListener('pointerdown', () => setCover(false));
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); }); // never resume an unlocked page from cache

let locking = false;
async function lock() {
  if (locking) return; locking = true;
  speaker.stop();
  setCover(true);
  try { await flushSaves(); } catch (e) { /* ignore */ }
  if (dirty && state.settings && state.settings.sync) { try { await Promise.race([syncNow(), sleep(5000)]); } catch (e) { /* ignore */ } }
  state.key = null; state.unlocked = false;
  $('#note-text').value = ''; $('#name-input').value = '';
  location.reload();
}

/* ---------------- masked fields ---------------- */
class MaskedField {
  constructor(wrap, getOpts, single) {
    this.wrap = wrap; this.ta = wrap.querySelector('textarea'); this.layer = wrap.querySelector('.mask-layer');
    this.getOpts = getOpts; this.single = single;
    this.ta.addEventListener('scroll', () => this.sync());
    this.ta.addEventListener('select', () => this.sync());
    new ResizeObserver(() => this.render()).observe(this.ta);
  }
  render() {
    if (!state.settings) return;
    const o = this.getOpts();
    this.layer.textContent = T.maskText(this.ta.value, o) + (this.single ? ' ' : '\n ');
    this.wrap.classList.toggle('revealed', !!o.all);
    this.sync();
  }
  sync() {
    const sb = this.ta.offsetWidth - this.ta.clientWidth;
    this.layer.style.right = sb + 'px';
    this.layer.scrollTop = this.ta.scrollTop;
    this.layer.scrollLeft = this.ta.scrollLeft;
  }
}
const textField = new MaskedField($('#text-wrap'), () => ({ ...state.settings.textDisplay, all: state.revealText }), false);
const nameField = new MaskedField($('#name-wrap'), () => ({ ...state.settings.nameDisplay, all: state.revealNames }), true);
const maskName = (name) => T.maskText(name, { ...state.settings.nameDisplay, all: state.revealNames });

/* ---------------- setup ---------------- */
$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#setup-error');
  const l1 = $('#setup-login').value, l2 = $('#setup-login2').value, r1 = $('#setup-reveal').value, r2 = $('#setup-reveal2').value;
  if (l1 !== l2) { err.textContent = 'The login passphrases don’t match.'; return; }
  if (r1 !== r2) { err.textContent = 'The reveal passphrases don’t match.'; return; }
  if (l1 === r1) { err.textContent = 'The reveal passphrase must be different from the login passphrase.'; return; }
  err.textContent = 'Setting up…';
  const { vault, key } = await C.createVault(l1, r1);
  state.vault = vault; state.key = key;
  state.settings = structuredClone(DEFAULT_SETTINGS);
  await db.put('kv', vault, 'vault');
  await saveSettings();
  $('#setup-form').reset();
  await loadData();
  enterApp();
});

async function readBackupFile(file) {
  let b;
  try { b = JSON.parse(await file.text()); } catch (e) { throw new Error('That file isn’t a MEO Notes backup.'); }
  if (!b || b.app !== 'meonotes' || !b.vault || !Array.isArray(b.notes)) throw new Error('That file isn’t a MEO Notes backup.');
  return b;
}
async function unlockBackup(b) {
  let key = null;
  const pass = await askPass('Enter the login passphrase that was in use when this backup was made.', {
    validate: async (p) => { try { key = await C.unlockVault(b.vault, p); return null; } catch (e) { return 'That passphrase doesn’t open this backup.'; } },
  });
  return pass ? key : null;
}

$('#setup-restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const err = $('#setup-error');
  try {
    const b = await readBackupFile(file);
    const key = await unlockBackup(b);
    if (!key) return;
    await db.put('kv', b.vault, 'vault');
    if (b.settings) await db.put('kv', b.settings, 'settings');
    await db.replaceAll('notes', b.notes);
    state.vault = b.vault; state.key = key;
    await loadData();
    enterApp();
  } catch (x) { err.textContent = x.message; }
});

/* ----- set up from sync (new device) ----- */
$('#setup-sync-toggle').addEventListener('click', () => { const f = $('#setup-sync-form'); f.hidden = !f.hidden; });
$('#setup-sync-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#setup-error');
  const cfg = { owner: $('#setup-sync-owner').value.trim(), repo: $('#setup-sync-repo').value.trim(), token: $('#setup-sync-token').value.trim() };
  err.textContent = 'Connecting to GitHub…';
  try {
    const { data } = await new GitHubStore(cfg).read();
    if (!data) throw new Error('Nothing has been synced to that repository yet. Turn on sync on your other device first.');
    if (data.app !== 'meonotes-sync') throw new Error('The sync file in that repository isn’t from MEO Notes.');
    err.textContent = '';
    let key = null;
    const ok = await askPass('Enter the login passphrase you use on your other device.', {
      validate: async (p) => { try { key = await C.unlockVault(data.vault, p); return null; } catch (x) { return 'That passphrase doesn’t open the synced notebook.'; } },
    });
    if (!ok) return;
    state.vault = data.vault; state.key = key;
    await db.put('kv', data.vault, 'vault');
    state.settings = structuredClone(DEFAULT_SETTINGS); state.settings.sync = cfg;
    await saveSettings();
    await db.replaceAll('notes', data.notes);
    state.sync = { base: {}, tomb: data.tombstones || {}, lastSync: 0 };
    await saveSyncState();
    await loadData();
    state.sync.base = Object.fromEntries([...state.notes].map(([id, n]) => [id, n.rev]));
    state.sync.lastSync = Date.now();
    await saveSyncState();
    $('#setup-sync-form').reset();
    enterApp();
  } catch (x) { err.textContent = x.message; }
});

/* ---------------- login ---------------- */
let failures = 0;
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn'); const err = $('#login-error'); const input = $('#login-pass');
  btn.disabled = true; err.textContent = ''; btn.textContent = 'Unlocking…';
  try {
    state.key = await C.unlockVault(state.vault, input.value);
    input.value = ''; failures = 0;
    await loadData();
    enterApp();
  } catch (x) {
    failures++;
    err.textContent = x.message === 'WRONG_PASSPHRASE' ? 'Wrong passphrase.' : 'Could not unlock: ' + x.message;
    await sleep(Math.min(10000, 600 * failures));
    input.select();
  } finally { btn.disabled = false; btn.textContent = 'Unlock'; }
});

/* ---------------- app ---------------- */
function enterApp() {
  state.unlocked = true; lastActivity = Date.now();
  show('app');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  applySettingsToUI();
  renderList();
  closeNote();
  if (state.settings.sync) syncSoon(300);
}

function applySettingsToUI() {
  const s = state.settings;
  for (const cb of $$('[data-text-opt]')) cb.checked = !!s.textDisplay[cb.dataset.textOpt];
  for (const cb of $$('[data-name-opt]')) cb.checked = !!s.nameDisplay[cb.dataset.nameOpt];
  for (const cb of $$('[data-meta-opt]')) cb.checked = !!s.metaDefaults[cb.dataset.metaOpt];
  $('#text-show-all').checked = state.revealText;
  $('#name-show-all').checked = state.revealNames;
  $('#sort-select').value = s.sort;
  $('#timeout-select').value = String(s.lockMinutes);
  $('#lock-on-hide').checked = !!s.lockOnHide;
  renderSyncUI();
  $('#auto-read').value = s.voice.autoRead;
  $('#speed').value = s.voice.speed; $('#speed-val').textContent = Number(s.voice.speed).toFixed(2).replace(/0$/, '') + '×';
  $('#engine').value = s.voice.engine;
  populateVoices();
  renderCustomVoices();
}

/* ----- notes list ----- */
function sortedNotes() {
  const arr = [...state.notes.values()];
  const s = state.settings.sort;
  if (s === 'num-asc') arr.sort((a, b) => a.num - b.num);
  else if (s === 'modified') arr.sort((a, b) => (b.meta.modified || 0) - (a.meta.modified || 0) || b.num - a.num);
  else arr.sort((a, b) => b.num - a.num);
  return arr;
}
let listTimer = null;
function renderListSoon() { clearTimeout(listTimer); listTimer = setTimeout(renderList, 300); }
function renderList() {
  const ul = $('#note-list'); ul.innerHTML = '';
  const notes = sortedNotes();
  $('#empty-list').hidden = notes.length > 0;
  for (const n of notes) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; if (n.id === state.openId) b.classList.add('active');
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = maskName(n.name) || '•';
    b.appendChild(nm);
    if (n.meta.modified || n.meta.created) {
      const m = document.createElement('span'); m.className = 'meta';
      m.textContent = n.meta.modified ? 'Modified ' + fmtDate(n.meta.modified) : 'Created ' + fmtDate(n.meta.created);
      b.appendChild(m);
    }
    b.onclick = () => openNote(n.id);
    li.appendChild(b); ul.appendChild(li);
  }
}

$('#new-note-btn').addEventListener('click', async () => {
  const s = state.settings;
  s.noteCounter = Math.max(s.noteCounter, ...[...state.notes.values()].map((n) => n.num), 0) + 1;
  const now = Date.now();
  const meta = {};
  if (s.metaDefaults.created) meta.created = now;
  if (s.metaDefaults.modified) meta.modified = now;
  if (s.metaDefaults.size) meta.size = 0;
  const note = { id: crypto.randomUUID(), num: s.noteCounter, name: 'Note ' + s.noteCounter, text: '', meta, rev: now };
  state.notes.set(note.id, note);
  openNote(note.id);
  $('#note-text').focus();
  await saveSettings(); await saveNote(note); markDirty();
});

/* ----- open / close ----- */
const current = () => state.notes.get(state.openId);
function setRevealText(on) { state.revealText = on; $('#text-show-all').checked = on; textField.render(); }

function openNote(id) {
  if (state.openId && state.openId !== id) closeNote({ keepView: true });
  const n = state.notes.get(id); if (!n) return;
  state.openId = id;
  setRevealText(false);
  $('#no-note').hidden = true; $('#editor').hidden = false;
  $('#note-text').value = n.text; $('#name-input').value = n.name;
  $('#note-text').scrollTop = 0; $('#note-text').setSelectionRange(n.text.length, n.text.length);
  document.body.classList.add('note-open');
  textField.render(); nameField.render();
  renderMeta(); renderList();
}

function closeNote({ keepView = false } = {}) {
  const n = current();
  if (n) { clearTimeout(state.saveTimers.get(n.id)); state.saveTimers.delete(n.id); saveNote(n); }
  speaker.stop(); clearTimeout(pendingSentence);
  state.openId = null;
  setRevealText(false);
  $('#note-text').value = ''; $('#name-input').value = '';
  if (!keepView) {
    $('#editor').hidden = true; $('#no-note').hidden = false;
    document.body.classList.remove('note-open');
    renderList();
  }
}
$('#close-note-btn').addEventListener('click', () => closeNote());
$('#back-btn').addEventListener('click', () => closeNote());
$('#lock-btn').addEventListener('click', () => lock());

/* ----- editing ----- */
function touch(note) {
  bump(note);
  if ('modified' in note.meta) note.meta.modified = Date.now();
  if ('size' in note.meta) note.meta.size = T.utf8Size(note.text);
  if ($('#meta-menu').open && !$('#meta-body').contains(document.activeElement)) renderMeta();
  renderListSoon();
}

let pendingSentence = null;
$('#note-text').addEventListener('input', (e) => {
  const n = current(); if (!n) return;
  const ta = e.target;
  if (ta.value.includes('\r')) { const p = ta.selectionStart; ta.value = ta.value.replace(/\r\n?/g, '\n'); ta.setSelectionRange(p, p); }
  const prevLen = n.text.length;
  n.text = ta.value;
  touch(n); scheduleSave(n); textField.render();
  autoRead(ta, prevLen, e.inputType || '');
});

function autoRead(ta, prevLen, inputType) {
  const mode = state.settings.voice.autoRead;
  if (mode === 'off') return;
  const grew = ta.value.length > prevLen && !inputType.startsWith('delete') && inputType !== 'insertFromPaste';
  if (pendingSentence) { clearTimeout(pendingSentence); pendingSentence = null; }
  const r = T.autoReadAfterInput(mode, ta.value, ta.selectionStart, grew);
  if (!r) return;
  if (r.pendingSentence) {
    const at = r.pendingSentence;
    pendingSentence = setTimeout(() => { pendingSentence = null; const s = T.lastSentence(ta.value, at); if (s) speaker.speak(s, { interrupt: false }); }, 900);
  } else if (r.speak) speaker.speak(r.speak, { interrupt: false });
}

$('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#name-input').addEventListener('input', (e) => {
  const n = current(); if (!n) return;
  const ta = e.target;
  if (/[\r\n]/.test(ta.value)) { const p = ta.selectionStart; ta.value = ta.value.replace(/[\r\n]+/g, ' '); ta.setSelectionRange(p, p); }
  n.name = ta.value; bump(n); scheduleSave(n); nameField.render(); renderListSoon();
});
$('#name-input').addEventListener('blur', (e) => {
  const n = current(); if (!n) return;
  if (!n.name.trim()) { n.name = 'Note ' + n.num; bump(n); e.target.value = n.name; nameField.render(); scheduleSave(n); renderList(); }
});

$('#delete-note-btn').addEventListener('click', async () => {
  const n = current(); if (!n) return;
  if (!(await confirmDanger('Delete this note? This can’t be undone.', 'Delete'))) return;
  clearTimeout(state.saveTimers.get(n.id)); state.saveTimers.delete(n.id);
  state.notes.delete(n.id); await db.del('notes', n.id);
  state.sync.tomb[n.id] = Date.now(); await saveSyncState(); markDirty();
  state.openId = null; closeNote();
});

/* ----- reading ----- */
for (const b of $$('[data-read]')) {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the keyboard/caret in the note
  b.addEventListener('click', () => {
    const ta = $('#note-text'); const text = ta.value; const pos = ta.selectionStart;
    const kind = b.dataset.read;
    const t = kind === 'word' ? T.lastWord(text, pos)
      : kind === 'sentence' ? T.lastSentence(text, pos)
      : kind === 'newline' ? T.currentLine(text, pos)
      : kind === 'cursor' ? T.fromCursor(text, pos)
      : kind === 'selection' ? text.slice(ta.selectionStart, ta.selectionEnd).trim()
      : T.allText(text);
    if (!t) { setVoiceStatus(kind === 'selection' ? 'Select some text first, then press Read Selection.' : 'Nothing to read there.'); return; }
    speaker.unlockAudio();
    speaker.speak(t, { interrupt: true });
  });
}
const SHORTCUTS = { Digit1: 'sentence', Digit2: 'newline', Digit3: 'all', Digit4: 'cursor', Digit5: 'word', Digit6: 'selection' };
for (const [code, kind] of Object.entries(SHORTCUTS)) { const b = $(`[data-read=${kind}]`); b.title = `${b.textContent} (Alt+${code.slice(-1)})`; }
let lastEsc = 0;
window.addEventListener('keydown', (e) => {
  if (!state.unlocked || document.querySelector('dialog[open]')) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && SHORTCUTS[e.code] && state.openId) {
    e.preventDefault(); $(`[data-read=${SHORTCUTS[e.code]}]`).click(); return;
  }
  if (e.key === 'Escape' && !e.repeat) {
    const now = Date.now();
    if (now - lastEsc < 600) { lastEsc = 0; lock(); return; }
    lastEsc = now; speaker.stop(); clearTimeout(pendingSentence);
  }
});
// Quick lock: double-tap / double-click the top bar.
let lastBarTap = 0;
$('.topbar').addEventListener('pointerup', (e) => {
  if (e.target.closest('button')) return;
  const now = Date.now();
  if (now - lastBarTap < 450) { lastBarTap = 0; lock(); } else lastBarTap = now;
});
$('#stop-btn').addEventListener('mousedown', (e) => e.preventDefault());
$('#stop-btn').addEventListener('click', () => { speaker.stop(); clearTimeout(pendingSentence); });
window.addEventListener('pointerdown', () => speaker.unlockAudio(), { once: true, capture: true });
window.addEventListener('keydown', () => speaker.unlockAudio(), { once: true, capture: true });

function setVoiceStatus(msg) { $('#voice-status').textContent = msg; }
speaker.onStatus = (msg, extra) => {
  setVoiceStatus(msg === 'Voice ready.' ? '' : msg);
  if (extra && extra.speakers) renderSpeakers(extra.speakers);
};
speaker.onError = (err) => {
  const offline = !navigator.onLine;
  setVoiceStatus('Voice problem: ' + err.message + (offline ? ' (You are offline – a new voice needs internet the first time.)' : ''));
};
speaker.onSpeakingChange = (on) => { $('#stop-btn').disabled = !on; };

/* ----- text settings ----- */
for (const cb of $$('[data-text-opt]')) cb.addEventListener('change', () => { state.settings.textDisplay[cb.dataset.textOpt] = cb.checked; saveSettings(); textField.render(); });
$('#text-show-all').addEventListener('change', async (e) => {
  if (!e.target.checked) { setRevealText(false); return; }
  e.target.checked = false;
  if (await askReveal()) setRevealText(true);
});

async function askReveal() {
  const p = await askPass('Enter your reveal passphrase.', {
    validate: async (v) => ((await C.checkReveal(state.vault, state.key, v)) ? null : 'Wrong reveal passphrase.'),
  });
  return !!p;
}

/* ----- note settings ----- */
for (const cb of $$('[data-name-opt]')) cb.addEventListener('change', () => { state.settings.nameDisplay[cb.dataset.nameOpt] = cb.checked; saveSettings(); nameField.render(); renderList(); });
for (const cb of $$('[data-meta-opt]')) cb.addEventListener('change', () => { state.settings.metaDefaults[cb.dataset.metaOpt] = cb.checked; saveSettings(); });
function setRevealNames(on) { state.revealNames = on; $('#name-show-all').checked = on; nameField.render(); renderList(); }
$('#name-show-all').addEventListener('change', async (e) => {
  if (!e.target.checked) { setRevealNames(false); return; }
  e.target.checked = false;
  if (await askReveal()) setRevealNames(true);
});
$('#sort-select').addEventListener('change', (e) => { state.settings.sort = e.target.value; saveSettings(); renderList(); });

$('#timeout-select').addEventListener('change', (e) => { state.settings.lockMinutes = +e.target.value; saveSettings(); });
$('#lock-on-hide').addEventListener('change', (e) => { state.settings.lockOnHide = e.target.checked; saveSettings(); });

/* ----- note info (metadata) ----- */
const META_FIELDS = [
  { k: 'created', label: 'Date created', type: 'date' },
  { k: 'modified', label: 'Date modified', type: 'date', note: 'Updates automatically when you edit the text.' },
  { k: 'size', label: 'Size (bytes)', type: 'size', note: 'Updates automatically when you edit the text.' },
];
function renderMeta() {
  const n = current(); const box = $('#meta-body'); box.innerHTML = '';
  if (!n) return;
  for (const f of META_FIELDS) {
    const row = document.createElement('div'); row.className = 'meta-row';
    const lbl = document.createElement('div'); lbl.className = 'lbl';
    lbl.textContent = f.label + (f.k in n.meta && f.note ? ' — ' + f.note : '');
    row.appendChild(lbl);
    if (f.k in n.meta) {
      const inp = document.createElement('input');
      if (f.type === 'date') { inp.type = 'datetime-local'; inp.value = toLocalInput(n.meta[f.k]); }
      else { inp.type = 'number'; inp.min = '0'; inp.value = n.meta[f.k]; }
      inp.setAttribute('aria-label', f.label);
      inp.addEventListener('change', () => {
        const v = f.type === 'date' ? new Date(inp.value).getTime() : Math.max(0, parseInt(inp.value, 10));
        if (Number.isFinite(v)) { n.meta[f.k] = v; bump(n); scheduleSave(n); renderListSoon(); }
      });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'ghost small danger'; del.textContent = 'Delete';
      del.onclick = () => { delete n.meta[f.k]; bump(n); scheduleSave(n); renderMeta(); renderListSoon(); };
      row.append(inp, del);
    } else {
      const none = document.createElement('span'); none.className = 'muted small'; none.textContent = 'Not saved for this note';
      const add = document.createElement('button'); add.type = 'button'; add.className = 'ghost small'; add.textContent = 'Add';
      add.onclick = () => { n.meta[f.k] = f.type === 'size' ? T.utf8Size(n.text) : Date.now(); bump(n); scheduleSave(n); renderMeta(); renderListSoon(); };
      row.append(none, add);
    }
    box.appendChild(row);
  }
}

/* ----- voice settings ----- */
const ENGINE_HINTS = {
  piper: 'Runs entirely on this device. Each voice downloads once (usually 20–120 MB), then works offline. Downloaded voices are marked ✓.',
  kokoro: 'Runs entirely on this device. Downloads about 90 MB once. The most natural voices, but slower to start, especially on phones.',
  system: 'Uses voices built into Windows or Android. Voices marked “online” send your text to Microsoft or Google to be spoken, so avoid them for private notes.',
};
async function downloadedPiperUrls() {
  try { const c = await caches.open('meo-voices-v1'); return new Set((await c.keys()).map((r) => r.url)); } catch (e) { return new Set(); }
}
async function populateVoices() {
  const v = state.settings.voice; const sel = $('#voice-select'); sel.innerHTML = '';
  $('#engine-hint').textContent = ENGINE_HINTS[v.engine];
  $('#speaker-row').hidden = true;
  const opt = (value, label, parent) => { const o = document.createElement('option'); o.value = value; o.textContent = label; (parent || sel).appendChild(o); return o; };
  const group = (label) => { const g = document.createElement('optgroup'); g.label = label; sel.appendChild(g); return g; };
  if (v.engine === 'piper') {
    const custom = await Speaker.customVoices();
    if (custom.length) { const g = group('Your custom voices'); for (const c of custom) opt(c.key, c.name, g); }
    const have = await downloadedPiperUrls();
    const langs = new Map();
    for (const p of PIPER_VOICES) { if (!langs.has(p.langName)) langs.set(p.langName, []); langs.get(p.langName).push(p); }
    const order = [...langs.keys()].sort((a, b) => (b.startsWith('English') - a.startsWith('English')) || a.localeCompare(b));
    for (const l of order) {
      const g = group(l);
      for (const p of langs.get(l)) {
        const done = [...have].some((u) => u.endsWith(p.path));
        const name = p.name.replace(/_/g, ' ');
        opt(p.key, `${done ? '✓ ' : ''}${name[0].toUpperCase() + name.slice(1)} – ${p.quality.replace('_', ' ')}${p.speakers > 1 ? `, ${p.speakers} speakers` : ''} (${p.mb} MB)`, g);
      }
    }
    sel.value = v.piperVoice;
    if (speaker.piper.loadedKey === v.piperVoice) renderSpeakers(speaker.piper.speakers);
  } else if (v.engine === 'kokoro') {
    for (const accent of ['en-us', 'en-gb']) {
      const g = group(accent === 'en-us' ? 'American English' : 'British English');
      for (const k of KOKORO_VOICES.filter((x) => x.lang === accent)) opt(k.key, `${k.name} (${k.gender.toLowerCase()}) – quality ${k.grade}`, g);
    }
    sel.value = v.kokoroVoice;
  } else {
    const voices = Speaker.systemVoices();
    if (!voices.length) opt('', 'No device voices found');
    const local = voices.filter((x) => x.localService), online = voices.filter((x) => !x.localService);
    if (local.length) { const g = group('On this device'); for (const x of local) opt(x.voiceURI, `${x.name} (${x.lang})`, g); }
    if (online.length) { const g = group('Online – not private'); for (const x of online) opt(x.voiceURI, `${x.name} (${x.lang}) – online`, g); }
    if (v.systemVoice) sel.value = v.systemVoice;
    if (!sel.value && local.length) { sel.value = local[0].voiceURI; v.systemVoice = sel.value; }
  }
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { if (state.unlocked && state.settings.voice.engine === 'system') populateVoices(); });

function renderSpeakers(list) {
  const row = $('#speaker-row'); const sel = $('#speaker-select');
  if (!list || list.length <= 1) { row.hidden = true; return; }
  sel.innerHTML = '';
  for (const s of list) { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.id} – ${s.name}`; sel.appendChild(o); }
  sel.value = state.settings.voice.piperSpeaker || 0;
  row.hidden = state.settings.voice.engine !== 'piper';
}

function prepareVoice() {
  speaker.prepare().then(() => { if (state.settings.voice.engine === 'piper') populateVoices(); }).catch((e) => speaker.onError(e));
}
$('#engine').addEventListener('change', (e) => { speaker.stop(); state.settings.voice.engine = e.target.value; saveSettings(); populateVoices(); });
$('#voice-select').addEventListener('change', (e) => {
  const v = state.settings.voice; speaker.stop();
  if (v.engine === 'piper') { v.piperVoice = e.target.value; v.piperSpeaker = 0; $('#speaker-row').hidden = true; prepareVoice(); }
  else if (v.engine === 'kokoro') v.kokoroVoice = e.target.value;
  else v.systemVoice = e.target.value;
  saveSettings();
});
$('#speaker-select').addEventListener('change', (e) => { state.settings.voice.piperSpeaker = +e.target.value; saveSettings(); });
$('#speed').addEventListener('input', (e) => { state.settings.voice.speed = +e.target.value; $('#speed-val').textContent = (+e.target.value).toFixed(2).replace(/0$/, '') + '×'; });
$('#speed').addEventListener('change', () => saveSettings());
$('#auto-read').addEventListener('change', (e) => { state.settings.voice.autoRead = e.target.value; saveSettings(); });
$('#test-voice-btn').addEventListener('click', () => { speaker.unlockAudio(); speaker.speak('Hello. This is how I sound when I read your notes.', { interrupt: true }); });

$('#custom-voice-file').addEventListener('change', async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  try {
    const key = await Speaker.addCustomVoice(files);
    Object.assign(state.settings.voice, { engine: 'piper', piperVoice: key, piperSpeaker: 0 });
    speaker.piper.loadedKey = null;
    await saveSettings(); $('#engine').value = 'piper';
    await populateVoices(); renderCustomVoices(); prepareVoice();
  } catch (x) { setVoiceStatus(x.message); }
});
async function renderCustomVoices() {
  const ul = $('#custom-voice-list'); ul.innerHTML = '';
  for (const c of await Speaker.customVoices()) {
    const li = document.createElement('li'); const span = document.createElement('span'); span.textContent = c.name;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ghost small danger'; del.textContent = 'Remove';
    del.onclick = async () => {
      if (!(await confirmDanger(`Remove the custom voice “${c.name}”?`, 'Remove'))) return;
      await Speaker.removeCustomVoice(c.key);
      if (state.settings.voice.piperVoice === c.key) { state.settings.voice.piperVoice = DEFAULT_SETTINGS.voice.piperVoice; saveSettings(); }
      renderCustomVoices(); populateVoices();
    };
    li.append(span, del); ul.appendChild(li);
  }
}
$('#clear-voices-btn').addEventListener('click', async () => {
  if (!(await confirmDanger('Delete all downloaded voice files from this device? They will download again when used. (Custom voices you added are kept.)', 'Delete'))) return;
  await Speaker.clearDownloadedVoices(); populateVoices(); setVoiceStatus('Downloaded voice files deleted.');
});

/* ----- sync ----- */
let dirty = false, syncTimer = null, syncing = null, syncAgain = false, joinDeclined = false;
function markDirty() { dirty = true; syncSoon(20000); }
function syncSoon(ms) {
  if (!state.unlocked || !state.settings || !state.settings.sync) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), ms);
}
setInterval(() => { if (state.unlocked && state.settings.sync && document.visibilityState === 'visible') syncNow(); }, 3 * 60000);

function setSyncStatus(msg, bad = false) {
  $('#sync-status').textContent = msg;
  const b = $('#sync-badge'); b.textContent = bad ? 'Sync problem' : ''; b.classList.toggle('bad', bad);
}
$('#sync-badge').addEventListener('click', () => {
  if (!$('#sync-badge').classList.contains('bad')) return;
  if (state.openId && window.matchMedia('(max-width: 820px)').matches) closeNote();
  $('#sync-menu').open = true; $('#sync-menu').scrollIntoView({ block: 'nearest' });
});

function syncNow() {
  if (!state.unlocked || !state.settings.sync) return Promise.resolve();
  if (syncing) { syncAgain = true; return syncing; }
  syncing = doSync().finally(() => { syncing = null; if (syncAgain) { syncAgain = false; syncSoon(1000); } });
  return syncing;
}

function refreshOpenNote(n) {
  const ta = $('#note-text');
  if (ta.value !== n.text) {
    const pos = Math.min(ta.selectionStart, n.text.length);
    ta.value = n.text; ta.setSelectionRange(pos, pos); textField.render();
  }
  if ($('#name-input').value !== n.name) { $('#name-input').value = n.name; nameField.render(); }
  renderMeta();
}

async function applyMerged(out, snapshot) {
  for (const [id, n] of out) {
    const cur = state.notes.get(id);
    if (cur && cur.rev !== snapshot.get(id)) continue; // edited while syncing – keep the edit
    if (!cur || cur.rev !== n.rev) {
      state.notes.set(id, n); await saveNote(n);
      if (id === state.openId) refreshOpenNote(n);
    }
  }
  for (const id of [...state.notes.keys()]) {
    if (out.has(id) || !snapshot.has(id) || state.notes.get(id).rev !== snapshot.get(id)) continue;
    state.notes.delete(id); await db.del('notes', id);
    if (id === state.openId) { closeNote(); setSyncStatus('The note you had open was deleted on your other device.'); }
  }
  renderList();
}

async function joinNotebook(data) {
  if (joinDeclined) return false;
  const go = await askChoice('Your GitHub sync already holds a notebook started on another device. Join it? The notes on this device will be added to it, and this device will then use that notebook’s login and reveal passphrases.', [
    { label: 'Not now', value: false, cls: 'ghost' }, { label: 'Join', value: true, cls: 'primary' }]);
  if (!go) { joinDeclined = true; return false; }
  let key = null;
  const ok = await askPass('Enter the login passphrase you use on your other device.', {
    validate: async (p) => { try { key = await C.unlockVault(data.vault, p); return null; } catch (e) { return 'That passphrase doesn’t open the synced notebook.'; } },
  });
  if (!ok) { joinDeclined = true; return false; }
  state.key = key; state.vault = data.vault;
  await db.put('kv', state.vault, 'vault');
  state.sync.base = {};
  for (const n of state.notes.values()) await saveNote(n);
  await saveSettings(); await saveSyncState();
  return true;
}

async function doSync() {
  const store = new GitHubStore(state.settings.sync);
  if (!$('#sync-badge').classList.contains('bad')) $('#sync-badge').textContent = 'Syncing…';
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      await flushSaves();
      const wasDirty = dirty; dirty = false;
      let sha, data;
      try { ({ sha, data } = await store.read()); } catch (e) { dirty = dirty || wasDirty; throw e; }
      const remote = new Map(); let tombRemote = {};
      if (data) {
        if (data.app !== 'meonotes-sync') throw new Error('The sync file in that repository isn’t from MEO Notes.');
        let same = true;
        try { await C.decryptJSON(state.key, data.check); } catch (e) { same = false; }
        if (!same) {
          dirty = dirty || wasDirty;
          if (!(await joinNotebook(data))) throw new Error('Sync is paused: GitHub holds a different notebook. Use “Sync now” to join it.');
          continue;
        }
        for (const rec of data.notes) { const n = await C.decryptJSON(state.key, rec); remote.set(n.id, n); }
        tombRemote = data.tombstones || {};
        if ((data.vault.updated || 0) > (state.vault.updated || 0)) { state.vault = data.vault; await db.put('kv', state.vault, 'vault'); }
      }
      const snapshot = new Map([...state.notes].map(([id, n]) => [id, n.rev]));
      let counter = Math.max(state.settings.noteCounter, ...[...state.notes.values(), ...remote.values()].map((n) => n.num || 0), 0);
      const makeCopy = (n) => ({ ...n, id: crypto.randomUUID(), num: ++counter, name: n.name + ' (other device)', rev: Date.now() });
      const res = mergeNotebooks({ local: new Map(state.notes), remote, base: state.sync.base, tombLocal: state.sync.tomb, tombRemote, makeCopy });
      if (res.localChanged) await applyMerged(res.notes, snapshot);
      state.sync.tomb = res.tomb;
      if (counter > state.settings.noteCounter) { state.settings.noteCounter = counter; await saveSettings(); }
      const vaultNewer = data && (state.vault.updated || 0) > (data.vault.updated || 0);
      if (!data || res.remoteChanged || vaultNewer) {
        const notes = [];
        for (const n of res.notes.values()) notes.push({ id: n.id, ...(await C.encryptJSON(state.key, n)) });
        const payload = { app: 'meonotes-sync', format: 1, vault: state.vault, check: await C.encryptJSON(state.key, { ok: true }), tombstones: res.tomb, notes };
        try { await store.write(payload, sha); } catch (e) {
          dirty = dirty || wasDirty;
          if (e instanceof SyncConflict) continue;
          throw e;
        }
      }
      state.sync.base = Object.fromEntries([...res.notes].map(([id, n]) => [id, n.rev]));
      state.sync.lastSync = Date.now();
      await saveSyncState();
      setSyncStatus('Last synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
        (res.copies ? ` · ${res.copies} note${res.copies === 1 ? ' was' : 's were'} changed on both devices, so both versions were kept (“other device”).` : ''));
      return;
    }
    throw new Error('Sync kept colliding with your other device. It will try again shortly.');
  } catch (e) {
    setSyncStatus(e.message, true);
  }
}

function renderSyncUI() {
  const cfg = state.settings.sync;
  $('#sync-setup').hidden = !!cfg; $('#sync-on').hidden = !cfg;
  if (cfg) $('#sync-where').textContent = cfg.owner + '/' + cfg.repo;
  if (!cfg) setSyncStatus('');
  else if (state.sync.lastSync && !$('#sync-badge').classList.contains('bad')) setSyncStatus('Last synced ' + fmtDate(state.sync.lastSync));
}
$('#sync-connect-btn').addEventListener('click', async () => {
  const cfg = { owner: $('#sync-owner').value.trim(), repo: $('#sync-repo').value.trim(), token: $('#sync-token').value.trim() };
  if (!cfg.owner || !cfg.repo || !cfg.token) { setSyncStatus('Fill in all three boxes.'); return; }
  const btn = $('#sync-connect-btn'); btn.disabled = true; setSyncStatus('Checking…');
  try {
    await new GitHubStore(cfg).read();
    state.settings.sync = cfg; joinDeclined = false;
    await saveSettings();
    $('#sync-token').value = '';
    renderSyncUI(); setSyncStatus('Connected. Syncing…');
    await syncNow();
  } catch (e) { setSyncStatus(e.message); } finally { btn.disabled = false; }
});
$('#sync-now-btn').addEventListener('click', () => { joinDeclined = false; syncNow(); });
$('#sync-token-btn').addEventListener('click', async () => {
  const t = await askPass('Paste the new GitHub access token.', { placeholder: 'Access token' });
  if (!t) return;
  state.settings.sync = { ...state.settings.sync, token: t.trim() };
  await saveSettings(); syncNow();
});
$('#sync-off-btn').addEventListener('click', async () => {
  if (!(await confirmDanger('Turn off sync on this device? Your notes stay here and on GitHub; they just stop updating each other.', 'Turn off'))) return;
  state.settings.sync = null; await saveSettings(); clearTimeout(syncTimer); renderSyncUI();
});

/* ----- backup & restore ----- */
$('#backup-btn').addEventListener('click', async () => {
  await flushSaves();
  const backup = { app: 'meonotes', format: 1, exported: new Date().toISOString(), vault: state.vault, settings: await db.get('kv', 'settings'), notes: await db.all('notes') };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `meo-notes-backup-${new Date().toISOString().slice(0, 10)}.meobak`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  $('#backup-status').textContent = `Backup of ${state.notes.size} note${state.notes.size === 1 ? '' : 's'} downloaded. It can only be opened with your login passphrase.`;
});

$('#restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const status = $('#backup-status');
  try {
    const b = await readBackupFile(file);
    const key = await unlockBackup(b);
    if (!key) return;
    const incoming = [];
    for (const rec of b.notes) { const n = await C.decryptJSON(key, rec); if (!n.rev) n.rev = n.meta.modified || n.meta.created || 1; incoming.push(n); }
    const mode = await askChoice(`This backup has ${incoming.length} note${incoming.length === 1 ? '' : 's'}. How should it be restored?`, [
      { label: 'Cancel', value: null, cls: 'ghost' },
      { label: 'Replace everything', value: 'replace' },
      { label: 'Merge with my notes', value: 'merge', cls: 'primary' },
    ]);
    if (!mode) return;
    if (mode === 'replace' && !(await confirmDanger('Replace all notes and settings on this device with the backup? Your passphrases stay the same.', 'Replace'))) return;
    closeNote();
    await flushSaves();
    let changed = 0;
    if (mode === 'replace') {
      for (const id of state.notes.keys()) if (!incoming.some((n) => n.id === id)) state.sync.tomb[id] = Date.now();
      for (const n of incoming) { delete state.sync.tomb[n.id]; bump(n); }
      const keepSync = state.settings.sync;
      state.notes = new Map(incoming.map((n) => [n.id, n]));
      if (b.settings) { state.settings = merge(DEFAULT_SETTINGS, await C.decryptJSON(key, b.settings)); state.settings.sync = keepSync; }
      speaker.setSettings(state.settings.voice);
      const recs = [];
      for (const n of incoming) recs.push({ id: n.id, ...(await C.encryptJSON(state.key, n)) });
      await db.replaceAll('notes', recs);
      changed = incoming.length;
    } else {
      for (const n of incoming) {
        const mine = state.notes.get(n.id);
        if (!mine || n.rev > mine.rev) { if (mine) bump(n); state.notes.set(n.id, n); await saveNote(n); changed++; }
      }
    }
    state.settings.noteCounter = Math.max(state.settings.noteCounter, ...[...state.notes.values()].map((n) => n.num), 0);
    await saveSettings(); await saveSyncState(); markDirty();
    applySettingsToUI(); renderList();
    status.textContent = mode === 'replace' ? `Restored ${changed} notes.` : `Merged: ${changed} note${changed === 1 ? '' : 's'} added or updated.`;
  } catch (x) { status.textContent = x.message; }
});

/* ----- security ----- */
$('#change-login-btn').addEventListener('click', async () => {
  let current = null;
  const ok = await askPass('Enter your current login passphrase.', {
    validate: async (p) => { try { await C.unlockVault(state.vault, p); current = p; return null; } catch (e) { return 'Wrong passphrase.'; } },
  });
  if (!ok) return;
  const next = await askPass('Choose a new login passphrase.', {
    confirm: true, placeholder: 'New login passphrase',
    validate: async (p) => (p.length < 6 ? 'Use at least 6 characters.' : (await C.checkReveal(state.vault, state.key, p)) ? 'It must be different from your reveal passphrase.' : null),
  });
  if (!next) return;
  state.vault = { ...(await C.changeLoginPassphrase(state.vault, current, next)), updated: Date.now() };
  await db.put('kv', state.vault, 'vault'); markDirty(); syncSoon(200);
  await askChoice('Login passphrase changed. Backups made before today still open with the old one. If sync is on, your other device will switch to the new passphrase after its next sync.', [{ label: 'OK', value: true, cls: 'primary' }]);
});
$('#change-reveal-btn').addEventListener('click', async () => {
  let login = null;
  const ok = await askPass('Enter your login passphrase.', {
    validate: async (p) => { try { await C.unlockVault(state.vault, p); login = p; return null; } catch (e) { return 'Wrong passphrase.'; } },
  });
  if (!ok) return;
  const next = await askPass('Choose a new reveal passphrase.', {
    confirm: true, placeholder: 'New reveal passphrase',
    validate: async (p) => (p.length < 4 ? 'Use at least 4 characters.' : p === login ? 'It must be different from your login passphrase.' : null),
  });
  if (!next) return;
  state.vault = { ...(await C.changeRevealPassphrase(state.vault, state.key, next)), updated: Date.now() };
  await db.put('kv', state.vault, 'vault'); markDirty(); syncSoon(200);
  await askChoice('Reveal passphrase changed.', [{ label: 'OK', value: true, cls: 'primary' }]);
});
$('#erase-btn').addEventListener('click', async () => {
  if (!(await confirmDanger('Erase ALL notes, settings and passphrases on this device? Make a backup first if you want to keep anything.', 'Continue'))) return;
  if (!(await confirmDanger('Are you completely sure? This cannot be undone.', 'Erase everything'))) return;
  speaker.stop(); state.unlocked = false; state.saveTimers.forEach(clearTimeout); state.saveTimers.clear();
  await db.wipe();
  location.reload();
});

/* ---------------- boot ---------------- */
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  state.vault = await db.get('kv', 'vault');
  if (state.vault) { show('login'); $('#login-pass').focus(); } else show('setup');
}
boot();
