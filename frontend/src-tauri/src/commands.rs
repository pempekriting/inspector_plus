use crate::backend_manager::{BackendStatus, SharedBackendManager};
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
    manager: State<'_, SharedBackendManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    manager.start()
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
    manager: State<'_, SharedBackendManager>,
) -> Result<(), String> {
    let mut manager = manager.lock().await;
    manager.stop()?;
    manager.start()
}