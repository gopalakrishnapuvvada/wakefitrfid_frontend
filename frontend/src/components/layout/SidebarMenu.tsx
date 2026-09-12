import React from 'react';
import { Layout, Menu, Drawer, Tag } from 'antd';
import { 
  DashboardOutlined, 
  ScanOutlined, 
  PrinterOutlined, 
  HistoryOutlined,
  SettingOutlined, 
  DatabaseOutlined, 
  UserSwitchOutlined, 
  ClusterOutlined 
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { UaimLogo } from '../common/UaimLogo';

const { Sider } = Layout;

interface SidebarMenuProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  activeMenuKey: string;
  onSelectMenu: (key: string) => void;
  isMobile: boolean;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({
  collapsed,
  onCollapse,
  activeMenuKey,
  onSelectMenu,
  isMobile,
  mobileDrawerOpen,
  onCloseMobileDrawer,
}) => {
  const { currentRole } = useAuth();
  const { isDark } = useAppTheme();
  const isOperator = currentRole.id === 'operator';
  const isAdmin = currentRole.id === 'admin';

  const baseMenuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined style={{ fontSize: '16px' }} />,
      label: 'Dashboard',
    },
    {
      key: 'product-validation',
      icon: <ScanOutlined style={{ fontSize: '16px' }} />,
      label: 'Product Validation',
    },
    {
      key: 'label-generation',
      icon: <PrinterOutlined style={{ fontSize: '16px' }} />,
      label: 'Label Lookup',
    },
    {
      key: 'history',
      icon: <HistoryOutlined style={{ fontSize: '16px' }} />,
      label: 'History',
    },
  ];

  const configurationGroup = {
    key: 'configuration-group',
    icon: <SettingOutlined style={{ fontSize: '16px' }} />,
    label: 'Configuration',
    children: [
      {
        key: 'master-data',
        icon: <DatabaseOutlined style={{ fontSize: '15px' }} />,
        label: 'Master Data (FG Items)',
      },
      {
        key: 'devices',
        icon: <ClusterOutlined style={{ fontSize: '15px' }} />,
        label: 'Device Management',
      },
      {
        key: 'role-admin',
        icon: <UserSwitchOutlined style={{ fontSize: '15px' }} />,
        label: 'Role Administration',
      },
    ],
  };

  let menuItems;
  if (isOperator) {
    menuItems = [
      {
        key: 'product-validation',
        icon: <ScanOutlined style={{ fontSize: '16px' }} />,
        label: 'Product Validation',
      },
    ];
  } else if (isAdmin) {
    menuItems = [...baseMenuItems, configurationGroup];
  } else {
    menuItems = baseMenuItems;
  }

  const handleMenuClick = ({ key }: { key: string }) => {
    onSelectMenu(key);
    if (isMobile) {
      onCloseMobileDrawer();
    }
  };

  const BrandHeader = (
    <div
      style={{
        height: '72px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      <UaimLogo size="medium" showText={false} />
      {(!collapsed || isMobile) && (
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                fontSize: '17px',
                fontWeight: 900,
                color: '#1E3A5F',
                letterSpacing: '-0.3px',
              }}
            >
              wakefit<span style={{ color: '#E53935' }}>.</span>
            </span>
            <Tag color="#E53935" style={{ fontSize: '9px', fontWeight: 800, padding: '0 4px', margin: 0 }}>
              FG LABELS
            </Tag>
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
            Powered by <strong>UAIM</strong>
          </div>
        </div>
      )}
    </div>
  );

  const RoleIndicatorCard = (!collapsed || isMobile) && (
    <div
      style={{
        padding: '12px 16px',
        margin: '12px',
        backgroundColor: isDark ? '#1e293b' : '#f8fafc',
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Role</span>
        <Tag color={currentRole.color} style={{ margin: 0, fontSize: '10px', fontWeight: 700 }}>
          {currentRole.badgeTitle}
        </Tag>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
        {currentRole.name}
      </div>
    </div>
  );

  // Desktop Sider
  if (!isMobile) {
    return (
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={onCollapse}
        width={260}
        collapsedWidth={80}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
          borderRight: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          zIndex: 101,
        }}
        trigger={null}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {BrandHeader}

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <Menu
              mode="inline"
              theme={isDark ? 'dark' : 'light'}
              selectedKeys={[activeMenuKey]}
              defaultOpenKeys={['configuration-group']}
              items={menuItems}
              onClick={handleMenuClick}
              style={{
                borderRight: 'none',
                backgroundColor: 'transparent',
                fontWeight: 500,
              }}
            />
          </div>

          {RoleIndicatorCard}
        </div>
      </Sider>
    );
  }

  // Mobile Slide-in Drawer
  return (
    <Drawer
      placement="left"
      onClose={onCloseMobileDrawer}
      open={mobileDrawerOpen}
      closable={false}
      styles={{ body: { padding: 0, backgroundColor: isDark ? '#0f172a' : '#ffffff' } }}
      width={280}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {BrandHeader}

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <Menu
            mode="inline"
            theme={isDark ? 'dark' : 'light'}
            selectedKeys={[activeMenuKey]}
            defaultOpenKeys={['configuration-group']}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              borderRight: 'none',
              backgroundColor: 'transparent',
              fontWeight: 500,
            }}
          />
        </div>

        {RoleIndicatorCard}
      </div>
    </Drawer>
  );
};
