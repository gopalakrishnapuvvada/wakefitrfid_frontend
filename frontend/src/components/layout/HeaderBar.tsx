import React, { useState } from 'react';
import { 
  Button, 
  Space, 
  Tag, 
  Tooltip, 
  Badge, 
  Popover, 
  List, 
  Modal 
} from 'antd';
import { 
  MenuUnfoldOutlined, 
  MenuFoldOutlined, 
  BulbOutlined, 
  BulbFilled, 
  BellOutlined, 
  LogoutOutlined, 
  CheckCircleTwoTone,
  ExclamationCircleOutlined,
  SafetyCertificateFilled,
  WifiOutlined
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';

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
  const { stats, devices } = useData();

  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);

  const notifications = [
    {
      id: '1',
      title: 'CIPHER RS38 Handheld #01 Connected',
      desc: 'Line 1 UHF reader active and ready for FG label scanning.',
      time: '2 mins ago',
      icon: <WifiOutlined style={{ color: '#10B981' }} />,
    },
    {
      id: '2',
      title: 'Zebra ZT411 Inlay Verification',
      desc: '100% RFID EPC parity achieved on Batch BATCH-2026-0831-A.',
      time: '15 mins ago',
      icon: <CheckCircleTwoTone twoToneColor="#10B981" />,
    },
    {
      id: '3',
      title: 'Periodic Backup Complete',
      desc: 'Master SKU catalog synchronised with factory ERP database.',
      time: '1 hr ago',
      icon: <ExclamationCircleOutlined style={{ color: '#0284C7' }} />,
    },
  ];

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

  const notificationContent = (
    <div style={{ width: '320px', maxWidth: '90vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
        <strong>Hardware & System Alerts</strong>
        <Tag color="blue">{notifications.length} New</Tag>
      </div>
      <List
        size="small"
        dataSource={notifications}
        renderItem={item => (
          <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <List.Item.Meta
              avatar={item.icon}
              title={<span style={{ fontSize: '12px', fontWeight: 600 }}>{item.title}</span>}
              description={
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{item.desc}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{item.time}</div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );

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
        {!isMobile && (
          <Tooltip title={`${stats.totalActiveDevices} out of ${devices.length} hardware scanners/readers currently online`}>
            <Tag 
              color={stats.totalActiveDevices === devices.length ? 'success' : 'warning'} 
              icon={<WifiOutlined />}
              style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              {stats.totalActiveDevices}/{devices.length} Devices Online
            </Tag>
          </Tooltip>
        )}

        <Tooltip title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
          <Button
            type="text"
            shape="circle"
            icon={isDark ? <BulbFilled style={{ color: '#F59E0B' }} /> : <BulbOutlined />}
            onClick={toggleTheme}
            style={{ width: 38, height: 38 }}
          />
        </Tooltip>

        <Popover content={notificationContent} trigger="click" placement="bottomRight">
          <Badge count={notifications.length} size="small" offset={[-2, 4]}>
            <Button
              type="text"
              shape="circle"
              icon={<BellOutlined style={{ fontSize: '16px' }} />}
              style={{ width: 38, height: 38 }}
            />
          </Badge>
        </Popover>

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
