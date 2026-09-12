import React from 'react';
import { Layout } from 'antd';
import { useAppTheme } from '../../context/ThemeContext';
import { UaimLogo } from '../common/UaimLogo';

const { Footer } = Layout;

export const AppFooter: React.FC = () => {
  const { isDark } = useAppTheme();

  return (
    <Footer
      style={{
        textAlign: 'center',
        padding: '16px 24px',
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        color: isDark ? '#94a3b8' : '#64748b',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
            Wakefit Finished Goods Label Generation & Auto-ID System
          </span>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>v2.4.0 (Enterprise)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UaimLogo size="small" showText={true} poweredBy={true} />
        </div>
      </div>
    </Footer>
  );
};
