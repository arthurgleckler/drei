// Prevent additional console window on Windows in release.
// DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::OnceCell;
use tauri_plugin_app;

static URL_ARG: OnceCell<String> = OnceCell::new();

#[tauri::command]
fn exit(message: String) {
    println!("{}", message);
    std::process::exit(1);
}

#[tauri::command]
async fn read_page() -> Result<String, String> {
    let url = URL_ARG.get().expect("--url not specified.");
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to load URL ({}).  Details: {}", url, e))?;

    if response.status().is_success() {
        response
            .text()
            .await
            .map_err(|e| format!("Bad response when loading URL ({}): Failed to read response text.  Details: {}", url, e))
    } else {
        Err(format!(
            "Bad response when loading URL ({}).  Status: {}",
            url,
            response.status()
        ))
    }
}

#[tauri::command]
async fn write_contents(contents: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = URL_ARG.get().expect("--url not specified.");
    let response = client
        .post(url)
        .body(contents)
        .send()
        .await
        .map_err(|e| format!("Failed to send data to URL ({}).  Details: {}", url, e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Could not read error response body".to_string());
        Err(format!(
            "Bad response when writing to URL ({}).  Status: {}.  Details: {}",
            url, status, error_text
        ))
    }
}

fn main() {
    use tauri_plugin_cli::CliExt;

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![exit, read_page, write_contents])
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_app::init())
        .plugin(tauri_plugin_cli::init())
        .setup(|app| {
            let cli_matches = app.cli().matches()?;

            if let Some(url_arg) = cli_matches.args.get("url") {
                if let Some(url_string) = url_arg.value.as_str() {
                    let _ = URL_ARG.set(url_string.to_string());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    web_editor_lib::run()
}
