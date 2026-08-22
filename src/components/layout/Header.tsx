import { Settings, Search } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-14 bg-panel border-divider border-b flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="text-xs font-semibold tracking-wide">AEGIS</div>

        <div className="flex items-center gap-2.5 ml-4">
          <span className="w-1.5 h-1.5 bg-primary-500 rounded-full pulse-soft"></span>
          <span className="text-xs font-medium text-secondary">SCANNING</span>
          <span className="text-xs text-tertiary">2.4s ago</span>
        </div>

        <div className="flex items-center gap-6 ml-auto">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-tertiary font-semibold">12 NETWORKS</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-tertiary font-semibold">2 ALERTS</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="p-1.5 hover:bg-base-700 rounded transition-colors" title="Search (⌘K)">
          <Search size={15} className="text-secondary" />
        </button>
        <button className="p-1.5 hover:bg-base-700 rounded transition-colors" title="Settings">
          <Settings size={15} className="text-secondary" />
        </button>
      </div>
    </header>
  );
}
