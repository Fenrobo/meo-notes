// MEO Notes – text helpers for the voice lookahead. No page or storage access here.

export const BLOCK_WORDS = { short: 60, medium: 150, long: 350 };
export const CONTEXT_SIZE = 6144;
const CLOSERS = `["'”’)\\]*_~]*`;

export function blockWords(fmt) {
  const size = (fmt && fmt.size) || 'medium';
  if (size === 'custom') return Math.min(800, Math.max(10, Math.round(Number(fmt.words) || 150)));
  return BLOCK_WORDS[size] || BLOCK_WORDS.medium;
}
export const replyLimit = (words) => Math.ceil(words * 1.7) + 24;

/** Remove control markers so note text can't be read as commands. */
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

/* ----- cues: a line that starts with a name and a colon, e.g. "Mara:" ----- */
const NAME = String.raw`[A-Z][\p{L}\p{N}'’.\-]*(?:[ \t]+[A-Z][\p{L}\p{N}'’.\-]*){0,2}`;
const CUE = new RegExp(String.raw`^[ \t]*(${NAME})[ \t]*:(?!//)[ \t]*`, 'u');
const NOT_NAMES = new Set(['note', 'notes', 'todo', 'ps', 'p.s.', 'edit', 'update', 're', 'fyi', 'nb', 'n.b.', 'warning', 'important', 'tip', 'question', 'answer', 'chapter', 'part', 'scene', 'date', 'time', 'location', 'setting', 'summary', 'http', 'https']);
export function cueName(line) {
  const m = CUE.exec(line || '');
  return m && !NOT_NAMES.has(m[1].toLowerCase()) ? m[1] : null;
}
const isNarrator = (n) => !!n && /^narrator$/i.test(n);
const BRACKETS = /\[[^\[\]]*\]/g;

/**
 * Work out what to write from the text before the cursor.
 * A [bracketed direction] right before the cursor is removed and replaced by the reply.
 * The reply is written as the last character cued ("Name:"), or as the narrator.
 */
export function prepare(before) {
  let ctx = before, direction = '', remove = '';
  const m = /\[([^\[\]]*)\][ \t]*$/.exec(before);
  if (m) { ctx = before.slice(0, m.index); direction = m[1].replace(/\s+/g, ' ').trim(); remove = '[' + m[1] + ']'; }
  const lines = ctx.split('\n'), cur = lines[lines.length - 1];
  let speaker = null;
  for (let i = lines.length - 1; i >= 0; i--) { const c = cueName(lines[i]); if (c) { speaker = c; break; } }
  if (isNarrator(speaker)) speaker = null;
  const onCueLine = !!cueName(cur);
  const prefix = speaker && !onCueLine && !cur.trim() ? speaker + ': ' : '';
  return { pos: ctx.length, tail: ctx.slice(-160), remove, direction, speaker, prefix, ctx };
}

export function buildPrompt({ ctx, prefix = '', direction = '', speaker = null, words, maxChars }) {
  const text = windowText(clean(ctx.replace(BRACKETS, '')), maxChars) + prefix;
  const directions = clean(direction).slice(0, 1500);
  const scripted = speaker || /^[ \t]*[A-Z][^\n:]{0,40}:/m.test(text);
  let ask;
  if (text.trim()) {
    ask = speaker
      ? `The text below is a story. A line that begins with a name and a colon belongs to that character. Continue the story from exactly where it stops, writing only as ${speaker}: what ${speaker} says and does next, true to ${speaker}'s voice and personality. Never write words, actions, or lines for any other character, and never start a new line with a name and a colon. Write about ${words} words. Output only ${speaker}'s new text, without the name label, titles, notes, or commentary.`
      : `Continue the text below from exactly where it stops, as the narrator. Match its voice, tense, point of view, and style. Write about ${words} words of new text.${scripted ? ' Do not start any line with a character\'s name and a colon.' : ''} Output only the new text. Do not repeat the existing text, and do not add titles, notes, or commentary.`;
    ask += `\n\n<text>\n${text}\n</text>`;
    if (directions) ask += `\n\nDirections for the new text:\n${directions}`;
  } else {
    ask = `Write about ${words} words of text following the directions below. Output only the text, with no title, notes, or commentary.\n\nDirections:\n${directions}`;
  }
  let prefill = openFragment(text);
  const cue = CUE.exec(prefill);
  if (cue && cueName(prefill)) prefill = prefill.slice(cue[0].length);
  return { prompt: `<start_of_turn>user\n${ask}<end_of_turn>\n<start_of_turn>model\n${prefill}`, prefill };
}

/** Where a reply should stop: the start of another character's line. Returns -1 if none. */
export function cueCut(raw, speaker = null) {
  const re = new RegExp(String.raw`\n[ \t]*(${NAME})[ \t]*:`, 'gu');
  const self = speaker && speaker.toLowerCase();
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (NOT_NAMES.has(name) || name === self) continue; // the same character carrying on is fine
    if (!raw.slice(0, m.index).trim()) continue; // a label right at the start is removed later, not a reason to stop
    return m.index;
  }
  return -1;
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
export function finishReply(before, raw, prefill, reason, speaker = null) {
  let r = clean(raw).replace(BRACKETS, '').replace(/<\/?text>/gi, '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trimEnd();
  if (reason === 'length') r = cutToSentence(r).trimEnd();
  if (speaker) r = r.replace(new RegExp('^\\s*' + speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:[ \\t]*'), '');
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
