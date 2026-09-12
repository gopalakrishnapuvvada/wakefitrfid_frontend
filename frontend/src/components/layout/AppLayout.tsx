import React, { useState, useEffect } from 'react';
import { Layout } from 'antd';
import { HeaderBar } from './HeaderBar';
import { SidebarMenu } from './SidebarMenu';
import { AppFooter } from './AppFooter';
import { useAppTheme } from '../../context/ThemeContext';

const { Content } = Layout;

interface AppLayoutProps {
  activeMenuKey: string;
  onSelectMenu: (key: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeMenuKey,
  onSelectMenu,
  children,
}) => {
  const { isDark } = useAppTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Responsive breakpoint listener
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 992;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: isDark ? '#0b0f19' : '#f8fafc' }}>
      <SidebarMenu
        collapsed={collapsed}
        onCollapse={setCollapsed}
        activeMenuKey={activeMenuKey}
        onSelectMenu={onSelectMenu}
        isMobile={isMobile}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
      />

      <Layout style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <HeaderBar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          isMobile={isMobile}
          activeMenuKey={activeMenuKey}
        />

        <Content
          style={{
            flex: 1,
            padding: isMobile ? '16px 12px' : '24px',
            maxWidth: '1600px',
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </Content>

        <AppFooter />
      </Layout>
    </Layout>
  );
};
