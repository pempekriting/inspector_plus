// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_manager;
mod commands;

use backend_manager::{create_backend_manager, SharedBackendManager};
use tauri::Manager;

fn main() {
    env_logger::init();

    log::info!("Starting InspectorPlus...");

    let backend_manager: SharedBackendManager = create_backend_manager();

    // Start backend before app window opens
    {
        let mut manager = backend_manager.blocking_lock();
        log::info!("Starting Python backend...");
        if let Err(e) = manager.start() {
            log::error!("Failed to start backend: {}", e);
        } else {
            log::info!("Backend started successfully");
            manager.wait_for_ready(15);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(backend_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_status,
            commands::start_backend,
            commands::stop_backend,
            commands::restart_backend,
        ])
        .setup(|_app| {
            log::info!("Tauri app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log::info!("Window close requested - shutting down backend...");
                let manager = window.state::<SharedBackendManager>();
                let mut mgr = manager.blocking_lock();
                let _ = mgr.stop();
            }
        })
        .run(tauri::generate_context!())
        .unwrap();
}