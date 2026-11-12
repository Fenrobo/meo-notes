// MEO Notes – pure text helpers: masking and "what to read" ranges.

export const DOT = '•';
const END = new Set(['.', '!', '?', '…']);
const WORD_RE = /[\p{L}\p{N}\p{M}]/u;
const isWord = (ch) => !!ch && WORD_RE.test(ch);
const isApos = (ch) => ch === "'" || ch === '’';
const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === ' ';
export const isEnd = (ch) => END.has(ch);

/**
 * Obfuscate text. opts: { spaces, endPunct, firstLetters, all }.
 * One output character per input character so a monospace overlay lines up
 * exactly with the real (invisible) text underneath. Line breaks are kept.
 */
export function maskText(text, opts = {}) {
  if (opts.all) return text;
  let out = '';
  let inWord = false;
  for (const ch of text) {
    if (ch === '\n') { out += '\n'; inWord = false; continue; }
    if (isSpace(ch)) { out += opts.spaces ? ch : DOT; inWord = false; continue; }
    if (isWord(ch)) { out += opts.firstLetters && !inWord ? ch : DOT; inWord = true; continue; }
    if (isApos(ch) && inWord) { out += DOT; continue; } // don't -> one word
    inWord = false;
    out += opts.endPunct && END.has(ch) ? ch : DOT;
  }
  return out;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const hasSpeakable = (s) => /[\p{L}\p{N}]/u.test(s);

/** The word just before the cursor. */
export function lastWord(text, pos) {
  let e = pos;
  while (e > 0 && !isWord(text[e - 1])) e--;
  let s = e;
  while (s > 0 && (isWord(text[s - 1]) || (isApos(text[s - 1]) && isWord(text[s - 2])))) s--;
  return clean(text.slice(s, e));
}

function sentenceStart(text, i) {
  // i = index just after the previous content; walk back to the char after a sentence end or newline.
  let s = i;
  while (s > 0) {
    const c = text[s - 1];
    if (c === '\n') break;
    if (END.has(c) && (s >= text.length || !isWord(text[s]))) break;
    s--;
  }
  return s;
}

/** The sentence at/just before the cursor (whole sentence if the cursor is inside one). */
export function lastSentence(text, pos) {
  let e = pos;
  while (e > 0 && isSpace(text[e - 1])) e--;
  if (e > 0 && text[e - 1] === '\n') { // cursor on a fresh line: use the line above
    e--;
    while (e > 0 && (isSpace(text[e - 1]) || text[e - 1] === '\n')) e--;
  }
  let core = e;
  while (core > 0 && END.has(text[core - 1])) core--;
  if (core === e) {
    // Mid-sentence: extend forward to the sentence end or line end.
    while (e < text.length && text[e] !== '\n' && !(END.has(text[e]) && !isWord(text[e + 1]))) e++;
    while (e < text.length && END.has(text[e])) e++;
  }
  const s = sentenceStart(text, core);
  const out = clean(text.slice(s, e));
  return hasSpeakable(out) ? out : '';
}

/** The whole line (paragraph) the cursor is on; if it's empty, the line above. */
export function currentLine(text, pos) {
  let s = text.lastIndexOf('\n', pos - 1) + 1;
  let e = text.indexOf('\n', pos); if (e < 0) e = text.length;
  let out = clean(text.slice(s, e));
  if (!hasSpeakable(out) && s > 0) {
    const pe = s - 1;
    const ps = text.lastIndexOf('\n', pe - 1) + 1;
    out = clean(text.slice(ps, pe));
  }
  return hasSpeakable(out) ? out : '';
}

export const fromCursor = (text, pos) => { const t = text.slice(pos).trim(); return hasSpeakable(t) ? t : ''; };
export const allText = (text) => (hasSpeakable(text) ? text.trim() : '');

/** Split long text into speakable chunks (sentences, max ~240 chars) for streaming playback. */
export function chunkText(text, max = 240) {
  const parts = [];
  for (const para of text.split(/\n+/)) {
    const sentences = para.split(/(?<=[.!?…]["')\]]*)\s+/);
    for (let s of sentences) {
      s = s.trim();
      if (!s) continue;
      while (s.length > max) {
        let cut = s.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        parts.push(s.slice(0, cut).trim());
        s = s.slice(cut).trim();
      }
      if (hasSpeakable(s)) parts.push(s);
    }
  }
  return parts;
}

/**
 * Decide what Auto Read should speak after an edit. Returns
 * { speak: string } | { pendingSentence: index } | null.
 */
export function autoReadAfterInput(mode, text, pos, grew) {
  if (mode === 'off' || !grew || pos <= 0) return null;
  const ch = text[pos - 1];
  const prev = text[pos - 2];
  if (mode === 'word') {
    if (!isWord(ch) && !isApos(ch) && isWord(prev)) {
      const w = lastWord(text, pos - 1);
      return w ? { speak: w } : null;
    }
    return null;
  }
  if (mode === 'sentence') {
    if ((isSpace(ch) || ch === '\n') && END.has(prev)) return { speak: lastSentence(text, pos - 1) };
    if (ch === '\n' && prev && prev !== '\n') return { speak: lastSentence(text, pos - 1) };
    if (END.has(ch)) return { pendingSentence: pos };
    return null;
  }
  if (mode === 'newline') {
    if (ch === '\n') return { speak: currentLine(text, pos - 1) };
    return null;
  }
  return null;
}

export function utf8Size(text) { return new TextEncoder().encode(text).length; }
