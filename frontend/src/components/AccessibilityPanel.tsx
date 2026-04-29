import { useState, memo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";
import type { UiNode } from "../types/shared";

interface AccessibilityIssue {
  nodeId: string;
  check: string;
  severity: "high" | "medium" | "low";
  description: string;
  element: Record<string, unknown>;
}

interface AuditResult {
  timestamp: string;
  totalNodes: number;
  issues: AccessibilityIssue[];
  summary: { high: number; medium: number; low: number };
}

export function useAccessibilityAudit() {
  return useMutation({
    mutationFn: async (): Promise<AuditResult> => {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";
      const res = await fetch(`${API_BASE}/hierarchy/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Audit failed: ${res.status}`);
      return res.json();
    },
  });
}

const SEVERITY_ICONS = {
  high: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  medium: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>
  ),
  low: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v.01M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
};

const SEVERITY_COLORS = {
  high: { bg: "rgba(251,113,133,0.15)", border: "#fb7185", text: "#fb7185" },
  medium: { bg: "rgba(251,191,36,0.15)", border: "#fbbf24", text: "#fbbf24" },
  low: { bg: "rgba(52,211,153,0.15)", border: "#34d399", text: "#34d399" },
};

const CHECK_LABELS: Record<string, string> = {
  contrast: "Contrast",
  touch_target: "Touch Target",
  missing_label: "Missing Label",
  duplicate_text: "Duplicate Text",
  text_overflow: "Text Overflow",
};

export const AccessibilityPanel = memo(function AccessibilityPanel() {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const { setSelectedNode, setHoveredNode, uiTree } = useHierarchyStore();
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const { mutate: runAudit, isPending: isRunning } = useAccessibilityAudit();

  const handleRunAudit = useCallback(() => {
    if (!uiTree) return;
    runAudit(undefined, {
      onSuccess: (data) => setAuditResult(data),
      onError: () => {},
    });
  }, [runAudit, uiTree]);

  const handleExportReport = useCallback(() => {
    if (!auditResult) return;
    const blob = new Blob([JSON.stringify(auditResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accessibility-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [auditResult]);

  const handleIssueClick = useCallback(
    (issue: AccessibilityIssue) => {
      setSelectedIssue(issue.nodeId === selectedIssue ? null : issue.nodeId);
      if (!uiTree) return;
      const findNode = (node: UiNode, id: string): UiNode | null => {
        if (node.id === id) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = findNode(child, id);
            if (found) return found;
          }
        }
        return null;
      };
      const found = findNode(uiTree, issue.nodeId);
      if (found) {
        setSelectedNode(found as Parameters<typeof setSelectedNode>[0]);
        setHoveredNode(found as Parameters<typeof setSelectedNode>[0]);
      }
    },
    [selectedIssue, setSelectedNode, setHoveredNode, uiTree]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between flex-shrink-0"
        style={{
          background: isDark ? "#18181b" : "#e5e5e5",
          borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" style={{ color: isDark ? "#34d399" : "#059669" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? "#34d399" : "#059669" }}>
            Accessibility Audit
          </span>
        </div>
        <button
          onClick={handleRunAudit}
          disabled={isRunning || !uiTree}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded transition-all active:scale-95"
          style={{
            background: isDark ? "#34d399" : "#059669",
            color: "#ffffff",
            border: isDark ? "2px solid #34d399" : "2px solid #059669",
            boxShadow: isDark ? "2px 2px 0 #000" : "2px 2px 0 #1a1a1a",
            opacity: isRunning || !uiTree ? 0.6 : 1,
          }}
        >
          {isRunning ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {isRunning ? "Running..." : "Run Audit"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!auditResult ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <div
              className="w-16 h-16 flex items-center justify-center mb-4"
              style={{
                background: isDark ? "#18181b" : "#ffffff",
                border: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
                boxShadow: isDark ? "4px 4px 0 #000" : "4px 4px 0 #1a1a1a",
              }}
            >
              <svg className="w-8 h-8" style={{ color: isDark ? "#52525b" : "#999999" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-sm font-bold mb-1" style={{ color: isDark ? "#a1a1aa" : "#4a4a4a" }}>
              Run an audit to check accessibility
            </p>
            <p className="text-[11px] text-center" style={{ color: isDark ? "#71717a" : "#666666" }}>
              Checks contrast, touch targets, missing labels, and more
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Summary */}
            <div
              className="p-2.5 rounded"
              style={{
                background: isDark ? "#1f1f23" : "#ffffff",
                border: isDark ? "2px solid #3f3f46" : "2px solid #1a1a1a",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold" style={{ color: isDark ? "#71717a" : "#666666" }}>
                  Issues: {auditResult.issues.length} total
                </span>
                <span className="text-[10px] font-mono" style={{ color: isDark ? "#52525b" : "#999999" }}>
                  {auditResult.totalNodes} nodes checked
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: SEVERITY_COLORS.high.bg,
                    color: SEVERITY_COLORS.high.text,
                    border: `1.5px solid ${SEVERITY_COLORS.high.border}`,
                  }}
                >
                  {auditResult.summary.high} High
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: SEVERITY_COLORS.medium.bg,
                    color: SEVERITY_COLORS.medium.text,
                    border: `1.5px solid ${SEVERITY_COLORS.medium.border}`,
                  }}
                >
                  {auditResult.summary.medium} Med
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: SEVERITY_COLORS.low.bg,
                    color: SEVERITY_COLORS.low.text,
                    border: `1.5px solid ${SEVERITY_COLORS.low.border}`,
                  }}
                >
                  {auditResult.summary.low} Low
                </span>
              </div>
            </div>

            {/* Export button */}
            <button
              onClick={handleExportReport}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded transition-all active:scale-95"
              style={{
                background: isDark ? "#1f1f23" : "#ffffff",
                color: isDark ? "#a1a1aa" : "#4a4a4a",
                border: isDark ? "2px solid #3f3f46" : "2px solid #1a1a1a",
                boxShadow: isDark ? "2px 2px 0 #000" : "2px 2px 0 #1a1a1a",
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export Report
            </button>

            {/* Issues list grouped by severity */}
            {["high", "medium", "low"].map((severity) => {
              const issues = auditResult.issues.filter((i) => i.severity === severity);
              if (issues.length === 0) return null;
              const colors = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS];
              return (
                <div key={severity}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ color: colors.text }}>{SEVERITY_ICONS[severity as keyof typeof SEVERITY_ICONS]}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>
                      {severity}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: isDark ? "#52525b" : "#999999" }}>
                      {issues.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {issues.map((issue) => {
                      const isSelected = selectedIssue === issue.nodeId;
                      return (
                        <button
                          key={issue.nodeId}
                          onClick={() => handleIssueClick(issue)}
                          className="w-full text-left p-2 rounded transition-all"
                          style={{
                            background: isSelected
                              ? colors.bg
                              : isDark
                              ? "#18181b"
                              : "#f5f5f5",
                            border: `1.5px solid ${isSelected ? colors.border : isDark ? "#3f3f46" : "#e5e5e5"}`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span
                              className="text-[10px] font-bold font-mono"
                              style={{ color: isDark ? "#22d3ee" : "#0066cc" }}
                            >
                              {CHECK_LABELS[issue.check] || issue.check}
                            </span>
                            <span
                              className="text-[9px] font-mono px-1 py-0.5 rounded"
                              style={{
                                background: isDark ? "#27272a" : "#e5e5e5",
                                color: isDark ? "#71717a" : "#999999",
                              }}
                            >
                              {issue.nodeId}
                            </span>
                          </div>
                          <p className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#4a4a4a" }}>
                            {issue.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});