
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { UserRole, Driver } from '@/types';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import DriversPage from '@/pages/DriversPage';
import StationsPage from '@/pages/StationsPage';
import TicketsPage from '@/pages/TicketsPage';
import DriverDetailPage from '@/pages/DriverDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import InventoryPage from '@/pages/InventoryPage';
import AlertsPage from '@/pages/AlertsPage';
import IDCardsPage from '@/pages/IDCardsPage';
import CashReportPage from '@/pages/CashReportPage';
import SwappingSessionsPage from '@/pages/SwappingSessionsPage';
import Login from '@/components/Login';
import UserManagement from '@/pages/UserManagement';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import ErrorBoundary from '@/components/ErrorBoundary';

const App: React.FC = () => {
  const { user, role, userName, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Selection States
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const handleDriverSelect = (driver: Driver) => {
    setSelectedDriver(driver);
    navigate(`/drivers/${driver.driver_id}`);
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center dark:bg-zinc-950 transition-colors"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <Login isDarkMode={isDarkMode} />;

  const activeTab = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div className="flex h-screen w-full overflow-hidden transition-colors bg-[#F8F9FB] dark:bg-zinc-950">
      <Sidebar 
        role={role} 
        activeTab={activeTab} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onLogout={logout} 
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          role={role} 
          onMenuClick={() => setIsSidebarOpen(true)} 
          isDarkMode={isDarkMode} 
          onThemeToggle={() => setIsDarkMode(!isDarkMode)} 
          user={user}
          userName={userName}
        />
        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="w-full mx-auto">
            <ErrorBoundary>
              <Routes>
                <Route path="/dashboard" element={<Dashboard isDarkMode={isDarkMode} />} />
                <Route path="/alerts" element={(role === UserRole.ADMIN || role === UserRole.SUPPORT_EXECUTIVE || role === UserRole.TECHNICIAN) ? <AlertsPage isDarkMode={isDarkMode} db={db} user={user} role={role} /> : <div className="p-20 text-center font-bold text-gray-400">Access Denied</div>} />
                <Route path="/id-cards" element={role === UserRole.ADMIN ? <IDCardsPage isDarkMode={isDarkMode} db={db} user={user} role={role} userName={userName} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/drivers" element={role === UserRole.ADMIN ? <DriversPage onDriverSelect={handleDriverSelect} isDarkMode={isDarkMode} role={role} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/stations" element={role === UserRole.ADMIN ? <StationsPage isDarkMode={isDarkMode} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/tickets" element={(role === UserRole.ADMIN || role === UserRole.SUPPORT_EXECUTIVE || role === UserRole.TECHNICIAN) ? <TicketsPage isDarkMode={isDarkMode} user={user} role={role} db={db} userName={userName} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/drivers/:id" 
                  element={
                    selectedDriver ? (
                      <DriverDetailPage
                        driver={selectedDriver}
                        onBack={() => navigate('/drivers')}
                        db={db}
                        user={user}
                      />
                    ) : (
                      <Navigate to="/drivers" replace />
                    )
                  } 
                />
                <Route path="/inventory" element={role === UserRole.ADMIN ? <InventoryPage isDarkMode={isDarkMode} db={db} user={user} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/swap-sessions" element={role === UserRole.ADMIN ? <SwappingSessionsPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/cash-report" element={(role === UserRole.ADMIN || role === UserRole.SUPERVISOR) ? <CashReportPage isDarkMode={isDarkMode} db={db} user={user} role={role} userName={userName} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/users" element={role === UserRole.ADMIN ? <UserManagement isDarkMode={isDarkMode} db={db} /> : <Navigate to="/dashboard" replace />} />
                <Route path="/settings" element={role === UserRole.ADMIN ? <SettingsPage db={db} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} user={user} /> : <Navigate to="/dashboard" replace />} />
                
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<div className="p-20 text-center font-bold text-gray-400">Page Not Found</div>} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
