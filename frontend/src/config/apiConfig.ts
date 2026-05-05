/**
 * Centralized API configuration for InspectorPlus.
 * Supports runtime overrides via localStorage, falling back to build-time env vars.
 */

const API_URL_STORAGE_KEY = "inspector-plus-api-url";
const MCP_URL_STORAGE_KEY = "inspector-plus-mcp-url";
const DEFAULT_API_URL = "http://localhost:8001";
const DEFAULT_MCP_URL = "http://localhost:8002";

// --- Backend API URL ---

function getStoredApiUrl(): string | null {
  try {
    return localStorage.getItem(API_URL_STORAGE_KEY);
  } catch {
    return null;
  }
}

let _apiUrl: string = getStoredApiUrl() ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

export function getApiUrl(): string {
  return _apiUrl;
}

export function setApiUrl(url: string): void {
  _apiUrl = url;
  try {
    localStorage.setItem(API_URL_STORAGE_KEY, url);
  } catch {}
}

export function resetApiUrl(): void {
  _apiUrl = import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
  try {
    localStorage.removeItem(API_URL_STORAGE_KEY);
  } catch {}
}

// --- MCP Server URL ---

export function getMcpUrl(): string {
  try {
    return localStorage.getItem(MCP_URL_STORAGE_KEY) ?? DEFAULT_MCP_URL;
  } catch {
    return DEFAULT_MCP_URL;
  }
}

export function setMcpUrl(url: string): void {
  try {
    localStorage.setItem(MCP_URL_STORAGE_KEY, url);
  } catch {}
}

export function resetMcpUrl(): void {
  try {
    localStorage.removeItem(MCP_URL_STORAGE_KEY);
  } catch {}
}
