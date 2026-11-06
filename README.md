Dub siren
==========


Slightly patched version of https://siren.zongosound.com dub siren.



src/ folder can be used as-is via webbrowser

src-tauri contains support files to build the project as "native" tauri application.



Usage
=====

Point your browser to src/ folder and open the index.html - it should "just work"

If you want to build the application, you need Rust 1.90 or newer, Cargo,
and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
This project uses Tauri 2. From the repository root, run:

```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri build
```

For development, run `cargo tauri dev`. Tauri serves the static files in `src/`
directly; no Node.js or frontend build step is required.

MIDI control
============

Open **MIDI Settings**, click **Enable MIDI**, and select your LPD8 (or another
MIDI input). Each launch needs this click to activate audio and request MIDI
permission. In a browser, serve `src/` on localhost or HTTPS and use a browser
with Web MIDI support, such as Chrome or Edge. Safari does not provide native
Web MIDI. The Tauri desktop app uses native MIDI instead, including on macOS.
Linux native builds additionally need the ALSA development libraries.

Click **Learn** beside a slider and turn a knob, or beside an action and press
a pad. **Clear** removes a mapping; **Cancel Learn** exits learning. A physical
control can have one assignment; teaching it elsewhere moves that assignment.
All seven sliders support absolute 7-bit CC knobs with immediate takeover.
Mapping, monitoring, and learning work without making sound on the settings
screen; return **Back to Siren** to perform.

Pads can send notes or CC. Use momentary mode: Play sounds while held, and
release must send Note Off, zero-velocity Note On, or CC zero. Reset immediately
silences sound and echoes without reloading. Tap Tempo triggers once per press.
Relative encoders, MIDI clock, SysEx, waveform selection, patch selection, and
tempo-sync toggle mappings are not included.

Mappings are global across sound patches and saved separately per input device.
The selected device and bindings save automatically:

- Browser: `localStorage`, key `dubsiren:midi:v1`, for the same browser profile
  and origin. Clearing site data removes settings. Changing host or port uses
  separate settings.
- Desktop: `midi-settings.json` in Tauri's application configuration directory.
  This is a readable, pretty-printed JSON document containing MIDI mappings,
  global volume, the selected patch, and the four active sound profiles.
  On macOS this is `~/Library/Application Support/com.italtone.dubsiren/`.
  Settings survive application restarts and rebuilding/replacing the app.

Saving failures show **Retry Save**; invalid stored settings are preserved
until you explicitly reset saved settings. Unplugging retains mappings;
reconnection uses device identity or a unique name match. Identical ambiguous
names require manual selection. Device changes, settings navigation, focus loss,
and Reset silence playback; release held pads before playing again.

Verification
------------

```bash
node --test tests/midi.test.cjs
cargo test --manifest-path src-tauri/Cargo.toml
cargo tauri build --bundles app # macOS app bundle
```

`tests/midi.browser.js` and `tests/midi-failures.browser.js` contain Playwright Page functions using a simulated
LPD8 for learning, routing, reload persistence, reassignment, and disconnect
checks. Serve `src/` on localhost before running it. It does not test hardware.

Hardware acceptance remains: teach all seven knobs and Play/Reset/Tap Tempo,
verify audible behavior and echo silence, restart browser and desktop to check
saved assignments, and unplug/reconnect while playing.

Sound profiles
--------------

Volume is global: changing patches never changes it, and its latest value is
restored after restarting. All other sound controls (six sliders, both waveform
selectors, delay factor, and both tempo-sync checkboxes) save automatically to
the selected patch. This includes edits made by MIDI. The selected patch is also
remembered, including when using the default patch 1 without selecting another.

Tap Tempo BPM, tap history, and the frequency/delay values produced by tapping
are runtime-only. They are never saved just because another setting changes.
Switching patches or restarting restores the manually saved slider values.
Manually moving a slider (including with MIDI) saves that slider's new value.
The tempo-sync checkbox preferences themselves are saved per patch.

Browser sound settings use `localStorage` key `dubsiren:settings:v2`; MIDI keeps
its existing `dubsiren:midi:v1` key. Desktop stores everything in the same
`midi-settings.json` file with top-level `version`, `volume`, `currentPatch`,
`patches`, `patchNames`, and `midi` fields. The current document version is 2. The file can be
read or edited while the app is closed; invalid values are reported rather than
overwriting the file. Do not add volume or runtime tempo fields inside patches.

Existing legacy patch keys and version-1 MIDI files are imported on first use.
Legacy patch-specific volume values are ignored in favor of the saved global
volume (or 80% if no global volume was saved). Valid old patch values are retained,
with defaults for missing or invalid legacy fields. The original browser keys
remain available after import, but the new settings take precedence.

`tests/patches.browser.js` covers patch isolation and runtime tempo behavior;
`tests/settings-desktop.browser.js` checks migration and combined saves through
a mocked desktop bridge. Real disk read/write behavior is covered by Rust tests.

Patch names and selection
-------------------------

The four active patches always stay in slot order 1–4. Use the radio buttons or
keys 1–4 (including the number pad) to select a patch. Click a patch's name to
edit it in place, up to 32 characters. Enter or clicking outside saves; Escape
cancels. Names are trimmed, and a blank name restores the slot number. Renaming
does not select a different patch or reorder the bank.

Names save as `patchNames` in the same settings as the sound profiles, in browser
storage or the shared desktop JSON file. Older settings receive names 1, 2, 3,
and 4 automatically. Previously saved slots 5–9 remain in stored data but are
hidden and have no shortcuts; if one was selected, startup selects slot 1.
`tests/patch-names.browser.js` covers editing, persistence, order, and migration.
