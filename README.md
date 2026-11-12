# MEO Notes

Private notes for Windows and Android. On screen your text shows as dots; on headphones it's read aloud by a voice that runs on your own device.

## What's private, and how

- **Everything is encrypted on the device.** Notes, note names, metadata and settings are encrypted with AES-256 using a key that only your login passphrase can unlock. Nothing is ever uploaded. The website only delivers the app itself.
- **The voices run on your device.** Piper and Kokoro voices are downloaded once from Hugging Face. After that, your text is turned into speech locally and works offline. The only exception is the **Device voices** engine: voices labelled "online" send your text to Microsoft or Google to be spoken, so avoid those for private notes.
- **Login every time.** Closing the app, locking it, or going a while without activity wipes everything from memory. The timeout is 15 minutes unless you change it in **Security**. Listening to a note counts as activity, so it won't lock while it's reading to you.
- **Quick lock.** Double-tap the top bar (phone) or press **Esc twice** (PC).
- **Privacy cover.** When you switch away from the app, the screen is covered and Show All Text / Show All Names turn off. You can also choose to lock completely whenever you switch away. Android takes its recent-apps preview at its own moment, and a web app can't fully block screenshots the way some banking apps do, so treat the cover as strong protection rather than a guarantee.
- **Reveal passphrase.** You need a second, different passphrase to show text or names without the dots. Show All Text turns itself off when you close the note, lock, or time out.
- **Backups stay encrypted.** A backup file can only be opened with the login passphrase you had when you made it.

> ⚠️ There is no "forgot passphrase" option. If you lose the login passphrase, nobody can open your notes, including you. Keep a backup and remember your passphrase.

## Put it online (one time, free, about 10 minutes)

The app has to be served from an `https://` web address before Windows and Android can install it. GitHub Pages does this for free:

1. Create a free account at **github.com**.
2. Click **+ → New repository**. Name it `meo-notes`, choose **Public** (the app's code is public, but your notes never leave your devices), and click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Unzip `meo-notes.zip` on your PC, then drag **everything inside the `meo-notes` folder** (the files and the `fonts`, `icons`, `js`, `vendor` and `workers` folders) into the upload box. Click **Commit changes**. (Every file is under 9 MB, well within GitHub's 25 MB limit for browser uploads. If the upload page seems stuck, upload the `vendor` folder on its own first, then everything else.)
4. Go to **Settings → Pages**. Under "Branch", choose **main** and **/ (root)**, then click **Save**.
5. After a minute or two the page shows your address, such as `https://YOURNAME.github.io/meo-notes/`.

## Install it

**Windows (Edge or Chrome):** Open your address. In the address bar, click the **Install** icon (a monitor with a down arrow), or use **⋯ → Apps → Install MEO Notes**. It then opens in its own window from the Start menu.

**Android (Chrome):** Open your address. Tap **⋮ → Add to Home screen → Install**.

Set it up on one device first. To bring your second device in, use **Set up from sync** (see below) or **Restore from a backup file** on its setup screen. Either way, both devices end up using the same passphrases.

## Turn on sync (optional, about 5 minutes)

Sync keeps your PC and phone up to date with each other automatically. It works through a **private** GitHub repository. Everything is encrypted on your device before upload, so GitHub only ever stores scrambled data.

1. **Make a private repository.** On github.com click **+ → New repository**. Name it something like `meo-notes-data` and choose **Private**. Tick **Add a README file**, then click **Create repository**.
2. **Make an access token** (it works like a password for this one repository):
   1. Click your profile picture, then **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   2. Name it "MEO Notes" and pick an expiration date. A year is fine.
   3. Under **Repository access**, choose **Only select repositories** and pick `meo-notes-data`.
   4. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
   5. Click **Generate token** and copy it. GitHub shows it only once.
3. **On your first device:** open **Sync**, enter your GitHub username, the repository name, and the token, then press **Turn on sync**.
4. **On your other device:**
   - **If it's new:** on the setup screen, choose **Set up from sync (GitHub)**, enter the same three things, then your login passphrase.
   - **If you already started a notebook there:** turn on sync the same way as step 3. It will offer to **join** the synced notebook. Your notes on that device are added to it, and that device switches to the synced notebook's passphrases.

How sync behaves:
- **When it syncs:** about 20 seconds after you stop typing, when you open, switch away from, or lock the app, every few minutes while it's open, and whenever you press **Sync now**.
- **Same note edited on both devices before syncing:** nothing is lost. You'll get both versions, and one is labelled "(other device)".
- **Deleting and passphrases:** deleting a note deletes it everywhere, and changing a passphrase on one device carries over to the other.
- **Expired token:** the top bar shows "Sync problem". Make a new token and use **Sync → Replace access token**.
- **What GitHub can see:** how big your encrypted notebook is and when you synced. It keeps the history of the encrypted file too. Nobody can read any of it without your login passphrase, but if you want old versions gone, delete the `meo-notes-data` repository and turn sync on again with a new one.

## Using it

- **Read buttons**
  - **Read Last Sentence**: the sentence you're in, or the one you just finished.
  - **Read from Newline**: the line (paragraph) the cursor is on.
  - **Read All**: the whole note.
  - **Read from Cursor**: from the cursor to the end.
  - **Read Last Word**: the word just before the cursor.
  - **Read Selection**: whatever text you've selected.
  - **Stop**: stops reading.
  - **PC keyboard shortcuts:** Alt+1 Last Sentence, Alt+2 Newline, Alt+3 All, Alt+4 Cursor, Alt+5 Last Word, Alt+6 Selection. Esc stops reading; Esc twice locks.
- **Auto Read**
  - **Every Word**: reads each word when you type the space or punctuation after it.
  - **Every Sentence**: reads each sentence after its `.` `!` or `?`, or when you press Enter.
  - **Every Newline**: reads each line when you press Enter.
- **Voices**
  - **Piper** (default) is quick, even on phones. It has over 100 voices in many languages. Some voices, like *LibriTTS-R* and *VCTK*, contain many different speakers (over 100) you can pick from.
  - **Kokoro** sounds the most natural, but it's a larger download and slower on phones.
  - The first time you use a voice, it downloads once. Downloaded voices show ✓.
- **Custom voices:** In **Voice Settings → Add custom voice**, select a Piper voice's `.onnx` file and its `.onnx.json` file together. You can use any voice from the Piper voices collection, or one you've trained yourself.
- **Moving notes without sync:** Use **Download backup** on one device. On the other, use **Restore from backup… → Merge**. For notes that exist on both devices, the most recently changed version wins.
- **Note Info:** You can edit or delete any note's created date, modified date or size. If you delete one, the app stops saving it for that note. **Add** puts it back.

## Privacy tips

- **Android keyboard suggestions** show the words you type above the keyboard. In Gboard, turn on **incognito** (Settings → Privacy) or turn off **Show suggestion strip** while you use MEO Notes.
- Use headphones. Audio plays through whatever output your device is set to.
- If someone has seen you type your passphrase, change it under **Security**.

## Updating the app

Upload the new files to the same GitHub repository and replace the old ones. The installed app picks up the update the next time you open it while online.

## Credits

MEO Notes uses the Piper voices (rhasspy, MIT), the Kokoro-82M voice model (Apache-2.0) through kokoro-js and Transformers.js, ONNX Runtime Web (MIT), the piper-phonemize/espeak-ng WebAssembly build from Diffusion Studio, and the JetBrains Mono font (OFL, see `fonts/OFL.txt`).
