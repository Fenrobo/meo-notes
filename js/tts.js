// MEO Notes – voice engines and playback.
// Engines: 'piper' (fast, on-device), 'kokoro' (most natural, on-device, bigger),
// 'system' (voices built into Windows/Android; some of these are online services).
import { PIPER_VOICES, KOKORO_VOICES } from '../voices.js';
import { chunkText } from './text.js';
import { db } from './db.js';

export { PIPER_VOICES, KOKORO_VOICES };
const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

class WorkerEngine {
  constructor(url, opts) {
    this.url = url; this.opts = opts; this.w = null; this.seq = 0; this.pending = new Map();
    this.q = Promise.resolve(); this.onProgress = null; this.loadedKey = null; this.speakers = [];
  }
  worker() {
    if (!this.w) {
      this.w = new Worker(this.url, this.opts);
      this.w.onmessage = (e) => {
        const m = e.data; const p = this.pending.get(m.id);
        if (m.type === 'progress') { if (this.onProgress) this.onProgress(m.loaded, m.total); return; }
        if (!p) return;
        this.pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
      };
      this.w.onerror = (e) => { for (const p of this.pending.values()) p.reject(new Error(e.message || 'Voice engine failed to start')); this.pending.clear(); };
    }
    return this.w;
  }
  request(msg, transfer) {
    const run = () => new Promise((resolve, reject) => {
      const id = ++this.seq; this.pending.set(id, { resolve, reject });
      this.worker().postMessage({ ...msg, id }, transfer || []);
    });
    const p = this.q.then(run, run);
    this.q = p.catch(() => {});
    return p;
  }
}

export class Speaker {
  constructor() {
    this.piper = new WorkerEngine(new URL('../workers/piper-worker.js', import.meta.url));
    this.kokoro = new WorkerEngine(new URL('../workers/kokoro-worker.js', import.meta.url), { type: 'module' });
    this.ctx = null; this.source = null; this.gen = 0; this.chain = Promise.resolve();
    this.settings = null; this.speaking = false;
    this.onStatus = () => {}; this.onError = () => {}; this.onSpeakingChange = () => {};
    const progress = (loaded, total) => {
      const pct = total ? Math.round((loaded / total) * 100) + '%' : Math.round(loaded / 1e6) + ' MB';
      this.onStatus('Downloading voice… ' + pct + ' (only needed once)');
    };
    this.piper.onProgress = progress; this.kokoro.onProgress = progress;
  }

  setSettings(v) { this.settings = v; }

  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  /** Call from a click/tap handler so audio is allowed to start later. */
  unlockAudio() { try { this.audio(); } catch (e) { /* ignore */ } }

  async piperVoiceSpec(key) {
    if (key.startsWith('custom:')) {
      const rec = await db.get('voices', key);
      if (!rec) throw new Error('That custom voice is missing. Choose another voice.');
      return { key, custom: true, model: rec.model.slice(0), config: rec.config };
    }
    const v = PIPER_VOICES.find((x) => x.key === key) || PIPER_VOICES.find((x) => x.key === 'en_US-hfc_female-medium');
    return { key: v.key, modelUrl: PIPER_BASE + v.path, configUrl: PIPER_BASE + v.path + '.json' };
  }

  /** Make sure the selected voice is downloaded and loaded. */
  async prepare() {
    const s = this.settings;
    if (s.engine === 'piper') {
      if (this.piper.loadedKey === s.piperVoice) return;
      this.onStatus('Loading voice…');
      const spec = await this.piperVoiceSpec(s.piperVoice);
      const res = await this.piper.request({ type: 'load', voice: spec }, spec.custom ? [spec.model] : []);
      this.piper.loadedKey = s.piperVoice; this.piper.speakers = res.speakers || [];
      this.onStatus('Voice ready.', { speakers: this.piper.speakers });
    } else if (s.engine === 'kokoro') {
      if (this.kokoro.loadedKey) return;
      this.onStatus('Loading voice…');
      await this.kokoro.request({ type: 'load' });
      this.kokoro.loadedKey = 'kokoro';
      this.onStatus('Voice ready.');
    }
  }

  async synth(text) {
    const s = this.settings;
    await this.prepare();
    if (s.engine === 'piper') return this.piper.request({ type: 'speak', text, speed: s.speed, speaker: s.piperSpeaker || 0 });
    return this.kokoro.request({ type: 'speak', text, speed: s.speed, voice: s.kokoroVoice });
  }

  /** Speak text. interrupt=true stops whatever is playing first; false queues it. */
  speak(text, { interrupt = true } = {}) {
    if (!text || !text.trim()) return;
    if (interrupt) this.stop();
    const g = this.gen;
    this.chain = this.chain.then(() => this.run(text, g)).catch((err) => { if (g === this.gen) this.onError(err); });
  }

  setSpeaking(on) { if (this.speaking !== on) { this.speaking = on; this.onSpeakingChange(on); } }

  async run(text, g) {
    if (g !== this.gen) return;
    this.setSpeaking(true);
    try {
      if (this.settings.engine === 'system') { await this.speakSystem(text, g); return; }
      const chunks = chunkText(text);
      if (!chunks.length) return;
      let next = this.synth(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const cur = await next;
        if (g !== this.gen) return;
        if (i + 1 < chunks.length) { next = this.synth(chunks[i + 1]); next.catch(() => {}); }
        await this.play(cur.pcm, cur.sampleRate, g);
        if (g !== this.gen) return;
      }
    } finally {
      if (g === this.gen) this.setSpeaking(false);
    }
  }

  play(pcm, sampleRate, g) {
    return new Promise((resolve) => {
      if (g !== this.gen || !pcm.length) { resolve(); return; }
      const ctx = this.audio();
      const buf = ctx.createBuffer(1, pcm.length, sampleRate);
      buf.copyToChannel(pcm, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination);
      src.onended = () => { if (this.source === src) this.source = null; resolve(); };
      this.source = src; this._resolvePlay = resolve;
      src.start();
    });
  }

  speakSystem(text, g) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) throw new Error('This browser has no built-in voices.');
      const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find((x) => x.voiceURI === this.settings.systemVoice);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = this.settings.speed || 1;
      u.onend = u.onerror = () => resolve();
      this._resolvePlay = resolve;
      if (g === this.gen) speechSynthesis.speak(u); else resolve();
    });
  }

  stop() {
    this.gen++;
    if (this.source) { try { this.source.onended = null; this.source.stop(); } catch (e) { /* ignore */ } this.source = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this._resolvePlay) { this._resolvePlay(); this._resolvePlay = null; }
    this.setSpeaking(false);
  }

  static systemVoices() {
    if (!('speechSynthesis' in window)) return [];
    return speechSynthesis.getVoices();
  }

  static async addCustomVoice(files) {
    const list = [...files];
    const model = list.find((f) => /\.onnx$/i.test(f.name));
    const cfgFile = list.find((f) => /\.json$/i.test(f.name));
    if (!model || !cfgFile) throw new Error('Pick both files for the voice: the .onnx file and its .onnx.json file.');
    const config = JSON.parse(await cfgFile.text());
    if (!config.audio || !config.espeak) throw new Error('That .json file does not look like a Piper voice config.');
    const name = model.name.replace(/\.onnx$/i, '');
    const key = 'custom:' + name;
    await db.put('voices', { key, name, model: await model.arrayBuffer(), config, added: Date.now() });
    return key;
  }
  static async customVoices() { return (await db.all('voices')).map((v) => ({ key: v.key, name: v.name })); }
  static async removeCustomVoice(key) { await db.del('voices', key); }

  static async clearDownloadedVoices() {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('meo-voices') || n.startsWith('transformers-cache')).map((n) => caches.delete(n)));
  }
}
