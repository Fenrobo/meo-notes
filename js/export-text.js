// MEO Notes – TEMPORARY "Export as text" feature (for testing).
// Self-contained: to remove it, delete this file and the
// <script src="js/export-text.js"> line in index.html. Nothing else depends on it.
// It reads the open note straight from the editor, so it needs no changes to app.js.

const row = document.querySelector('#duplicate-note-btn').parentElement;
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'ghost small';
btn.textContent = 'Export as text file';
row.insertBefore(btn, document.querySelector('#delete-note-btn'));

btn.addEventListener('click', () => {
  const text = document.querySelector('#note-text').value;
  const name = document.querySelector('#name-input').value.trim() || 'note';
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 100) || 'note';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
});
