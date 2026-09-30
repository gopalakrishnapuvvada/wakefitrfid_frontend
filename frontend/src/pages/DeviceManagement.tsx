import React, { useMemo, useState } from 'react';
import { Card, Table, Button, Form, Input, InputNumber, Modal, Typography, message, Popconfirm, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import type { DeviceItem } from '../types';

const { Title, Paragraph } = Typography;

export const DeviceManagement: React.FC = () => {
  const { devices, addDevice, updateDevice, deleteDevice } = useData();
  const { isDark } = useAppTheme();
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [form] = Form.useForm();

  const filteredDevices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return devices.filter(device => {
      if (!q) return true;
      const searchable = [device.name, device.displayName, device.ipAddress, device.macAddress, device.make]
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
      const payload = {
        name: (values.name || '').trim(),
        displayName: (values.name || '').trim(),
        ipAddress: (values.ipAddress || '').trim(),
        macAddress: (values.macAddress || '').trim(),
        make: (values.make || '').trim() || 'Unknown',
        port: Number(values.port || 0),
      };

      if (editingDevice) {
        updateDevice(editingDevice.id, payload);
        message.success(`Updated ${payload.name}`);
      } else {
        addDevice(payload);
        message.success(`Added ${payload.name}`);
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch {
      message.error('Please fill in the required device fields.');
    }
  };

  const columns: ColumnsType<DeviceItem> = [
    {
      title: 'Device Name',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => record.displayName || record.name,
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
            onConfirm={() => {
              deleteDevice(record.id);
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
            <Paragraph style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
              Simple device list with name, IP, MAC address, make, and port.
            </Paragraph>
          </div>

          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            Add Device
          </Button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search device by name, IP, MAC or make"
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
          scroll={{ x: 760 }}
        />
      </Card>

      <Modal
        title={editingDevice ? `Edit Device - ${editingDevice.displayName || editingDevice.name}` : 'Add Device'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        centered
        onOk={handleSubmit}
        okText={editingDevice ? 'Save' : 'Add Device'}
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical" style={{ marginTop: '8px' }}>
          <Form.Item
            name="name"
            label="Device Name"
            rules={[{ required: true, message: 'Please enter the device name' }]}
          >
            <Input placeholder="e.g. Zebra Scanner 01" />
          </Form.Item>

          <Form.Item name="ipAddress" label="IP Address">
            <Input placeholder="192.168.10.25" />
          </Form.Item>

          <Form.Item name="macAddress" label="MAC Address">
            <Input placeholder="00:1A:2B:3C:4D:5E" />
          </Form.Item>

          <Form.Item name="make" label="Make">
            <Input placeholder="Zebra / Honeywell / CipherLab" />
          </Form.Item>

          <Form.Item name="port" label="Port">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="8080" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
