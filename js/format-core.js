// MEO Notes – text helpers for the Formatting tools. No page or storage access here.

export const BLOCK_WORDS = { short: 60, medium: 150, long: 350 };
export const CONTEXT_SIZE = 6144;
const CLOSERS = `["'”’)\\]*_~]*`;

export function blockWords(fmt) {
  const size = (fmt && fmt.size) || 'medium';
  if (size === 'custom') return Math.min(800, Math.max(10, Math.round(Number(fmt.words) || 150)));
  return BLOCK_WORDS[size] || BLOCK_WORDS.medium;
}
export const replyLimit = (words) => Math.ceil(words * 1.7) + 24;

/** Remove control markers so note text can't be read as formatting commands. */
export function clean(s) {
  return String(s || '').replace(/<\/?(?:start_of_turn|end_of_turn|bos|eos|pad)>/gi, '');
}

/** Keep the end of a long note. The start moves in fixed steps so repeat requests stay fast. */
export function windowText(text, maxChars, step = 2048) {
  if (text.length <= maxChars) return text;
  let start = Math.ceil((text.length - maxChars) / step) * step;
  const near = text.slice(start, start + 200).search(/\s/);
  if (near >= 0) start += near + 1;
  return text.slice(start);
}

/** The unfinished sentence at the end of the text, if there is one. */
export function openFragment(text) {
  if (!text || /\n\s*$/.test(text)) return '';
  if (new RegExp(`[.!?…]${CLOSERS}\\s*$`).test(text)) return '';
  const tail = text.slice(-300);
  const marks = [...tail.matchAll(new RegExp(`[.!?…]${CLOSERS}\\s+|\\n`, 'g'))];
  const last = marks[marks.length - 1];
  return (last ? tail.slice(last.index + last[0].length) : tail).trimEnd();
}

export function buildPrompt({ before, notes, words, maxChars }) {
  const text = windowText(clean(before), maxChars);
  const directions = clean(notes).trim().slice(0, 1500);
  let ask;
  if (text.trim()) {
    ask = `Continue the text below from exactly where it stops. Match its voice, tense, point of view, and style. Write about ${words} words of new text. Output only the new text. Do not repeat the existing text, and do not add titles, notes, or commentary.\n\n<text>\n${text}\n</text>`;
    if (directions) ask += `\n\nDirections for the new text:\n${directions}`;
  } else {
    ask = `Write about ${words} words of text following the directions below. Output only the text, with no title, notes, or commentary.\n\nDirections:\n${directions}`;
  }
  const prefill = openFragment(text);
  return { prompt: `<start_of_turn>user\n${ask}<end_of_turn>\n<start_of_turn>model\n${prefill}`, prefill };
}

/** End on a complete sentence when the length limit cut the reply short. */
export function cutToSentence(s) {
  const ends = [...s.matchAll(new RegExp(`[.!?…]${CLOSERS}(?=\\s|$)`, 'g'))];
  const last = ends[ends.length - 1];
  if (last && last.index + last[0].length >= s.length * 0.2) return s.slice(0, last.index + last[0].length);
  const sp = s.search(/\s\S*$/);
  return sp > 0 ? s.slice(0, sp) : s;
}

/** Turn raw output into the exact text to insert after `before`. */
export function finishReply(before, raw, prefill, reason) {
  let r = clean(raw).replace(/<\/?text>/gi, '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trimEnd();
  if (reason === 'length') r = cutToSentence(r).trimEnd();
  const endsSpace = /\s$/.test(before);
  if (prefill) return endsSpace ? r.trimStart() : r;
  r = r.trimStart();
  const b = before.trimEnd();
  for (let k = Math.min(200, b.length, r.length); k >= 20; k--) {
    if (r.startsWith(b.slice(-k))) { r = r.slice(k).trimStart(); break; }
  }
  if (!r) return '';
  return before && !endsSpace ? ' ' + r : r;
}

/** Find where a reply belongs, even if the note was edited while it was being written. */
export function locate(text, pos, tail) {
  if (!tail) return pos === 0 ? 0 : text.length;
  if (pos <= text.length && text.slice(Math.max(0, pos - tail.length), pos) === tail) return pos;
  const i = text.lastIndexOf(tail);
  return i >= 0 ? i + tail.length : text.length;
}

/** Remove an inserted block. Returns the new text, or null if the block was changed. */
export function removeBlock(text, pos, block) {
  if (text.startsWith(block, pos)) return text.slice(0, pos) + text.slice(pos + block.length);
  const i = text.lastIndexOf(block);
  return i >= 0 ? text.slice(0, i) + text.slice(i + block.length) : null;
}

export function unscramble(s) {
  const b = atob(s); let out = '';
  for (let i = 0; i < b.length; i++) out += String.fromCharCode(b.charCodeAt(i) ^ ((0x5a + i * 7) & 255));
  return out;
}
