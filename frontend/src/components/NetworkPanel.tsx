import React, { useState, useEffect, useRef } from 'react';

import { getApiUrl } from '../config/apiConfig';
import {
  useProxyStatus,
  useStartProxy,
  useStopProxy,
  useNetworkTraffic,
  useNetworkInfo,
  useInstallCert,
  useVpnStatus,
  useStartVpn,
  useStopVpn,
} from '../services/api';
import { useDeviceStore } from '../stores/deviceStore';
import { useNetworkStore } from '../stores/networkStore';
import { useThemeStore } from '../stores/themeStore';
import type { NetworkFlow } from '../types/network';

type ProxyMode = 'app' | 'full';

// ─── DetailRow ───────────────────────────────────────────────────────────
function DetailRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        className="text-[9px] font-bold uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-label)' }}
      >
        {label}
      </div>
      <pre
        className="text-[10px] font-code p-2 rounded overflow-auto max-h-20"
        style={{
          background: 'var(--bg-primary)',
          border: '1.5px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        {body}
      </pre>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  '2': 'var(--accent-emerald)',
  '3': 'var(--accent-blue)',
  '4': 'var(--accent-amber)',
  '5': 'var(--accent-rose)',
};
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: 'rgba(16,185,129,0.15)', text: 'var(--accent-emerald)' },
  POST: { bg: 'rgba(37,99,235,0.15)', text: 'var(--accent-blue)' },
  PUT: { bg: 'rgba(245,158,11,0.15)', text: 'var(--accent-amber)' },
  PATCH: { bg: 'rgba(139,92,246,0.15)', text: 'var(--accent-violet)' },
  DELETE: { bg: 'rgba(244,63,94,0.15)', text: 'var(--accent-rose)' },
};
function statusColor(code: number) {
  return STATUS_COLORS[String(code)[0]] || 'var(--text-tertiary)';
}

// ─── component ────────────────────────────────────────────────────────────
export function NetworkPanel() {
  const { theme } = useThemeStore();
  const { selectedDevice } = useDeviceStore();
  const { setLastTimestamp } = useNetworkStore();

  // mode: "app" = http_proxy only, "full" = VPN interception
  const [proxyMode, setProxyMode] = useState<ProxyMode>('app');
  const [urlFilter, setUrlFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [port, setPort] = useState(8080);
  const [showCert, setShowCert] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  // queries
  const { data: proxyData, refetch: refetchProxy } = useProxyStatus();
  const isRunning = proxyData?.running ?? false;
  const startProxy = useStartProxy();
  const stopProxy = useStopProxy();

  // VPN queries
  const { data: vpnData } = useVpnStatus(selectedDevice ?? undefined);
  // startVpnPending tracks optimistic UI state separately from backend running state
  const [startVpnPending, setStartVpnPending] = useState(false);
  const vpnRunning = vpnData?.running ?? false;
  const startVpn = useStartVpn();
  const stopVpn = useStopVpn();

  const installCert = useInstallCert();
  const { data: networkInfo } = useNetworkInfo(selectedDevice ?? undefined);

  // ── WS-disconnect gap-fill: poll only when WS is down ─────────────
  const {
    trafficFlows,
    wsConnected,
    wsDisconnectedAt,
    lastTimestamp,
    addFlow,
    clearTraffic,
    selectedFlowId,
    setSelectedFlowId,
    setWsConnected,
    setWsDisconnectedAt,
  } = useNetworkStore();
  const addFlowRef = useRef(addFlow);
  addFlowRef.current = addFlow;

  const enableFallbackPoll = isRunning && !wsConnected && wsDisconnectedAt !== null;
  const fallbackSince = enableFallbackPoll ? wsDisconnectedAt / 1000 : lastTimestamp;
  const { data: fallbackData } = useNetworkTraffic(fallbackSince, enableFallbackPoll);

  // Sync flows from fallback poll
  useEffect(() => {
    if (!fallbackData?.flows) return;
    for (const f of fallbackData.flows as NetworkFlow[]) {
      addFlowRef.current(f);
    }
  }, [fallbackData]);

  // ── WebSocket primary ───────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    let wsCleanedUp = false;
    const wsUrl = `${getWsUrl()}/network/stream${selectedDevice ? `?udid=${selectedDevice}` : ''}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (wsCleanedUp) return;
      setWsConnected(true);
    };
    ws.onmessage = (e) => {
      if (wsCleanedUp) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'flow') addFlowRef.current(msg.data as NetworkFlow);
      } catch {}
    };
    ws.onclose = () => {
      if (wsCleanedUp) return;
      wsCleanedUp = true;
      setWsConnected(false);
      setWsDisconnectedAt(Date.now());
    };
    return () => {
      if (wsCleanedUp) return;
      wsCleanedUp = true;
      ws.close();
    };
  }, [isRunning, selectedDevice]);

  function getWsUrl() {
    return getApiUrl().replace(/^http/, 'ws');
  }

  // ── handlers ──────────────────────────────────────────────────────
  const handleStartAppProxy = () => {
    startProxy.mutateAsync({ port, udid: selectedDevice ?? undefined }).then(() => refetchProxy());
  };
  const handleStopAppProxy = () => {
    stopProxy.mutateAsync().then(() => refetchProxy());
  };
  const handleStartVpn = () => {
    setStartVpnPending(true);
    startVpn
      .mutateAsync({ port, udid: selectedDevice ?? undefined })
      .then(() => setStartVpnPending(false))
      .catch((err) => {
        setStartVpnPending(false);
        console.error('Start VPN failed:', err);
      });
  };
  const handleStopVpn = () => {
    stopVpn
      .mutateAsync({ udid: selectedDevice ?? undefined })
      .catch((err) => console.error('Stop VPN failed:', err));
  };
  const handleCert = () => installCert.mutateAsync({ udid: selectedDevice ?? undefined });

  const handleModeSwitch = (mode: ProxyMode) => {
    setProxyMode(mode);
    setStartVpnPending(false);
    // If switching away from app proxy while running, stop it
    if (mode === 'full' && isRunning) {
      stopProxy.mutateAsync().then(() => refetchProxy());
    }
  };

  // ── filtered rows ──────────────────────────────────────────────────
  const rows = trafficFlows.filter((f) => {
    if (methodFilter !== 'ALL' && String(f.request.method).toUpperCase() !== methodFilter)
      return false;
    if (
      statusFilter !== 'ALL' &&
      f.response?.status_code != null &&
      String(f.response.status_code)[0] !== statusFilter
    )
      return false;
    if (urlFilter && !(f.request.url || '').toLowerCase().includes(urlFilter.toLowerCase()))
      return false;
    return true;
  });

  // ── render ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full font-ui"
      style={{ fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* ── Controls bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: 'var(--bg-secondary)', borderBottom: 'var(--nb-border)' }}
      >
        {/* Mode toggle */}
        <div
          className="flex rounded overflow-hidden"
          style={{ border: '1.5px solid var(--border-default)' }}
        >
          <button
            onClick={() => handleModeSwitch('app')}
            style={{
              padding: '4px 10px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: proxyMode === 'app' ? 'rgba(0,229,204,0.12)' : 'var(--bg-tertiary)',
              color: proxyMode === 'app' ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              borderRight: proxyMode === 'app' ? '1.5px solid var(--border-default)' : 'none',
            }}
          >
            App Proxy
          </button>
          <button
            onClick={() => handleModeSwitch('full')}
            style={{
              padding: '4px 10px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: proxyMode === 'full' ? 'rgba(0,229,204,0.12)' : 'var(--bg-tertiary)',
              color: proxyMode === 'full' ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
            }}
          >
            Full Intercept
          </button>
        </div>

        {/* status dot + label */}
        {proxyMode === 'app' ? (
          <>
            <div className="flex items-center gap-1.5">
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: isRunning ? 'var(--accent-emerald)' : 'var(--text-tertiary)',
                  boxShadow: isRunning ? `0 0 6px var(--accent-emerald)` : 'none',
                }}
              />
              <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.04em' }}>
                {isRunning ? `mitmdump:${proxyData?.port ?? port}` : 'stopped'}
              </span>
            </div>
            {isRunning ? (
              <button
                className="neo-btn neo-btn-sm"
                onClick={handleStopAppProxy}
                style={{
                  background: 'rgba(244,63,94,0.12)',
                  borderColor: 'var(--accent-rose)',
                  color: 'var(--accent-rose)',
                }}
              >
                ■ Stop
              </button>
            ) : (
              <button
                className="neo-btn neo-btn-sm"
                onClick={handleStartAppProxy}
                disabled={startProxy.isPending}
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  borderColor: 'var(--accent-emerald)',
                  color: 'var(--accent-emerald)',
                  opacity: startProxy.isPending ? 0.5 : 1,
                }}
              >
                ▶ {startProxy.isPending ? '...' : 'Start'}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background:
                    vpnRunning || startVpnPending
                      ? 'var(--accent-emerald)'
                      : 'var(--text-tertiary)',
                  boxShadow:
                    vpnRunning || startVpnPending ? `0 0 6px var(--accent-emerald)` : 'none',
                }}
              />
              <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.04em' }}>
                {vpnRunning ? 'VPN:active' : startVpnPending ? 'VPN:pending' : 'VPN:off'}
              </span>
            </div>
            {vpnRunning || startVpnPending ? (
              <button
                className="neo-btn neo-btn-sm"
                onClick={handleStopVpn}
                style={{
                  background: 'rgba(244,63,94,0.12)',
                  borderColor: 'var(--accent-rose)',
                  color: 'var(--accent-rose)',
                }}
              >
                ■ {startVpnPending ? '...' : 'Stop'}
              </button>
            ) : (
              <button
                className="neo-btn neo-btn-sm"
                onClick={handleStartVpn}
                disabled={startVpn.isPending}
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  borderColor: 'var(--accent-emerald)',
                  color: 'var(--accent-emerald)',
                  opacity: startVpn.isPending ? 0.5 : 1,
                }}
              >
                ▶ Start
              </button>
            )}
          </>
        )}

        {/* WS status */}
        <div className="ml-auto flex items-center gap-1.5">
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: wsConnected ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
            }}
          />
          <span
            style={{ fontSize: 9, fontFamily: 'var(--font-code)', color: 'var(--text-tertiary)' }}
          >
            {wsConnected ? 'LIVE' : 'offline'}
          </span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: 'var(--bg-secondary)', borderBottom: 'var(--nb-border)' }}
      >
        <input
          key={`url-${pollKey}`}
          type="text"
          placeholder={`filter ${trafficFlows.length} reqs...`}
          value={urlFilter}
          onChange={(e) => setUrlFilter(e.target.value)}
          className="neo-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <select
          key={`method-${pollKey}`}
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="neo-input"
          style={{ width: 90, fontSize: 10 }}
        >
          <option value="ALL">ALL</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select
          key={`status-${pollKey}`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="neo-input"
          style={{ width: 90, fontSize: 10 }}
        >
          <option value="ALL">ALL</option>
          <option value="2">2xx</option>
          <option value="3">3xx</option>
          <option value="4">4xx</option>
          <option value="5">5xx</option>
        </select>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1.5px solid var(--border-subtle)',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--font-code)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--accent-cyan)' }}>{rows.length}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>/</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{trafficFlows.length}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto tree-scroll">
        {rows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg
              className="w-8 h-8 opacity-20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 11 }}>
              {proxyMode === 'app'
                ? isRunning
                  ? 'no matching requests'
                  : 'start proxy to capture'
                : vpnRunning
                  ? 'no matching requests'
                  : 'start VPN to capture all traffic'}
            </span>
          </div>
        ) : (
          <table
            key={`table-${pollKey}-${methodFilter}-${statusFilter}-${urlFilter}`}
            className="w-full"
            style={{ borderCollapse: 'collapse' }}
          >
            <thead>
              <tr
                style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 0, zIndex: 10 }}
              >
                {['Method', 'Endpoint', 'Status', 'Time'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 10px',
                      textAlign: i >= 2 ? 'center' : 'left',
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--text-label)',
                      borderBottom: 'var(--nb-border)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((flow) => {
                const sel = selectedFlowId === flow.id;
                const mc = METHOD_COLORS[String(flow.request.method).toUpperCase()] || {
                  bg: 'rgba(107,107,120,0.1)',
                  text: 'var(--text-tertiary)',
                };
                return (
                  <tr
                    key={flow.id}
                    onClick={() => setSelectedFlowId(sel ? null : flow.id)}
                    className="cursor-pointer"
                    style={{
                      background: sel ? 'rgba(0,229,204,0.06)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={(e) => {
                      if (!sel)
                        (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '4px 10px', width: 72 }}>
                      <span
                        className="inline-flex px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: mc.bg,
                          color: mc.text,
                          fontSize: 9,
                          fontFamily: 'var(--font-code)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {flow.request.method}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '4px 10px',
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 10,
                        fontFamily: 'var(--font-code)',
                        color: sel ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      }}
                    >
                      {flow.request.url.replace(/^https?:\/\//, '')}
                    </td>
                    <td style={{ padding: '4px 10px', textAlign: 'center', width: 56 }}>
                      {flow.response ? (
                        <span
                          className="font-bold"
                          style={{ fontSize: 10, color: statusColor(flow.response.status_code) }}
                        >
                          {flow.response.status_code}
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '4px 10px',
                        textAlign: 'right',
                        width: 56,
                        fontSize: 9,
                        fontFamily: 'var(--font-code)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {flow.duration_ms > 0 ? `${flow.duration_ms}ms` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail drawer ── */}
      {selectedFlowId &&
        (() => {
          const flow = trafficFlows.find((f) => f.id === selectedFlowId);
          if (!flow) return null;
          const mc = METHOD_COLORS[String(flow.request.method).toUpperCase()] || {
            bg: '',
            text: '',
          };
          return (
            <div
              style={{
                borderTop: 'var(--nb-border)',
                background: 'var(--bg-secondary)',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderBottom: '2px solid var(--border-default)',
                  position: 'sticky',
                  top: 0,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="px-1.5 py-0.5 rounded font-bold"
                    style={{
                      background: mc.bg,
                      color: mc.text,
                      fontSize: 9,
                      fontFamily: 'var(--font-code)',
                    }}
                  >
                    {flow.request.method}
                  </span>
                  <span
                    className="truncate"
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-code)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {flow.request.url}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {flow.response && (
                    <span
                      className="px-1.5 py-0.5 rounded font-bold"
                      style={{
                        background: `${statusColor(flow.response.status_code)}20`,
                        color: statusColor(flow.response.status_code),
                        fontSize: 10,
                      }}
                    >
                      {flow.response.status_code} {flow.response.reason}
                    </span>
                  )}
                  {flow.duration_ms > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-code)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {flow.duration_ms}ms
                    </span>
                  )}
                </div>
              </div>
              <DetailRow
                label="Request Headers"
                body={JSON.stringify(flow.request.headers, null, 2)}
              />
              {flow.request.body && (
                <DetailRow label="Request Body" body={String(flow.request.body)} />
              )}
              {flow.response && (
                <DetailRow
                  label="Response Body"
                  body={JSON.stringify(flow.response.body ?? '', null, 2)}
                />
              )}
            </div>
          );
        })()}

      {/* ── Action bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: 'var(--bg-secondary)', borderTop: 'var(--nb-border)' }}
      >
        <button
          className="neo-btn neo-btn-sm"
          onClick={() => setShowCert((v) => !v)}
          style={{
            background: showCert ? 'rgba(0,229,204,0.1)' : 'var(--bg-tertiary)',
            borderColor: showCert ? 'var(--accent-cyan)' : 'var(--border-default)',
            color: showCert ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          }}
        >
          🔒 Cert
        </button>
        <button
          className="neo-btn neo-btn-sm"
          onClick={() => setShowInfo((v) => !v)}
          style={{
            background: showInfo ? 'rgba(0,229,204,0.1)' : 'var(--bg-tertiary)',
            borderColor: showInfo ? 'var(--accent-cyan)' : 'var(--border-default)',
            color: showInfo ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          }}
        >
          ℹ Info
        </button>
        <button
          className="neo-btn neo-btn-sm"
          onClick={clearTraffic}
          style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-subtle)' }}
        >
          ✕ Clear
        </button>
      </div>

      {/* ── Cert panel ── */}
      {showCert && (
        <div
          className="px-4 py-3"
          style={{ borderTop: 'var(--nb-border)', background: 'var(--bg-tertiary)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ background: 'rgba(0,229,204,0.1)', border: '2px solid var(--accent-cyan)' }}
            >
              <svg
                className="w-4 h-4"
                style={{ color: 'var(--accent-cyan)' }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 11 }}>MITM CA Certificate</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                Required for HTTPS decryption
              </div>
            </div>
          </div>
          <button
            className="neo-btn neo-btn-sm w-full mb-3"
            onClick={handleCert}
            disabled={installCert.isPending}
            style={{
              background: 'rgba(37,99,235,0.1)',
              borderColor: 'var(--accent-blue)',
              color: 'var(--accent-blue)',
              justifyContent: 'center',
              display: 'flex',
              gap: 6,
            }}
          >
            {installCert.isPending ? 'Pushing...' : 'Push to Device'}
          </button>
          {installCert.data && (
            <pre
              className="text-[10px] p-2 rounded"
              style={{
                background: 'var(--bg-primary)',
                border: '1.5px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-code)',
              }}
            >
              {installCert.data.note ||
                installCert.data.error ||
                JSON.stringify(installCert.data, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ── Info panel ── */}
      {showInfo && networkInfo && (
        <div
          className="px-4 py-3"
          style={{ borderTop: 'var(--nb-border)', background: 'var(--bg-tertiary)' }}
        >
          <div
            className="text-[9px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-label)' }}
          >
            Network
          </div>
          {(networkInfo.ip_addresses as { address: string; iface: string }[] | undefined)?.map((ip, i) => (
            <div
              key={i}
              className="text-[10px] font-code mb-1"
              style={{ color: 'var(--accent-cyan)' }}
            >
              {ip.address} <span style={{ color: 'var(--text-tertiary)' }}>({ip.iface})</span>
            </div>
          ))}
          {(networkInfo.dns as string[])?.map((d, i: number) => (
            <div
              key={i}
              className="text-[10px] font-code"
              style={{ color: 'var(--text-secondary)' }}
            >
              {d}
            </div>
          ))}
          {!networkInfo.ip_addresses?.length && !networkInfo.dns?.length && (
            <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              no info available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
