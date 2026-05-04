import { useRef, useEffect, useState } from "react";
import { useDeviceStore } from "../stores/deviceStore";
import { useHierarchyStore, UiNode } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";
import { SkeletonCanvas } from "./SkeletonLoader";
import { LayoutBoundsOverlay } from "./LayoutBoundsOverlay";
import { useRecording } from "../hooks/useRecording";

interface ImageMetrics {
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
}

function getImageMetrics(container: HTMLElement): ImageMetrics | null {
  const img = container.querySelector("img") as HTMLImageElement;
  if (!img || !img.naturalWidth) return null;

  const containerRect = container.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  return {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    displayWidth: imgRect.width,
    displayHeight: imgRect.height,
    offsetX: imgRect.left - containerRect.left,
    offsetY: imgRect.top - containerRect.top,
  };
}

// Convert a UiNode to a locator object for the recorder
export function nodeToLocator(node: UiNode): { strategy: string; value: string; expression?: string } {
  // Priority: resourceId > contentDesc > text > className + index
  if (node.resourceId) {
    return {
      strategy: "id",
      value: node.resourceId,
      expression: `//*[@resource-id="${node.resourceId}"]`,
    };
  }
  if (node.contentDesc) {
    return {
      strategy: "accessibility-id",
      value: node.contentDesc,
      expression: `//*[@content-desc="${node.contentDesc}"]`,
    };
  }
  if (node.text) {
    return {
      strategy: "text",
      value: node.text,
      expression: `//*[contains(@text,"${node.text}")]`,
    };
  }
  // Fallback to class name + index-based xpath
  const className = node.className?.split(".").pop() || "View";
  return {
    strategy: "xpath",
    value: `//${className}[${node.id.split("_").pop() || "1"}]`,
    expression: `//${className}[${node.id.split("_").pop() || "1"}]`,
  };
}

export function ScreenshotCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [coordPopup, setCoordPopup] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);

  const { selectedDevice, setDeviceResolution } = useDeviceStore();
  const {
    isLoadingScreenshot, uiTree, setHoveredNode, setSelectedNode, lockSelection,
    setLoadingScreenshot, combinedScreenshotUrl, lockedNode,
    canvasMode, setCanvasMode,
  } = useHierarchyStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { isRecording, recordStep } = useRecording();

  // D2: Zoom + Pan state
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoomRef = useRef(0.7);
  zoomRef.current = zoom;

  const resetZoom = () => { setZoom(0.7); setPan({ x: 0, y: 0 }); };
  const zoomIn  = () => setZoom(z => Math.min(4, +(z * 1.25).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(0.25, +(z / 1.25).toFixed(2)));

  // Load screenshot from combined /hierarchy-and-screenshot endpoint
  useEffect(() => {
    if (!combinedScreenshotUrl) return;

    const img = new Image();
    img.onload = () => {
      setImageUrl(combinedScreenshotUrl);
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setDeviceResolution(img.naturalWidth, img.naturalHeight);
      setLoadingScreenshot(false);
    };
    img.onerror = () => {
      setLoadingScreenshot(false);
    };
    img.src = combinedScreenshotUrl;
  }, [combinedScreenshotUrl, setDeviceResolution, setLoadingScreenshot]);

  // L key → toggle layout boundless mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'l' || e.key === 'L') {
        setCanvasMode(canvasMode === 'layout' ? 'inspect' : 'layout');
      }
      if (e.key === 'Escape' && canvasMode === 'layout') {
        setCanvasMode('inspect');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canvasMode]);

  // Clear coordinate popup when switching away from coordinate mode
  useEffect(() => {
    if (canvasMode !== 'coordinate') {
      setCoordPopup(null);
    }
  }, [canvasMode]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageUrl) return;

    const metrics = getImageMetrics(containerRef.current);
    if (!metrics || metrics.naturalWidth === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = metrics.displayWidth / metrics.naturalWidth;
    const scaleY = metrics.displayHeight / metrics.naturalHeight;

    const deviceX = Math.round((clickX - metrics.offsetX) / scaleX);
    const deviceY = Math.round((clickY - metrics.offsetY) / scaleY);

    // Coordinate mode: show coords only, no tap
    if (canvasMode === 'coordinate') {
      setCoordPopup({ x: deviceX, y: deviceY, screenX: Math.round(clickX), screenY: Math.round(clickY) });
      setTimeout(() => setCoordPopup(null), 3000);
      return;
    }

    // Inspect mode: lock selection only, no tap to device
    const imgX = (clickX - metrics.offsetX) / scaleX;
    const imgY = (clickY - metrics.offsetY) / scaleY;
    const node = uiTree ? findNodeAtPoint(uiTree, imgX, imgY) : null;
    setSelectedNode(node);
    if (node) {
      lockSelection(node);

      // Record step if recording is active
      if (isRecording) {
        if (e.shiftKey) {
          // Shift+Click: record fill action with user-provided text
          const fillValue = window.prompt("Enter text to fill:");
          if (fillValue !== null) {
            const locator = nodeToLocator(node);
            recordStep({
              action: "fill",
              nodeId: node.id,
              locator,
              value: fillValue,
            });
          }
        } else {
          // Normal click: record click action
          const locator = nodeToLocator(node);
          recordStep({
            action: "click",
            nodeId: node.id,
            locator,
          });
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageUrl) return;

    const metrics = getImageMetrics(containerRef.current);
    if (!metrics || metrics.naturalWidth === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (
      mouseX < metrics.offsetX ||
      mouseX > metrics.offsetX + metrics.displayWidth ||
      mouseY < metrics.offsetY ||
      mouseY > metrics.offsetY + metrics.displayHeight
    ) {
      setHoveredNode(null);
      return;
    }

    // In coordinate mode, skip node highlighting
    if (canvasMode === 'coordinate') {
      setHoveredNode(null);
      return;
    }

    const scaleX = metrics.displayWidth / metrics.naturalWidth;
    const scaleY = metrics.displayHeight / metrics.naturalHeight;
    const imgX = (mouseX - metrics.offsetX) / scaleX;
    const imgY = (mouseY - metrics.offsetY) / scaleY;

    const node = uiTree ? findNodeAtPoint(uiTree, imgX, imgY) : null;
    setHoveredNode(node, { x: mouseX, y: mouseY });
  };

  const handleMouseLeave = () => { setHoveredNode(null); };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Note: cannot call preventDefault on passive wheel listener
      // Container has overflow:hidden so page scroll is already blocked
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(z => Math.min(4, Math.max(0.25, +(z * delta).toFixed(2))));
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning && panStart.current) {
      setPan({ x: panStart.current.panX + e.clientX - panStart.current.x, y: panStart.current.panY + e.clientY - panStart.current.y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-3 relative canvas-container flex items-center justify-center overflow-hidden"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        background: isDark ? '#0f0f12' : '#faf9f7',
        cursor: canvasMode === 'coordinate' ? 'crosshair' : (zoom !== 1 ? (isPanning ? 'grabbing' : 'grab') : 'default'),
      }}
    >
      {/* Screenshot wrapper with zoom/pan — overflow clipped to prevent zoom spillover */}
      {imageUrl && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            transform: zoom !== 1 ? `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` : undefined,
            transition: isPanning ? 'none' : 'transform 150ms ease-out',
            transformOrigin: 'center center',
            zIndex: 1,
          }}
        >
          <img
            src={imageUrl}
            alt="Device screen"
            className="screenshot-img"
            draggable={false}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', margin: 'auto' }}
          />
        </div>
      )}

      {/* Layout Boundless Mode — Portal rendered at document.body, positioned over canvas */}
      {canvasMode === 'layout' && uiTree && (
        <LayoutBoundsOverlay
          canvasRef={containerRef.current}
          zoom={zoom}
          pan={pan}
        />
      )}

      {isLoadingScreenshot && !imageUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: isDark ? '#1a1a1f' : '#ffffff' }}>
          <div className="w-16 h-16 mb-4 animate-br-spin" style={{ background: isDark ? '#242429' : '#f0eeeb', border: `3px solid ${isDark ? '#3f3f46' : '#1a1a1a'}` }}>
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8" style={{ color: isDark ? 'var(--accent-cyan)' : '#047857' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5h.008z" />
              </svg>
            </div>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#6b6b78' : '#7a7a8c' }}>Capturing screenshot...</span>
        </div>
      )}

      {isLoadingScreenshot && imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(10, 10, 12, 0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 animate-br-spin" style={{ background: isDark ? '#242429' : '#f0eeeb', border: `3px solid ${isDark ? '#3f3f46' : '#1a1a1a'}` }}>
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-6 h-6" style={{ color: isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#a8a8b3' : '#4a4a5c' }}>Loading screenshot...</span>
          </div>
        </div>
      )}

      {imageSize.width > 0 && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded-lg z-[50100]" style={{
          background: isDark ? 'rgba(26, 26, 31, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          border: isDark ? '1.5px solid #4a4a55' : '1.5px solid #c5c2bb',
        }}>
          <svg className="w-3 h-3" style={{ color: isDark ? 'var(--accent-cyan)' : '#1a1a2e' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-mono" style={{ color: isDark ? '#a8a8b3' : '#4a4a5c' }}>{imageSize.width}x{imageSize.height}</span>
        </div>
      )}

      {/* Mode Toggle - Top Left */}
      <div className="absolute top-3 left-3 flex items-center gap-1 z-[50100]" style={{ marginTop: imageSize.width > 0 ? '32px' : '0' }}>
        <button
          onClick={() => setCanvasMode('inspect')}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
          style={{
            background: canvasMode === 'inspect' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)') : (isDark ? 'rgba(26, 26, 31, 0.9)' : 'rgba(255, 255, 255, 0.9)'),
            backdropFilter: 'blur(8px)',
            border: `2px solid ${canvasMode === 'inspect' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)') : (isDark ? '#4a4a55' : '#c5c2bb')}`,
            boxShadow: canvasMode === 'inspect' ? (isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a') : 'none',
          }}
          title="Inspect Mode"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={canvasMode === 'inspect' ? (isDark ? '#0a0a0c' : '#ffffff') : (isDark ? '#a1a1aa' : '#4a4a4a')} strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <button
          onClick={() => setCanvasMode('coordinate')}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
          style={{
            background: canvasMode === 'coordinate' ? (isDark ? '#10b981' : '#059669') : (isDark ? 'rgba(26, 26, 31, 0.9)' : 'rgba(255, 255, 255, 0.9)'),
            backdropFilter: 'blur(8px)',
            border: `2px solid ${canvasMode === 'coordinate' ? (isDark ? '#10b981' : '#059669') : (isDark ? '#4a4a55' : '#c5c2bb')}`,
            boxShadow: canvasMode === 'coordinate' ? (isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a') : 'none',
          }}
          title="Coordinate Mode"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={canvasMode === 'coordinate' ? (isDark ? '#0a0a0c' : '#ffffff') : (isDark ? '#a1a1aa' : '#4a4a4a')} strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </button>
        <button
          onClick={() => setCanvasMode(canvasMode === 'layout' ? 'inspect' : 'layout')}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
          style={{
            background: canvasMode === 'layout' ? (isDark ? 'rgba(0, 245, 212, 0.20)' : 'rgba(0, 102, 204, 0.15)') : (isDark ? 'rgba(26, 26, 31, 0.9)' : 'rgba(255, 255, 255, 0.9)'),
            backdropFilter: 'blur(8px)',
            border: `2px solid ${canvasMode === 'layout' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)') : (isDark ? '#4a4a55' : '#c5c2bb')}`,
            boxShadow: canvasMode === 'layout' ? (isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a') : 'none',
          }}
          title="Layout Mode (L)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={canvasMode === 'layout' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)') : (isDark ? '#a1a1aa' : '#4a4a4a')} strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      </div>

      {/* D2: Zoom toolbar */}
      {imageUrl && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-lg z-20" style={{
          background: isDark ? 'rgba(26, 26, 31, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          border: isDark ? '1.5px solid #4a4a55' : '1.5px solid #c5c2bb',
        }}>
          <button onClick={zoomOut} className="w-6 h-6 flex items-center justify-center rounded transition-all active:scale-95" style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#a1a1aa' : '#4a4a4a',
            border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc',
          }} title="Zoom out">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg>
          </button>
          <div className="w-20 h-1 rounded-full mx-1" style={{ background: isDark ? '#3f3f46' : '#cccccc' }}>
            <div className="h-full rounded-full" style={{ background: isDark ? 'var(--accent-cyan)' : 'var(--accent-blue)', width: `${((zoom - 0.25) / 3.75) * 100}%` }} />
          </div>
          <button onClick={zoomIn} className="w-6 h-6 flex items-center justify-center rounded transition-all active:scale-95" style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#a1a1aa' : '#4a4a4a',
            border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc',
          }} title="Zoom in">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span className="text-[10px] font-mono font-bold mx-1 w-10 text-center" style={{ color: isDark ? '#a1a1aa' : '#4a4a4a' }}>
            {zoom === 0.3 ? '0.3x' : `${zoom.toFixed(1)}x`}
          </span>
          {zoom !== 1 && (
            <button onClick={resetZoom} className="w-6 h-6 flex items-center justify-center rounded transition-all active:scale-95" style={{
              background: isDark ? '#1f1f23' : '#ffffff',
              color: isDark ? 'var(--accent-orange, #fb923c)' : 'var(--accent-button, #c2410c)',
              border: isDark ? '1.5px solid var(--accent-orange, #fb923c)' : '1.5px solid var(--accent-button, #c2410c)',
            }} title="Reset zoom">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      )}

      {!imageUrl && !isLoadingScreenshot && (
        <SkeletonCanvas aspectRatio={imageSize.height > 0 ? imageSize.width / imageSize.height : 9 / 16} isDark={isDark} />
      )}

      {coordPopup && (
        <div className="absolute pointer-events-none z-30 animate-coord-popup font-code" style={{
          left: coordPopup.screenX + 16,
          top: coordPopup.screenY - 60,
          background: isDark ? '#1a1a1f' : '#ffffff',
          border: isDark ? '2px solid #10b981' : '2px solid #059669',
          borderRadius: '6px',
          padding: '8px 12px',
          boxShadow: isDark ? '4px 4px 0 #000' : '4px 4px 0 #1a1a1a',
        }}>
          <div className="text-[10px] font-bold mb-1" style={{ color: isDark ? '#10b981' : '#059669' }}>Device Coords</div>
          <div className="text-[12px] font-bold" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>[{coordPopup.x}, {coordPopup.y}]</div>
          <div className="text-[10px] mt-1" style={{ color: isDark ? '#71717a' : '#666666' }}>Screen [{coordPopup.screenX}, {coordPopup.screenY}]</div>
        </div>
      )}
    </div>
  );
}

function findNodeAtPoint(node: UiNode, imgX: number, imgY: number): UiNode | null {
  if (node.bounds) {
    const { x, y, width, height } = node.bounds;
    if (imgX >= x && imgX <= x + width && imgY >= y && imgY <= y + height) {
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const found = findNodeAtPoint(child, imgX, imgY);
          if (found) return found;
        }
      }
      return node;
    }
  } else {
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const found = findNodeAtPoint(child, imgX, imgY);
        if (found) return found;
      }
    }
  }
  return null;
}