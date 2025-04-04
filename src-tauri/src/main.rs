// Prevent additional console window on Windows in release.
// DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri_plugin_app;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_file])
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_app::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    web_editor_lib::run()
}
