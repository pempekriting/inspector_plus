import { useHierarchyStore } from "../stores/hierarchyStore";
import { useEffect, useState, memo } from "react";
import { useThemeStore } from "../stores/themeStore";
import type { UiCapability } from "../types/shared";

const CAPABILITY_COLORS: Record<string, string> = {
  scroll: "#fbbf24",
  input:  "#a78bfa",
  long:   "#fb923c",
  link:   "#34d399",
};

function capabilityColor(type: string): string {
  return CAPABILITY_COLORS[type] ?? "#6b7280";
}

interface ImageLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  imgLeft: number;
  imgTop: number;
}

function getImageLayout(): ImageLayout | null {
  const img = document.querySelector('.screenshot-img') as HTMLImageElement;
  if (!img?.naturalWidth) return null;

  const container = img.parentElement;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  const imgLeft = imgRect.left;
  const imgTop = imgRect.top;
  const displayWidth = imgRect.width;
  const scale = displayWidth / img.naturalWidth;

  return {
    left: containerRect.left,
    top: containerRect.top,
    width: containerRect.width,
    height: containerRect.height,
    scale,
    imgLeft,
    imgTop,
  };
}

interface HighlightProps {
  bounds: { x: number; y: number; width: number; height: number };
  layout: ImageLayout;
  isDark: boolean;
  locked?: boolean;
}

const HighlightBox = memo(function HighlightBox({ bounds, layout, isDark, locked }: HighlightProps) {
  const left = layout.imgLeft + bounds.x * layout.scale;
  const top = layout.imgTop + bounds.y * layout.scale;
  const width = bounds.width * layout.scale;
  const height = bounds.height * layout.scale;

  const finalWidth = Math.max(width, 6);
  const finalHeight = Math.max(height, 6);

  // Locked: bright yellow border + "SELECTED" badge. Hover/selected: subtle cyan.
  const accentColor = locked ? '#fbbf24' : (isDark ? '#00f5d4' : '#1a1a2e');
  const bgColor = locked
    ? 'rgba(251, 191, 36, 0.20)'
    : (isDark ? 'rgba(0, 245, 212, 0.12)' : 'rgba(26, 26, 46, 0.10)');
  const boxShadow = locked
    ? '0 0 20px rgba(251, 191, 36, 0.6), inset 0 0 14px rgba(251, 191, 36, 0.20)'
    : (isDark
      ? '0 0 16px rgba(0, 245, 212, 0.5), inset 0 0 12px rgba(0, 245, 212, 0.15)'
      : '0 0 12px rgba(26, 26, 46, 0.3), inset 0 0 10px rgba(26, 26, 46, 0.08)');

  return (
    <>
      <div
        data-overlay="highlight"
        data-locked={locked ? 'true' : 'false'}
        data-scale={layout.scale.toFixed(4)}
        data-img-left={layout.imgLeft.toFixed(1)}
        data-img-top={layout.imgTop.toFixed(1)}
        style={{
          position: 'fixed',
          left: `${left}px`,
          top: `${top}px`,
          width: `${finalWidth}px`,
          height: `${finalHeight}px`,
          outline: `2.5px solid ${accentColor}`,
          outlineOffset: '2px',
          borderRadius: '2px',
          background: bgColor,
          boxShadow,
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'left 0.03s linear, top 0.03s linear, width 0.03s linear, height 0.03s linear',
        }}
      />
    </>
  );
});

const InfoTooltip = memo(function InfoTooltip({
  bounds,
  layout,
  node,
  isDark,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  layout: ImageLayout;
  node: any;
  isDark: boolean;
}) {
  const left = layout.imgLeft + (bounds.x + bounds.width) * layout.scale + 12;
  const top = layout.imgTop + bounds.y * layout.scale;

  const accentColor = isDark ? '#00f5d4' : '#1a1a2e';
  const bgColor = isDark ? '#1a1a1f' : '#ffffff';
  const borderColor = isDark ? '#4a4a55' : '#c5c2bb';
  const textPrimary = isDark ? '#f0f0f5' : '#1a1a2e';
  const textTertiary = isDark ? '#6b6b78' : '#7a7a8c';

  return (
    <div
      data-overlay="tooltip"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '4px',
        padding: '6px 10px',
        boxShadow: isDark ? '4px 4px 0 #000' : '4px 4px 0 #1a1a1a',
        minWidth: '100px',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div className="text-[11px] font-bold mb-1" style={{ color: textPrimary, fontFamily: 'JetBrains Mono, monospace' }}>
        {node.className?.split('.').pop()}
      </div>
      {node.resourceId && (
        <div className="text-[10px]" style={{ color: accentColor, fontFamily: 'JetBrains Mono, monospace' }}>
          #{node.resourceId}
        </div>
      )}
      <div className="text-[9px] mt-1" style={{ color: textTertiary, fontFamily: 'JetBrains Mono, monospace' }}>
        [{bounds.x}, {bounds.y}] {bounds.width}x{bounds.height}
      </div>
    </div>
  );
});

interface CapabilityBadgeProps {
  capability: UiCapability;
  left: number;
  top: number;
}

const CapabilityBadge = memo(function CapabilityBadge({
  capability,
  left,
  top,
}: CapabilityBadgeProps) {
  const color = capabilityColor(capability.type);
  return (
    <div
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        background: color,
        opacity: 0.88,
        borderRadius: '3px',
        padding: '2px 5px',
        pointerEvents: 'none',
        zIndex: 10001,
        boxShadow: '1px 1px 0 rgba(0,0,0,0.3)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <span
        className="font-mono text-[9px] font-bold"
        style={{ color: '#0a0a0c' }}
      >
        {capability.badge}
      </span>
    </div>
  );
});

interface CapabilityBadgesProps {
  bounds: { x: number; y: number; width: number; height: number };
  capabilities: UiCapability[];
  layout: ImageLayout;
}

const CapabilityBadges = memo(function CapabilityBadges({
  bounds,
  capabilities,
  layout,
}: CapabilityBadgesProps) {
  if (!capabilities || capabilities.length === 0) return null;

  const imgRight = layout.imgLeft + layout.scale * layout.width;
  const imgBottom = layout.imgTop + layout.scale * layout.height;

  return (
    <>
      {capabilities
          .filter(cap => cap.type !== 'tap' && cap.type !== 'focus')
          .map((cap, i) => {
        const leftRaw =
          layout.imgLeft +
          bounds.x * layout.scale +
          (i % 2 === 0 ? 4 : bounds.width * layout.scale - 40);
        const topRaw = layout.imgTop + bounds.y * layout.scale + 4;
        const clampedLeft = Math.max(
          layout.imgLeft,
          Math.min(leftRaw, imgRight - 44)
        );
        const clampedTop = Math.max(
          layout.imgTop,
          Math.min(topRaw, imgBottom - 20)
        );
        return (
          <CapabilityBadge
            key={cap.type}
            capability={cap}
            left={clampedLeft}
            top={clampedTop}
          />
        );
      })}
    </>
  );
});

export function Overlay() {
  const { hoveredNode, selectedNode, lockedNode } = useHierarchyStore();
  const { theme } = useThemeStore();
  const [layout, setLayout] = useState<ImageLayout | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    const updateLayout = () => {
      const newLayout = getImageLayout();
      setLayout(newLayout);
    };

    updateLayout();

    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout);

    let lastSrc = '';
    const interval = setInterval(() => {
      const img = document.querySelector('.screenshot-img') as HTMLImageElement;
      if (img?.src && img.src !== lastSrc) {
        lastSrc = img.src;
      }
      updateLayout();  // Always run to pick up zoom/pan changes
    }, 200);

    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (hoveredNode) {
      updateLayout();
    }
  }, [hoveredNode]);

  const updateLayout = () => {
    const newLayout = getImageLayout();
    setLayout(newLayout);
  };

  // Priority: lockedNode (persistent) > selectedNode (click-locked) > hoveredNode (hover preview)
  const activeNode = lockedNode || selectedNode || hoveredNode;

  if (!activeNode?.bounds || !layout) return null;

  const { capabilities } = activeNode;

  return (
    <>
      <HighlightBox bounds={activeNode.bounds} layout={layout} isDark={isDark} locked={!!lockedNode} />
      <InfoTooltip bounds={activeNode.bounds} layout={layout} node={activeNode} isDark={isDark} />
      {capabilities && capabilities.length > 0 && (
        <CapabilityBadges
          bounds={activeNode.bounds}
          capabilities={capabilities}
          layout={layout}
        />
      )}
    </>
  );
}