// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod midi;

fn main() {
    tauri::Builder::default()
        .manage(midi::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            midi::midi_list_inputs,
            midi::midi_connect,
            midi::midi_disconnect,
            midi::midi_load_settings,
            midi::midi_save_settings
        ])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
