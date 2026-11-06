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
