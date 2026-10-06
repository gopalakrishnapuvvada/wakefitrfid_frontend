import React, { useState } from 'react';
import { 
  Button, 
  Space, 
  Tooltip, 
  Modal 
} from 'antd';
import { 
  MenuUnfoldOutlined, 
  MenuFoldOutlined, 
  BulbOutlined, 
  BulbFilled, 
  LogoutOutlined, 
  SafetyCertificateFilled,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';

interface HeaderBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileDrawer: () => void;
  isMobile: boolean;
  activeMenuKey: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  collapsed,
  onToggleCollapse,
  onOpenMobileDrawer,
  isMobile,
  activeMenuKey,
}) => {
  const { currentRole, logout } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();

  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);

  const getPageTitle = (key: string) => {
    switch (key) {
      case 'dashboard':
        return 'Operations Dashboard';
      case 'product-validation':
        return 'FG Product Validation & Scan';
      case 'label-generation':
        return 'FG Label Lookup (Packaging Conveyor & SICK RFID)';
      case 'history':
        return 'FG Transaction Records';
      case 'master-data':
        return 'Configuration / Master Data (Material & Part No)';
      case 'role-admin':
        return 'Configuration / Role Administration';
      case 'devices':
      case 'devices-handheld':
      case 'devices-rfid':
      case 'devices-gateway':
      case 'devices-barcode':
        return 'Configuration / Device Management';
      default:
        return 'FG Label Generation System';
    }
  };

  const handleLogoutConfirm = () => {
    setIsLogoutModalVisible(false);
    logout();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        padding: isMobile ? '0 12px' : '0 24px',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button
          type="text"
          icon={isMobile ? <MenuUnfoldOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={isMobile ? onOpenMobileDrawer : onToggleCollapse}
          style={{ fontSize: '16px', width: 38, height: 38 }}
        />

        <div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? '15px' : '17px',
              fontWeight: 700,
              color: isDark ? '#f8fafc' : '#0f172a',
              letterSpacing: '-0.2px',
              lineHeight: 1.2,
            }}
          >
            {getPageTitle(activeMenuKey)}
          </h2>
          {!isMobile && (
            <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>
              Wakefit Finished Goods Label & RFID System
            </div>
          )}
        </div>
      </div>

      <Space size={isMobile ? 6 : 12} align="center">

        <Tooltip title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
          <Button
            type="text"
            shape="circle"
            icon={isDark ? <BulbFilled style={{ color: '#F59E0B' }} /> : <BulbOutlined />}
            onClick={toggleTheme}
            style={{ width: 38, height: 38 }}
          />
        </Tooltip>


        {/* Current Active Role Badge (Direct Switch Removed: Must Log Out & Log In) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            height: 38,
            padding: isMobile ? '0 8px' : '0 12px',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
            backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          }}
        >
          <SafetyCertificateFilled style={{ color: currentRole.color, fontSize: '15px' }} />
          {!isMobile && (
            <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>{currentRole.name}</div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>{currentRole.badgeTitle}</div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <Tooltip title={`Log Out (${currentRole.name})`}>
          <Button
            danger
            type="primary"
            icon={<LogoutOutlined />}
            onClick={() => setIsLogoutModalVisible(true)}
            style={{ 
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '12px',
              height: 38,
            }}
          >
            {!isMobile && 'Logout'}
          </Button>
        </Tooltip>
      </Space>

      {/* Logout Confirmation Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444' }}>
            <LogoutOutlined />
            <span>Confirm Terminal Logout</span>
          </div>
        }
        open={isLogoutModalVisible}
        onOk={handleLogoutConfirm}
        onCancel={() => setIsLogoutModalVisible(false)}
        okText="Yes, Log Out"
        okButtonProps={{ danger: true, style: { fontWeight: 600 } }}
        cancelText="Cancel"
      >
        <p style={{ fontSize: '14px', margin: '8px 0 4px 0' }}>
          You are currently operating as <strong>{currentRole.name}</strong> ({currentRole.badgeTitle}).
        </p>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          To change roles or switch operator accounts, log out and enter credentials on the login screen.
        </p>
      </Modal>
    </div>
  );
};
