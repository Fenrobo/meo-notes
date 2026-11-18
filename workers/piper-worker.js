/* MEO Notes – Piper TTS worker (classic worker, runs fully on-device).
 * Loads onnxruntime-web and the piper/espeak phonemizer from the app's own
 * /vendor folder. Only voice model files are downloaded (from Hugging Face),
 * and they are cached on the device after the first download.
 */
/* global ort, createPiperPhonemize */
const BASE = new URL('../', self.location.href).href;
importScripts(BASE + 'workers/gz-fetch.js');
importScripts(BASE + 'vendor/ort/ort.wasm.min.js');
importScripts(BASE + 'vendor/piper/piper_phonemize.js');

ort.env.wasm.wasmPaths = BASE + 'vendor/ort/';
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const MODEL_CACHE = 'meo-voices-v1';

let session = null;      // ort.InferenceSession
let config = null;       // voice .onnx.json
let loadedKey = null;
let phon = null;         // persistent phonemizer module
let phonOut = null;      // resolver for the current phonemize call
let wasmBinary = null, dataPackage = null;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

async function fetchWithCache(url, onProgress) {
  let cache = null;
  try { cache = await caches.open(MODEL_CACHE); } catch (e) { /* no cache API */ }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed (' + res.status + ') for ' + url);
  const total = +(res.headers.get('Content-Length') || 0);
  const reader = res.body.getReader();
  const chunks = []; let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.length;
    if (onProgress) onProgress(loaded, total);
  }
  const buf = new Uint8Array(loaded); let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  if (cache) { try { await cache.put(url, new Response(buf)); } catch (e) { /* quota */ } }
  return buf;
}

async function getPhonemizer() {
  if (phon) return phon;
  if (!wasmBinary) wasmBinary = await (await fetch(BASE + 'vendor/piper/piper_phonemize.wasm')).arrayBuffer();
  if (!dataPackage) dataPackage = await (await fetch(BASE + 'vendor/piper/piper_phonemize.data')).arrayBuffer();
  phon = await createPiperPhonemize({
    wasmBinary,
    getPreloadedPackage: () => dataPackage,
    locateFile: (f) => BASE + 'vendor/piper/' + f,
    print: (data) => { if (phonOut) { const r = phonOut; phonOut = null; r(data); } },
    printErr: () => {},
  });
  return phon;
}

async function phonemize(text, espeakVoice) {
  const mod = await getPhonemizer();
  const input = JSON.stringify([{ text }]);
  const out = await new Promise((resolve, reject) => {
    phonOut = resolve;
    try {
      mod.callMain(['-l', espeakVoice, '--input', input, '--espeak_data', '/espeak-ng-data']);
    } catch (e) {
      phonOut = null;
      // Some builds exit after main(); fall back to a fresh instance next time.
      phon = null;
      reject(e);
    }
    setTimeout(() => { if (phonOut === resolve) { phonOut = null; phon = null; reject(new Error('Phonemizer timeout')); } }, 15000);
  });
  return JSON.parse(out).phoneme_ids;
}

async function load(msg) {
  const { id, voice } = msg;
  if (loadedKey === voice.key && session) { post({ type: 'ready', id, key: voice.key, speakers: speakerList() }); return; }
  let modelBuf, cfg;
  if (voice.custom) {
    modelBuf = new Uint8Array(voice.model);
    cfg = voice.config;
  } else {
    const progress = (loaded, total) => post({ type: 'progress', id, loaded, total });
    cfg = JSON.parse(new TextDecoder().decode(await fetchWithCache(voice.configUrl)));
    modelBuf = await fetchWithCache(voice.modelUrl, progress);
  }
  if (session) { try { await session.release(); } catch (e) { /* ignore */ } }
  session = await ort.InferenceSession.create(modelBuf, { executionProviders: ['wasm'] });
  config = cfg; loadedKey = voice.key;
  await getPhonemizer();
  post({ type: 'ready', id, key: voice.key, speakers: speakerList() });
}

function speakerList() {
  const map = (config && config.speaker_id_map) || {};
  return Object.keys(map).map((name) => ({ name, id: map[name] }));
}

async function speak(msg) {
  const { id, text, speed, speaker } = msg;
  if (!session) throw new Error('No voice loaded');
  const ids = await phonemize(text, config.espeak.voice);
  const inf = config.inference || {};
  const lengthScale = (inf.length_scale || 1) / Math.max(0.25, speed || 1);
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, lengthScale, inf.noise_w ?? 0.8]), [3]),
  };
  if (config.num_speakers > 1 || Object.keys(config.speaker_id_map || {}).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speaker || 0)]), [1]);
  }
  const out = await session.run(feeds);
  const pcm = Float32Array.from(out[session.outputNames[0]].data);
  post({ type: 'audio', id, pcm, sampleRate: config.audio.sample_rate }, [pcm.buffer]);
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg);
    else if (msg.type === 'speak') await speak(msg);
  } catch (err) {
    post({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
