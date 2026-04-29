import { memo } from "react";

interface SkeletonRowProps {
  width?: string;
  height?: number;
  isDark: boolean;
}

export const SkeletonRow = memo(function SkeletonRow({ width = "60%", height = 12, isDark }: SkeletonRowProps) {
  return (
    <div
      className="rounded animate-shimmer"
      style={{
        width,
        height,
        background: isDark ? "#1f1f23" : "#e5e5e5",
        borderRadius: 2,
      }}
    />
  );
});

interface SkeletonLoaderProps {
  rows?: number;
  isDark: boolean;
}

export const SkeletonLoader = memo(function SkeletonLoader({ rows = 8, isDark }: SkeletonLoaderProps) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-1.5">
          <div
            className="w-4 h-4 rounded animate-shimmer"
            style={{ background: isDark ? "#1f1f23" : "#e5e5e5", flexShrink: 0 }}
          />
          <div
            className="w-4 h-4 rounded animate-shimmer"
            style={{ background: isDark ? "#27272a" : "#d4d4d4", flexShrink: 0 }}
          />
          <div className="flex flex-col gap-1.5 flex-1">
            <SkeletonRow width="40%" height={10} isDark={isDark} />
            <SkeletonRow width="25%" height={8} isDark={isDark} />
          </div>
        </div>
      ))}
    </div>
  );
});

interface SkeletonCanvasProps {
  aspectRatio?: number;
  isDark: boolean;
}

export const SkeletonCanvas = memo(function SkeletonCanvas({ aspectRatio = 9 / 16, isDark }: SkeletonCanvasProps) {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: isDark ? "#0f0f12" : "#faf9f7" }}
    >
      <div
        className="animate-shimmer rounded-lg"
        style={{
          width: "60%",
          aspectRatio: String(aspectRatio),
          background: isDark ? "#18181b" : "#e5e5e5",
          border: isDark ? "2px solid #3f3f46" : "2px solid #d4d4d4",
        }}
      />
    </div>
  );
});