import React, { useState } from 'react';
import { 
  Card, 
  Tag, 
  Button, 
  message, 
  Row, 
  Col, 
  Modal, 
  Form, 
  Input, 
  Typography,
} from 'antd';
import { 
  KeyOutlined, 
  SafetyCertificateOutlined, 
  ControlOutlined, 
  BarcodeOutlined, 
  LockOutlined,
  CheckOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import type { RoleId } from '../types';

const { Title, Paragraph } = Typography;

export const RoleAdmin: React.FC = () => {
  const { allRoles, currentRole, changeRolePassword } = useAuth();
  const { isDark } = useAppTheme();

  // Password Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedRoleForPassword, setSelectedRoleForPassword] = useState<RoleId | null>(null);
  const [form] = Form.useForm();

  const handleOpenPasswordModal = (roleId: RoleId) => {
    setSelectedRoleForPassword(roleId);
    form.resetFields();
    setPasswordModalOpen(true);
  };

  const handleSavePassword = async () => {
    try {
      const values = await form.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('New Password and Confirm Password do not match!');
        return;
      }

      if (selectedRoleForPassword) {
        const success = changeRolePassword(selectedRoleForPassword, values.newPassword);
        if (success) {
          const roleObj = allRoles.find(r => r.id === selectedRoleForPassword);
          message.success({
            content: `Password updated successfully for ${roleObj?.name || selectedRoleForPassword}!`,
            duration: 3,
          });
          setPasswordModalOpen(false);
          form.resetFields();
        } else {
          message.error('Failed to update password. Please check your input.');
        }
      }
    } catch (err) {
      console.error('Password validation failed', err);
    }
  };

  const getRoleIcon = (roleId: RoleId) => {
    switch (roleId) {
      case 'admin':
        return <SafetyCertificateOutlined style={{ fontSize: '24px', color: '#D32F2F' }} />;
      case 'supervisor':
        return <ControlOutlined style={{ fontSize: '24px', color: '#0284C7' }} />;
      case 'operator':
        return <BarcodeOutlined style={{ fontSize: '24px', color: '#10B981' }} />;
      default:
        return <SafetyCertificateOutlined style={{ fontSize: '24px' }} />;
    }
  };

  const targetRoleData = allRoles.find(r => r.id === selectedRoleForPassword);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Role Administration & Access Security
            </Title>
            <Paragraph style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
              Simple 3-tier security model: <strong>Admin</strong>, <strong>Supervisor</strong>, and <strong>Operator</strong>. Admins maintain full password authority across all roles.
            </Paragraph>
          </div>

          <Tag color="error" style={{ fontSize: '12px', padding: '4px 10px', fontWeight: 600 }}>
            ADMIN ACCESS ONLY
          </Tag>
        </div>
      </Card>

      {/* 3 Role Cards with Password Change Buttons */}
      <Row gutter={[16, 16]}>
        {allRoles.map(role => {
          const isActive = currentRole.id === role.id;
          return (
            <Col xs={24} md={8} key={role.id}>
              <Card
                bordered={false}
                style={{
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  borderRadius: '12px',
                  border: `2px solid ${isActive ? role.color : isDark ? '#334155' : '#e2e8f0'}`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isActive ? `0 4px 14px ${role.color}25` : undefined,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {getRoleIcon(role.id as RoleId)}
                      <div>
                        <strong style={{ fontSize: '16px', display: 'block', color: isDark ? '#f8fafc' : '#0f172a' }}>
                          {role.name}
                        </strong>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Role ID: {role.id}</span>
                      </div>
                    </div>

                    <Tag color={role.color} style={{ fontWeight: 700, margin: 0, fontSize: '12px', padding: '2px 8px' }}>
                      {role.badgeTitle}
                    </Tag>
                  </div>

                  <p style={{ fontSize: '12px', color: '#64748b', minHeight: '36px', margin: '8px 0 16px 0', lineHeight: 1.4 }}>
                    {role.description}
                  </p>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      fontSize: '12px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748b' }}>Password Status: </span>
                      <strong style={{ color: '#10B981' }}>● Configured</strong>
                    </div>
                    <Tag color="default" style={{ fontFamily: 'monospace', margin: 0 }}>
                      {role.password ? '••••••••' : 'Default'}
                    </Tag>
                  </div>
                </div>

                <Button
                  type="primary"
                  block
                  icon={<KeyOutlined />}
                  style={{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F', fontWeight: 600 }}
                  onClick={() => handleOpenPasswordModal(role.id as RoleId)}
                >
                  Change {role.badgeTitle} Password
                </Button>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Role Access Matrix (Read-Only Summary) */}

      {/* Admin Change Password Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyOutlined style={{ color: '#E53935' }} />
            <span>Change Password: {targetRoleData?.name || selectedRoleForPassword}</span>
          </div>
        }
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onOk={handleSavePassword}
        okText="Update Password"
        okButtonProps={{ style: { backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 600 } }}
        centered
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: isDark ? '#0f172a' : '#f8fafc',
              border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Target Role:</span>
              <Tag color={targetRoleData?.color} style={{ fontWeight: 700, margin: 0 }}>
                {targetRoleData?.badgeTitle}
              </Tag>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Updating this password will require users logging in as {targetRoleData?.name} to use the new credentials.
            </div>
          </div>

          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 3, message: 'Password must be at least 3 characters long' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Enter new password (e.g. admin123)"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Confirm New Password"
            rules={[
              { required: true, message: 'Please confirm the new password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('The two passwords do not match!'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<CheckOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Re-enter new password to confirm"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
