// Prevent additional console window on Windows in release.
// DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::OnceCell;
use tauri_plugin_app;
use std::fs;
use std::sync::Mutex;
use scraper::{Html, Selector};

static URL_ARG: OnceCell<String> = OnceCell::new();
static FILE_ARG: OnceCell<String> = OnceCell::new();
static SELECTOR_ARG: OnceCell<String> = OnceCell::new();
static ORIGINAL_CONTENT: OnceCell<Mutex<Option<String>>> = OnceCell::new();

fn replace_selector_content(original_html: &str, selector_str: &str, new_content: &str) -> Option<String> {
    use ego_tree::iter::Edge;

    let mut document = Html::parse_document(original_html);
    let selector = Selector::parse(selector_str).ok()?;

    let element_id = {
        let element = document.select(&selector).next()?;

        element.id()
    };

    let mut new_children = Vec::new();
    let fragment = Html::parse_fragment(new_content);

    for edge in fragment.tree.root().traverse() {
        if let Edge::Open(node) = edge {
            if node != fragment.tree.root() {
                new_children.push(node.value().clone());
            }
        }
    }

    let children_to_remove: Vec<_> = {
        let target_node = document.tree.get(element_id)?;

        target_node.children().map(|child| child.id()).collect()
    };

    for child_id in children_to_remove {
        if let Some(mut child_node) = document.tree.get_mut(child_id) {
            child_node.detach();
        }
    }

    let mut target_node = document.tree.get_mut(element_id)?;
    for new_child in new_children.into_iter().rev() {
        target_node.prepend(new_child);
    }

    Some(document.html())
}

#[tauri::command]
fn exit(message: String) {
    println!("{}", message);
    std::process::exit(1);
}

#[tauri::command]
fn get_selector() -> Result<String, String> {
    SELECTOR_ARG.get()
        .ok_or_else(|| "--selector not specified".to_string())
        .map(|s| s.clone())
}

#[tauri::command]
fn get_base_url() -> Result<String, String> {
    if let Some(url) = URL_ARG.get() {
        let parsed = reqwest::Url::parse(url)
            .map_err(|e| format!("Failed to parse URL: {}", e))?;
        Ok(format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or("")))
    } else {
        Err("No URL specified".to_string())
    }
}


#[tauri::command]
async fn read_page() -> Result<String, String> {
    if let Some(file_path) = FILE_ARG.get() {
        let content = fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file ({}).  Details: {}", file_path, e))?;

        let _ = ORIGINAL_CONTENT.get_or_init(|| Mutex::new(None));

        if let Some(storage) = ORIGINAL_CONTENT.get() {
            *storage.lock().unwrap() = Some(content.clone());
        }

        Ok(content)
    } else if let Some(url) = URL_ARG.get() {
        let response = reqwest::get(url)
            .await
            .map_err(|e| format!("Failed to load URL ({}).  Details: {}", url, e))?;

        if response.status().is_success() {
            let content = response
                .text()
                .await
                .map_err(|e| format!("Bad response when loading URL ({}): Failed to read response text.  Details: {}", url, e))?;

            let _ = ORIGINAL_CONTENT.get_or_init(|| Mutex::new(None));

            if let Some(storage) = ORIGINAL_CONTENT.get() {
                *storage.lock().unwrap() = Some(content.clone());
            }

            Ok(content)
        } else {
            Err(format!(
                "Bad response when loading URL ({}).  Status: {}",
                url,
                response.status()
            ))
        }
    } else {
        Err("Neither --file nor --url was specified".to_string())
    }
}

#[tauri::command]
async fn write_contents(contents: String) -> Result<(), String> {
    let original_content = ORIGINAL_CONTENT
        .get()
        .and_then(|storage| storage.lock().unwrap().clone())
        .ok_or_else(|| "Original content not available".to_string())?;

    let selector_str = SELECTOR_ARG.get()
        .ok_or_else(|| "--selector not specified".to_string())?;

    let modified_html = replace_selector_content(&original_content, selector_str, &contents)
        .ok_or_else(|| format!("Could not find element matching selector '{}'", selector_str))?;

    if let Some(file_path) = FILE_ARG.get() {
        fs::write(file_path, modified_html)
            .map_err(|e| format!("Failed to write file ({}).  Details: {}", file_path, e))?;

        Ok(())
    } else if let Some(url) = URL_ARG.get() {
        let client = reqwest::Client::new();
        let response = client
            .post(url)
            .body(modified_html)
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
                .unwrap_or_else(|_| "Could not read error response body.".to_string());
            Err(format!(
                "Bad response when writing to URL ({}).  Status: {}.  Details: {}",
                url, status, error_text
            ))
        }
    } else {
        Err("Neither --file nor --url was specified".to_string())
    }
}

fn main() {
    use tauri_plugin_cli::CliExt;

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![exit, get_selector, get_base_url, read_page, write_contents])
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

            if let Some(file_arg) = cli_matches.args.get("file") {
                if let Some(file_string) = file_arg.value.as_str() {
                    let _ = FILE_ARG.set(file_string.to_string());
                }
            }

            if let Some(selector_arg) = cli_matches.args.get("selector") {
                if let Some(selector_string) = selector_arg.value.as_str() {
                    let _ = SELECTOR_ARG.set(selector_string.to_string());
                }
            }

            if URL_ARG.get().is_none() && FILE_ARG.get().is_none() {
                eprintln!("Error: Either --url or --file must be specified.");
                eprintln!();
                eprintln!("Usage: drei --selector <SELECTOR> (--url <URL> | --file <PATH>)");
                eprintln!();
                eprintln!("Arguments:");
                eprintln!("  --selector <SELECTOR>  CSS selector for the editable content element (required)");
                eprintln!("  --url <URL>            URL to load (HTTP GET) and save (HTTP POST)");
                eprintln!("  --file <PATH>          Local file path to load and save (preserves content outside selector)");
                std::process::exit(1);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application.");
    web_editor_lib::run()
}
