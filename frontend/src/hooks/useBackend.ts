import { useState } from 'react';

interface BackendStatus {
  status: 'running' | 'error';
  url: string;
}

export function useBackendStatus() {
  const [backendStatus] = useState<BackendStatus>({
    status: 'running',
    url: 'http://127.0.0.1:8001',
  });

  return backendStatus;
}
