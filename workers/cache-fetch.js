/* MEO Notes – downloads and checks the extended voice cache in the background.
 * The download resumes where it stopped, and the finished file is verified before use. */
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function Hasher() {
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w = new Uint32Array(64), block = new Uint8Array(64); let fill = 0, total = 0;
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  function run(d, p) {
    for (let i = 0; i < 16; i++, p += 4) w[i] = (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, e0, e, f, g, i0] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (i0 + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      i0 = g; g = f; f = e; e = (e0 + t1) | 0; e0 = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += e0; h[4] += e; h[5] += f; h[6] += g; h[7] += i0;
  }
  return {
    update(d) {
      let p = 0; total += d.length;
      if (fill) { const n = Math.min(64 - fill, d.length); block.set(d.subarray(0, n), fill); fill += n; p = n; if (fill === 64) { run(block, 0); fill = 0; } }
      for (; p + 64 <= d.length; p += 64) run(d, p);
      if (p < d.length) { block.set(d.subarray(p), 0); fill = d.length - p; }
    },
    hex() {
      const bits = total * 8, tail = new Uint8Array(((fill < 56 ? 56 : 120) - fill) + 8); tail[0] = 0x80;
      const v = new DataView(tail.buffer); v.setUint32(tail.length - 8, Math.floor(bits / 2 ** 32)); v.setUint32(tail.length - 4, bits >>> 0);
      this.update(tail);
      return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
    },
  };
}
const post = (m) => self.postMessage(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(handle, url, size) {
  let got = handle.getSize(), tries = 0, lastPost = 0, sinceFlush = 0;
  if (got > size) { handle.truncate(0); got = 0; }
  while (got < size) {
    try {
      const ctl = new AbortController(); let stall = setTimeout(() => ctl.abort(), 60000);
      const res = await fetch(url, { headers: got ? { Range: `bytes=${got}-` } : {}, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (got && res.status !== 206) { handle.truncate(0); got = 0; }
      const reader = res.body.getReader();
      for (;;) {
        clearTimeout(stall); stall = setTimeout(() => ctl.abort(), 60000);
        const { done, value } = await reader.read();
        if (done) break;
        if (handle.write(value, { at: got }) !== value.length) { const x = new Error('space'); x.name = 'QuotaExceededError'; throw x; }
        got += value.length; sinceFlush += value.length; tries = 0;
        if (sinceFlush > 32e6) { handle.flush(); sinceFlush = 0; }
        const now = Date.now();
        if (now - lastPost > 500) { lastPost = now; post({ type: 'progress', phase: 'download', got, size }); }
      }
      clearTimeout(stall); handle.flush();
      if (got < size) throw new Error('Connection closed early');
    } catch (e) {
      handle.flush();
      if (e.name === 'QuotaExceededError') throw e;
      if (++tries > 8) throw new Error('offline');
      post({ type: 'progress', phase: 'retry', got, size });
      await wait(Math.min(30000, 3000 * tries));
    }
  }
}

function verify(handle, size) {
  const hasher = Hasher(), buf = new Uint8Array(8 << 20);
  let at = 0, lastPost = 0;
  while (at < size) {
    const n = handle.read(buf, { at });
    if (!n) break;
    hasher.update(buf.subarray(0, n)); at += n;
    const now = Date.now();
    if (now - lastPost > 500) { lastPost = now; post({ type: 'progress', phase: 'verify', got: at, size }); }
  }
  return hasher.hex();
}

self.onmessage = async (e) => {
  const { url, size, sha } = e.data;
  let handle = null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('fmt', { create: true });
    const file = await dir.getFileHandle('pack.bin', { create: true });
    handle = await file.createSyncAccessHandle();
    await download(handle, url, size);
    post({ type: 'progress', phase: 'verify', got: 0, size });
    const ok = verify(handle, size) === sha;
    if (!ok) handle.truncate(0);
    handle.flush(); handle.close(); handle = null;
    if (!ok) { post({ type: 'error', code: 'damaged' }); return; }
    const mark = await (await dir.getFileHandle('pack.ok', { create: true })).createSyncAccessHandle();
    mark.truncate(0); mark.write(new TextEncoder().encode(sha), { at: 0 }); mark.flush(); mark.close();
    post({ type: 'done' });
  } catch (x) {
    try { if (handle) { handle.flush(); handle.close(); } } catch (y) { /* already closed */ }
    post({ type: 'error', code: x && x.name === 'QuotaExceededError' ? 'space' : (x.message === 'offline' ? 'offline' : 'failed') });
  }
};
