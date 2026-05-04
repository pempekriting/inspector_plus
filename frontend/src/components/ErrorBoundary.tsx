import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { useThemeStore } from "../stores/themeStore";

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    <div
      className="flex flex-col items-center justify-center h-screen w-screen p-8"
      style={{
        background: isDark ? "#0a0a0c" : "#f5f5f5",
        fontFamily: '"Satoshi", sans-serif',
      }}
    >
      <div
        className="rounded-xl p-8 max-w-md text-center neo-brutal-border"
        style={{
          background: isDark ? "#111114" : "#ffffff",
          border: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
          boxShadow: isDark ? "6px 6px 0 #000" : "6px 6px 0 #1a1a1a",
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{
            background: isDark
              ? "rgba(251, 113, 133, 0.2)"
              : "rgba(220, 38, 38, 0.15)",
          }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: isDark ? "#fb7185" : "#dc2626" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2
          className="text-lg font-bold mb-2"
          style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}
        >
          Something went wrong
        </h2>
        <p
          className="text-sm mb-4"
          style={{ color: isDark ? "#71717a" : "#666666" }}
        >
          {errorMessage || "An unexpected error occurred"}
        </p>
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 rounded-lg font-bold text-sm transition-transform active:scale-95"
          style={{
            background: isDark ? "#1f1f23" : "#ffffff",
            border: isDark ? "2px solid #3f3f46" : "2px solid #1a1a1a",
            boxShadow: isDark ? "3px 3px 0 #000" : "3px 3px 0 #1a1a1a",
            color: isDark ? "#e4e4e7" : "#1a1a1a",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
  );
}