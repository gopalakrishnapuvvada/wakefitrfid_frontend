import React, { useState, useCallback } from 'react';
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
  message,
  Empty 
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
import type { MarriedTransaction, TransactionFilterParams } from '../types';
import { getProductImageByMaterial, TransactionsApi } from '../services/api';

dayjs.extend(isBetween);

const { Option } = Select;

interface HistoryPageProps {
  onNavigate?: (key: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = () => {
  const { marriedTransactions, devices, masterData } = useData();
  const { isDark } = useAppTheme();

  // Search & Filters State (Selected by user, pending "Apply")
  const [searchText, setSearchText] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Date/Time Filters (Controlled picker states)
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);

  // Active History Data (Only populated when user submits / clicks "Apply Filter", preset, etc.)
  const [historyData, setHistoryData] = useState<MarriedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [appliedFiltersSummary, setAppliedFiltersSummary] = useState<string>('');

  // Selected Transaction for Detail Drawer
  const [selectedTxn, setSelectedTxn] = useState<MarriedTransaction | null>(null);

  // Fetch History from Backend API based on applied filters
  const fetchHistoryData = useCallback(
    async (overrides?: {
      search?: string;
      device?: string;
      category?: string;
      status?: string;
      start?: Dayjs | null;
      end?: Dayjs | null;
    }) => {
      const sText = overrides?.search !== undefined ? overrides.search : searchText;
      const sDev = overrides?.device !== undefined ? overrides.device : selectedDevice;
      const sCat = overrides?.category !== undefined ? overrides.category : selectedCategory;
      const sStat = overrides?.status !== undefined ? overrides.status : selectedStatus;
      const sStart = overrides?.start !== undefined ? overrides.start : startDate;
      const sEnd = overrides?.end !== undefined ? overrides.end : endDate;

      if (sStart && sEnd && sStart.isAfter(sEnd)) {
        message.error('Start Date & Time cannot be after End Date & Time.');
        return null;
      }

      const params: TransactionFilterParams = {
        search: sText.trim() || undefined,
        deviceId: sDev !== 'all' ? sDev : undefined,
        category: sCat !== 'all' ? sCat : undefined,
        status: sStat !== 'all' ? sStat : undefined,
        startDate: sStart ? sStart.format('YYYY-MM-DD HH:mm:ss') : undefined,
        endDate: sEnd ? sEnd.format('YYYY-MM-DD HH:mm:ss') : undefined,
      };

      setIsLoading(true);
      try {
        const records = await TransactionsApi.getTransactions(params);
        setHistoryData(records);

        // Build summary of applied filters
        const parts: string[] = [];
        if (sStat !== 'all') parts.push(`State: ${sStat}`);
        if (sDev !== 'all') {
          const devName = devices.find(d => d.id === sDev)?.displayName || sDev;
          parts.push(`Device: ${devName}`);
        }
        if (sCat !== 'all') parts.push(`Category: ${sCat}`);
        if (sStart || sEnd) {
          parts.push(`Date: ${sStart ? sStart.format('MM/DD HH:mm') : 'Start'} → ${sEnd ? sEnd.format('MM/DD HH:mm') : 'Now'}`);
        }
        if (sText.trim()) parts.push(`Search: "${sText.trim()}"`);
        setAppliedFiltersSummary(parts.length > 0 ? parts.join(' | ') : 'All Records');

        return records;
      } catch (err: any) {
        console.warn('Backend transactions API error, falling back to local dataset:', err);
        // Fallback filter over context data in case backend is offline
        const fallback = marriedTransactions.filter(txn => {
          const q = (sText || '').toLowerCase().trim();
          const matchesSearch = !q ||
            txn.transactionId.toLowerCase().includes(q) ||
            txn.rfidUniqueId.toLowerCase().includes(q) ||
            txn.workOrderNo.toLowerCase().includes(q) ||
            txn.materialCode.toLowerCase().includes(q) ||
            txn.partNumber.toLowerCase().includes(q) ||
            txn.productName.toLowerCase().includes(q) ||
            txn.deviceName.toLowerCase().includes(q) ||
            (txn.status || 'WIP').toLowerCase().includes(q);

          const matchesDevice = sDev === 'all' || txn.deviceId === sDev;
          const matchesCategory = sCat === 'all' || txn.category === sCat;
          const matchesStatus = sStat === 'all' || (txn.status || 'WIP') === sStat;

          let matchesDate = true;
          if (sStart || sEnd) {
            const txnDate = dayjs(txn.timestamp);
            if (sStart && sEnd) {
              matchesDate = txnDate.isBetween(sStart, sEnd, null, '[]');
            } else if (sStart) {
              matchesDate = txnDate.isAfter(sStart) || txnDate.isSame(sStart);
            } else if (sEnd) {
              matchesDate = txnDate.isBefore(sEnd) || txnDate.isSame(sEnd);
            }
          }
          return matchesSearch && matchesDevice && matchesCategory && matchesStatus && matchesDate;
        });
        setHistoryData(fallback);
        return fallback;
      } finally {
        setIsLoading(false);
      }
    },
    [searchText, selectedDevice, selectedCategory, selectedStatus, startDate, endDate, devices, marriedTransactions]
  );

  // Apply Filter: Only call API and load data when user hits "Apply" or presses Enter
  const handleApplyFilter = async () => {
    setHasSubmitted(true);
    const res = await fetchHistoryData();
    if (res) {
      message.success(`Filter applied: Loaded ${res.length} transaction records.`);
    }
  };

  // Reset Filters: Clear all filter inputs and reset table to initial unsubmitted state
  const handleResetFilter = () => {
    setStartDate(null);
    setEndDate(null);
    setSearchText('');
    setSelectedDevice('all');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setHistoryData([]);
    setHasSubmitted(false);
    setAppliedFiltersSummary('');
    message.info('Filters reset. Click "Apply Filter" to retrieve records.');
  };

  // Quick Preset Handlers (Set date & immediately fetch from API)
  const handlePreset = async (preset: 'today' | '24h' | '7d' | 'month' | 'all') => {
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
    setHasSubmitted(true);
    const res = await fetchHistoryData({ start, end });
    message.success(`Preset '${preset}' applied: Loaded ${res?.length || 0} records.`);
  };

  // Export CSV with ALL records matching the applied filter
  const handleExportCSV = () => {
    if (historyData.length === 0) {
      message.warning('No transaction records available to export. Please apply filters first.');
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

    const rows = historyData.map(t => {
      return [
        `"${t.transactionId || ''}"`,
        `"${t.materialCode || ''}"`,
        `"${t.partNumber || ''}"`,
        `"${t.workOrderNo || ''}"`,
        `"${t.rfidUniqueId || ''}"`,
        `"${t.wipScanTimestamp || t.timestamp || ''}"`,
        `"${t.dispatchScanTimestamp || (t.status === 'Dispatched' ? t.timestamp : '')}"`,
        `"${(t.productName || '').replace(/"/g, '""')}"`,
        `"${t.category || ''}"`,
        `"${t.deviceName || ''}"`,
        `"${t.operatorRole || ''}"`,
        `"${t.status || 'WIP'}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers, ...rows].join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Wakefit_FG_Transactions_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success(`Successfully exported all ${historyData.length} transaction records to CSV.`);
  };

  // Metrics Calculations based on active history data
  const totalCount = historyData.length;
  const wipCount = historyData.filter(t => (t.status || 'WIP') === 'WIP').length;
  const dispatchedCount = historyData.filter(t => t.status === 'Dispatched').length;
  const uniqueWorkOrders = new Set(historyData.map(t => t.workOrderNo).filter(Boolean)).size;

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
                {/* <Tag color="blue" style={{ borderRadius: '6px', fontWeight: 800, fontSize: '12px', margin: 0, padding: '2px 8px' }}>
                  <FileTextOutlined style={{ marginRight: '5px' }} />
                  Unique WOs: {uniqueWorkOrders}
                </Tag> */}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Input
              placeholder="Search Transaction ID / RFID / Material Code / WO... (Hit Enter or Apply)"
              prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: '14px' }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onPressEnter={handleApplyFilter}
              allowClear
              style={{ width: '400px', minWidth: '260px' }}
            />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              style={{ fontWeight: 600 }}
              disabled={isLoading || historyData.length === 0}
            >
              Export (CSV)
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
              loading={isLoading}
              style={{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F', fontWeight: 700, padding: '0 16px' }}
            >
              Apply Filter
            </Button>

            <Button
              icon={<ReloadOutlined />}
              onClick={handleResetFilter}
              disabled={isLoading}
            >
              Reset
            </Button>

            {/* Quick Presets */}
            <Space size={4} wrap style={{ marginLeft: '4px' }}>
              <Button size="small" disabled={isLoading} onClick={() => handlePreset('today')}>Today</Button>
              <Button size="small" disabled={isLoading} onClick={() => handlePreset('24h')}>Last 24h</Button>
              <Button size="small" disabled={isLoading} onClick={() => handlePreset('7d')}>Last 7D</Button>
              <Button size="small" disabled={isLoading} onClick={() => handlePreset('month')}>Month</Button>
              <Button size="small" disabled={isLoading} onClick={() => handlePreset('all')}>All</Button>
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


            {hasSubmitted && appliedFiltersSummary && (
              <Tag color="geekblue" closable onClose={handleResetFilter} style={{ margin: 0, fontWeight: 600 }}>
                Active: {appliedFiltersSummary}
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
          dataSource={historyData}
          rowKey={(r) => r.id || r.transactionId || String(r.sqliteRecordId)}
          loading={isLoading}
          locale={{
            emptyText: (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '13px' }}>
                      {hasSubmitted
                        ? 'No transaction records found matching the applied filter criteria.'
                        : 'Select filter criteria above and click "Apply Filter" to retrieve transaction history.'}
                    </span>
                  }
                />
              </div>
            ),
          }}
          pagination={{ 
            pageSize: 10, 
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
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
            </Descriptions>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default HistoryPage;
