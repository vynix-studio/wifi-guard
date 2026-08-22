import { Plus } from "lucide-react";

export default function TrustedAPsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-primary mb-1">
            Trusted Access Points
          </h1>
          <p className="text-xs text-secondary">
            Networks you explicitly approve as safe and trustworthy
          </p>
        </div>
        <button className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors">
          <Plus size={13} />
          Add AP
        </button>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-base-800 flex items-center justify-center mb-4">
          <div className="w-6 h-6 border border-safe-600 rounded-full"></div>
        </div>
        <h2 className="text-sm font-semibold text-primary mb-1">
          No trusted networks
        </h2>
        <p className="text-xs text-tertiary max-w-xs">
          Add trusted networks to your allowlist. These will be marked as safe
          during scans.
        </p>
      </div>
    </div>
  );
}
