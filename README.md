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
  On macOS this is `~/Library/Application Support/com.italtone.dubsiren/`.
  Settings survive application restarts and rebuilding/replacing the app.

Saving failures show **Retry Save**; invalid stored settings are preserved
until you explicitly reset saved MIDI settings. Unplugging retains mappings;
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
