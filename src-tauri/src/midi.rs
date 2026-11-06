use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::Serialize;
use std::{fs, path::Path, sync::Mutex};
use tauri::{ipc::Channel, Manager, State, WebviewWindow};

#[derive(Default)]
pub struct MidiState(pub Mutex<Option<MidiInputConnection<()>>>);
#[derive(Serialize)]
pub struct Port {
    id: String,
    name: String,
    manufacturer: String,
}
fn allowed(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("MIDI is available only in the main window".into())
    }
}
fn input() -> Result<MidiInput, String> {
    MidiInput::new("Dub Siren").map_err(|e| e.to_string())
}
#[tauri::command]
pub fn midi_list_inputs(window: WebviewWindow) -> Result<Vec<Port>, String> {
    allowed(&window)?;
    let input = input()?;
    Ok(input
        .ports()
        .iter()
        .map(|port| Port {
            id: port.id(),
            name: input
                .port_name(port)
                .unwrap_or_else(|_| "Unknown MIDI input".into()),
            manufacturer: String::new(),
        })
        .collect())
}
#[tauri::command]
pub fn midi_disconnect(window: WebviewWindow, state: State<MidiState>) -> Result<(), String> {
    allowed(&window)?;
    state.0.lock().map_err(|e| e.to_string())?.take();
    Ok(())
}
#[tauri::command]
pub fn midi_connect(
    window: WebviewWindow,
    state: State<MidiState>,
    id: String,
    messages: Channel<Vec<u8>>,
) -> Result<(), String> {
    allowed(&window)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    guard.take();
    let mut input = input()?;
    input.ignore(Ignore::All);
    let port = input
        .ports()
        .into_iter()
        .find(|port| port.id() == id)
        .ok_or("MIDI input disconnected")?;
    let connection = input
        .connect(
            &port,
            "Dub Siren input",
            move |_, bytes, _| {
                if bytes.len() == 3 && matches!(bytes[0] >> 4, 8 | 9 | 11) {
                    let _ = messages.send(bytes.to_vec());
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;
    *guard = Some(connection);
    Ok(())
}
fn read_settings(path: &Path) -> Result<Option<serde_json::Value>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn write_settings(path: &Path, settings: &serde_json::Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Missing settings directory")?)
        .map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(temporary, path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn midi_load_settings(window: WebviewWindow) -> Result<Option<serde_json::Value>, String> {
    allowed(&window)?;
    read_settings(
        &window
            .app_handle()
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join("midi-settings.json"),
    )
}
#[tauri::command]
pub fn midi_save_settings(
    window: WebviewWindow,
    settings: serde_json::Value,
) -> Result<(), String> {
    allowed(&window)?;
    write_settings(
        &window
            .app_handle()
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join("midi-settings.json"),
        &settings,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_roundtrip_and_corrupt_file() {
        let dir = std::env::temp_dir().join(format!("dubsiren-midi-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        assert!(read_settings(&path).unwrap().is_none());
        let settings = serde_json::json!({"version":1,"selected":null,"devices":{}});
        write_settings(&path, &settings).unwrap();
        assert!(write_settings(&path.join("child.json"), &settings).is_err());
        assert_eq!(read_settings(&path).unwrap(), Some(settings));
        write_settings(&path, &serde_json::json!({"version":2})).unwrap();
        assert_eq!(read_settings(&path).unwrap().unwrap()["version"], 2);
        fs::write(&path, "corrupt").unwrap();
        assert!(read_settings(&path).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
