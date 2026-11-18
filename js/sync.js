// MEO Notes – encrypted sync through a private GitHub repository.
// Only already-encrypted data is uploaded. GitHub never sees passphrases or keys.
import { toB64, fromB64 } from './crypto.js';

const API = 'https://api.github.com';
const enc = new TextEncoder();
const dec = new TextDecoder();

export class SyncConflict extends Error { constructor() { super('SYNC_CONFLICT'); } }

export class GitHubStore {
  constructor({ owner, repo, token, path }) {
    this.owner = owner.trim(); this.repo = repo.trim(); this.token = token.trim();
    this.path = path || 'meonotes-sync.json';
  }
  headers(extra = {}) {
    return { Authorization: 'Bearer ' + this.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  }
  get repoUrl() { return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }
  get fileUrl() { return `${this.repoUrl}/contents/${encodeURIComponent(this.path)}`; }

  async fail(res) {
    if (res.status === 401) throw new Error('GitHub didn’t accept the access token. It may be mistyped or expired.');
    if (res.status === 403) throw new Error('The access token isn’t allowed to change this repository. Give it “Contents: Read and write”.');
    if (res.status === 404) throw new Error('Repository not found. Check the username and repository name, and that the token has access to it.');
    let msg = ''; try { msg = (await res.json()).message || ''; } catch (e) { /* ignore */ }
    throw new Error('GitHub error ' + res.status + (msg ? ': ' + msg : ''));
  }

  /** Returns { sha, data } – data is null when nothing has been synced yet. */
  async read() {
    let res;
    try { res = await fetch(this.fileUrl, { headers: this.headers(), cache: 'no-store' }); } catch (e) { throw new Error('Can’t reach GitHub. Check your internet connection.'); }
    if (res.status === 404) {
      const repo = await fetch(this.repoUrl, { headers: this.headers(), cache: 'no-store' });
      if (!repo.ok) await this.fail(repo);
      return { sha: null, data: null };
    }
    if (!res.ok) await this.fail(res);
    const j = await res.json();
    let text;
    if (j.content && j.encoding === 'base64') text = dec.decode(fromB64(j.content.replace(/\s/g, '')));
    else { // files over 1 MB come back without content
      const raw = await fetch(this.fileUrl, { headers: this.headers({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
      if (!raw.ok) await this.fail(raw);
      text = await raw.text();
    }
    return { sha: j.sha, data: JSON.parse(text) };
  }

  /** Write the sync file. Throws SyncConflict if someone else wrote it first. */
  async write(data, sha) {
    const body = { message: 'MEO Notes sync', content: toB64(enc.encode(JSON.stringify(data))) };
    if (sha) body.sha = sha;
    let res;
    try { res = await fetch(this.fileUrl, { method: 'PUT', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store' }); } catch (e) { throw new Error('Can’t reach GitHub. Check your internet connection.'); }
    if (res.status === 409 || res.status === 422) throw new SyncConflict();
    if (!res.ok) await this.fail(res);
    return (await res.json()).content.sha;
  }
}

/**
 * Merge two copies of the notebook.
 * local/remote: Map(id -> note); base: { id: rev } as of this device's last sync;
 * tombLocal/tombRemote: { id: deletedAt }.
 * Rules: unchanged-on-one-side → take the other side; changed on both sides → keep
 * this device's version and save the other as a separate copy; deleted → stays
 * deleted unless edited after the deletion.
 */
export function mergeNotebooks({ local, remote, base, tombLocal, tombRemote, makeCopy }) {
  const tomb = { ...tombRemote };
  for (const [k, v] of Object.entries(tombLocal)) tomb[k] = Math.max(tomb[k] || 0, v);
  const out = new Map();
  const copies = [];
  for (const id of new Set([...local.keys(), ...remote.keys()])) {
    const L = local.get(id); const R = remote.get(id);
    let w;
    if (L && R) {
      if (L.rev === R.rev) w = L;
      else if (!(id in base)) w = (R.rev > L.rev) ? R : L;          // never synced here: newer wins
      else if (base[id] === L.rev) w = R;                             // only the other device changed it
      else if (base[id] === R.rev) w = L;                             // only this device changed it
      else { w = L; copies.push(makeCopy(R)); }                       // changed on both: keep both
    } else w = L || R;
    if (tomb[id] && tomb[id] >= (w.rev || 0)) continue;
    out.set(id, w);
  }
  for (const c of copies) out.set(c.id, c);
  const sameAs = (m) => m.size === out.size && [...out].every(([id, n]) => m.has(id) && m.get(id).rev === n.rev);
  const tombSame = (t) => Object.keys(t).length === Object.keys(tomb).length && Object.entries(tomb).every(([k, v]) => t[k] === v);
  return {
    notes: out, tomb, copies: copies.length,
    remoteChanged: !sameAs(remote) || !tombSame(tombRemote),
    localChanged: !sameAs(local),
  };
}
