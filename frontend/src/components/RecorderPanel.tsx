import { useState } from "react";
import { useRecording } from "../hooks/useRecording";
import { useRecorder } from "../services/api";

export function RecorderPanel() {
  const { isRecording, sessionId, steps, toggleRecording, clearAllSteps } = useRecording();
  const [lang, setLang] = useState<"python" | "java" | "javascript">("python");
  const { exportRecording } = useRecorder();

  const handleExport = async () => {
    const result = await exportRecording({ sessionId, lang, platform: "android" });
    const blob = new Blob([result.script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full neo-recorder">
      {/* Header - Neo Brutalist block */}
      <div className="neo-recorder-header">
        <div className="flex items-center gap-3">
          {/* Animated recording indicator */}
          <div className="neo-recorder-indicator" data-recording={isRecording}>
            <div className="neo-recorder-dot" />
            <span className="neo-recorder-label">
              {isRecording ? "REC" : "IDLE"}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="neo-recorder-title">Test Recorder</span>
            <span className="neo-recorder-meta">
              {steps.length > 0 ? `${steps.length} step${steps.length !== 1 ? "s" : ""}` : "No steps yet"}
            </span>
          </div>
        </div>

        {/* Record/Stop button - Neo brutalist style */}
        <button
          onClick={toggleRecording}
          className={`neo-recorder-btn ${isRecording ? "neo-recorder-btn-stop" : "neo-recorder-btn-record"}`}
        >
          {isRecording ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <span>STOP</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="6" />
              </svg>
              <span>RECORD</span>
            </>
          )}
        </button>
      </div>

      {/* Steps list */}
      <div className="neo-recorder-steps">
        {steps.length === 0 ? (
          <div className="neo-recorder-empty">
            <div className="neo-recorder-empty-icon">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" strokeDasharray="4 2" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
            </div>
            <span className="neo-recorder-empty-text">
              {isRecording ? "Click elements to record steps" : "Press RECORD to start"}
            </span>
            <span className="neo-recorder-empty-hint">
              Shift+Click to record text input
            </span>
          </div>
        ) : (
          <div className="neo-recorder-steps-list">
            {steps.map((step, i) => (
              <div key={i} className="neo-recorder-step" style={{ animationDelay: `${i * 30}ms` }}>
                <span className="neo-recorder-step-num">{i + 1}</span>
                <div className="neo-recorder-step-content">
                  <span className={`neo-recorder-step-action neo-recorder-step-action-${step.action}`}>
                    {step.action}
                  </span>
                  <code className="neo-recorder-step-code">
                    {step.code}
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer - Actions */}
      <div className="neo-recorder-footer">
        {/* Language selector - Neo brutalist custom select */}
        <div className="neo-recorder-lang">
          <label className="neo-recorder-lang-label">FRAMEWORK</label>
          <div className="neo-recorder-lang-select-wrapper">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
              className="neo-recorder-lang-select"
            >
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="javascript">JavaScript</option>
            </select>
            <svg className="neo-recorder-lang-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Action buttons */}
        <div className="neo-recorder-actions">
          <button
            onClick={clearAllSteps}
            disabled={steps.length === 0}
            className="neo-recorder-action neo-recorder-action-clear"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
            <span>CLEAR</span>
          </button>

          <button
            onClick={() => {
              const code = steps.map((s) => s.code).join("\n");
              navigator.clipboard.writeText(code);
            }}
            disabled={steps.length === 0}
            className="neo-recorder-action neo-recorder-action-copy"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="1" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <span>COPY</span>
          </button>

          <button
            onClick={handleExport}
            disabled={steps.length === 0}
            className="neo-recorder-action neo-recorder-action-export"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>EXPORT</span>
          </button>
        </div>
      </div>

      <style>{`
        .neo-recorder {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
        }

        /* Header */
        .neo-recorder-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-bottom: 3px solid var(--border-default);
        }

        .neo-recorder-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 4px;
          border: 2px solid var(--border-default);
          background: var(--bg-secondary);
          box-shadow: 3px 3px 0 var(--border-default);
        }

        .neo-recorder-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--text-tertiary);
          transition: all 0.15s ease;
        }

        .neo-recorder-indicator[data-recording="true"] .neo-recorder-dot {
          background: #ef4444;
          box-shadow: 0 0 8px #ef4444;
          animation: neo-pulse 1s ease-in-out infinite;
        }

        @keyframes neo-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }

        .neo-recorder-label {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }

        .neo-recorder-indicator[data-recording="true"] .neo-recorder-label {
          color: #ef4444;
        }

        .neo-recorder-title {
          font-family: "Satoshi", sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .neo-recorder-meta {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          color: var(--text-tertiary);
        }

        /* Record/Stop button */
        .neo-recorder-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 4px;
          border: 2px solid var(--border-default);
          font-family: "Satoshi", sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.1s ease;
          box-shadow: 3px 3px 0 var(--border-default);
        }

        .neo-recorder-btn:active {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0 var(--border-default);
        }

        .neo-recorder-btn-record {
          background: var(--accent-emerald);
          color: #000;
          border-color: var(--accent-emerald);
          box-shadow: 3px 3px 0 rgba(16, 185, 129, 0.4);
        }

        .neo-recorder-btn-record:hover {
          background: #34d399;
        }

        .neo-recorder-btn-stop {
          background: #ef4444;
          color: #fff;
          border-color: #ef4444;
          box-shadow: 3px 3px 0 rgba(239, 68, 68, 0.4);
        }

        .neo-recorder-btn-stop:hover {
          background: #f87171;
        }

        /* Steps list */
        .neo-recorder-steps {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .neo-recorder-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 8px;
          text-align: center;
        }

        .neo-recorder-empty-icon {
          color: var(--text-tertiary);
          opacity: 0.5;
        }

        .neo-recorder-empty-text {
          font-family: "Satoshi", sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .neo-recorder-empty-hint {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          color: var(--text-tertiary);
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          border: 1px dashed var(--border-default);
        }

        .neo-recorder-steps-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .neo-recorder-step {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-tertiary);
          border: 2px solid var(--border-default);
          border-radius: 4px;
          box-shadow: 2px 2px 0 var(--border-default);
          animation: neo-step-in 0.2s ease-out forwards;
          opacity: 0;
        }

        @keyframes neo-step-in {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .neo-recorder-step-num {
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          font-weight: 700;
          color: var(--accent-cyan);
          min-width: 20px;
        }

        .neo-recorder-step-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .neo-recorder-step-action {
          font-family: "Satoshi", sans-serif;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 6px;
          border-radius: 2px;
          display: inline-block;
          width: fit-content;
        }

        .neo-recorder-step-action-click {
          background: rgba(34, 211, 238, 0.15);
          color: var(--accent-cyan);
          border: 1px solid var(--accent-cyan);
        }

        .neo-recorder-step-action-fill {
          background: rgba(124, 58, 237, 0.15);
          color: var(--accent-violet);
          border: 1px solid var(--accent-violet);
        }

        .neo-recorder-step-action-swipe {
          background: rgba(251, 191, 36, 0.15);
          color: var(--accent-amber);
          border: 1px solid var(--accent-amber);
        }

        .neo-recorder-step-action-wait {
          background: rgba(251, 113, 133, 0.15);
          color: var(--accent-rose);
          border: 1px solid var(--accent-rose);
        }

        .neo-recorder-step-code {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          color: var(--text-secondary);
          word-break: break-all;
          line-height: 1.4;
        }

        /* Footer */
        .neo-recorder-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-top: 3px solid var(--border-default);
        }

        .neo-recorder-lang {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .neo-recorder-lang-label {
          font-family: "Satoshi", sans-serif;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--text-tertiary);
        }

        .neo-recorder-lang-select-wrapper {
          position: relative;
        }

        .neo-recorder-lang-select {
          appearance: none;
          padding: 6px 28px 6px 10px;
          background: var(--bg-secondary);
          border: 2px solid var(--border-default);
          border-radius: 4px;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-primary);
          cursor: pointer;
          box-shadow: 2px 2px 0 var(--border-default);
        }

        .neo-recorder-lang-select:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent-cyan);
        }

        .neo-recorder-lang-arrow {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: var(--text-tertiary);
          pointer-events: none;
        }

        .neo-recorder-actions {
          display: flex;
          gap: 8px;
        }

        .neo-recorder-action {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 4px;
          border: 2px solid var(--border-default);
          font-family: "Satoshi", sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: all 0.1s ease;
          box-shadow: 2px 2px 0 var(--border-default);
        }

        .neo-recorder-action:active:not(:disabled) {
          transform: translate(1px, 1px);
          box-shadow: 1px 1px 0 var(--border-default);
        }

        .neo-recorder-action:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .neo-recorder-action-clear {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }

        .neo-recorder-action-clear:hover:not(:disabled) {
          background: var(--bg-elevated);
          color: #ef4444;
          border-color: #ef4444;
        }

        .neo-recorder-action-copy {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }

        .neo-recorder-action-copy:hover:not(:disabled) {
          background: var(--bg-elevated);
          color: var(--accent-cyan);
          border-color: var(--accent-cyan);
        }

        .neo-recorder-action-export {
          background: var(--accent-cyan);
          color: #000;
          border-color: var(--accent-cyan);
        }

        .neo-recorder-action-export:hover:not(:disabled) {
          background: #22d3ee;
        }

        /* Scrollbar */
        .neo-recorder-steps::-webkit-scrollbar {
          width: 6px;
        }

        .neo-recorder-steps::-webkit-scrollbar-track {
          background: var(--bg-tertiary);
          border-radius: 3px;
        }

        .neo-recorder-steps::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
