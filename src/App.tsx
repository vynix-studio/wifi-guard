import { useState } from 'react';
import AppShell from './components/layout/AppShell';
import ScanOverview from './pages/ScanOverview';
import AlertsPage from './pages/AlertsPage';
import TrustedAPsPage from './pages/TrustedAPsPage';
import SettingsPage from './pages/SettingsPage';

type NavView = 'overview' | 'alerts' | 'trusted' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<NavView>('overview');
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return <ScanOverview selectedNetworkId={selectedNetworkId} onSelectNetwork={setSelectedNetworkId} />;
      case 'alerts':
        return <AlertsPage />;
      case 'trusted':
        return <TrustedAPsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <ScanOverview selectedNetworkId={selectedNetworkId} onSelectNetwork={setSelectedNetworkId} />;
    }
  };

  return (
    <AppShell
      currentView={currentView}
      onNavigate={setCurrentView}
    >
      {renderContent()}
    </AppShell>
  );
}
