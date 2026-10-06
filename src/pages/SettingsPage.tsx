import { useState } from "react";
import { useBackend } from "../context/BackendContext";
import { api, type Settings } from "../lib/api";

const FALLBACK: Settings = {
  scan_interval: "10",
  alert_threshold: "50",
  suspicious_threshold: "20",
};

const inputClass =
  "w-full bg-base-700 border border-divider rounded px-3 py-2 text-xs text-primary focus:outline-none focus:border-primary-600 transition-colors";

function ScanningSection({
  settings,
  onSave,
  disabled,
}: {
  settings: Settings | null;
  onSave: (next: Settings) => Promise<void>;
  disabled: boolean;
}) {
  const [form, setForm] = useState<Settings>(settings ?? FALLBACK);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const handleSave = async () => {
    try {
      await onSave(form);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const field = (key: keyof Settings, label: string, hint: string) => (
    <div>
      <label className="text-xs text-secondary block mb-2">{label}</label>
      <input
        type="number"
        min={1}
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setStatus("idle");
        }}
        className={inputClass}
      />
      <p className="text-xs text-tertiary mt-1.5">{hint}</p>
    </div>
  );

  return (
    <div>
      <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">
        Scanning
      </h2>
      <div className="space-y-4 px-4 py-3 bg-base-800 border border-divider rounded">
        {field("scan_interval", "Scan interval (seconds)", "How often the backend rescans nearby networks.")}
        {field("suspicious_threshold", "Detection threshold", "Score at or above this is flagged Suspicious.")}
        {field("alert_threshold", "Rogue threshold", "Score at or above this is flagged Rogue.")}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={disabled}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
          >
            Save changes
          </button>
          {status === "saved" && <span className="text-xs text-safe-400">Saved</span>}
          {status === "error" && (
            <span className="text-xs text-danger-400">Could not save. Is the backend running?</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings, clearAlerts, connected } = useBackend();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-primary mb-1">Settings</h1>
        <p className="text-xs text-secondary">
          Configure scanning behavior and notification preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Scanning */}
        <ScanningSection
          key={settings ? "loaded" : "loading"}
          settings={settings}
          onSave={saveSettings}
          disabled={!connected}
        />

        {/* Alerts */}
        <div>
          <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">
            Notifications
          </h2>
          <div className="space-y-3 px-4 py-3 bg-base-800 border border-divider rounded">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 accent-primary-600"
              />
              <span className="text-xs text-primary group-hover:text-secondary transition-colors">
                Desktop notifications
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 accent-primary-600"
              />
              <span className="text-xs text-primary group-hover:text-secondary transition-colors">
                Sound alerts on detection
              </span>
            </label>
          </div>
        </div>

        {/* Display */}
        <div>
          <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">
            Display
          </h2>
          <div className="space-y-3 px-4 py-3 bg-base-800 border border-divider rounded">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" className="w-4 h-4 accent-primary-600" />
              <span className="text-xs text-primary group-hover:text-secondary transition-colors">
                Compact mode
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 accent-primary-600"
              />
              <span className="text-xs text-primary group-hover:text-secondary transition-colors">
                Enable animations
              </span>
            </label>
          </div>
        </div>

        {/* Data */}
        <div>
          <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">
            Data Management
          </h2>
          <div className="space-y-2 px-4 py-3 bg-base-800 border border-divider rounded">
            <button
              onClick={() => void clearAlerts()}
              disabled={!connected}
              className="text-xs text-secondary hover:text-primary disabled:opacity-50 transition-colors text-left py-1"
            >
              Clear alert history
            </button>
            <a
              href={api.exportAlertsUrl()}
              className="block text-xs text-secondary hover:text-primary transition-colors text-left py-1"
            >
              Export alert log (CSV)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
