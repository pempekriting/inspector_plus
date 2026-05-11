import { useEffect, useState, useCallback, memo } from 'react';

import { useHierarchyStore } from '../stores/hierarchyStore';
import { useThemeStore } from '../stores/themeStore';
import type { UiNode } from '../types/shared';

interface ImageLayout {
  imgLeft: number;
  imgTop: number;
  scale: number;
}

function getImageLayout(): ImageLayout | null {
  const img = document.querySelector('.screenshot-img') as HTMLImageElement;
  if (!img?.naturalWidth) return null;

  const container = img.parentElement;
  if (!container) return null;

  const imgRect = img.getBoundingClientRect();
  const displayWidth = imgRect.width;
  const scale = displayWidth / img.naturalWidth;

  return {
    imgLeft: imgRect.left,
    imgTop: imgRect.top,
    scale,
  };
}

interface HighlightBoxProps {
  bounds: { x: number; y: number; width: number; height: number };
  layout: ImageLayout;
  isDark: boolean;
  locked?: boolean;
}

const HighlightBox = memo(function HighlightBox({
  bounds,
  layout,
  isDark,
  locked,
}: HighlightBoxProps) {
  const left = layout.imgLeft + bounds.x * layout.scale;
  const top = layout.imgTop + bounds.y * layout.scale;
  const width = bounds.width * layout.scale;
  const height = bounds.height * layout.scale;

  const finalWidth = Math.max(width, 6);
  const finalHeight = Math.max(height, 6);

  // Locked: bright yellow border + "SELECTED" badge. Hover/selected: subtle cyan.
  const accentColor = locked ? '#fbbf24' : isDark ? 'var(--accent-cyan)' : '#1a1a2e';
  const bgColor = locked
    ? 'rgba(251, 191, 36, 0.20)'
    : isDark
      ? 'rgba(0, 245, 212, 0.12)'
      : 'rgba(26, 26, 46, 0.10)';
  const boxShadow = locked
    ? '0 0 20px rgba(251, 191, 36, 0.6), inset 0 0 14px rgba(251, 191, 36, 0.20)'
    : isDark
      ? '0 0 16px rgba(0, 245, 212, 0.5), inset 0 0 12px rgba(0, 245, 212, 0.15)'
      : '0 0 12px rgba(26, 26, 46, 0.3), inset 0 0 10px rgba(26, 26, 46, 0.08)';

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
          transition:
            'left 0.03s linear, top 0.03s linear, width 0.03s linear, height 0.03s linear',
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
  node: UiNode;
  isDark: boolean;
}) {
  const left = layout.imgLeft + (bounds.x + bounds.width) * layout.scale + 12;
  const top = layout.imgTop + bounds.y * layout.scale;

  const accentColor = isDark ? 'var(--accent-cyan)' : '#1a1a2e';
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
      <div
        className="text-[11px] font-bold mb-1"
        style={{ color: textPrimary, fontFamily: 'JetBrains Mono, monospace' }}
      >
        {node.className?.split('.').pop()}
      </div>
      {node.resourceId && (
        <div
          className="text-[10px]"
          style={{ color: accentColor, fontFamily: 'JetBrains Mono, monospace' }}
        >
          #{node.resourceId}
        </div>
      )}
      <div
        className="text-[9px] mt-1"
        style={{ color: textTertiary, fontFamily: 'JetBrains Mono, monospace' }}
      >
        [{bounds.x}, {bounds.y}] {bounds.width}x{bounds.height}
      </div>
    </div>
  );
});

export function Overlay() {
  const { hoveredNode, selectedNode, lockedNode, canvasZoom, canvasPan } = useHierarchyStore();
  const { theme } = useThemeStore();
  const [layout, setLayout] = useState<{ imgLeft: number; imgTop: number; scale: number } | null>(null);

  const isDark = theme === 'dark';

  const updateLayout = useCallback(() => {
    const newLayout = getImageLayout();
    setLayout(newLayout);
  }, []);

  useEffect(() => {
    updateLayout();

    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout);

    const img = document.querySelector('.screenshot-img');
    let observer: ResizeObserver | null = null;
    if (img) {
      observer = new ResizeObserver(updateLayout);
      observer.observe(img);
    }

    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout);
      if (observer) observer.disconnect();
    };
  }, [updateLayout]);

  useEffect(() => {
    updateLayout();
  }, [hoveredNode, canvasZoom, canvasPan, updateLayout]);

  // Priority: lockedNode (persistent) > selectedNode (click-locked) > hoveredNode (hover preview)
  const activeNode = lockedNode || selectedNode || hoveredNode;

  if (!activeNode?.bounds || !layout) return null;

  return (
    <>
      <HighlightBox
        bounds={activeNode.bounds}
        layout={layout}
        isDark={isDark}
        locked={!!lockedNode}
      />
      <InfoTooltip bounds={activeNode.bounds} layout={layout} node={activeNode} isDark={isDark} />
    </>
  );
}
