export interface NetworkFlow {
  id: string;
  timestamp: number;
  request: {
    method: string;
    url: string;
    host: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    status_code: number;
    reason: string;
    headers: Record<string, string>;
    body?: string;
  };
  duration_ms: number;
  websocket: boolean;
  error?: string;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  flow_count: number;
  mitm_version?: string;
}

export interface NetworkInfo {
  ip_addresses: Array<{ iface: string; address: string; family: string }>;
  connections: string[];
  dns: string[];
}
