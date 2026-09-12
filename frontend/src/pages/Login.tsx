import React, { useState } from 'react';
import { 
  Button, 
  Tag, 
  Input, 
  message,
  Tooltip
} from 'antd';
import { 
  SafetyCertificateOutlined, 
  ControlOutlined, 
  BarcodeOutlined, 
  ArrowRightOutlined,
  BulbOutlined,
  BulbFilled,
  LockOutlined,
  CheckCircleFilled,
  GlobalOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { UaimLogo } from '../components/common/UaimLogo';
import type { RoleId } from '../types';

export const Login: React.FC = () => {
  const { allRoles, loginRole } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();

  const [selectedRole, setSelectedRole] = useState<RoleId>('admin');
  const [password, setPassword] = useState<string>('admin');
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const getRoleIcon = (roleId: RoleId) => {
    switch (roleId) {
      case 'admin':
        return <SafetyCertificateOutlined style={{ fontSize: '20px' }} />;
      case 'supervisor':
        return <ControlOutlined style={{ fontSize: '20px' }} />;
      case 'operator':
        return <BarcodeOutlined style={{ fontSize: '20px' }} />;
      default:
        return <SafetyCertificateOutlined style={{ fontSize: '20px' }} />;
    }
  };

  const handleRoleSelect = (roleId: RoleId) => {
    setSelectedRole(roleId);
    const role = allRoles.find(r => r.id === roleId);
    setPassword(role?.password || roleId);
  };

  const handleLogin = (roleId?: RoleId) => {
    const targetRole = roleId || selectedRole;
    setLoadingRole(targetRole);
    setTimeout(() => {
      const role = allRoles.find(r => r.id === targetRole);
      const isSuccess = loginRole(targetRole, password || role?.password);
      setLoadingRole(null);

      if (isSuccess) {
        message.success({
          content: `Authenticated as ${role?.name || targetRole}. Welcome to Wakefit FG System!`,
          duration: 3,
        });
      } else {
        message.error({
          content: `Incorrect password for ${role?.name || targetRole}. Please verify credentials.`,
          duration: 4,
        });
      }
    }, 350);
  };

  const activeRoleData = allRoles.find(r => r.id === selectedRole) || allRoles[0];

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        backgroundImage: 'url(/images/round_packing_bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Industrial Transparent Backdrop Overlay Scrim */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.78) 0%, rgba(2, 6, 23, 0.94) 100%)'
            : 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.65) 0%, rgba(10, 15, 29, 0.88) 100%)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1,
        }}
      />

      {/* Top Floating Glass Header */}
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 32px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>
            wakefit<span style={{ color: '#E53935' }}>.</span>
          </span>
          <Tag color="#E53935" style={{ fontSize: '11px', fontWeight: 700, margin: 0, borderRadius: '4px' }}>
            FG LABEL SYSTEM
          </Tag>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Tooltip title="Toggle Dark/Light Theme">
            <Button
              type="text"
              shape="circle"
              icon={isDark ? <BulbFilled style={{ color: '#F59E0B', fontSize: '18px' }} /> : <BulbOutlined style={{ color: '#ffffff', fontSize: '18px' }} />}
              onClick={toggleTheme}
              style={{
                width: 38,
                height: 38,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
          </Tooltip>

          <UaimLogo size="small" showText={true} poweredBy={true} />
        </div>
      </header>

      {/* Center Simple Professional Login Card */}
      <main
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          flex: 1,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
            borderRadius: '16px',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.8)'}`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(229, 57, 53, 0.15)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            padding: '32px 28px',
            color: isDark ? '#f8fafc' : '#0f172a',
          }}
        >
          {/* Brand & Portal Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', marginBottom: '10px' }}>
              <UaimLogo size="large" showText={false} />
            </div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 800,
                margin: '0 0 4px 0',
                color: isDark ? '#f8fafc' : '#0f172a',
                letterSpacing: '-0.3px',
              }}
            >
              Finished Goods Auto-ID Portal
            </h1>
            <p
              style={{
                fontSize: '13px',
                color: isDark ? '#94a3b8' : '#64748b',
                margin: 0,
              }}
            >
              Packaging Line & RFID Traceability Engine
            </p>
          </div>

          {/* 3 Simple Operating Roles Selector */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: isDark ? '#94a3b8' : '#64748b',
                marginBottom: '8px',
              }}
            >
              Select Operating Role
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              {allRoles.map(role => {
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleRoleSelect(role.id as RoleId)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px 6px',
                      borderRadius: '10px',
                      border: `2px solid ${isSelected ? role.color : isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(30, 41, 59, 0.9)'
                          : 'rgba(241, 245, 249, 0.95)'
                        : isDark
                          ? 'rgba(15, 23, 42, 0.5)'
                          : 'rgba(255, 255, 255, 0.6)',
                      color: isSelected ? (isDark ? '#f8fafc' : '#0f172a') : '#94a3b8',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                    }}
                  >
                    <div
                      style={{
                        color: isSelected ? role.color : '#94a3b8',
                        marginBottom: '4px',
                      }}
                    >
                      {getRoleIcon(role.id as RoleId)}
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: isSelected ? 800 : 600,
                      }}
                    >
                      {role.badgeTitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Role Privilege Summary */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.8)',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircleFilled style={{ color: activeRoleData.color }} />
              <span style={{ fontWeight: 700, color: activeRoleData.color }}>
                {activeRoleData.name}
              </span>
            </div>
            <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '11px' }}>
              {activeRoleData.id === 'admin' 
                ? 'Full Admin Access' 
                : activeRoleData.id === 'supervisor' 
                  ? 'Shop Floor + History' 
                  : 'Validation & Scan Only'}
            </span>
          </div>

          {/* Password Input Field */}
          <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: isDark ? '#94a3b8' : '#64748b',
                }}
              >
                Security Password
              </label>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Default: <code style={{ color: activeRoleData.color, fontWeight: 700 }}>{activeRoleData.password || activeRoleData.id}</code>
              </span>
            </div>

            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: '4px' }} />}
              placeholder={`Enter password for ${activeRoleData.badgeTitle}`}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onPressEnter={() => handleLogin(selectedRole)}
              style={{
                borderRadius: '8px',
                height: '44px',
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
                borderColor: isDark ? '#334155' : '#d1d5db',
              }}
            />
          </div>

          {/* Primary Action Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={<ArrowRightOutlined />}
            onClick={() => handleLogin(selectedRole)}
            loading={loadingRole === selectedRole}
            style={{
              height: '48px',
              backgroundColor: activeRoleData.color,
              borderColor: activeRoleData.color,
              fontSize: '15px',
              fontWeight: 800,
              borderRadius: '8px',
              boxShadow: `0 4px 16px ${activeRoleData.color}55`,
            }}
          >
            Log In as {activeRoleData.name}
          </Button>

          {/* Security Guarantee */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '16px',
              fontSize: '11px',
              color: isDark ? '#64748b' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <GlobalOutlined />
            <span>SQLite Local DB & MES Industrial Security Protocol</span>
          </div>
        </div>
      </main>

      {/* Bottom Subtle Glass Footer */}
      <footer
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          padding: '14px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span>Wakefit Innovations Pvt. Ltd.</span>
        <span>•</span>
        <span>Packaging Automation & Roll-Packing Station</span>
        <span>•</span>
        <span>UAIM Systems</span>
      </footer>
    </div>
  );
};

export default Login;
