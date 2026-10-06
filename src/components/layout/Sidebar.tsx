import { Bell, Shield, Lock, Sliders } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const navItems = [
    { id: 'overview', label: 'Live Monitor', icon: Shield },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'trusted', label: 'Trusted APs', icon: Lock },
  ];

  return (
    <aside className="w-48 bg-panel border-divider border-r flex flex-col">
      <div className="px-4 py-4 border-b border-divider">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-primary-600 text-white font-bold text-xs">
            📡
          </div>
          <span className="text-xs font-semibold tracking-wider">WiFi Scanner</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <p className="text-xs font-semibold text-tertiary px-2 mb-3">MONITORING</p>
        <div className="space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full text-left px-3 py-2 rounded text-xs font-medium transition-all ${
                currentView === id
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary hover:bg-base-700 hover:text-primary'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={14} className="flex-shrink-0" />
                <span>{label}</span>
              </div>
            </button>
          ))}
        </div>
      </nav>

      <div className="border-t border-divider px-3 py-4">
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full text-left px-3 py-2 rounded text-xs font-medium transition-all ${
            currentView === 'settings'
              ? 'bg-primary-600 text-white'
              : 'text-secondary hover:bg-base-700 hover:text-primary'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sliders size={14} className="flex-shrink-0" />
            <span>Settings</span>
          </div>
        </button>
      </div>
    </aside>
  );
}
