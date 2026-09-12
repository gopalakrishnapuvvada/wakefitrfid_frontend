import React, { useState, useMemo } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Tag, 
  Space, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  Select, 
  Typography, 
  Row, 
  Col, 
  Progress, 
  message, 
  Popconfirm, 
  Tooltip, 
  Drawer,
  Segmented,
  Tabs,
  Descriptions,
  AutoComplete
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  MobileOutlined, 
  RadarChartOutlined, 
  SyncOutlined, 
  CodeOutlined,
  IdcardOutlined,
  EnvironmentOutlined,
  ApiOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import { DeviceStatusTag } from '../components/common/StatusTag';
import type { DeviceCategory, DeviceItem, DeviceStatus, ConnectionType, ScanMode } from '../types';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

export const DeviceManagement: React.FC = () => {
  const { devices, addDevice, updateDevice, deleteDevice, pingDevice } = useData();
  const { isDark } = useAppTheme();

  // Search & Filter State
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Modal & Drawer State
  const [modalTab, setModalTab] = useState<'identity' | 'connectivity' | 'operation'>('identity');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceItem | null>(null);
  const [pingingDeviceId, setPingingDeviceId] = useState<string | null>(null);
  const [diagnosticDevice, setDiagnosticDevice] = useState<DeviceItem | null>(null);
  const [form] = Form.useForm();

  // Filtered Devices
  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      const q = searchText.toLowerCase().trim();
      const matchesSearch = !q || 
        (dev.displayName || dev.name || '').toLowerCase().includes(q) ||
        (dev.assetCode || dev.code || '').toLowerCase().includes(q) ||
        (dev.stationId || dev.locationLine || '').toLowerCase().includes(q) ||
        (dev.ipAddress || '').toLowerCase().includes(q) ||
        (dev.serialNumber || '').toLowerCase().includes(q) ||
        (dev.manufacturer || '').toLowerCase().includes(q) ||
        (dev.model || '').toLowerCase().includes(q);

      const matchesCategory = selectedCategory === 'all' || dev.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || dev.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [devices, searchText, selectedCategory, selectedStatus]);

  // Statistics for 3 Standard Device States
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const errorCount = devices.filter(d => d.status === 'error').length;

  const handleOpenModal = (device?: DeviceItem) => {
    setModalTab('identity');
    if (device) {
      setEditingDevice(device);
      form.setFieldsValue({
        displayName: device.displayName || device.name,
        assetCode: device.assetCode || device.code,
        category: device.category,
        manufacturer: device.manufacturer || device.brand || 'CipherLab',
        model: device.model,
        serialNumber: device.serialNumber || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
        macAddress: device.macAddress,
        stationId: device.stationId || device.locationLine || 'Line 1 - Mattress & Recliner Final Pack',
        connectionType: device.connectionType || (device.ipAddress ? 'TCP/IP' : 'USB-HID'),
        ipAddress: device.ipAddress,
        subnetMask: device.subnetMask || (device.ipAddress ? '255.255.255.0' : undefined),
        gateway: device.gateway || (device.ipAddress ? '192.168.10.1' : undefined),
        port: device.port,
        comPort: device.comPort,
        connectionParameters: device.connectionParameters,
        scanMode: device.scanMode || device.triggerMode || 'Manual Scan',
        firmwareVersion: device.firmwareVersion || 'v1.0.0',
      });
    } else {
      setEditingDevice(null);
      form.resetFields();
      const defaultMac = `00:1F:B5:${Math.floor(10 + Math.random() * 89)}:${Math.floor(10 + Math.random() * 89)}:${Math.floor(10 + Math.random() * 89)}`;
      form.setFieldsValue({
        displayName: '',
        assetCode: '',
        category: 'handheld',
        manufacturer: 'CipherLab',
        model: 'RS38 UHF-RFID Rugged Mobile Computer',
        serialNumber: `SN-${Date.now().toString().slice(-6)}`,
        macAddress: defaultMac,
        connectionType: 'TCP/IP',
        ipAddress: '192.168.10.150',
        subnetMask: '255.255.255.0',
        gateway: '192.168.10.1',
        port: 8080,
        stationId: 'Line 1 - Mattress & Recliner Final Pack',
        scanMode: 'Manual Scan',
        firmwareVersion: 'v2.14.0',
        connectionParameters: 'Keep-Alive: 15s, Timeout: 3000ms',
      });
    }
    setModalTab('identity');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      const displayName = (values.displayName || '').trim();
      const assetCode = (values.assetCode || '').toUpperCase().trim();
      const stationId = (values.stationId || 'Line 1 - Mattress & Recliner Final Pack').trim();
      const scanMode = values.scanMode as ScanMode;

      const payload: Partial<DeviceItem> & { name: string; code: string; category: DeviceCategory } = {
        displayName,
        name: displayName,
        assetCode,
        code: assetCode,
        category: values.category as DeviceCategory,
        manufacturer: values.manufacturer.trim(),
        model: values.model.trim(),
        serialNumber: values.serialNumber?.trim() || `SN-${Date.now().toString().slice(-6)}`,
        macAddress: values.macAddress?.trim() || editingDevice?.macAddress || `00:11:22:${Math.floor(10 + Math.random() * 89)}:AA:BB`,
        stationId,
        locationLine: stationId,
        connectionType: values.connectionType as ConnectionType,
        ipAddress: values.ipAddress?.trim(),
        subnetMask: values.subnetMask?.trim(),
        gateway: values.gateway?.trim(),
        port: values.port ? Number(values.port) : undefined,
        comPort: values.comPort?.trim(),
        connectionParameters: values.connectionParameters?.trim(),
        scanMode,
        triggerMode: scanMode,
        firmwareVersion: values.firmwareVersion?.trim() || editingDevice?.firmwareVersion || 'v1.0.0',
        status: (editingDevice ? editingDevice.status : 'online') as DeviceStatus,
        lastSeen: editingDevice ? (editingDevice.lastSeen || editingDevice.lastPing) : new Date().toISOString().replace('T', ' ').substring(0, 19),
        lastPing: editingDevice ? (editingDevice.lastPing || editingDevice.lastSeen) : new Date().toISOString().replace('T', ' ').substring(0, 19),
        lastError: editingDevice?.lastError || 'None (Healthy)',
        batteryLevel: values.category === 'handheld' ? (editingDevice?.batteryLevel ?? 95) : undefined,
        antennaCount: values.category === 'rfid_fixed' ? (editingDevice?.antennaCount ?? 4) : undefined,
        signalStrengthDbm: editingDevice?.signalStrengthDbm ?? -50,
      };

      if (editingDevice) {
        updateDevice(editingDevice.id, payload);
        message.success(`Updated hardware configuration for ${payload.displayName}`);
      } else {
        addDevice(payload);
        message.success(`Registered new hardware device ${payload.displayName}`);
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      const errorFields = err?.errorFields || [];
      if (errorFields.length > 0) {
        const firstError = errorFields[0];
        const fieldName = firstError.name?.[0] as string;
        const errorMsg = firstError.errors?.[0] || 'Please complete this required field.';

        // Automatically switch the active tab to wherever the error is
        if (['displayName', 'assetCode', 'category', 'manufacturer', 'model', 'serialNumber', 'macAddress', 'firmwareVersion'].includes(fieldName)) {
          setModalTab('identity');
        } else if (['connectionType', 'ipAddress', 'subnetMask', 'gateway', 'port', 'comPort', 'connectionParameters'].includes(fieldName)) {
          setModalTab('connectivity');
        } else if (['stationId', 'scanMode'].includes(fieldName)) {
          setModalTab('operation');
        }
        message.error(`Required: ${errorMsg}`);
      } else {
        message.error('Please complete all required fields highlighted in red.');
      }
    }
  };

  const handlePing = async (device: DeviceItem) => {
    setPingingDeviceId(device.id);
    const res = await pingDevice(device.id);
    setPingingDeviceId(null);

    if (res.success) {
      message.success({
        content: `Ping Success: [${device.displayName || device.name}] responded in ${res.latencyMs}ms. Status: HEALTHY`,
        duration: 3,
      });
    } else {
      message.error({
        content: res.message,
        duration: 4,
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    deleteDevice(id);
    message.success(`Device "${name}" removed successfully.`);
  };

  const getCategoryTag = (category: DeviceCategory) => {
    switch (category) {
      case 'gateway':
        return (
          <Tag color="purple" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
            <ApiOutlined /> Device Hardware Gateway
          </Tag>
        );
      case 'rfid_fixed':
        return (
          <Tag color="cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
            <RadarChartOutlined /> Fixed RFID Scanner
          </Tag>
        );
      case 'handheld':
      default:
        return (
          <Tag color="blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
            <MobileOutlined /> Handheld RFID Scanner
          </Tag>
        );
    }
  };

  // Minimal Mandatory Table Columns
  const columns: ColumnsType<DeviceItem> = [
    {
      title: 'Device & Hardware Asset',
      key: 'identity',
      render: (_, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '14px', color: isDark ? '#f8fafc' : '#0f172a' }}>
              {record.displayName || record.name}
            </strong>
            <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: '11px', margin: 0 }}>
              {record.assetCode || record.code}
            </Tag>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {record.manufacturer} {record.model}
          </div>
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 220,
      render: (cat: DeviceCategory) => getCategoryTag(cat),
    },
    {
      title: 'Assigned Station',
      key: 'station',
      width: 200,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <EnvironmentOutlined style={{ color: '#0284C7' }} />
          <span>{record.stationId || record.locationLine}</span>
        </div>
      ),
    },
    {
      title: 'Runtime Status',
      key: 'status',
      width: 150,
      render: (_, record) => (
        <div>
          <DeviceStatusTag status={record.status} />
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            {record.lastSeen || record.lastPing}
          </div>
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<EyeOutlined />}
            style={{
              backgroundColor: '#1E3A5F',
              borderColor: '#1E3A5F',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '4px'
            }}
            onClick={() => setDiagnosticDevice(record)}
          >
            Details
          </Button>

          <Tooltip title="Ping / Test Socket Connection">
            <Button
              size="small"
              icon={<SyncOutlined spin={pingingDeviceId === record.id} />}
              onClick={() => handlePing(record)}
              loading={pingingDeviceId === record.id}
            />
          </Tooltip>

          <Tooltip title="Edit Device Config">
            <Button
              size="small"
              icon={<EditOutlined style={{ color: '#0284C7' }} />}
              onClick={() => handleOpenModal(record)}
            />
          </Tooltip>

          <Popconfirm
            title="Delete Device?"
            description={`Disconnect and remove ${record.displayName || record.name}?`}
            onConfirm={() => handleDelete(record.id, record.displayName || record.name)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete Device">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner & Action Header */}
      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Device Management
            </Title>
            <Paragraph style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
              Standardized AutoIDDevice hardware inventory, real-time connectivity, station line bindings, and CRUD control.
            </Paragraph>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 600, height: '38px', padding: '0 20px' }}
            onClick={() => handleOpenModal()}
          >
            Register New Device
          </Button>
        </div>

        {/* Metric Chips for 3 Standard Device States */}
        <Row gutter={[12, 12]} style={{ marginBottom: '16px' }}>
          <Col xs={12} sm={6} md={6}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              }}
            >
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL REGISTERED DEVICES</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>{totalCount}</div>
            </div>
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Tooltip title="Device is reachable and communicating normally">
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#0f172a' : '#f0fdf4',
                  border: `1px solid ${isDark ? '#334155' : '#bbf7d0'}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'online' ? 'all' : 'online')}
              >
                <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🟢</span> ONLINE (NORMAL)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a' }}>{onlineCount}</div>
              </div>
            </Tooltip>
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Tooltip title="Device is not reachable / communication lost">
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'offline' ? 'all' : 'offline')}
              >
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⚫</span> OFFLINE (LOST)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: isDark ? '#94a3b8' : '#475569' }}>{offlineCount}</div>
              </div>
            </Tooltip>
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Tooltip title="Device is reachable, but reports a fault or cannot perform its intended function">
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#0f172a' : '#fef2f2',
                  border: `1px solid ${isDark ? '#334155' : '#fecaca'}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedStatus(selectedStatus === 'error' ? 'all' : 'error')}
              >
                <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🔴</span> ERROR (FAULT REPORTED)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>{errorCount}</div>
              </div>
            </Tooltip>
          </Col>
        </Row>

        {/* Search, Filters, and View Switcher Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
          <Space wrap size="middle">
            <Input
              placeholder="Search by device name, asset code, station, IP address, serial..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: 400, minWidth: 260 }}
            />

            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 200 }}
            >
              <Option value="all">All Hardware Categories</Option>
              <Option value="handheld">Handheld RFID Scanner</Option>
              <Option value="rfid_fixed">Fixed RFID Scanner</Option>
              <Option value="gateway">Device Hardware Gateway</Option>
            </Select>

            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              style={{ width: 160 }}
            >
              <Option value="all">All Device States</Option>
              <Option value="online">🟢 Online</Option>
              <Option value="offline">⚫ Offline</Option>
              <Option value="error">🔴 Error</Option>
            </Select>
          </Space>

          <Segmented
            value={viewMode}
            onChange={v => setViewMode(v as 'table' | 'grid')}
            options={[
              { value: 'table', icon: <UnorderedListOutlined />, label: 'Table' },
              { value: 'grid', icon: <AppstoreOutlined />, label: 'Cards' },
            ]}
          />
        </div>
      </Card>

      {/* Main Content Area: Table View or Grid Cards */}
      {viewMode === 'table' ? (
        <Card
          bordered={false}
          style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
          styles={{ body: { padding: '8px' } }}
        >
          <Table
            columns={columns}
            dataSource={filteredDevices}
            rowKey="id"
            pagination={{ pageSize: 8, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} devices` }}
            scroll={{ x: 950 }}
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {filteredDevices.map(dev => (
            <Col xs={24} md={12} xl={8} key={dev.id}>
              <Card
                bordered
                style={{
                  borderRadius: '10px',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: isDark ? '#f8fafc' : '#0f172a' }}>
                        {dev.displayName || dev.name}
                      </strong>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {dev.assetCode || dev.code} • {dev.manufacturer ? `${dev.manufacturer} ` : ''}{dev.model}
                      </div>
                    </div>
                    <DeviceStatusTag status={dev.status} />
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    {getCategoryTag(dev.category)}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '12px',
                      margin: '12px 0',
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Station Line:</span>
                      <strong>{dev.stationId || dev.locationLine}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Connection:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Tag color="cyan" style={{ margin: 0, fontSize: '10px' }}>{dev.connectionType || 'TCP/IP'}</Tag>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>
                          {dev.ipAddress ? `${dev.ipAddress}${dev.port ? `:${dev.port}` : ''}` : dev.comPort || dev.macAddress}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Serial / MAC:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                        {dev.serialNumber || 'N/A'} • {dev.macAddress}
                      </span>
                    </div>

                    {dev.batteryLevel !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b' }}>Battery:</span>
                        <div style={{ width: '100px' }}>
                          <Progress
                            percent={dev.batteryLevel}
                            size="small"
                            status={dev.batteryLevel < 20 ? 'exception' : 'normal'}
                            strokeColor={dev.batteryLevel < 20 ? '#EF4444' : '#10B981'}
                          />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Scan Mode:</span>
                      <Tag color="geekblue" style={{ margin: 0, fontSize: '10px' }}>{dev.scanMode || dev.triggerMode}</Tag>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Firmware / Last Seen:</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{dev.firmwareVersion} • {dev.lastSeen || dev.lastPing}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<EyeOutlined />}
                      style={{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F', fontSize: '11px', fontWeight: 600 }}
                      onClick={() => setDiagnosticDevice(dev)}
                    >
                      Details
                    </Button>

                    <Button
                      size="small"
                      icon={<SyncOutlined spin={pingingDeviceId === dev.id} />}
                      onClick={() => handlePing(dev)}
                      loading={pingingDeviceId === dev.id}
                    >
                      Ping
                    </Button>
                  </div>

                  <Space size="small">
                    <Tooltip title="View Live Diagnostics & Data Model">
                      <Button
                        size="small"
                        icon={<CodeOutlined style={{ color: '#10B981' }} />}
                        onClick={() => setDiagnosticDevice(dev)}
                      />
                    </Tooltip>

                    <Tooltip title="Edit Device Config">
                      <Button
                        size="small"
                        icon={<EditOutlined style={{ color: '#0284C7' }} />}
                        onClick={() => handleOpenModal(dev)}
                      />
                    </Tooltip>

                    <Popconfirm
                      title="Remove Device?"
                      description={`Disconnect ${dev.displayName || dev.name}?`}
                      onConfirm={() => handleDelete(dev.id, dev.displayName || dev.name)}
                      okText="Yes, Remove"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Steady, Tabbed Register / Edit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '95%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RadarChartOutlined style={{ color: '#E53935' }} />
              <span style={{ fontWeight: 700 }}>
                {editingDevice ? `Configure Device: ${editingDevice.displayName || editingDevice.name}` : 'Register Auto-ID Hardware Device'}
              </span>
            </div>
            {editingDevice ? (
              <Tag color="blue" style={{ margin: 0 }}>EDITING CONFIG</Tag>
            ) : (
              <Tag color="green" style={{ margin: 0 }}>NEW HARDWARE</Tag>
            )}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        centered
        width={750}
        footer={null}
        destroyOnClose={false}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '8px' }}>
          {editingDevice && (
            <div
              style={{
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ color: '#64748b' }}>Device UUID: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{editingDevice.deviceId || editingDevice.id}</span>
              </div>
              <DeviceStatusTag status={editingDevice.status} />
            </div>
          )}

          <Tabs
            activeKey={modalTab}
            onChange={k => setModalTab(k as 'identity' | 'connectivity' | 'operation')}
            type="card"
            size="small"
            style={{ marginBottom: '12px' }}
            items={[
              {
                key: 'identity',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <IdcardOutlined style={{ color: '#E53935' }} />
                    <span>1. Identity & Specs</span>
                  </span>
                ),
              },
              {
                key: 'connectivity',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <ApiOutlined style={{ color: '#10B981' }} />
                    <span>2. Connectivity & Ports</span>
                  </span>
                ),
              },
              {
                key: 'operation',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <EnvironmentOutlined style={{ color: '#0284C7' }} />
                    <span>3. Assignment & Operation</span>
                  </span>
                ),
              },
            ]}
          />

          <div
            style={{
              minHeight: '310px',
              maxHeight: '350px',
              overflowY: 'auto',
              paddingRight: '6px',
              paddingTop: '4px',
            }}
          >
            {/* Tab 1: Identity & Hardware Specification */}
            <div style={{ display: modalTab === 'identity' ? 'block' : 'none' }}>
              <div>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="displayName" label="Device Display Name" rules={[{ required: true, message: 'Please enter display name' }]}>
                      <Input placeholder="e.g. Zebra TC26 Handheld #01" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="assetCode" label="Hardware Asset Code" rules={[{ required: true, message: 'Please enter asset code' }]}>
                      <Input placeholder="e.g. HH-ZBR-TC26-01" style={{ textTransform: 'uppercase' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="category" label="Device Hardware Category" rules={[{ required: true }]}>
                      <Select>
                        <Option value="handheld">Handheld RFID Scanner</Option>
                        <Option value="rfid_fixed">Fixed RFID Scanner</Option>
                        <Option value="gateway">Device Hardware Gateway</Option>
                        <Option value="barcode">Industrial Barcode Scanner</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="manufacturer" label="Manufacturer / Brand" rules={[{ required: true, message: 'Please enter manufacturer' }]}>
                      <Input placeholder="e.g. CipherLab / Honeywell / Zebra / Impinj" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="model" label="Model & Make" rules={[{ required: true, message: 'Please enter model' }]}>
                      <Input placeholder="e.g. RS38 UHF-RFID Android Rugged Mobile Computer" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="serialNumber" label="Hardware Serial Number" rules={[{ required: true, message: 'Please enter serial number' }]}>
                      <Input placeholder="e.g. SN-CPR-RS38-9921" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="macAddress" label="MAC Address" rules={[{ required: true, message: 'Please enter MAC address' }]}>
                      <Input placeholder="e.g. 00:1F:B5:7C:10:01" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="firmwareVersion" label="Firmware Version">
                      <Input placeholder="e.g. v2.14.0" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </div>

            {/* Tab 2: Hardware Connectivity */}
            <div style={{ display: modalTab === 'connectivity' ? 'block' : 'none' }}>
              <div>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="connectionType" label="Connection Type" rules={[{ required: true }]}>
                      <Select>
                        <Option value="TCP/IP">TCP/IP (Network Socket / WiFi)</Option>
                        <Option value="Serial (RS-232)">Serial (RS-232 / COM)</Option>
                        <Option value="USB-HID">USB-HID (POS Emulation)</Option>
                        <Option value="Bluetooth">Bluetooth Low Energy (BLE)</Option>
                        <Option value="Websocket">Websocket Gateway</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="ipAddress" label="IP Address (Network Socket)">
                      <Input placeholder="192.168.10.XXX" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="subnetMask" label="Subnet Mask">
                      <Input placeholder="e.g. 255.255.255.0" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="gateway" label="Default Gateway">
                      <Input placeholder="e.g. 192.168.10.1" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="port" label="Network Port">
                      <InputNumber placeholder="e.g. 5084 or 8080" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="comPort" label="COM Port / Channel">
                      <Input placeholder="e.g. COM3 / USB-HID" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24}>
                    <Form.Item name="connectionParameters" label="Connection Parameters">
                      <Input placeholder="e.g. Keep-Alive: 15s, Timeout: 3000ms, Protocol: LLRP" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </div>

            {/* Tab 3: Assignment & Operation */}
            <div style={{ display: modalTab === 'operation' ? 'block' : 'none' }}>
              <div>
                <Row gutter={16}>
                  <Col xs={24}>
                    <Form.Item name="stationId" label="Assigned Station / Line ID" rules={[{ required: true, message: 'Please enter station line' }]}>
                      <AutoComplete
                        options={[
                          { value: 'Line 1 - Mattress & Recliner Final Pack' },
                          { value: 'Line 2 - Sofa Assembly & Packaging' },
                          { value: 'Line 3 - Bed Frame & Accessories' },
                          { value: 'Conveyor Main Exit Tunnel (Station 1)' },
                          { value: 'Outbound Shipping Dock Door #01' },
                          { value: 'Automatic Palletizer Portal #2' },
                        ]}
                        placeholder="e.g. Line 1 - Mattress & Recliner Final Pack"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="scanMode" label="Scan Mode" rules={[{ required: true }]}>
                      <Select>
                        <Option value="Manual Scan">Manual Scan</Option>
                        <Option value="Automatic Scan">Automatic Scan</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#10B981', marginBottom: '4px' }}>● Ready to Register</div>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>
                        All hardware settings comply with the UAIM AutoIDDevice data model and shop floor gateway specifications.
                      </div>
                    </div>
                  </Col>
                </Row>
              </div>
            </div>
          </div>

          {/* Steady Action Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            }}
          >
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {modalTab === 'identity' && 'Step 1 of 3: Identity & Hardware Specs'}
              {modalTab === 'connectivity' && 'Step 2 of 3: Connectivity & Ports'}
              {modalTab === 'operation' && 'Step 3 of 3: Line Assignment & Mode'}
            </div>

            <Space>
              <Button onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>

              {modalTab !== 'identity' && (
                <Button
                  onClick={() => {
                    if (modalTab === 'operation') setModalTab('connectivity');
                    else if (modalTab === 'connectivity') setModalTab('identity');
                  }}
                >
                  ← Back
                </Button>
              )}

              {modalTab !== 'operation' && (
                <Button
                  onClick={() => {
                    if (modalTab === 'identity') setModalTab('connectivity');
                    else if (modalTab === 'connectivity') setModalTab('operation');
                  }}
                  style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0', fontWeight: 600 }}
                >
                  {modalTab === 'identity' ? 'Next: Connectivity →' : 'Next: Assignment →'}
                </Button>
              )}

              <Button
                type="primary"
                onClick={handleFormSubmit}
                style={{ backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 600 }}
              >
                {editingDevice ? 'Save Configuration' : 'Register Hardware'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Comprehensive Device Details & Telemetry Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <EyeOutlined style={{ color: '#1E3A5F', fontSize: '18px' }} />
            <span>Hardware Device Details — {diagnosticDevice?.displayName || diagnosticDevice?.name}</span>
          </div>
        }
        open={!!diagnosticDevice}
        onClose={() => setDiagnosticDevice(null)}
        width={600}
        extra={
          diagnosticDevice && (
            <Space>
              <Button
                size="small"
                icon={<SyncOutlined spin={pingingDeviceId === diagnosticDevice.id} />}
                onClick={() => handlePing(diagnosticDevice)}
                loading={pingingDeviceId === diagnosticDevice.id}
              >
                Ping Socket
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                style={{ backgroundColor: '#E53935', borderColor: '#E53935' }}
                onClick={() => {
                  const dev = diagnosticDevice;
                  setDiagnosticDevice(null);
                  handleOpenModal(dev);
                }}
              >
                Edit Config
              </Button>
            </Space>
          )
        }
      >
        {diagnosticDevice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Hero Card */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                padding: '16px',
                borderRadius: '10px',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: isDark ? '#f8fafc' : '#0f172a' }}>
                  {diagnosticDevice.displayName || diagnosticDevice.name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <EnvironmentOutlined style={{ color: '#0284C7' }} />
                  <span>Assigned: <strong>{diagnosticDevice.stationId || diagnosticDevice.locationLine}</strong></span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <DeviceStatusTag status={diagnosticDevice.status} />
                <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: '11px', margin: 0 }}>
                  {diagnosticDevice.assetCode || diagnosticDevice.code}
                </Tag>
              </div>
            </div>

            {/* 1. Identity Domain */}
            <Descriptions
              title={
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#E53935', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IdcardOutlined /> 1. Identity Domain
                </span>
              }
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Device ID (UUID)">
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0284C7' }}>
                  {diagnosticDevice.deviceId || diagnosticDevice.id}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Display Name">
                {diagnosticDevice.displayName || diagnosticDevice.name}
              </Descriptions.Item>
              <Descriptions.Item label="Asset Code">
                <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {diagnosticDevice.assetCode || diagnosticDevice.code}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Hardware Category">
                {getCategoryTag(diagnosticDevice.category)}
              </Descriptions.Item>
              <Descriptions.Item label="Manufacturer">
                {diagnosticDevice.manufacturer}
              </Descriptions.Item>
              <Descriptions.Item label="Model">
                {diagnosticDevice.model}
              </Descriptions.Item>
              <Descriptions.Item label="Serial Number">
                <span style={{ fontFamily: 'monospace' }}>{diagnosticDevice.serialNumber || 'N/A'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="MAC Address">
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{diagnosticDevice.macAddress}</span>
              </Descriptions.Item>
            </Descriptions>

            {/* 2. Assignment Domain */}
            <Descriptions
              title={
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <EnvironmentOutlined /> 2. Assignment Domain
                </span>
              }
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Station ID / Line">
                <strong>{diagnosticDevice.stationId || diagnosticDevice.locationLine}</strong>
              </Descriptions.Item>
            </Descriptions>

            {/* 3. Connectivity Domain */}
            <Descriptions
              title={
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ApiOutlined /> 3. Connectivity Domain
                </span>
              }
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Connection Type">
                <Tag color="cyan">{diagnosticDevice.connectionType || 'TCP/IP'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="IP Address & Port">
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {diagnosticDevice.ipAddress ? `${diagnosticDevice.ipAddress}${diagnosticDevice.port ? `:${diagnosticDevice.port}` : ''}` : 'N/A'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Subnet Mask">
                <span style={{ fontFamily: 'monospace' }}>
                  {diagnosticDevice.subnetMask || (diagnosticDevice.ipAddress ? '255.255.255.0' : 'N/A')}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Default Gateway">
                <span style={{ fontFamily: 'monospace' }}>
                  {diagnosticDevice.gateway || (diagnosticDevice.ipAddress ? '192.168.10.1' : 'N/A')}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="COM Port">
                <span style={{ fontFamily: 'monospace' }}>{diagnosticDevice.comPort || 'N/A (Network Socket)'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Connection Parameters">
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {diagnosticDevice.connectionParameters || 'Keep-Alive: 15s, Timeout: 3000ms'}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {/* 4. Operation Domain */}
            <Descriptions
              title={
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RadarChartOutlined /> 4. Operation Domain
                </span>
              }
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Scan Mode">
                <Tag color={diagnosticDevice.scanMode === 'Automatic Scan' ? 'processing' : 'default'}>
                  {diagnosticDevice.scanMode || diagnosticDevice.triggerMode || 'Manual Scan'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* 5. Runtime Domain */}
            <Descriptions
              title={
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SyncOutlined /> 5. Runtime & Telemetry Domain
                </span>
              }
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Device State">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><DeviceStatusTag status={diagnosticDevice.status} /></div>
                  <span style={{ fontSize: '12px', color: diagnosticDevice.status === 'error' ? '#EF4444' : '#64748b' }}>
                    {diagnosticDevice.status === 'online' && '🟢 Device is reachable and communicating normally.'}
                    {diagnosticDevice.status === 'offline' && '⚫ Device is not reachable / communication lost.'}
                    {diagnosticDevice.status === 'error' && '🔴 Device is reachable, but reports a fault or cannot perform its intended function.'}
                  </span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Last Seen">
                {diagnosticDevice.lastSeen || diagnosticDevice.lastPing}
              </Descriptions.Item>
              <Descriptions.Item label="Firmware Version">
                <Tag color="purple" style={{ fontFamily: 'monospace' }}>
                  {diagnosticDevice.firmwareVersion || 'v1.0.0'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Last Error / Health">
                <span style={{ color: diagnosticDevice.lastError && diagnosticDevice.lastError !== 'None' ? '#EF4444' : '#10B981' }}>
                  {diagnosticDevice.lastError || 'None (Healthy & Operational)'}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {/* Raw JSON Schema */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>
                AutoIDDevice Raw JSON Schema:
              </Text>
              <pre
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#090d16' : '#1e293b',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '180px',
                }}
              >
                {JSON.stringify(diagnosticDevice, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
