// MEO Notes – TEMPORARY "Import text files" feature (for testing).
// Self-contained: to remove it, delete this file and the
// <script src="js/import-text.js"> line in index.html. Nothing else depends on it.
// Each chosen .txt file becomes a new note named after the file. It works by driving
// the normal "+ New note" button and editor, so encryption, metadata, saving and sync
// all happen exactly as if you had typed the note yourself.

const newBtn = document.querySelector('#new-note-btn');
const label = document.createElement('label');
label.className = 'button icon-btn';
label.title = 'Import text files';
label.setAttribute('aria-label', 'Import text files');
label.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const input = document.createElement('input');
input.type = 'file';
input.accept = '.txt,text/plain';
input.multiple = true;
input.hidden = true;
label.appendChild(input);
const row = document.createElement('div');
row.className = 'btn-row';
row.appendChild(label);
document.querySelector('#note-settings .menu-body').prepend(row);

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
