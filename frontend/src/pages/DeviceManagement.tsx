import React, { useMemo, useState } from 'react';
import { Card, Table, Button, Form, Input, InputNumber, Modal, Typography, message, Popconfirm, Space, Select, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, AlertOutlined } from '@ant-design/icons';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import type { DeviceItem, DeviceType } from '../types';

const { Title, Text } = Typography;

export const DeviceManagement: React.FC = () => {
  const { devices, addDevice, updateDevice, deleteDevice } = useData();
  const { isDark } = useAppTheme();
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [form] = Form.useForm();

  // Check if a Fixed RFID Scanner is already registered in the system
  const existingFixedScanner = useMemo(() => {
    return devices.find(
      d => (d.deviceType === 'Fixed RFID Scanner' || d.category === 'rfid_fixed') && d.id !== editingDevice?.id
    );
  }, [devices, editingDevice]);

  const filteredDevices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return devices.filter(device => {
      if (!q) return true;
      const searchable = [
        device.name,
        device.displayName,
        device.deviceType,
        device.ipAddress,
        device.macAddress,
        device.make,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
  }, [devices, searchText]);

  const handleOpenModal = (device?: DeviceItem) => {
    if (device) {
      setEditingDevice(device);
      form.setFieldsValue({
        name: device.name,
        deviceType: device.deviceType || (device.category === 'rfid_fixed' ? 'Fixed RFID Scanner' : 'Handheld Scanner'),
        ipAddress: device.ipAddress || '',
        macAddress: device.macAddress || '',
        make: device.make || '',
        port: device.port ?? 0,
      });
    } else {
      setEditingDevice(null);
      form.resetFields();
      form.setFieldsValue({
        name: '',
        deviceType: 'Handheld Scanner',
        ipAddress: '',
        macAddress: '',
        make: '',
        port: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const devType: DeviceType = values.deviceType || 'Handheld Scanner';
      const cleanName = (values.name || '').trim();
      const cleanIp = (values.ipAddress || '').trim();

      if (!cleanName) {
        message.error('Device Name is required.');
        return;
      }

      if (!cleanIp) {
        message.error('IP Address is required.');
        return;
      }

      // Check unique Device Name
      const duplicateName = devices.find(
        d => d.id !== editingDevice?.id && (d.name?.trim().toLowerCase() === cleanName.toLowerCase() || d.displayName?.trim().toLowerCase() === cleanName.toLowerCase())
      );
      if (duplicateName) {
        message.error(`Device Name '${cleanName}' already exists. Please choose a unique name.`);
        return;
      }

      // Check unique IP Address
      const duplicateIp = devices.find(
        d => d.id !== editingDevice?.id && d.ipAddress?.trim().toLowerCase() === cleanIp.toLowerCase()
      );
      if (duplicateIp) {
        message.error(`IP Address '${cleanIp}' is already assigned to device '${duplicateIp.displayName || duplicateIp.name}'.`);
        return;
      }

      // Strict Validation: Restrict to only 1 Fixed RFID Scanner across the system
      if (devType === 'Fixed RFID Scanner' && existingFixedScanner) {
        message.error(
          `Only one Fixed RFID Scanner is allowed in the system. Device '${existingFixedScanner.displayName || existingFixedScanner.name}' is already registered as a Fixed RFID Scanner.`
        );
        return;
      }

      const payload = {
        name: cleanName,
        displayName: cleanName,
        deviceType: devType,
        ipAddress: cleanIp,
        macAddress: (values.macAddress || '').trim(),
        make: (values.make || '').trim() || 'Unknown',
        port: Number(values.port || 0),
      };

      if (editingDevice) {
        await updateDevice(editingDevice.id, payload);
        message.success(`Updated device: ${payload.name}`);
      } else {
        await addDevice(payload);
        message.success(`Added device: ${payload.name}`);
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      if (err?.errorFields) {
        message.error(err.errorFields[0]?.errors?.[0] || 'Please fill in all required fields.');
      } else {
        message.error(err?.message || 'Failed to save device.');
      }
    }
  };

  const columns: ColumnsType<DeviceItem> = [
    {
      title: 'Device Name',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <span style={{ fontWeight: 600 }}>{record.displayName || record.name}</span>
      ),
    },
    {
      title: 'Device Type',
      dataIndex: 'deviceType',
      key: 'deviceType',
      render: (deviceType?: string, record?: DeviceItem) => {
        const isFixed = deviceType === 'Fixed RFID Scanner' || record?.category === 'rfid_fixed';
        return isFixed ? (
          <Tag color="purple" style={{ fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
            Fixed RFID Scanner
          </Tag>
        ) : (
          <Tag color="blue" style={{ fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
            Handheld Scanner
          </Tag>
        );
      },
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip) => ip || '—',
    },
    {
      title: 'MAC Address',
      dataIndex: 'macAddress',
      key: 'macAddress',
      render: (mac) => mac || '—',
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      render: (make) => make || 'Unknown',
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      render: (port) => port ?? '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(record)} />
          <Popconfirm
            title="Delete device?"
            description={`Remove ${record.displayName || record.name}?`}
            onConfirm={async () => {
              await deleteDevice(record.id);
              message.success(`Deleted ${record.displayName || record.name}`);
            }}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Device Management</Title>
            <Text type="secondary" style={{ fontSize: '13px' }}>
              Configure and manage Auto-ID barcode and RFID scanner hardware
            </Text>
          </div>

          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            Add Device
          </Button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search device by name, type, IP, MAC or make"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 360 }}
          />
        </div>
      </Card>

      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        <Table
          columns={columns}
          dataSource={filteredDevices}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          scroll={{ x: 820 }}
        />
      </Card>

      <Modal
        title={editingDevice ? `Edit Device - ${editingDevice.displayName || editingDevice.name}` : 'Add New Device'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        centered
        onOk={handleSubmit}
        okText={editingDevice ? 'Save Changes' : 'Add Device'}
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical" style={{ marginTop: '12px' }}>
          <Form.Item
            name="name"
            label="Device Name"
            rules={[
              { required: true, message: 'Please enter Device Name' },
              {
                validator: (_, value) => {
                  const clean = (value || '').trim();
                  if (!clean) return Promise.resolve();
                  const exists = devices.some(
                    d =>
                      d.id !== editingDevice?.id &&
                      (d.name?.trim().toLowerCase() === clean.toLowerCase() ||
                        d.displayName?.trim().toLowerCase() === clean.toLowerCase())
                  );
                  if (exists) {
                    return Promise.reject(new Error(`Device Name '${clean}' already exists. Please choose a unique name.`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="e.g. SICK Fixed RFID Portal / Zebra RS38" />
          </Form.Item>

          <Form.Item
            name="deviceType"
            label="Device Type"
            rules={[{ required: true, message: 'Please select device type' }]}
            extra={
              existingFixedScanner ? (
                <div style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertOutlined /> Note: Only 1 Fixed RFID Scanner allowed. &apos;{existingFixedScanner.displayName || existingFixedScanner.name}&apos; is already registered.
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Select Handheld Scanner or Fixed RFID Scanner (Maximum 1 Fixed RFID Scanner allowed).
                </span>
              )
            }
          >
            <Select
              placeholder="Select Device Type"
              options={[
                { label: 'Handheld Scanner', value: 'Handheld Scanner' },
                {
                  label: existingFixedScanner
                    ? 'Fixed RFID Scanner (Limit: 1 already registered)'
                    : 'Fixed RFID Scanner',
                  value: 'Fixed RFID Scanner',
                  disabled: Boolean(existingFixedScanner),
                },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="ipAddress"
            label="IP Address"
            rules={[
              { required: true, message: 'Please enter IP Address' },
              {
                pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
                message: 'Please enter a valid IPv4 address (e.g. 192.168.10.25)',
              },
              {
                validator: (_, value) => {
                  const clean = (value || '').trim();
                  if (!clean) return Promise.resolve();
                  const exists = devices.some(
                    d => d.id !== editingDevice?.id && d.ipAddress?.trim().toLowerCase() === clean.toLowerCase()
                  );
                  if (exists) {
                    return Promise.reject(new Error(`IP Address '${clean}' is already assigned to another device.`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="192.168.10.25" />
          </Form.Item>

          <Form.Item name="macAddress" label="MAC Address">
            <Input placeholder="00:1A:2B:3C:4D:5E" />
          </Form.Item>

          <Form.Item name="make" label="Make / Manufacturer">
            <Input placeholder="Zebra / Honeywell / SICK / CipherLab" />
          </Form.Item>

          <Form.Item name="port" label="Port">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="8080" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
