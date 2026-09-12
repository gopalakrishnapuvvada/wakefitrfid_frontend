import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DataProvider } from './context/DataContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ProductValidation } from './pages/ProductValidation';
import { LabelGeneration } from './pages/LabelGeneration';
import { HistoryPage } from './pages/HistoryPage';
import { MasterData } from './pages/MasterData';
import { RoleAdmin } from './pages/RoleAdmin';
import { DeviceManagement } from './pages/DeviceManagement';

const MainRouter: React.FC = () => {
  const { isAuthenticated, currentRole } = useAuth();
  const [activeMenuKey, setActiveMenuKey] = useState<string>(() => {
    return currentRole?.id === 'operator' ? 'product-validation' : 'dashboard';
  });

  useEffect(() => {
    if (currentRole?.id === 'operator' && activeMenuKey !== 'product-validation') {
      setActiveMenuKey('product-validation');
    }
  }, [currentRole?.id]);

  if (!isAuthenticated) {
    return <Login />;
  }

  const isOperator = currentRole.id === 'operator';
  const isAdmin = currentRole.id === 'admin';

  const renderActivePage = () => {
    if (isOperator) {
      return <ProductValidation />;
    }

    switch (activeMenuKey) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveMenuKey} />;
      case 'product-validation':
        return <ProductValidation />;
      case 'label-generation':
        return <LabelGeneration />;
      case 'history':
        return <HistoryPage onNavigate={setActiveMenuKey} />;
      case 'master-data':
        return isAdmin ? <MasterData /> : <Dashboard onNavigate={setActiveMenuKey} />;
      case 'role-admin':
        return isAdmin ? <RoleAdmin /> : <Dashboard onNavigate={setActiveMenuKey} />;
      case 'devices':
      case 'devices-handheld':
      case 'devices-rfid':
      case 'devices-gateway':
      case 'devices-barcode':
        return isAdmin ? <DeviceManagement /> : <Dashboard onNavigate={setActiveMenuKey} />;
      default:
        return <Dashboard onNavigate={setActiveMenuKey} />;
    }
  };

  return (
    <AppLayout activeMenuKey={activeMenuKey} onSelectMenu={setActiveMenuKey}>
      {renderActivePage()}
    </AppLayout>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <MainRouter />
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
