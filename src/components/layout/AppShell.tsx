import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppShellProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function AppShell({ children, currentView, onNavigate }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-app overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
