import { useState, useEffect } from "react";
import { useThemeStore } from "../stores/themeStore";

const STORAGE_KEY = "inspectorplus_onboarding_seen";

interface OnboardingStep {
  title: string;
  content: (props: { isDark: boolean }) => React.ReactNode;
}

// ─── Welcome Step ────────────────────────────────────────────────────────────

function WelcomeStep({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#0f0f12" : "#faf9f7";
  const bgCard = isDark ? "#1a1a1f" : "#ffffff";
  const bgElevated = isDark ? "#242429" : "#f0eeeb";
  const border = isDark ? "#3a3a42" : "#e5e2dd";
  const accent = isDark ? "#00e5cc" : "#0c4a6e";
  const textPrimary = isDark ? "#f0f0f5" : "#1a1a2e";
  const textSecondary = isDark ? "#a8a8b3" : "#4a4a5c";
  const textTertiary = isDark ? "#6b6b78" : "#7a7a8c";

  return (
    <div className="space-y-6">
      {/* Accent bar */}
      <div className="h-0.5 w-12 rounded-full" style={{ background: accent }} />

      {/* Title in serif */}
      <h2
        className="text-2xl leading-tight"
        style={{ fontFamily: '"Instrument Serif", serif', fontStyle: "italic", color: textPrimary }}
      >
        Real-time UI inspection<br />for Android and iOS
      </h2>

      <p className="text-[11px] leading-relaxed" style={{ color: textSecondary, maxWidth: "36ch" }}>
        Inspect elements, execute commands, and run accessibility audits on connected devices — all from one window.
      </p>

      {/* Feature list - minimal */}
      <div className="space-y-2">
        {[
          "Inspect UI hierarchy in real-time",
          "Tap to select elements on device",
          "Execute device commands",
          "Record and playback action sequences",
        ].map((text, i) => (
          <div key={text} className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono font-bold w-4 flex-shrink-0"
              style={{ color: accent }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[11px]" style={{ color: textPrimary }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Device Connection Step ───────────────────────────────────────────────────

function DeviceConnectionStep({ isDark }: { isDark: boolean }) {
  const textPrimary = isDark ? "#f0f0f5" : "#1a1a2e";
  const textSecondary = isDark ? "#a8a8b3" : "#4a4a5c";
  const textTertiary = isDark ? "#6b6b78" : "#7a7a8c";
  const bgCard = isDark ? "#1a1a1f" : "#ffffff";
  const border = isDark ? "#3a3a42" : "#e5e2dd";
  const bgElevated = isDark ? "#242429" : "#f0eeeb";
  const accent = isDark ? "#00e5cc" : "#0c4a6e";
  const codeBg = isDark ? "#0f0f12" : "#faf9f7";
  const codeText = isDark ? "#00e5cc" : "#0c4a6e";

  return (
    <div className="space-y-5">
      <div>
        <h2
          className="text-xl leading-tight mb-1"
          style={{ fontFamily: '"Instrument Serif", serif', fontStyle: "italic", color: textPrimary }}
        >
          Connect your device
        </h2>
        <p className="text-[11px]" style={{ color: textTertiary }}>
          Get started in under a minute
        </p>
      </div>

      <div className="space-y-3">
        {/* Android */}
        <div
          className="rounded-lg p-3.5"
          style={{ background: bgCard, border: `1.5px solid ${border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: accent }}>
              Android
            </span>
            <div className="flex-1 h-px" style={{ background: border }} />
          </div>
          <ol className="text-[10px] space-y-1.5" style={{ color: textSecondary }}>
            {[
              "Enable USB debugging in Developer Options",
              "Connect device via USB cable",
              "Run adb devices to verify connection",
              "Grant USB debugging permission on device",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono font-bold mt-0.5 w-3 flex-shrink-0" style={{ color: textTertiary }}>
                  {i + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[9px] font-mono" style={{ color: textTertiary }}>$</span>
            <code
              className="text-[10px] font-mono px-2 py-1 rounded"
              style={{ background: codeBg, color: codeText }}
            >
              adb devices
            </code>
          </div>
        </div>

        {/* iOS */}
        <div
          className="rounded-lg p-3.5"
          style={{ background: bgCard, border: `1.5px solid ${border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: accent }}>
              iOS Simulator
            </span>
            <div className="flex-1 h-px" style={{ background: border }} />
          </div>
          <ol className="text-[10px] space-y-1.5" style={{ color: textSecondary }}>
            {[
              "Open Xcode and start a simulator",
              "Or run xcrun simctl list devices",
              "InspectorPlus auto-detects connected simulators",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono font-bold mt-0.5 w-3 flex-shrink-0" style={{ color: textTertiary }}>
                  {i + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ─── Feature Tour Step ─────────────────────────────────────────────────────────

function FeatureTourStep({ isDark }: { isDark: boolean }) {
  const textPrimary = isDark ? "#f0f0f5" : "#1a1a2e";
  const textSecondary = isDark ? "#a8a8b3" : "#4a4a5c";
  const textTertiary = isDark ? "#6b6b78" : "#7a7a8c";
  const bgCard = isDark ? "#1a1a1f" : "#ffffff";
  const border = isDark ? "#3a3a42" : "#e5e2dd";
  const accent = isDark ? "#00e5cc" : "#0c4a6e";
  const codeBg = isDark ? "#0f0f12" : "#faf9f7";
  const codeText = isDark ? "#00e5cc" : "#0c4a6e";

  const features = [
    { title: "Inspector", desc: "View and search the UI element tree", key: "01" },
    { title: "Tap to Inspect", desc: "Click any element to see details", key: "02" },
    { title: "Device Commands", desc: "Execute actions directly on device", key: "03" },
    { title: "Accessibility Audit", desc: "Run WCAG checks on your UI", key: "04" },
    { title: "Recorder", desc: "Capture and replay action sequences", key: "05" },
    { title: "App Info", desc: "Browse installed apps and packages", key: "06" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2
          className="text-xl leading-tight mb-1"
          style={{ fontFamily: '"Instrument Serif", serif', fontStyle: "italic", color: textPrimary }}
        >
          What you can do
        </h2>
        <p className="text-[11px]" style={{ color: textTertiary }}>
          Six tools in one unified interface
        </p>
      </div>

      <div className="space-y-2">
        {features.map(({ title, desc, key }) => (
          <div
            key={key}
            className="flex items-center gap-3 p-2.5 rounded-lg"
            style={{ background: bgCard, border: `1.5px solid ${border}` }}
          >
            <span className="text-[10px] font-mono font-bold w-5 flex-shrink-0" style={{ color: textTertiary }}>
              {key}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium block" style={{ color: textPrimary }}>{title}</span>
              <span className="text-[9px] block" style={{ color: textTertiary }}>{desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Keyboard hint */}
      <div
        className="rounded-lg p-2.5 flex items-center gap-2"
        style={{ background: bgCard, border: `1.5px solid ${border}` }}
      >
        <span className="text-[9px] font-mono" style={{ color: textTertiary }}>
          Press
        </span>
        <kbd
          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: codeBg, color: codeText, border: `1px solid ${border}` }}
        >
          ?
        </kbd>
        <span className="text-[9px] font-mono" style={{ color: textTertiary }}>
          to see all keyboard shortcuts
        </span>
      </div>
    </div>
  );
}

// ─── Troubleshooting Step ─────────────────────────────────────────────────────

function TroubleshootingStep({ isDark }: { isDark: boolean }) {
  const textPrimary = isDark ? "#f0f0f5" : "#1a1a2e";
  const textSecondary = isDark ? "#a8a8b3" : "#4a4a5c";
  const textTertiary = isDark ? "#6b6b78" : "#7a7a8c";
  const bgCard = isDark ? "#1a1a1f" : "#ffffff";
  const border = isDark ? "#3a3a42" : "#e5e2dd";
  const accent = isDark ? "#00e5cc" : "#0c4a6e";
  const codeBg = isDark ? "#0f0f12" : "#faf9f7";
  const codeText = isDark ? "#00e5cc" : "#0c4a6e";
  const errorText = isDark ? "#fb7185" : "#dc2626";

  const issues = [
    {
      problem: "Device not detected",
      solutions: [
        "Check USB cable connection",
        "Verify USB debugging is enabled",
        "Run adb kill-server && adb devices",
      ],
    },
    {
      problem: "Hierarchy empty or stale",
      solutions: [
        "Wait for screen to settle",
        "Try refreshing the hierarchy",
        "Check that target app is in foreground",
      ],
    },
    {
      problem: "Tap not working",
      solutions: [
        "Ensure element is clickable",
        "Try with a slight delay between actions",
        "Check if app handles touch events",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2
          className="text-xl leading-tight mb-1"
          style={{ fontFamily: '"Instrument Serif", serif', fontStyle: "italic", color: textPrimary }}
        >
          Troubleshooting
        </h2>
        <p className="text-[11px]" style={{ color: textTertiary }}>
          Quick fixes for common issues
        </p>
      </div>

      <div className="space-y-2">
        {issues.map(({ problem, solutions }) => (
          <div
            key={problem}
            className="rounded-lg p-3"
            style={{ background: bgCard, border: `1.5px solid ${border}` }}
          >
            <p className="text-[10px] font-mono font-bold mb-1.5" style={{ color: errorText }}>
              / {problem}
            </p>
            <ul className="space-y-1">
              {solutions.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[9px] font-mono mt-0.5 w-3 flex-shrink-0" style={{ color: textTertiary }}>
                    {String(i + 1)}.
                  </span>
                  <span className="text-[10px]" style={{ color: textSecondary }}>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step definitions ──────────────────────────────────────────────────────────

const STEPS: OnboardingStep[] = [
  { title: "Welcome", content: ({ isDark }) => <WelcomeStep isDark={isDark} /> },
  { title: "Connect Device", content: ({ isDark }) => <DeviceConnectionStep isDark={isDark} /> },
  { title: "Features", content: ({ isDark }) => <FeatureTourStep isDark={isDark} /> },
  { title: "Troubleshooting", content: ({ isDark }) => <TroubleshootingStep isDark={isDark} /> },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setIsVisible(true);
    } catch {
      setIsVisible(true);
    }
  }, []);

  const handleClose = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
    setIsVisible(false);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (!isVisible) return null;

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  const bgPrimary = isDark ? "#0f0f12" : "#faf9f7";
  const bgSecondary = isDark ? "#1a1a1f" : "#ffffff";
  const bgHeader = isDark ? "#18181b" : "#e5e5e5";
  const bgFooter = isDark ? "#18181b" : "#e5e5e5";
  const border = isDark ? "#3a3a42" : "#e5e2dd";
  const borderStrong = isDark ? "#4a4a55" : "#c5c2bb";
  const textPrimary = isDark ? "#f0f0f5" : "#1a1a2e";
  const textSecondary = isDark ? "#a8a8b3" : "#4a4a5c";
  const textTertiary = isDark ? "#6b6b78" : "#7a7a8c";
  const accent = isDark ? "#00e5cc" : "#0c4a6e";
  const codeBg = isDark ? "#0f0f12" : "#faf9f7";
  const codeText = isDark ? "#00e5cc" : "#0c4a6e";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.8)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{
          background: bgSecondary,
          border: `2px solid ${border}`,
          boxShadow: isDark
            ? "0 0 0 1px rgba(0,229,204,0.05), 0 32px 64px rgba(0,0,0,0.6)"
            : "0 0 0 1px rgba(12,74,110,0.05), 0 32px 64px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: bgHeader,
            borderBottom: `1px solid ${border}`,
          }}
        >
          <div className="flex items-center gap-2">
            {/* Hash mark logo */}
            <div
              className="flex items-center gap-0.5"
              aria-hidden="true"
            >
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1 rounded-full"
                  style={{
                    height: i === 1 ? "14px" : "10px",
                    background: accent,
                    opacity: i === 1 ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
            <span
              className="text-[11px] font-mono font-bold tracking-wider uppercase"
              style={{ color: textTertiary, letterSpacing: "0.12em" }}
            >
              InspectorPlus
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-95"
            style={{ background: bgSecondary, color: textTertiary, border: `1px solid ${border}` }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step indicators — hash marks */}
        <div className="flex gap-0.5 px-4 pt-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-0.5 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= currentStep ? accent : border,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {step?.content({ isDark })}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: bgFooter,
            borderTop: `1px solid ${border}`,
          }}
        >
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-25"
            style={{
              background: bgSecondary,
              color: textSecondary,
              border: `1px solid ${border}`,
            }}
          >
            Prev
          </button>

          <span className="text-[9px] font-mono" style={{ color: textTertiary }}>
            {String(currentStep + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>

          <button
            onClick={handleNext}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: accent,
              color: isDark ? "#0f0f12" : "#ffffff",
              border: `1px solid ${accent}`,
            }}
          >
            {isLastStep ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}