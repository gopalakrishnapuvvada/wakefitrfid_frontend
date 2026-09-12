import React, { useState, useMemo } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Input, 
  DatePicker, 
  Select, 
  Space, 
  Tag, 
  Image, 
  Drawer, 
  Descriptions,
  message 
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { 
  SearchOutlined, 
  DownloadOutlined, 
  FilterFilled, 
  ReloadOutlined, 
  DatabaseOutlined, 
  BarcodeOutlined, 
  FileTextOutlined, 
  EyeOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import type { MarriedTransaction } from '../types';
import { getProductImageByMaterial } from '../services/api';

dayjs.extend(isBetween);

const { Option } = Select;

interface HistoryPageProps {
  onNavigate?: (key: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = () => {
  const { marriedTransactions, devices, masterData } = useData();
  const { isDark } = useAppTheme();

  // Search & Filters State
  const [searchText, setSearchText] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Date/Time Filters (Controlled picker states)
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);

  // Applied Date Filter Range (Only updates when "Apply" or a preset is clicked)
  const [appliedRange, setAppliedRange] = useState<{ start: Dayjs | null; end: Dayjs | null }>({
    start: null,
    end: null,
  });

  // Selected Transaction for Detail Drawer
  const [selectedTxn, setSelectedTxn] = useState<MarriedTransaction | null>(null);

  // Apply Date Filter
  const handleApplyFilter = () => {
    if (startDate && endDate && startDate.isAfter(endDate)) {
      message.error('Start Date & Time cannot be after End Date & Time.');
      return;
    }
    setAppliedRange({ start: startDate, end: endDate });
    message.success('Date & Time filter applied to transaction history.');
  };

  // Reset Filters
  const handleResetFilter = () => {
    setStartDate(null);
    setEndDate(null);
    setAppliedRange({ start: null, end: null });
    setSearchText('');
    setSelectedDevice('all');
    setSelectedCategory('all');
    setSelectedStatus('all');
    message.info('All history filters reset.');
  };

  // Quick Preset Handlers
  const handlePreset = (preset: 'today' | '24h' | '7d' | 'month' | 'all') => {
    const now = dayjs();
    let start: Dayjs | null = null;
    let end: Dayjs | null = now;

    switch (preset) {
      case 'today':
        start = now.startOf('day');
        break;
      case '24h':
        start = now.subtract(24, 'hour');
        break;
      case '7d':
        start = now.subtract(7, 'day').startOf('day');
        break;
      case 'month':
        start = now.startOf('month');
        break;
      case 'all':
        start = null;
        end = null;
        break;
    }

    setStartDate(start);
    setEndDate(end);
    setAppliedRange({ start, end });
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return marriedTransactions.filter(txn => {
      // 1. Text Search Filter
      const q = searchText.toLowerCase().trim();
      const matchesSearch = !q ||
        txn.transactionId.toLowerCase().includes(q) ||
        txn.rfidUniqueId.toLowerCase().includes(q) ||
        txn.workOrderNo.toLowerCase().includes(q) ||
        txn.materialCode.toLowerCase().includes(q) ||
        txn.partNumber.toLowerCase().includes(q) ||
        txn.productName.toLowerCase().includes(q) ||
        txn.deviceName.toLowerCase().includes(q) ||
        (txn.status || 'WIP').toLowerCase().includes(q);

      // 2. Device Filter
      const matchesDevice = selectedDevice === 'all' || txn.deviceId === selectedDevice;

      // 3. Category Filter
      const matchesCategory = selectedCategory === 'all' || txn.category === selectedCategory;

      // 4. Status Filter (WIP vs Dispatched)
      const matchesStatus = selectedStatus === 'all' || (txn.status || 'WIP') === selectedStatus;

      // 5. Date & Time Range Filter
      let matchesDate = true;
      if (appliedRange.start || appliedRange.end) {
        const txnDate = dayjs(txn.timestamp);
        if (appliedRange.start && appliedRange.end) {
          matchesDate = txnDate.isBetween(appliedRange.start, appliedRange.end, null, '[]');
        } else if (appliedRange.start) {
          matchesDate = txnDate.isAfter(appliedRange.start) || txnDate.isSame(appliedRange.start);
        } else if (appliedRange.end) {
          matchesDate = txnDate.isBefore(appliedRange.end) || txnDate.isSame(appliedRange.end);
        }
      }

      return matchesSearch && matchesDevice && matchesCategory && matchesStatus && matchesDate;
    });
  }, [marriedTransactions, searchText, selectedDevice, selectedCategory, selectedStatus, appliedRange]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      message.warning('No transaction records available to export.');
      return;
    }

    const headers = [
      'Transaction ID',
      'Material Code',
      'Part Number',
      'Work Order No',
      'RFID ID',
      'WIP Scan Timestamp',
      'Dispatch Scan Timestamp',
      'Product Description',
      'Category',
      'Scanner Device',
      'Operator Role',
      'State'
    ].join(',');

    const rows = filteredTransactions.map(t => {
      return [
        `"${t.transactionId}"`,
        `"${t.materialCode}"`,
        `"${t.partNumber}"`,
        `"${t.workOrderNo}"`,
        `"${t.rfidUniqueId}"`,
        `"${t.wipScanTimestamp || t.timestamp}"`,
        `"${t.dispatchScanTimestamp || (t.status === 'Dispatched' ? t.timestamp : '')}"`,
        `"${t.productName.replace(/"/g, '""')}"`,
        `"${t.category}"`,
        `"${t.deviceName}"`,
        `"${t.operatorRole}"`,
        `"${t.status || 'WIP'}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Wakefit_FG_Transactions_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success(`Exported ${filteredTransactions.length} transaction records to CSV.`);
  };

  // Metrics Calculations
  const totalCount = filteredTransactions.length;
  const wipCount = filteredTransactions.filter(t => (t.status || 'WIP') === 'WIP').length;
  const dispatchedCount = filteredTransactions.filter(t => t.status === 'Dispatched').length;
  const uniqueWorkOrders = new Set(filteredTransactions.map(t => t.workOrderNo)).size;

  // Table Columns (Exact requested sequence: FG Image, Transaction ID, Material Code, Part Number, Work Order No., RFID ID, WIP Scan Timestamp, Dispatch Scan Timestamp)
  const columns: ColumnsType<MarriedTransaction> = [
    {
      title: 'FG Image',
      key: 'productImage',
      width: 75,
      align: 'center',
      render: (_, record) => {
        const catalogItem = masterData?.find(
          m => m.materialCode.toUpperCase() === (record.materialCode || '').toUpperCase()
        );
        const catalogImg = Array.isArray(catalogItem?.fgImage)
          ? catalogItem.fgImage[0]
          : (typeof catalogItem?.fgImage === 'string' && catalogItem.fgImage !== 'string' ? catalogItem.fgImage : null);
        const imgSrc =
          record.productImage ||
          catalogImg ||
          getProductImageByMaterial(record.materialCode, record.category);

        return (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Image
              src={imgSrc}
              alt={record.partNumber}
              width={48}
              height={48}
              style={{
                objectFit: 'cover',
                borderRadius: '6px',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
              }}
              fallback="/products/mattress_1.jpg"
            />
          </div>
        );
      },
    },
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
      width: 170,
      render: (txnId: string) => (
        <span style={{ color: '#D32F2F', fontWeight: 700, fontFamily: 'monospace', fontSize: '13px' }}>
          {txnId}
        </span>
      ),
    },
    {
      title: 'Material Code',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 160,
      render: (mat: string) => (
        <span style={{ color: '#E53935', fontWeight: 700, fontFamily: 'monospace', fontSize: '13px' }}>
          {mat}
        </span>
      ),
    },
    {
      title: 'Part Number',
      dataIndex: 'partNumber',
      key: 'partNumber',
      width: 160,
      render: (part: string) => (
        <span style={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 700, fontFamily: 'monospace', fontSize: '12px' }}>
          {part}
        </span>
      ),
    },
    {
      title: 'Work Order No.',
      dataIndex: 'workOrderNo',
      key: 'workOrderNo',
      width: 170,
      render: (wo: string) => (
        <span style={{ color: '#9333EA', fontWeight: 600, fontFamily: 'monospace', fontSize: '12px' }}>
          {wo}
        </span>
      ),
    },
    {
      title: 'RFID ID',
      dataIndex: 'rfidUniqueId',
      key: 'rfidUniqueId',
      width: 210,
      render: (rfid: string) => (
        <span style={{ color: '#0284C7', fontWeight: 700, fontFamily: 'monospace', fontSize: '12px' }}>
          {rfid}
        </span>
      ),
    },
    {
      title: 'WIP Scan Timestamp',
      key: 'wipScanTimestamp',
      width: 170,
      render: (_, record) => {
        const ts = record.wipScanTimestamp || record.timestamp;
        return (
          <span style={{ fontSize: '12px', color: isDark ? '#cbd5e1' : '#475569', fontFamily: 'monospace' }}>
            {ts}
          </span>
        );
      },
    },
    {
      title: 'Dispatch Scan Timestamp',
      key: 'dispatchScanTimestamp',
      width: 180,
      render: (_, record) => {
        if (record.dispatchScanTimestamp) {
          return (
            <span style={{ fontSize: '12px', color: '#10B981', fontFamily: 'monospace', fontWeight: 700 }}>
              {record.dispatchScanTimestamp}
            </span>
          );
        }
        if (record.status === 'Dispatched') {
          return (
            <span style={{ fontSize: '12px', color: '#10B981', fontFamily: 'monospace', fontWeight: 700 }}>
              {record.timestamp}
            </span>
          );
        }
        return (
          <Tag color="default" style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
            -
          </Tag>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          style={{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F', fontWeight: 600, fontSize: '11px' }}
          onClick={() => setSelectedTxn(record)}
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Header & Filter Controls Card (Space-Optimized) */}
      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        {/* Row 1: Title, Subtitle, Real-time Metrics, Search & Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <FileTextOutlined style={{ color: '#10B981', fontSize: '22px' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                  FG Transaction Records
                </h3>
                {/* State & Volume Summary Badges */}
                <Tag color="red" style={{ borderRadius: '6px', fontWeight: 800, fontSize: '12px', margin: 0, padding: '2px 8px' }}>
                  <BarcodeOutlined style={{ marginRight: '5px' }} />
                  Total: {totalCount}
                </Tag>
                <Tag color="warning" style={{ borderRadius: '6px', fontWeight: 800, fontSize: '12px', margin: 0, padding: '2px 8px' }}>
                  <ClockCircleOutlined style={{ marginRight: '4px' }} />
                  WIP: {wipCount}
                </Tag>
                <Tag color="success" style={{ borderRadius: '6px', fontWeight: 800, fontSize: '12px', margin: 0, padding: '2px 8px' }}>
                  <CheckCircleOutlined style={{ marginRight: '4px' }} />
                  Dispatched: {dispatchedCount}
                </Tag>
                <Tag color="blue" style={{ borderRadius: '6px', fontWeight: 800, fontSize: '12px', margin: 0, padding: '2px 8px' }}>
                  <FileTextOutlined style={{ marginRight: '5px' }} />
                  Unique WOs: {uniqueWorkOrders}
                </Tag>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Audit trail of married barcodes, factory UHF RFID tags, work orders, and local SQLite records.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Input
              placeholder="Search Transaction ID / RFID Tag / Material Code / Work Order No..."
              prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: '14px' }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: '380px', minWidth: '260px' }}
            />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              style={{ fontWeight: 600 }}
            >
              Export SQLite (CSV)
            </Button>
          </div>
        </div>

        {/* Row 2: Unified Filter & Date-Time Toolbar */}
        <div
          style={{
            backgroundColor: isDark ? '#0f172a' : '#f8fafc',
            padding: '10px 14px',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          {/* Left: Date-Time Pickers & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarOutlined style={{ color: '#0284C7', fontSize: '13px' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                Start:
              </span>
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="Start Date & Time"
                value={startDate}
                onChange={val => setStartDate(val)}
                style={{ width: 180 }}
                size="middle"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarOutlined style={{ color: '#E53935', fontSize: '13px' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                End:
              </span>
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="End Date & Time"
                value={endDate}
                onChange={val => setEndDate(val)}
                style={{ width: 180 }}
                size="middle"
              />
            </div>

            <Button
              type="primary"
              icon={<FilterFilled />}
              onClick={handleApplyFilter}
              style={{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F', fontWeight: 700, padding: '0 16px' }}
            >
              Apply
            </Button>

            <Button
              icon={<ReloadOutlined />}
              onClick={handleResetFilter}
            >
              Reset
            </Button>

            {/* Quick Presets */}
            <Space size={4} wrap style={{ marginLeft: '4px' }}>
              <Button size="small" onClick={() => handlePreset('today')}>Today</Button>
              <Button size="small" onClick={() => handlePreset('24h')}>Last 24h</Button>
              <Button size="small" onClick={() => handlePreset('7d')}>Last 7D</Button>
              <Button size="small" onClick={() => handlePreset('month')}>Month</Button>
              <Button size="small" onClick={() => handlePreset('all')}>All</Button>
            </Space>
          </div>

          {/* Right: State, Device, Category Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* State Filter (WIP vs Dispatched) */}
            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              style={{ width: 140 }}
              size="middle"
            >
              <Option value="all">All States</Option>
              <Option value="WIP">● WIP</Option>
              <Option value="Dispatched">✓ Dispatched</Option>
            </Select>

            <Select
              value={selectedDevice}
              onChange={setSelectedDevice}
              style={{ width: 190 }}
              size="middle"
            >
              <Option value="all">All Scanner Hardware</Option>
              {devices.map(d => (
                <Option key={d.id} value={d.id}>{d.displayName || d.name}</Option>
              ))}
            </Select>

            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 150 }}
              size="middle"
            >
              <Option value="all">All Product Categories</Option>
              <Option value="Mattress">Mattress</Option>
              <Option value="Sofa">Sofa</Option>
              <Option value="Recliner">Recliner</Option>
              <Option value="Bed">Bed</Option>
              <Option value="Pillow">Pillow</Option>
            </Select>

            {(appliedRange.start || appliedRange.end) && (
              <Tag color="orange" closable onClose={() => handlePreset('all')} style={{ margin: 0 }}>
                {appliedRange.start ? appliedRange.start.format('MM-DD HH:mm') : 'Start'} → {appliedRange.end ? appliedRange.end.format('MM-DD HH:mm') : 'Now'}
              </Tag>
            )}
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
        styles={{ body: { padding: '8px' } }}
      >
        <Table
          columns={columns}
          dataSource={filteredTransactions}
          rowKey="id"
          pagination={{ 
            pageSize: 10, 
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} married scan transactions` 
          }}
        />
      </Card>

      {/* Transaction Details Slide-over Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DatabaseOutlined style={{ color: '#10B981', fontSize: '18px' }} />
            <span>SQLite Married Transaction — {selectedTxn?.transactionId}</span>
          </div>
        }
        open={!!selectedTxn}
        onClose={() => setSelectedTxn(null)}
        width={580}
      >
        {selectedTxn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Product Card */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                padding: '16px',
                borderRadius: '10px',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
              }}
            >
              {(() => {
                const catalogItem = masterData?.find(
                  m => m.materialCode.toUpperCase() === (selectedTxn.materialCode || '').toUpperCase()
                );
                const catalogImg = Array.isArray(catalogItem?.fgImage)
                  ? catalogItem.fgImage[0]
                  : (typeof catalogItem?.fgImage === 'string' && catalogItem.fgImage !== 'string' ? catalogItem.fgImage : null);
                const imgSrc =
                  selectedTxn.productImage ||
                  catalogImg ||
                  getProductImageByMaterial(selectedTxn.materialCode, selectedTxn.category);

                return (
                  <Image
                    src={imgSrc}
                    alt={selectedTxn.partNumber}
                    width={80}
                    height={80}
                    style={{
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    }}
                    fallback="/products/mattress_1.jpg"
                  />
                );
              })()}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag color="red" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px' }}>
                    {selectedTxn.transactionId}
                  </Tag>
                  <Tag color={(selectedTxn.status || 'WIP') === 'Dispatched' ? 'success' : 'warning'} style={{ fontWeight: 800 }}>
                    {(selectedTxn.status || 'WIP') === 'Dispatched' ? '✓ Dispatched' : '● WIP'}
                  </Tag>
                </div>
                <div style={{ fontWeight: 800, fontSize: '15px', marginTop: '4px', color: isDark ? '#f8fafc' : '#0f172a' }}>
                  {selectedTxn.partNumber}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {selectedTxn.productName}
                </div>
              </div>
            </div>

            {/* Structured SQLite Record Details */}
            <Descriptions
              title={<span style={{ fontSize: '13px', fontWeight: 700, color: '#E53935' }}>1. Married Key Bindings</span>}
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Transaction ID">
                <span style={{ color: '#D32F2F', fontWeight: 700, fontFamily: 'monospace' }}>
                  {selectedTxn.transactionId}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="System State">
                {(selectedTxn.status || 'WIP') === 'Dispatched' ? (
                  <Tag color="success" style={{ fontWeight: 800, borderRadius: '12px', padding: '2px 12px' }}>
                    <CheckCircleOutlined style={{ marginRight: '5px' }} />
                    Dispatched (Outbound RFID Dock Portal Verified)
                  </Tag>
                ) : (
                  <Tag color="warning" style={{ fontWeight: 800, borderRadius: '12px', padding: '2px 12px' }}>
                    <ClockCircleOutlined style={{ marginRight: '5px' }} />
                    WIP (Packaged & Married / Awaiting Dock Dispatch)
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="WIP Scan Timestamp">
                <span style={{ fontFamily: 'monospace' }}>{selectedTxn.wipScanTimestamp || selectedTxn.timestamp}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Dispatch Scan Timestamp">
                <span style={{ fontFamily: 'monospace', color: selectedTxn.dispatchScanTimestamp || selectedTxn.status === 'Dispatched' ? '#10B981' : '#94a3b8' }}>
                  {selectedTxn.dispatchScanTimestamp || (selectedTxn.status === 'Dispatched' ? selectedTxn.timestamp : 'Pending Dispatch')}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="RFID ID">
                <span style={{ color: '#0284C7', fontWeight: 700, fontFamily: 'monospace' }}>
                  {selectedTxn.rfidUniqueId}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Work Order No.">
                <span style={{ color: '#9333EA', fontWeight: 700, fontFamily: 'monospace' }}>
                  {selectedTxn.workOrderNo}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Material Code">
                <span style={{ color: '#E53935', fontWeight: 700, fontFamily: 'monospace' }}>
                  {selectedTxn.materialCode}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="FG Part Number">
                <strong>{selectedTxn.partNumber}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                <Tag color="blue">{selectedTxn.category}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Descriptions
              title={<span style={{ fontSize: '13px', fontWeight: 700, color: '#0284C7' }}>2. Hardware & SQLite Commitment</span>}
              bordered
              size="small"
              column={1}
              styles={{
                label: { width: '180px', fontWeight: 600, backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                content: { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
              }}
            >
              <Descriptions.Item label="Scanner Hardware">
                <span>{selectedTxn.deviceName}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Operator Role">
                <Tag color="cyan">{selectedTxn.operatorRole}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Local SQLite DB File">
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10B981' }}>
                  {selectedTxn.sqliteDatabasePath}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="SQLite Auto Record ID">
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  #{selectedTxn.sqliteRecordId}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Database Commit Status">
                <Tag color="green">COMMITTED_TO_SQLITE</Tag>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default HistoryPage;
