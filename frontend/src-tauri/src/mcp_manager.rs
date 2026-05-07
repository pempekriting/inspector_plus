use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use std::net::TcpStream;
use std::thread;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, PartialEq)]
pub enum McpStatus {
    Starting,
    Running,
    Stopped,
    Error(String),
}

pub struct McpManager {
    port: u16,
    mcp_dir: PathBuf,
    child: Option<Child>,
    status: McpStatus,
}

impl McpManager {
    pub fn new(port: u16) -> Self {
        let mcp_dir = Self::find_mcp_dir();
        Self {
            port,
            mcp_dir,
            child: None,
            status: McpStatus::Stopped,
        }
    }

    fn find_mcp_dir() -> PathBuf {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        let candidates = [
            // Dev: src-tauri/target/debug/inspector_plus -> project root -> backend/mcp
            exe_dir.as_ref().map(|p| p.join("../../../../backend/mcp")),
            // Release: macOS bundle -> project root -> backend/mcp (9 levels up for .app with symlinks)
            exe_dir.as_ref().map(|p| p.join("../../../../../../../../../backend/mcp")),
        ];

        for candidate in candidates.iter().flatten() {
            if candidate.join("package.json").exists() {
                return candidate.clone();
            }
        }

        PathBuf::from("./backend/mcp")
    }

    pub fn get_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn status(&self) -> McpStatus {
        if self.child.is_some() && Self::is_port_open(self.port) {
            return McpStatus::Running;
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

    fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
        let mut retries = timeout_secs * 10;
        while retries > 0 {
            if Self::is_port_open(port) {
                return true;
            }
            thread::sleep(Duration::from_millis(100));
            retries -= 1;
        }
        false
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.status == McpStatus::Running {
            return Ok(());
        }

        self.status = McpStatus::Starting;

        let mcp_dir = self.mcp_dir.clone();
        let port = self.port;

        let node_child = Command::new("npm")
            .current_dir(&mcp_dir)
            .args(["run", "dev"])
            .env("MCP_PORT", port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match node_child {
            Ok(child) => {
                if Self::wait_for_port(self.port, 15) {
                    self.child = Some(child);
                    self.status = McpStatus::Running;
                    Ok(())
                } else {
                    self.status = McpStatus::Error("MCP process started but port not open".to_string());
                    Err("MCP process started but port not open".to_string())
                }
            }
            Err(e) => {
                let err = format!("Failed to spawn MCP process: {}", e);
                self.status = McpStatus::Error(err.clone());
                Err(err)
            }
        }
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            // First kill the bash wrapper
            let _ = child.kill();
            // The node/tsx processes may survive bash death - use lsof to find and kill the actual process on this port
            let port = self.port;
            let output = Command::new("lsof")
                .args(["-ti", &format!(":{}", port)])
                .output();
            if let Ok(output) = output {
                let pids = String::from_utf8_lossy(&output.stdout);
                for pid in pids.split_whitespace() {
                    let _ = Command::new("kill")
                        .args(["-9", pid])
                        .spawn();
                }
            }
            self.status = McpStatus::Stopped;
        }
        Ok(())
    }

    pub fn restart_on_port(&mut self, port: u16) -> Result<(), String> {
        self.stop()?;
        self.port = port;
        self.start()
    }
}

impl Drop for McpManager {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
        }
    }
}

pub type SharedMcpManager = Arc<Mutex<McpManager>>;

pub fn create_mcp_manager() -> SharedMcpManager {
    let requested_port = std::env::var("MCP_PORT")
        .ok()
        .and_then(|p| p.parse().ok());

    let port = requested_port.unwrap_or(8002);

    Arc::new(Mutex::new(McpManager::new(port)))
}
