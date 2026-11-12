// MEO Notes – encryption helpers (Web Crypto only, nothing leaves the device).
// Design: a random 256-bit data key encrypts every note and setting with AES-GCM.
// The data key is itself encrypted ("wrapped") with a key derived from the login
// passphrase (PBKDF2-SHA256, 600k iterations). The reveal passphrase verifier is
// stored inside the encrypted area, so it can't be attacked without the login one.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const KDF_ITERATIONS = 600000;

export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function pbkdf2Bits(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
}

async function aesKey(raw, extractable = false) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', extractable, ['encrypt', 'decrypt']);
}

async function encryptBytes(key, bytes) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv: toB64(iv), ct: toB64(ct) };
}
async function decryptBytes(key, rec) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct)));
}

export async function encryptJSON(key, obj) { return encryptBytes(key, enc.encode(JSON.stringify(obj))); }
export async function decryptJSON(key, rec) { return JSON.parse(dec.decode(await decryptBytes(key, rec))); }

async function makeRevealRecord(dataKey, revealPass) {
  const salt = rand(16);
  const hash = await pbkdf2Bits(revealPass, salt, KDF_ITERATIONS);
  return encryptJSON(dataKey, { salt: toB64(salt), hash: toB64(hash), iter: KDF_ITERATIONS });
}

async function wrapDataKey(rawDataKey, loginPass) {
  const salt = rand(16);
  const kek = await aesKey(await pbkdf2Bits(loginPass, salt, KDF_ITERATIONS));
  return { kdf: { name: 'PBKDF2-SHA256', salt: toB64(salt), iter: KDF_ITERATIONS }, wrappedKey: await encryptBytes(kek, rawDataKey) };
}

/** Create a brand-new vault. Returns { vault, key } where vault is safe to store. */
export async function createVault(loginPass, revealPass) {
  const raw = rand(32);
  const key = await aesKey(raw);
  const wrapped = await wrapDataKey(raw, loginPass);
  const vault = { v: 1, ...wrapped, reveal: await makeRevealRecord(key, revealPass) };
  raw.fill(0);
  return { vault, key };
}

/** Unlock a vault with the login passphrase. Throws on a wrong passphrase. */
export async function unlockVault(vault, loginPass) {
  const kek = await aesKey(await pbkdf2Bits(loginPass, fromB64(vault.kdf.salt), vault.kdf.iter));
  let raw;
  try { raw = await decryptBytes(kek, vault.wrappedKey); } catch (e) { throw new Error('WRONG_PASSPHRASE'); }
  const key = await aesKey(raw);
  raw.fill(0);
  return key;
}

export async function checkReveal(vault, key, revealPass) {
  const r = await decryptJSON(key, vault.reveal);
  const got = await pbkdf2Bits(revealPass, fromB64(r.salt), r.iter);
  const want = fromB64(r.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Re-wrap the data key under a new login passphrase (needs the current one). */
export async function changeLoginPassphrase(vault, currentPass, newPass) {
  const kek = await aesKey(await pbkdf2Bits(currentPass, fromB64(vault.kdf.salt), vault.kdf.iter));
  let raw;
  try { raw = await decryptBytes(kek, vault.wrappedKey); } catch (e) { throw new Error('WRONG_PASSPHRASE'); }
  const wrapped = await wrapDataKey(raw, newPass);
  raw.fill(0);
  return { ...vault, ...wrapped };
}

export async function changeRevealPassphrase(vault, key, newRevealPass) {
  return { ...vault, reveal: await makeRevealRecord(key, newRevealPass) };
}
