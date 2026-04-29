import { useState } from "react";
import { PropertyRow } from "./PropertyRow";
import { StylePanel } from "./StylePanel";
import { LocatorPanel } from "./LocatorPanel";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";
import { inputDeviceText } from "../hooks/useDevice";

const _ = (v: unknown, fallback = "-"): string => {
  if (v === undefined || v === null) return fallback as string;
  return String(v);
};

export function PropertiesPanel() {
  const { hoveredNode, selectedNode, lockedNode, triggerHierarchyRefresh } = useHierarchyStore();
  const { theme } = useThemeStore();
  const [inputText, setInputText] = useState('');
  const isDark = theme === 'dark';

  // Priority: lockedNode (persistent) > selectedNode (clicked) > hoveredNode (hover preview)
  const displayNode = lockedNode || selectedNode || hoveredNode;

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    await inputDeviceText(inputText, displayNode?.className ? undefined : undefined);
    setInputText('');

  };

  const isEditText = displayNode?.className?.includes('EditText');

  if (!displayNode) {
    return (
      <div
        className="px-4 py-3"
        style={{
          background: isDark ? '#111114' : '#ffffff',
          borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#71717a' : '#666666' }}>
            Properties
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-6 gap-4">
          {[
            ["class", "-"],
            ["content-desc", "-"],
            ["label", "-"],
            ["value", "-"],
            ["name", "-"],
            ["text", "-"],
            ["bounds", "-"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? '#52525b' : '#999999' }}>{label}</span>
              <span className="text-[11px] font-mono" style={{ color: isDark ? '#3f3f46' : '#cccccc' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const node = displayNode;

  return (
    <div
      className="px-4 py-3 space-y-1"
      style={{
        background: isDark ? '#111114' : '#ffffff',
        borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#71717a' : '#666666' }}>
          Properties
        </span>
        {lockedNode && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
            style={{
              background: 'rgba(251, 191, 36, 0.2)',
              color: '#fbbf24',
              border: '2px solid #fbbf24',
            }}
          >
            Locked
          </span>
        )}
      </div>

      {/* Always-visible static property rows */}
      <PropertyRow
        label="class"
        value={node?.className ? node.className.split('.').pop() ?? "-" : "-"}
        isDark={isDark}
      >
        {node?.className && (
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-bold font-mono"
            style={{
              background: isDark ? '#1f1f23' : '#f0f0f0',
              color: isDark ? '#e4e4e7' : '#1a1a1a',
              border: isDark ? '1px solid #3f3f46' : '1px solid #cccccc',
            }}
          >
            {node.className.split('.').pop()}
          </span>
        )}
      </PropertyRow>

      <PropertyRow label="package"     value={_(node?.package)}    valueColor={isDark ? '#fb923c' : '#c2410c'} isDark={isDark} />
      <PropertyRow label="resource-id" value={node?.resourceId ? `#${node.resourceId}` : "-"} valueColor={isDark ? '#00e5cc' : '#0c4a6e'} isDark={isDark} />
      <PropertyRow label="content-desc" value={_(node?.contentDesc)} valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />
      <PropertyRow label="label"       value={node?.label ? `"${node.label}"` : "-"}       valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />
      <PropertyRow label="value"       value={_(node?.value)}       valueColor={isDark ? '#fde047' : '#b45309'} isDark={isDark} />
      <PropertyRow label="name"        value={_(node?.name)}        valueColor={isDark ? '#fde047' : '#b45309'} isDark={isDark} />
      <PropertyRow label="text"       value={node?.text ? `"${node.text}"` : "-"} valueColor={isDark ? '#fde047' : '#b45309'} italic isDark={isDark} />
      <PropertyRow
        label="bounds"
        value={node?.bounds ? `[${node.bounds.x}, ${node.bounds.y}, ${node.bounds.width}x${node.bounds.height}]` : "-"}
        valueColor={isDark ? '#10b981' : '#047857'}
        isDark={isDark}
      />

      {/* Boolean attributes - only show when explicitly true or present */}
      {node?.clickable !== undefined && (
        <PropertyRow label="clickable"      value={node?.clickable ? "true" : "false"}      valueColor={isDark ? '#f472b6' : '#be185d'} isDark={isDark} />
      )}
      {node?.enabled !== undefined && (
        <PropertyRow label="enabled"        value={_(node?.enabled)}                       valueColor={isDark ? '#a3e635' : '#15803d'} isDark={isDark} />
      )}
      {node?.focusable !== undefined && (
        <PropertyRow label="focusable"      value={node?.focusable ? "true" : "false"}       valueColor={isDark ? '#fbbf24' : '#b45309'} isDark={isDark} />
      )}
      {node?.focused !== undefined && (
        <PropertyRow label="focused"        value={node?.focused ? "true" : "false"}         valueColor={isDark ? '#f87171' : '#dc2626'} isDark={isDark} />
      )}
      {node?.scrollable !== undefined && (
        <PropertyRow label="scrollable"     value={node?.scrollable ? "true" : "false"}     valueColor={isDark ? '#67e8f9' : '#0891b2'} isDark={isDark} />
      )}
      {node?.checkable !== undefined && (
        <PropertyRow label="checkable"      value={node?.checkable ? "true" : "false"}       valueColor={isDark ? '#c4b5fd' : '#7c3aed'} isDark={isDark} />
      )}
      {node?.checked !== undefined && (
        <PropertyRow label="checked"        value={_(node?.checked)}                        valueColor={isDark ? '#fb7185' : '#e11d48'} isDark={isDark} />
      )}
      {node?.selected !== undefined && (
        <PropertyRow label="selected"       value={node?.selected ? "true" : "false"}       valueColor={isDark ? '#4ade80' : '#16a34a'} isDark={isDark} />
      )}
      {node?.longClickable !== undefined && (
        <PropertyRow label="long-clickable" value={node?.longClickable ? "true" : "false"}  valueColor={isDark ? '#e879f9' : '#c026d3'} isDark={isDark} />
      )}
      {node?.password !== undefined && (
        <PropertyRow label="password"       value={node?.password ? "true" : "false"}        valueColor={isDark ? '#fbbf24' : '#b45309'} isDark={isDark} />
      )}
      {node?.visibleToUser !== undefined && (
        <PropertyRow label="visible-to-user" value={_(node?.visibleToUser)}                valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />
      )}

      {/* Input Text */}
      <div className="mt-3 pt-3" style={{ borderTop: isDark ? '2px solid #27272a' : '2px solid #e5e5e5' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: isDark ? '#71717a' : '#666666' }}>
          Input Text
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder={isEditText ? "Enter text..." : "Select EditText to input"}
            disabled={!isEditText}
            className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isDark ? '#1f1f23' : '#ffffff',
              color: isDark ? '#e4e4e7' : '#1a1a1a',
              border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
            }}
          />
          <button
            onClick={handleSendText}
            disabled={!inputText.trim() || !isEditText}
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: (inputText.trim() && isEditText) ? (isDark ? '#00f5d4' : '#0066cc') : (isDark ? '#3f3f46' : '#e5e5e5'),
              color: (inputText.trim() && isEditText) ? (isDark ? '#0a0a0c' : '#ffffff') : (isDark ? '#71717a' : '#999999'),
              border: `2px solid ${(inputText.trim() && isEditText) ? (isDark ? '#00f5d4' : '#0066cc') : (isDark ? '#3f3f46' : '#e5e5e5')}`,
              cursor: (inputText.trim() && isEditText) ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>

      <StylePanel styles={displayNode?.styles} />

      {/* Inline Locators — generated instantly on selection, no API call needed */}
      <LocatorPanel />
    </div>
  );
}