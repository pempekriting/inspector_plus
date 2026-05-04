import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHierarchyStore } from '../stores/hierarchyStore';
import { useThemeStore } from '../stores/themeStore';
import { getImageLayout } from '../utils/layoutGeometry';
import type { UiNode } from '../types/shared';

// ─── Color map by widget class prefix ─────────────────────────────────────────
// Covers both Android (android.widget.*) and iOS (XCUIElementType*) element types
const CLASS_COLORS: Record<string, { border: string; fill: string }> = {
  // Android / shared interactive — vivid high-contrast colors
  Button:          { border: 'var(--accent-cyan)', fill: 'transparent' },  // cyan
  TextView:       { border: '#ff6b6b', fill: 'transparent' },  // red - stands out
  EditText:       { border: '#a78bfa', fill: 'transparent' },  // purple
  ImageView:      { border: '#f472b6', fill: 'transparent' },  // pink
  CheckBox:       { border: '#34d399', fill: 'transparent' },  // green
  RadioButton:    { border: '#fbbf24', fill: 'transparent' },  // yellow
  Switch:         { border: '#60a5fa', fill: 'transparent' },  // blue
  // Android layout containers — sky blue, consistent
  LinearLayout:   { border: '#0ea5e9', fill: 'transparent' },
  RelativeLayout: { border: '#0ea5e9', fill: 'transparent' },
  FrameLayout:    { border: '#0ea5e9', fill: 'transparent' },
  ConstraintLayout:{ border: '#0ea5e9', fill: 'transparent' },
  RecyclerView:   { border: '#ff9f43', fill: 'transparent' },  // orange
  ListView:       { border: '#ff9f43', fill: 'transparent' },  // orange
  WebView:        { border: '#86efac', fill: 'transparent' },  // green
  Surface:        { border: '#fdba74', fill: 'transparent' },  // light orange
  Toolbar:        { border: '#e879f9', fill: 'transparent' },  // fuchsia
  BottomNavigation:{ border: '#e879f9', fill: 'transparent' },
  TabLayout:      { border: '#c084fc', fill: 'transparent' },  // purple
  // iOS XCUIElementType* equivalents
  TextField:      { border: '#a78bfa', fill: 'transparent' },
  SecureTextField:{ border: '#a78bfa', fill: 'transparent' },
  StaticText:     { border: '#ff6b6b', fill: 'transparent' },  // red
  Icon:          { border: '#f472b6', fill: 'transparent' },  // pink
  Cell:           { border: '#34d399', fill: 'transparent' },  // green
  TableGroup:     { border: '#0ea5e9', fill: 'transparent' },  // sky blue
  Other:         { border: '#f472b6', fill: 'transparent' },  // pink
  NavigationBar:  { border: '#e879f9', fill: 'transparent' },
  TabBar:        { border: '#e879f9', fill: 'transparent' },
  SearchField:   { border: '#a78bfa', fill: 'transparent' },
  Keyboard:      { border: '#60a5fa', fill: 'transparent' },
};

const DEFAULT_COLOR = { border: '#f472b6', fill: 'transparent' };

// Layout container class names — these should be very subtle so colorful interactive
// elements pop. Android deep hierarchies cause many stacked layout boxes otherwise.
const LAYOUT_CLASSES = new Set([
  'LinearLayout', 'RelativeLayout', 'FrameLayout', 'ConstraintLayout',
  'GridLayout', 'TableLayout', 'AbsoluteLayout', 'SlidingDrawer',
  'TableGroup', 'Other', 'Keyboard',
]);

function isLayoutClass(className: string | undefined) {
  if (!className) return false;
  // Android widget class names contain dots, iOS XCUIElementType* do not
  if (className.includes('.')) {
    const short = className.split('.').pop() || '';
    return LAYOUT_CLASSES.has(short);
  }
  // iOS types
  return LAYOUT_CLASSES.has(className);
}

function getClassColor(className: string | undefined) {
  if (!className) return DEFAULT_COLOR;
  for (const [prefix, color] of Object.entries(CLASS_COLORS)) {
    if (className.includes(prefix)) return color;
  }
  return DEFAULT_COLOR;
}

function depthOpacity(depth: number, isLayout: boolean) {
  // Layout containers: visible but not dominant
  if (isLayout) {
    if (depth <= 1) return 0.25;
    if (depth <= 3) return 0.18;
    if (depth <= 5) return 0.12;
    return 0.08;
  }
  // Interactive elements: high opacity for clear visibility on any background
  if (depth <= 7) return 0.90;
  return 0.75;
}

function nodeLabel(node: UiNode): string {
  const cls = (node.className || '').split('.').pop() || '';
  const rid = node.resourceId || '';
  const idPart = rid.includes('/') ? rid.split('/').pop() : rid;
  return idPart ? `${cls}#${idPart}` : cls;
}

// ─── LayoutNode ───────────────────────────────────────────────────────────────
interface LayoutNodeProps {
  node: UiNode;
  depth: number;
  scale: number;
  imgLeft: number;
  imgTop: number;
  zoom: number;
  pan: { x: number; y: number };
  isDark: boolean;
  onHover: (id: string | null) => void;
  onClick: (node: UiNode) => void;
  localHoveredId: string | null;
}

const LayoutNode = memo(function LayoutNode({
  node, depth, scale, imgLeft, imgTop, zoom, pan, isDark, onHover, onClick, localHoveredId,
}: LayoutNodeProps) {
  // Root node from hierarchy API has no bounds (it's a wrapper).
  // Render children at the same depth so the actual UI elements show.
  if (!node.bounds) {
    return (
      <>
        {node.children?.map(child => (
          <LayoutNode key={child.id} node={child} depth={depth} scale={scale}
            imgLeft={imgLeft} imgTop={imgTop} zoom={zoom} pan={pan} isDark={isDark}
            onHover={onHover} onClick={onClick} localHoveredId={localHoveredId} />
        ))}
      </>
    );
  }
  const { x, y, width, height } = node.bounds;
  const color = getClassColor(node.className);
  const isLayout = isLayoutClass(node.className);
  const opacity = depthOpacity(depth, isLayout);
  // Apply zoom and pan to match the CSS transform on the inner canvas div
  const left = (imgLeft + x * scale) * zoom + pan.x / zoom;
  const top = (imgTop + y * scale) * zoom + pan.y / zoom;
  const w = width * scale * zoom;
  const h = height * scale * zoom;
  if (w < 1 || h < 1) return null;

  const isHovered = localHoveredId === node.id;

  return (
    <>
      <div
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onClick(node)}
        style={{
          position: 'absolute',
          left: `${left}px`, top: `${top}px`,
          width: `${w}px`, height: `${h}px`,
          border: `${isHovered ? 3 : 2}px solid ${isHovered ? '#ffffff' : color.border}`,
          backgroundColor: 'transparent',
          opacity, borderRadius: 2,
          boxShadow: `0 0 6px ${color.border}88`,
          pointerEvents: 'auto', cursor: 'pointer',
          contain: 'layout',
        }}
      >
        {w > 40 && h > 18 && (
          <div style={{
            position: 'absolute', top: 2, left: 3,
            fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            opacity: 0.85, lineHeight: 1, pointerEvents: 'none',
            whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', maxWidth: `${w - 6}px`,
          }}>
            {nodeLabel(node)}
          </div>
        )}
      </div>
      {node.children?.map(child => (
        <LayoutNode key={child.id} node={child} depth={depth + 1} scale={scale}
          imgLeft={imgLeft} imgTop={imgTop} zoom={zoom} pan={pan} isDark={isDark}
          onHover={onHover} onClick={onClick} localHoveredId={localHoveredId} />
      ))}
    </>
  );
});

// ─── Blueprint Grid ───────────────────────────────────────────────────────────
function BlueprintGrid({ zoom, pan, isDark }: { zoom: number; pan: { x: number; y: number }; isDark: boolean }) {
  const size = 40 * zoom;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `linear-gradient(${isDark ? '#1a1a2e' : '#e5e7eb'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? '#1a1a2e' : '#e5e7eb'} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${pan.x / zoom}px ${pan.y / zoom}px`,
      backgroundColor: isDark ? '#0a0a0f' : '#f8f9fa',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}

// ─── Mode Badge ───────────────────────────────────────────────────────────────
function ModeBadge({ isDark }: { isDark: boolean }) {
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 30,
      padding: '4px 8px', borderRadius: 4,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
      background: isDark ? 'rgba(0, 245, 212, 0.15)' : 'rgba(0, 102, 204, 0.10)',
      border: `1.5px solid ${isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)'}`,
      color: isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)',
      pointerEvents: 'none',
    }}>
      LAYOUT MODE
    </div>
  );
}

// ─── Legend ─────────────────────────────────────────────────────────────────
function Legend({ isDark }: { isDark: boolean }) {
  const items = [
    { label: 'Button / TextView', color: 'var(--accent-cyan)' },
    { label: 'EditText', color: '#a78bfa' },
    { label: 'ImageView', color: '#f472b6' },
    { label: 'Layouts', color: '#64748b' },
    { label: 'RecyclerView', color: '#fcd34d' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 48, right: 12, zIndex: 30,
      padding: '6px 8px', borderRadius: 6,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
      background: isDark ? 'rgba(26, 26, 31, 0.92)' : 'rgba(255, 255, 255, 0.92)',
      border: `1px solid ${isDark ? '#3f3f46' : '#d4d4d4'}`,
      backdropFilter: 'blur(8px)', pointerEvents: 'none',
    }}>
      {items.map(({ label, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 2, background: color, opacity: 0.8, border: `1px solid ${color}`, flexShrink: 0 }} />
          <span style={{ color: isDark ? '#71717a' : '#666666', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ title, subtitle, isDark }: { title: string; subtitle: string; isDark: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: isDark ? 'rgba(10, 10, 15, 0.85)' : 'rgba(248, 249, 250, 0.85)',
      backdropFilter: 'blur(4px)',
    }}>
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none"
        stroke={isDark ? '#4a4a55' : '#d4d4d4'} strokeWidth={1.5} style={{ marginBottom: 12 }}>
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: isDark ? '#71717a' : '#666666' }}>{title}</p>
      <p style={{ fontSize: 11, color: isDark ? '#52525b' : '#999999' }}>{subtitle}</p>
    </div>
  );
}

// ─── Main Component (Portal) ─────────────────────────────────────────────────
interface LayoutOverlayProps {
  canvasRef: HTMLDivElement | null;
  zoom: number;
  pan: { x: number; y: number };
}

export function LayoutBoundsOverlay({ canvasRef, zoom, pan }: LayoutOverlayProps) {
  const { uiTree, hoveredNode, selectedNode, lockedNode, setSelectedNode, lockSelection } = useHierarchyStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [localHoveredId, setLocalHoveredId] = useState<string | null>(null);

  // Poll getImageLayout until screenshot is loaded
  const [layout, setLayout] = useState<{ imgLeft: number; imgTop: number; scale: number } | null>(null);

  useEffect(() => {
    if (!canvasRef) return;

    const updateLayout = () => {
      const result = getImageLayout();
      if (result) setLayout(result);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    const interval = setInterval(updateLayout, 250);
    return () => {
      window.removeEventListener('resize', updateLayout);
      clearInterval(interval);
    };
  }, [canvasRef]);

  const handleHover = useCallback((id: string | null) => setLocalHoveredId(id), []);
  const handleClick = useCallback((node: UiNode) => {
    setSelectedNode(node);
    lockSelection(node);
  }, [setSelectedNode, lockSelection]);

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!uiTree) {
    return createPortal(
      <EmptyState title="No hierarchy data" subtitle="Connect a device and refresh to load layout" isDark={isDark} />,
      document.body
    );
  }

  if (!layout) {
    return createPortal(
      <EmptyState title="Waiting for screenshot..." subtitle="Capturing screenshot to show layout boxes" isDark={isDark} />,
      document.body
    );
  }

  // Get canvas viewport position for Portal positioning
  const canvasRect = canvasRef?.getBoundingClientRect();
  const portalLeft = canvasRect?.left ?? 0;
  const portalTop = canvasRect?.top ?? 0;
  const portalWidth = canvasRect?.width ?? 0;
  const portalHeight = canvasRect?.height ?? 0;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: portalLeft,
        top: portalTop,
        width: portalWidth,
        height: portalHeight,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Blueprint grid */}
      <BlueprintGrid zoom={zoom} pan={pan} isDark={isDark} />

      {/* Mode badge */}
      <ModeBadge isDark={isDark} />

      {/* Legend */}
      <Legend isDark={isDark} />

      {/* Bounding boxes — pointer events enabled */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <LayoutNode
          node={uiTree}
          depth={0}
          scale={layout.scale}
          imgLeft={layout.imgLeft}
          imgTop={layout.imgTop}
          zoom={zoom}
          pan={pan}
          isDark={isDark}
          onHover={handleHover}
          onClick={handleClick}
          localHoveredId={localHoveredId}
        />
      </div>
    </div>,
    document.body
  );
}
