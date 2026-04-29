import { PropertyRow } from "./PropertyRow";
import { LocatorPanel } from "./LocatorPanel";
import { EmptyState } from "./EmptyState";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";

const _ = (v: unknown, fallback = "-"): string => {
  if (v === undefined || v === null) return fallback as string;
  return String(v);
};

function SectionHeader({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div
      className="flex items-center gap-2 pt-3 pb-1"
      style={{ borderBottom: isDark ? '1px solid #27272a' : '1px solid #e5e5e5' }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: isDark ? '#52525b' : '#999999' }}
      >
        {label}
      </span>
    </div>
  );
}

export function PropertiesPanel() {
  const { hoveredNode, selectedNode, lockedNode } = useHierarchyStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const displayNode = lockedNode || selectedNode || hoveredNode;

  if (!displayNode) {
    return (
      <EmptyState
        icon="element"
        title="No element selected"
        description="Hover or click an element to inspect its properties"
        isDark={isDark}
      />
    );
  }

  const node = displayNode;

  // Identity fields
  const identityRows: React.ReactNode[] = [];
  if (node?.className) {
    identityRows.push(
      <PropertyRow
        key="class"
        label="class"
        value={node.className.split('.').pop() ?? "-"}
        isDark={isDark}
      >
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
      </PropertyRow>
    );
  }
  identityRows.push(
    <PropertyRow key="package" label="package" value={_(node?.package)} valueColor={isDark ? '#fb923c' : '#c2410c'} isDark={isDark} />,
    <PropertyRow key="resource-id" label="resource-id" value={node?.resourceId ? `#${node.resourceId}` : "-"} valueColor={isDark ? '#00e5cc' : '#0c4a6e'} isDark={isDark} />,
    <PropertyRow key="text" label="text" value={node?.text ? `"${node.text}"` : "-"} valueColor={isDark ? '#fde047' : '#b45309'} italic isDark={isDark} />,
    <PropertyRow key="content-desc" label="content-desc" value={_(node?.contentDesc)} valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />,
    <PropertyRow key="label" label="label" value={node?.label ? `"${node.label}"` : "-"} valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />
  );

  // State toggles
  const stateRows: React.ReactNode[] = [];
  if (node?.enabled !== undefined) stateRows.push(<PropertyRow key="enabled" label="enabled" value={_(node?.enabled)} valueColor={isDark ? '#a3e635' : '#15803d'} isDark={isDark} />);
  if (node?.focused !== undefined) stateRows.push(<PropertyRow key="focused" label="focused" value={node?.focused ? "true" : "false"} valueColor={isDark ? '#f87171' : '#dc2626'} isDark={isDark} />);
  if (node?.clickable !== undefined) stateRows.push(<PropertyRow key="clickable" label="clickable" value={node?.clickable ? "true" : "false"} valueColor={isDark ? '#f472b6' : '#be185d'} isDark={isDark} />);
  if (node?.scrollable !== undefined) stateRows.push(<PropertyRow key="scrollable" label="scrollable" value={node?.scrollable ? "true" : "false"} valueColor={isDark ? '#67e8f9' : '#0891b2'} isDark={isDark} />);
  if (node?.checkable !== undefined) stateRows.push(<PropertyRow key="checkable" label="checkable" value={node?.checkable ? "true" : "false"} valueColor={isDark ? '#c4b5fd' : '#7c3aed'} isDark={isDark} />);
  if (node?.checked !== undefined) stateRows.push(<PropertyRow key="checked" label="checked" value={_(node?.checked)} valueColor={isDark ? '#fb7185' : '#e11d48'} isDark={isDark} />);
  if (node?.selected !== undefined) stateRows.push(<PropertyRow key="selected" label="selected" value={node?.selected ? "true" : "false"} valueColor={isDark ? '#4ade80' : '#16a34a'} isDark={isDark} />);
  if (node?.longClickable !== undefined) stateRows.push(<PropertyRow key="long-clickable" label="long-clickable" value={node?.longClickable ? "true" : "false"} valueColor={isDark ? '#e879f9' : '#c026d3'} isDark={isDark} />);
  if (node?.focusable !== undefined) stateRows.push(<PropertyRow key="focusable" label="focusable" value={node?.focusable ? "true" : "false"} valueColor={isDark ? '#fbbf24' : '#b45309'} isDark={isDark} />);
  if (node?.password !== undefined) stateRows.push(<PropertyRow key="password" label="password" value={node?.password ? "true" : "false"} valueColor={isDark ? '#fbbf24' : '#b45309'} isDark={isDark} />);
  if (node?.visibleToUser !== undefined) stateRows.push(<PropertyRow key="visible-to-user" label="visible-to-user" value={_(node?.visibleToUser)} valueColor={isDark ? '#a78bfa' : '#5b21b6'} isDark={isDark} />);

  return (
    <div
      className="px-4 py-3 space-y-1"
      style={{
        background: isDark ? '#111114' : '#ffffff',
        borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
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

      <SectionHeader label="Identity" isDark={isDark} />
      <div className="space-y-0.5">{identityRows}</div>

      {stateRows.length > 0 && (
        <>
          <SectionHeader label="State" isDark={isDark} />
          <div className="space-y-0.5">{stateRows}</div>
        </>
      )}

      {node?.bounds && (
        <>
          <SectionHeader label="Geometry" isDark={isDark} />
          <PropertyRow
            label="bounds"
            value={`[${node.bounds.x}, ${node.bounds.y}, ${node.bounds.width}x${node.bounds.height}]`}
            valueColor={isDark ? '#10b981' : '#047857'}
            isDark={isDark}
          />
        </>
      )}

      <LocatorPanel />
    </div>
  );
}
