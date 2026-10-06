import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useBackend } from "../context/BackendContext";

const BSSID_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

export default function TrustedAPsPage() {
  const { trusted, trustNetwork, untrustNetwork, connected } = useBackend();
  const [adding, setAdding] = useState(false);
  const [ssid, setSsid] = useState("");
  const [bssid, setBssid] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) return setError("Enter the network name (SSID).");
    if (!BSSID_PATTERN.test(bssid.trim())) {
      return setError("BSSID must look like AA:BB:CC:11:22:33.");
    }
    try {
      await trustNetwork(ssid.trim(), bssid.trim().toLowerCase());
      setSsid("");
      setBssid("");
      setError(null);
      setAdding(false);
    } catch {
      setError("Could not save. Is the backend running?");
    }
  };

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
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={!connected}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <Plus size={13} />
          Add AP
        </button>
      </div>

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 px-4 py-3 bg-base-800 border border-divider rounded flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-secondary block mb-2">SSID</label>
            <input
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="CafeWiFi"
              className="w-full bg-base-700 border border-divider rounded px-3 py-2 text-xs text-primary focus:outline-none focus:border-primary-600 transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-secondary block mb-2">BSSID</label>
            <input
              value={bssid}
              onChange={(e) => setBssid(e.target.value)}
              placeholder="aa:bb:cc:11:22:33"
              className="w-full bg-base-700 border border-divider rounded px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-primary-600 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded text-xs font-semibold transition-colors"
          >
            Save
          </button>
          {error && <p className="w-full text-xs text-danger-400">{error}</p>}
        </form>
      )}

      {trusted.length === 0 ? (
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
      ) : (
        <div className="border border-divider rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-base-800">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SSID</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">BSSID</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">ADDED</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {trusted.map((ap, index) => (
                <tr
                  key={`${ap.ssid}-${ap.bssid}`}
                  className={`border-b border-divider ${
                    index === trusted.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-primary font-medium">{ap.ssid}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-tertiary">{ap.bssid}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-tertiary">
                    {ap.added_on.replace("T", " ")}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => void untrustNetwork(ap.ssid, ap.bssid)}
                      title="Remove from trusted"
                      className="p-1.5 hover:bg-base-700 rounded transition-colors"
                    >
                      <Trash2 size={13} className="text-secondary" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
