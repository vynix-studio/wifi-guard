export default function SettingsPage() {
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
        <div>
          <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">
            Scanning
          </h2>
          <div className="space-y-4 px-4 py-3 bg-base-800 border border-divider rounded">
            <div>
              <label className="text-xs text-secondary block mb-2">
                Scan interval
              </label>
              <input
                type="text"
                defaultValue="2.4 seconds"
                className="w-full bg-base-700 border border-divider rounded px-3 py-2 text-xs text-primary focus:outline-none focus:border-primary-600 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-secondary block mb-2">
                Detection threshold
              </label>
              <input
                type="text"
                defaultValue="20"
                className="w-full bg-base-700 border border-divider rounded px-3 py-2 text-xs text-primary focus:outline-none focus:border-primary-600 transition-colors"
              />
            </div>
          </div>
        </div>

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
            <button className="text-xs text-secondary hover:text-primary transition-colors text-left py-1">
              Clear alert history
            </button>
            <button className="text-xs text-secondary hover:text-primary transition-colors text-left py-1">
              Export scan data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
