use crate::backend_manager::{BackendStatus, SharedBackendManager};
use crate::mcp_manager::{McpStatus, SharedMcpManager};
use tauri::State;

#[derive(serde::Serialize)]
pub struct BackendStatusResponse {
    pub status: String,
    pub url: String,
}

#[tauri::command]
pub async fn get_backend_status(
    manager: State<'_, SharedBackendManager>,
) -> Result<BackendStatusResponse, String> {
    let manager = manager.lock().await;
    let status = match manager.status() {
        BackendStatus::Starting => "starting",
        BackendStatus::Running => "running",
        BackendStatus::Stopped => "stopped",
        BackendStatus::Error(msg) => return Err(msg),
    };
    Ok(BackendStatusResponse {
        status: status.to_string(),
        url: manager.get_url(),
    })
}

#[tauri::command]
pub async fn start_backend(
    port: Option<u16>,
    manager: State<'_, SharedBackendManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    if let Some(p) = port {
        manager.restart_on_port(p)
    } else {
        manager.start()
    }
}

#[tauri::command]
pub async fn stop_backend(
    manager: State<'_, SharedBackendManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    manager.stop()
}

#[tauri::command]
pub async fn restart_backend(
    port: Option<u16>,
    manager: State<'_, SharedBackendManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    if let Some(p) = port {
        manager.restart_on_port(p)
    } else {
        manager.stop()?;
        manager.start()
    }
}

// ─── MCP Server Commands ───────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct McpStatusResponse {
    pub status: String,
    pub url: String,
}

#[tauri::command]
pub async fn get_mcp_status(
    manager: State<'_, SharedMcpManager>,
) -> Result<McpStatusResponse, String> {
    let manager = manager.lock().await;
    let status = match manager.status() {
        McpStatus::Starting => "starting",
        McpStatus::Running => "running",
        McpStatus::Stopped => "stopped",
        McpStatus::Error(msg) => return Err(msg),
    };
    Ok(McpStatusResponse {
        status: status.to_string(),
        url: manager.get_url(),
    })
}

#[tauri::command]
pub async fn start_mcp(
    port: u16,
    manager: State<'_, SharedMcpManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    manager.restart_on_port(port)
}

#[tauri::command]
pub async fn stop_mcp(
    manager: State<'_, SharedMcpManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    manager.stop()
}

#[tauri::command]
pub async fn restart_mcp(
    port: Option<u16>,
    manager: State<'_, SharedMcpManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    if let Some(p) = port {
        manager.restart_on_port(p)
    } else {
        manager.stop()?;
        manager.start()
    }
}
