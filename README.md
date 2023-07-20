Dub siren
==========


Slightly patched version of https://siren.zongosound.com dub siren.



src/ folder can be used as-is via webbrowser

src-tauri contains support files to build the project as "native" tauri application.



Usage
=====

Point your browser to src/ folder and open the index.html - it should "just work"

If you want to build the application, you need to have rust and cargo installed and then:

```bash
cargo install tauri-cli
cargo tauri build
```
