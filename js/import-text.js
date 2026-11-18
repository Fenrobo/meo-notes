// MEO Notes – TEMPORARY "Import text files" feature (for testing).
// Self-contained: to remove it, delete this file and the
// <script src="js/import-text.js"> line in index.html. Nothing else depends on it.
// Each chosen .txt file becomes a new note named after the file. It works by driving
// the normal "+ New note" button and editor, so encryption, metadata, saving and sync
// all happen exactly as if you had typed the note yourself.

const newBtn = document.querySelector('#new-note-btn');
const label = document.createElement('label');
label.className = 'button wide';
label.textContent = 'Import text file(s)…';
const input = document.createElement('input');
input.type = 'file';
input.accept = '.txt,text/plain';
input.multiple = true;
input.hidden = true;
label.appendChild(input);
newBtn.after(label);

function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } // UTF-8 (BOM is dropped)
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }     // older Windows "ANSI" files
}

function setField(sel, value) {
  const el = document.querySelector(sel);
  el.value = value;
  // insertFromPaste so Auto Read doesn't start reading the imported text aloud
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
}

input.addEventListener('change', async () => {
  const files = [...input.files];
  input.value = '';
  let count = 0;
  for (const f of files) {
    const text = decode(await f.arrayBuffer()).replace(/\r\n?/g, '\n');
    newBtn.click(); // opens a fresh, empty note
    const name = f.name.replace(/\.txt$/i, '').replace(/[\r\n]+/g, ' ').trim();
    if (name) setField('#name-input', name);
    setField('#note-text', text);
    count++;
  }
  if (count) {
    document.querySelector('#name-input').blur();
    document.querySelector('#voice-status').textContent =
      `Imported ${count} file${count === 1 ? '' : 's'}${count > 1 ? ' (this is the last one)' : ''}.`;
  }
});
