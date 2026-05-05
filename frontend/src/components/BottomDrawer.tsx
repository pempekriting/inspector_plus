import { memo, useState, useRef, useCallback, useEffect } from "react";

interface BottomDrawerProps {
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  isDark: boolean;
}

export const BottomDrawer = memo(function BottomDrawer({
  children,
  defaultHeight = 200,
  minHeight = 80,
  maxHeight = 400,
  isDark,
}: BottomDrawerProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = dragStartY.current - e.clientY;
    const newHeight = Math.min(maxHeight, Math.max(minHeight, dragStartHeight.current + delta));
    setHeight(newHeight);
  }, [isDragging, minHeight, maxHeight]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isCollapsed) {
        setIsCollapsed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCollapsed]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-shrink-0 select-none rounded-t-lg"
      style={{
        background: "var(--bg-secondary)",
        borderTop: "var(--nb-border)",
        height: isCollapsed ? minHeight : height,
        transition: isDragging ? "none" : "height 0.15s ease-out",
        cursor: isDragging ? "ns-resize" : "default",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{
          background: "var(--bg-tertiary)",
          borderBottom: "2px solid var(--border-subtle)",
          cursor: isDragging ? "ns-resize" : "ns-resize",
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="flex items-center gap-2">
          {/* Drag indicator */}
          <div
            className="w-8 h-1 rounded-full"
            style={{
              background: "var(--border-default)",
            }}
          />
        </div>
        <button
          onClick={toggleCollapse}
          className="w-6 h-6 flex items-center justify-center rounded transition-all active:scale-95"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1.5px solid var(--border-default)",
          }}
        >
          <svg
            className={`w-3 h-3 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
});