// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::time::Duration;
use std::thread;
use std::net::TcpStream;
use std::path::PathBuf;

fn get_backend_dir() -> PathBuf {
    // In dev: executable is in src-tauri/target/debug/
    // Backend is at project-root/backend/
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    // Try relative paths for both dev and release builds
    let candidates = [
        // Dev: src-tauri/target/debug/ -> frontend/ -> project root -> backend
        exe_dir.as_ref().map(|p| p.join("../../../../backend")).unwrap_or_default(),
        // Release: src-tauri/target/release/bundle/macos/InspectorPlus.app/ -> backend
        exe_dir.as_ref().map(|p| p.join("../../../../../../backend")).unwrap_or_default(),
        // Fallback: use executable's parent and go up
        PathBuf::from("/Users/azzamnizar/Documents/project/inspector_plus/backend"),
    ];

    for candidate in &candidates {
        let python_path = candidate.join(".venv/bin/python");
        if python_path.exists() {
            return candidate.clone();
        }
    }

    // Fallback to hardcoded path
    PathBuf::from("/Users/azzamnizar/Documents/project/inspector_plus/backend")
}

fn main() {
    env_logger::init();

    // Start Python backend
    log::info!("Starting Python backend...");

    let backend_dir = get_backend_dir();
    log::info!("Backend directory: {:?}", backend_dir);

    let venv_python = backend_dir.join(".venv/bin/python");
    let start_cmd = format!(
        "cd '{}' && '{}' -m uvicorn main:app --port 8001 --host 127.0.0.1",
        backend_dir.display(),
        venv_python.display()
    );

    log::info!("Starting: {}", start_cmd);

    let python_child = Command::new("sh")
        .args(["-c", &start_cmd])
        .spawn();

    match python_child {
        Ok(child) => {
            log::info!("Python backend started with PID: {}", child.id());

            // Wait for backend to be ready
            log::info!("Waiting for backend to be ready...");
            let mut retries = 30;
            while retries > 0 {
                if TcpStream::connect("127.0.0.1:8001").is_ok() {
                    log::info!("Backend is ready!");
                    break;
                }
                thread::sleep(Duration::from_millis(500));
                retries -= 1;
            }

            if retries == 0 {
                log::warn!("Backend may not be ready, continuing anyway...");
            }
        }
        Err(e) => {
            log::error!("Failed to start Python backend: {}", e);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .unwrap();
}
