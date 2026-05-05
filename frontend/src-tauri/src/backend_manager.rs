use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use std::net::TcpStream;
use std::thread;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, PartialEq)]
pub enum BackendStatus {
    Starting,
    Running,
    Stopped,
    Error(String),
}

pub struct BackendManager {
    port: u16,
    backend_dir: PathBuf,
    child: Option<Child>,
    status: BackendStatus,
}

impl BackendManager {
    pub fn new(port: u16) -> Self {
        let backend_dir = Self::find_backend_dir();
        Self {
            port,
            backend_dir,
            child: None,
            status: BackendStatus::Running,
        }
    }

    fn find_backend_dir() -> PathBuf {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        let candidates = [
            // Dev: src-tauri/target/debug/inspector_plus -> project root -> backend
            exe_dir.as_ref().map(|p| p.join("../../../../backend")),
            // Release: src-tauri/target/release/bundle/macos/InspectorPlus.app/Contents/MacOS/inspector_plus -> backend
            exe_dir.as_ref().map(|p| p.join("../../../../../../../backend")),
        ];

        for candidate in candidates.iter().flatten() {
            let python_path = candidate.join(".venv/bin/python");
            if python_path.exists() {
                return candidate.clone();
            }
        }

        PathBuf::from("./backend")
    }

    fn get_python_path(&self) -> PathBuf {
        self.backend_dir.join(".venv/bin/python")
    }

    fn get_uvicorn_cmd(&self) -> String {
        // Source .zshrc to get Android SDK in PATH
        format!(
            "source ~/.zshrc && cd '{}' && '{}' -m uvicorn main:app --port {} --host 127.0.0.1",
            self.backend_dir.display(),
            self.get_python_path().display(),
            self.port
        )
    }

    pub fn get_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn status(&self) -> BackendStatus {
        if self.child.is_some() && Self::is_port_open(self.port) {
            return BackendStatus::Running;
        }
        self.status.clone()
    }

    fn is_port_open(port: u16) -> bool {
        TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(100),
        )
        .is_ok()
    }

    fn find_available_port(start: u16) -> Option<u16> {
        for port in start..start + 100 {
            if !Self::is_port_open(port) {
                return Some(port);
            }
        }
        None
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.status == BackendStatus::Running {
            return Ok(());
        }

        self.status = BackendStatus::Starting;

        let python_child = Command::new("sh")
            .args(["-c", &self.get_uvicorn_cmd()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        match python_child {
            Ok(child) => {
                log::info!("Python backend started with PID: {}", child.id());
                self.child = Some(child);
                // Check port immediately; if not open, mark as Error
                if Self::is_port_open(self.port) {
                    self.status = BackendStatus::Running;
                    Ok(())
                } else {
                    self.status = BackendStatus::Error("Backend process started but port not open".to_string());
                    Err("Backend process started but port not open".to_string())
                }
            }
            Err(e) => {
                let err = format!("Failed to spawn backend process: {}", e);
                log::error!("{}", err);
                self.status = BackendStatus::Error(err.clone());
                Err(err)
            }
        }
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            log::info!("Stopping Python backend...");
            child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
            self.status = BackendStatus::Stopped;
            log::info!("Python backend stopped");
        }
        Ok(())
    }

    pub fn restart_on_port(&mut self, port: u16) -> Result<(), String> {
        self.stop()?;
        self.port = port;
        self.start()
    }

    pub fn wait_for_ready(&self, timeout_secs: u64) -> bool {
        let mut retries = timeout_secs * 2;
        while retries > 0 {
            if Self::is_port_open(self.port) {
                log::info!("Backend is ready!");
                return true;
            }
            thread::sleep(Duration::from_millis(500));
            retries -= 1;
        }
        log::warn!("Backend may not be ready, continuing anyway...");
        false
    }
}

impl Drop for BackendManager {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            log::info!("App closing - stopping backend");
            let _ = child.kill();
        }
    }
}

pub type SharedBackendManager = Arc<Mutex<BackendManager>>;

pub fn create_backend_manager() -> SharedBackendManager {
    let requested_port = std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse().ok());

    let port = match requested_port {
        Some(p) => p,
        None => {
            // Try default 8001; if busy, find available port starting from 8002
            if BackendManager::is_port_open(8001) {
                BackendManager::find_available_port(8002).unwrap_or(8001)
            } else {
                8001
            }
        }
    };

    Arc::new(Mutex::new(BackendManager::new(port)))
}