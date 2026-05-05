// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_manager;
mod commands;
mod mcp_manager;

use backend_manager::{create_backend_manager, SharedBackendManager};
use mcp_manager::{create_mcp_manager, SharedMcpManager};
use tauri::Manager;

fn main() {
    env_logger::init();

    log::info!("Starting InspectorPlus...");

    let backend_manager: SharedBackendManager = create_backend_manager();
    let mcp_manager: SharedMcpManager = create_mcp_manager();

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

    // Start MCP server before app window opens
    {
        let mut manager = mcp_manager.blocking_lock();
        log::info!("Starting MCP server...");
        if let Err(e) = manager.start() {
            log::error!("Failed to start MCP: {}", e);
        } else {
            log::info!("MCP server started successfully");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(backend_manager)
        .manage(mcp_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_status,
            commands::start_backend,
            commands::stop_backend,
            commands::restart_backend,
            commands::get_mcp_status,
            commands::start_mcp,
            commands::stop_mcp,
            commands::restart_mcp,
        ])
        .setup(|_app| {
            log::info!("Tauri app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log::info!("Window close requested - shutting down...");
                let backend_mgr = window.state::<SharedBackendManager>();
                let mut backend = backend_mgr.blocking_lock();
                let _ = backend.stop();
                let mcp_mgr = window.state::<SharedMcpManager>();
                let mut mcp = mcp_mgr.blocking_lock();
                let _ = mcp.stop();
            }
        })
        .run(tauri::generate_context!())
        .unwrap();
}
