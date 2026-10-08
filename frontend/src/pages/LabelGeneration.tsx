import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Button, 
  Tag, 
  Table, 
  Tooltip, 
  message, 
  Select, 
  Input, 
  Space
} from 'antd';
import { 
  CopyOutlined, 
  CheckOutlined, 
  DatabaseOutlined, 
  HistoryOutlined,
  ExportOutlined,
  SearchOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import confetti from 'canvas-confetti';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import { ConveyorAnimation, type SickScanPhase } from '../components/lookup/ConveyorAnimation';
import type { MasterDataItem } from '../types';
import { TransactionsApi } from '../services/api';
import { formatToIST } from '../utils/dateUtils';

const { Option } = Select;

const AUTO_RESET_HOLD_MS = 5000; // Hold detection display for 5 seconds, then return to Green Steady (Standby)

export const LabelGeneration: React.FC = () => {
  const { masterData, updateTransactionStatus, refreshTransactions, devices, marriedTransactions } = useData();
  const { isDark } = useAppTheme();

  // Find dynamically registered Fixed RFID Scanner from Device Management
  const fixedScanner = useMemo(() => {
    return (
      (devices || []).find(
        d =>
          d.deviceType === 'Fixed RFID Scanner' ||
          (d.deviceType && d.deviceType.toLowerCase().includes('fixed')) ||
          (d.name && d.name.toLowerCase().includes('fixed'))
      ) || null
    );
  }, [devices]);

  // Active SKU on the conveyor
  const [selectedSkuIndex, setSelectedSkuIndex] = useState<number>(0);
  const currentProduct: MasterDataItem = masterData[selectedSkuIndex] || masterData[0];

  // Scan Lifecycle State - Standby by default (idle)
  const [scanPhase, setScanPhase] = useState<SickScanPhase>('idle');

  // Active Read RFID & Traceability States (Initialized empty until a SICK scan occurs)
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [activeRfidTag, setActiveRfidTag] = useState<string | null>(null);
  const [activeWorkOrder, setActiveWorkOrder] = useState<string | null>(null);
  const [activeMaterialCode, setActiveMaterialCode] = useState<string | null>(null);
  const [activePartNumber, setActivePartNumber] = useState<string | null>(null);
  const activeBatch = 'BATCH-2026-0831-A';

  const hasActiveScan = scanPhase === 'reading_success' && Boolean(activeTransactionId);

  const handleResetToStandby = useCallback(() => {
    setScanPhase('idle');
    setActiveTransactionId(null);
    setActiveRfidTag(null);
    setActiveWorkOrder(null);
    setActiveMaterialCode(null);
    setActivePartNumber(null);
  }, []);

  // Dispatched transactions from SQLite DB (persisted and synchronized)
  const dispatchedTransactions = useMemo(() => {
    return (marriedTransactions || [])
      .filter(t => t.status === 'Dispatched' || (t as any).statusId === 'dispatch')
      .map(t => ({
        id: t.id || t.transactionId,
        transactionId: t.transactionId,
        rfidUniqueId: t.rfidUniqueId,
        workOrderNo: t.workOrderNo,
        materialCode: t.materialCode,
        partNumber: t.partNumber,
        productName: t.productName,
        status: 'Dispatched',
        timestamp: t.timestamp,
        labelLookupTimestamp: (t as any).labelLookupTimestamp,
        dispatchScanTimestamp: t.dispatchScanTimestamp,
      }));
  }, [marriedTransactions]);

  // Refresh live transactions on mount to ensure synchronization with SQLite
  useEffect(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  // Clean any stale legacy scan cache on component mount
  useEffect(() => {
    try {
      localStorage.removeItem('wakefit_last_fixed_rfid_scan_v3');
      localStorage.removeItem('wakefit_last_fixed_rfid_scan');
    } catch {
      // ignore
    }
  }, []);

  // Copy success indicator states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Buffer tracking for continuous SICK RFU630 fixed RFID reader listener
  const lastProcessedFixedScanIdRef = useRef<string | null>(null);
  const autoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Continuous SICK RFU630 RFID Portal Listener (Polls pending fixed scans)
  useEffect(() => {
    let isSubscribed = true;
    const checkFixedPending = async () => {
      try {
        const getPendingFn = TransactionsApi.getPendingFixedRfid;
        let pending: any;
        if (typeof getPendingFn === 'function') {
          pending = await getPendingFn();
        } else {
          const fetchRes = await fetch('/api/transactions/pending_fixed_rfid');
          pending = await fetchRes.json();
        }

        if (!isSubscribed) return;
        if (!fixedScanner) {
          // If no Fixed RFID Scanner is registered in Device Management, ignore scans
          return;
        }
        if (
          pending &&
          pending.scanId &&
          pending.scanId !== lastProcessedFixedScanIdRef.current &&
          pending.rfidUniqueId &&
          pending.status === 'Dispatch'
        ) {
          lastProcessedFixedScanIdRef.current = pending.scanId;

          // 1. SICK RFID Portal detection animation: Orange blink as box passes under antenna
          setScanPhase('reading_success');

          // 2. Update Live Traceability & Coupled Product Identifiers tiles
          setActiveTransactionId(pending.transactionId);
          setActiveRfidTag(pending.rfidUniqueId);
          setActiveWorkOrder(pending.workOrderNo);
          setActiveMaterialCode(pending.materialCode);
          setActivePartNumber(pending.partNumber || '');

          // Find matching Master Data item and update active SKU
          const matchedIdx = masterData.findIndex(
            m => m.materialCode.toUpperCase() === (pending.materialCode || '').toUpperCase()
          );
          if (matchedIdx >= 0) {
            setSelectedSkuIndex(matchedIdx);
          }

          // 3. Confetti and toast notification
          confetti({
            particleCount: 30,
            spread: 60,
            origin: { y: 0.5, x: 0.5 },
            colors: ['#F97316', '#EA580C', '#FB923C', '#10B981'],
          });

          message.success({
            content: `SICK RFID Portal Detected Tag [${pending.rfidUniqueId}]! Coupled to Transaction [${pending.transactionId}], WO [${pending.workOrderNo}], Material [${pending.materialCode}]. Status: DISPATCH.`,
            duration: 8,
          });

          // 4. Update status in DataContext and refresh from SQLite
          if (updateTransactionStatus) {
            updateTransactionStatus(pending.transactionId, 'Dispatched');
          }
          if (refreshTransactions) {
            refreshTransactions();
          }

          // 5. Clear backend buffer
          try {
            const clearFn = TransactionsApi.clearFixedRfid;
            if (typeof clearFn === 'function') {
              clearFn();
            } else {
              fetch('/api/transactions/clear_fixed_rfid', { method: 'POST' });
            }
          } catch {
            // ignore clear error
          }

          // 6. Auto-reset timer: Hold scan detection for 5 seconds, then return to Green Steady (Standby)
          if (autoResetTimerRef.current) {
            clearTimeout(autoResetTimerRef.current);
          }
          autoResetTimerRef.current = setTimeout(() => {
            handleResetToStandby();
          }, AUTO_RESET_HOLD_MS);
        }
      } catch {
        // quiet continuous listener polling
      }
    };

    checkFixedPending();
    const interval = setInterval(checkFixedPending, 1000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
      if (autoResetTimerRef.current) {
        clearTimeout(autoResetTimerRef.current);
      }
    };
  }, [masterData, updateTransactionStatus, refreshTransactions, handleResetToStandby, fixedScanner]);

  // Search filter for bottom transaction records table
  const [tableSearchText, setTableSearchText] = useState<string>('');

  const filteredReads = useMemo(() => {
    if (!tableSearchText.trim()) return dispatchedTransactions;
    const q = tableSearchText.toLowerCase().trim();
    return dispatchedTransactions.filter(
      r =>
        (r.transactionId && r.transactionId.toLowerCase().includes(q)) ||
        (r.materialCode && r.materialCode.toLowerCase().includes(q)) ||
        (r.partNumber && r.partNumber.toLowerCase().includes(q)) ||
        (r.workOrderNo && r.workOrderNo.toLowerCase().includes(q)) ||
        (r.rfidUniqueId && r.rfidUniqueId.toLowerCase().includes(q)) ||
        (r.productName && r.productName.toLowerCase().includes(q)) ||
        (r.timestamp && r.timestamp.toLowerCase().includes(q))
    );
  }, [dispatchedTransactions, tableSearchText]);


  // Helper to copy text to clipboard with user feedback
  const handleCopy = (text: string, keyName: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    message.success({
      content: `Copied ${label} to clipboard: "${text}"`,
      key: 'copy_msg',
      duration: 2.5,
    });
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Helper to copy entire traceability payload
  const handleCopyAllTraceability = () => {
    if (!hasActiveScan) {
      message.info('No active scanned data to copy. Please wait for an RFID scan.');
      return;
    }
    const scannerDesc = fixedScanner
      ? `${fixedScanner.displayName || fixedScanner.name} (IP: ${fixedScanner.ipAddress || 'Auto'}${fixedScanner.port ? `:${fixedScanner.port}` : ''})`
      : 'Fixed RFID Reader';

    const payload = `=== WAKEFIT FG TRACEABILITY DATA ===
Transaction ID: ${activeTransactionId || 'N/A'}
RFID Tag No:    ${activeRfidTag || 'N/A'}
Material Code:  ${activeMaterialCode || currentProduct.materialCode}
Part Number:    ${activePartNumber || currentProduct.partNumber}
Work Order No:  ${activeWorkOrder || 'N/A'}
Product Name:   ${currentProduct.productDescription || currentProduct.productName}
Category:       ${currentProduct.category}
Dimensions:     ${currentProduct.dimensions.lengthMm} x ${currentProduct.dimensions.widthMm} x ${currentProduct.dimensions.heightMm} mm
Color:          ${currentProduct.color || 'Standard'}
Batch Number:   ${activeBatch}
Scanner Device: ${scannerDesc}
Read Timestamp: ${new Date().toISOString()}
=====================================`;

    navigator.clipboard.writeText(payload);
    message.success('Copied complete traceability record to clipboard!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 1. SICK RFU630 RFID Portal & Scan Detection */}
      <ConveyorAnimation
        currentProduct={currentProduct}
        rfidTag={activeRfidTag || ''}
        scanPhase={scanPhase}
        onResetToStandby={handleResetToStandby}
        fixedDevice={fixedScanner}
      />

      {/* 3. Five Key Copyable Traceability Data Fields */}
      <Card
        bordered={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DatabaseOutlined style={{ color: '#E53935' }} />
              <span style={{ fontWeight: 800, fontSize: '15px' }}>
                Live Traceability & Coupled Product Identifiers
              </span>
              {hasActiveScan ? (
                <Tag color="success" style={{ fontWeight: 700, borderRadius: '10px', fontSize: '11px' }}>
                  ● SICK Scan Active
                </Tag>
              ) : (
                <Tag color="default" style={{ fontWeight: 600, borderRadius: '10px', fontSize: '11px' }}>
                  ○ Standby (Awaiting Scan)
                </Tag>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Select
                value={hasActiveScan ? selectedSkuIndex : undefined}
                placeholder={hasActiveScan ? undefined : 'No Active Scan'}
                onChange={val => setSelectedSkuIndex(val)}
                style={{ width: 250 }}
                size="small"
                disabled={!hasActiveScan}
              >
                {masterData.map((item, idx) => (
                  <Option key={item.id} value={idx}>
                    <span style={{ fontWeight: 700, color: '#E53935', fontFamily: 'monospace' }}>{item.materialCode}</span>
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({item.partNumber})</span>
                  </Option>
                ))}
              </Select>

              <Button
                icon={<ExportOutlined />}
                size="small"
                disabled={!hasActiveScan}
                onClick={handleCopyAllTraceability}
                style={{ fontWeight: 600, fontSize: '12px' }}
              >
                Copy All Data
              </Button>
            </div>
          </div>
        }
        style={{
          borderRadius: '12px',
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <Row gutter={[12, 12]} style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* Field 1: Transaction ID */}
          <Col xs={24} sm={12} md={12} lg={4.8} xl={4.8} style={{ flex: '1 1 190px', minWidth: '180px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : (hasActiveScan ? '#f8fafc' : '#f8fafc'),
                border: `1px solid ${isDark ? '#334155' : (hasActiveScan ? '#e2e8f0' : '#e2e8f0')}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                opacity: hasActiveScan ? 1 : 0.7,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
                    TRANSACTION ID
                  </span>
                  <Tag color={hasActiveScan ? 'blue' : 'default'} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    {hasActiveScan ? 'Auto-Coupled' : 'Standby'}
                  </Tag>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: hasActiveScan ? (isDark ? '#f8fafc' : '#0f172a') : '#94a3b8', wordBreak: 'break-all' }}>
                  {hasActiveScan ? activeTransactionId : '—'}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                disabled={!hasActiveScan || !activeTransactionId}
                icon={copiedKey === 'txn' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => activeTransactionId && handleCopy(activeTransactionId, 'txn', 'Transaction ID')}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'txn' ? '#10B981' : undefined,
                  borderColor: copiedKey === 'txn' ? '#10B981' : undefined,
                }}
              >
                {copiedKey === 'txn' ? 'Copied Transaction ID!' : 'Copy Transaction ID'}
              </Button>
            </div>
          </Col>

          {/* Field 2: RFID Tag No. */}
          <Col xs={24} sm={12} md={12} lg={4.8} xl={4.8} style={{ flex: '1 1 190px', minWidth: '180px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : (hasActiveScan ? '#f0f9ff' : '#f8fafc'),
                border: `1px solid ${isDark ? '#334155' : (hasActiveScan ? '#bae6fd' : '#e2e8f0')}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                opacity: hasActiveScan ? 1 : 0.7,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284C7', letterSpacing: '0.5px' }}>
                    RFID TAG NO.
                  </span>
                  <Tag color={hasActiveScan ? 'cyan' : 'default'} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    {hasActiveScan ? 'SICK Portal' : 'Standby'}
                  </Tag>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'monospace', color: hasActiveScan ? '#0284C7' : '#94a3b8', wordBreak: 'break-all' }}>
                  {hasActiveScan ? activeRfidTag : '—'}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                disabled={!hasActiveScan || !activeRfidTag}
                icon={copiedKey === 'rfid' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => activeRfidTag && handleCopy(activeRfidTag, 'rfid', 'RFID Tag No.')}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'rfid' ? '#10B981' : (hasActiveScan ? '#0284C7' : undefined),
                  borderColor: copiedKey === 'rfid' ? '#10B981' : (hasActiveScan ? '#7dd3fc' : undefined),
                }}
              >
                {copiedKey === 'rfid' ? 'Copied RFID Tag!' : 'Copy RFID Tag'}
              </Button>
            </div>
          </Col>

          {/* Field 3: Material Code */}
          <Col xs={24} sm={12} md={12} lg={4.8} xl={4.8} style={{ flex: '1 1 190px', minWidth: '180px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : (hasActiveScan ? '#fef2f2' : '#f8fafc'),
                border: `1px solid ${isDark ? '#334155' : (hasActiveScan ? '#fecaca' : '#e2e8f0')}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                opacity: hasActiveScan ? 1 : 0.7,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#E53935', letterSpacing: '0.5px' }}>
                    MATERIAL CODE
                  </span>
                  <Tag color={hasActiveScan ? 'red' : 'default'} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    {hasActiveScan ? 'Primary SKU' : 'Standby'}
                  </Tag>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 900, fontFamily: 'monospace', color: hasActiveScan ? '#E53935' : '#94a3b8', wordBreak: 'break-all' }}>
                  {hasActiveScan ? (activeMaterialCode || currentProduct.materialCode) : '—'}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                disabled={!hasActiveScan || !(activeMaterialCode || currentProduct.materialCode)}
                icon={copiedKey === 'mat' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => {
                  const val = activeMaterialCode || currentProduct.materialCode;
                  if (val) handleCopy(val, 'mat', 'Material Code');
                }}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'mat' ? '#10B981' : (hasActiveScan ? '#E53935' : undefined),
                  borderColor: copiedKey === 'mat' ? '#10B981' : (hasActiveScan ? '#fca5a5' : undefined),
                }}
              >
                {copiedKey === 'mat' ? 'Copied Material Code!' : 'Copy Material Code'}
              </Button>
            </div>
          </Col>

          {/* Field 4: Part Number */}
          <Col xs={24} sm={12} md={12} lg={4.8} xl={4.8} style={{ flex: '1 1 190px', minWidth: '180px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : (hasActiveScan ? '#f8fafc' : '#f8fafc'),
                border: `1px solid ${isDark ? '#334155' : (hasActiveScan ? '#e2e8f0' : '#e2e8f0')}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                opacity: hasActiveScan ? 1 : 0.7,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
                    PART NUMBER (FG SKU)
                  </span>
                  <Tag color={hasActiveScan ? 'cyan' : 'default'} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    {hasActiveScan ? 'Engineering' : 'Standby'}
                  </Tag>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: hasActiveScan ? (isDark ? '#f8fafc' : '#0f172a') : '#94a3b8', wordBreak: 'break-all' }}>
                  {hasActiveScan ? (activePartNumber || currentProduct.partNumber) : '—'}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                disabled={!hasActiveScan || !(activePartNumber || currentProduct.partNumber)}
                icon={copiedKey === 'part' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => {
                  const val = activePartNumber || currentProduct.partNumber;
                  if (val) handleCopy(val, 'part', 'Part Number');
                }}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'part' ? '#10B981' : undefined,
                  borderColor: copiedKey === 'part' ? '#10B981' : undefined,
                }}
              >
                {copiedKey === 'part' ? 'Copied Part Number!' : 'Copy Part Number'}
              </Button>
            </div>
          </Col>

          {/* Field 5: Work Order Number */}
          <Col xs={24} sm={12} md={12} lg={4.8} xl={4.8} style={{ flex: '1 1 190px', minWidth: '180px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : (hasActiveScan ? '#faf5ff' : '#f8fafc'),
                border: `1px solid ${isDark ? '#334155' : (hasActiveScan ? '#e9d5ff' : '#e2e8f0')}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                opacity: hasActiveScan ? 1 : 0.7,
                transition: 'all 0.3s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B5CF6', letterSpacing: '0.5px' }}>
                    WORK ORDER NUMBER
                  </span>
                  <Tag color={hasActiveScan ? 'purple' : 'default'} style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    {hasActiveScan ? 'Production Run' : 'Standby'}
                  </Tag>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: hasActiveScan ? '#7c3aed' : '#94a3b8', wordBreak: 'break-all' }}>
                  {hasActiveScan ? activeWorkOrder : '—'}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                disabled={!hasActiveScan || !activeWorkOrder}
                icon={copiedKey === 'wo' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => activeWorkOrder && handleCopy(activeWorkOrder, 'wo', 'Work Order Number')}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'wo' ? '#10B981' : (hasActiveScan ? '#7c3aed' : undefined),
                  borderColor: copiedKey === 'wo' ? '#10B981' : (hasActiveScan ? '#d8b4fe' : undefined),
                }}
              >
                {copiedKey === 'wo' ? 'Copied Work Order!' : 'Copy Work Order Number'}
              </Button>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 4. Live Stream: Recent Units Traversed through Conveyor SICK Reader */}
      <Card
        bordered={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HistoryOutlined style={{ color: '#0284C7' }} />
              <span style={{ fontWeight: 800, fontSize: '14px' }}>
                FG Dispatch Transaction Records ({filteredReads.length}{filteredReads.length !== dispatchedTransactions.length ? ` of ${dispatchedTransactions.length}` : ''})
              </span>
            </div>
            <Space size="middle" wrap>
              <Input
                placeholder="Search transaction, material, part no, work order, RFID..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={tableSearchText}
                onChange={e => setTableSearchText(e.target.value)}
                allowClear
                style={{ width: 320, minWidth: 220 }}
                size="small"
              />
              {/* <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearDispatchRecords}
                disabled={recentReads.length === 0}
              >
                Clear Dispatches
              </Button> */}
              <Tag color="cyan" style={{ fontWeight: 700, borderRadius: '4px', margin: 0 }}>
                LIVE BUFFER
              </Tag>
            </Space>
          </div>
        }
        style={{
          borderRadius: '12px',
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <Table
          size="middle"
          dataSource={filteredReads}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{ emptyText: tableSearchText ? `No dispatch records matching "${tableSearchText}"` : 'No recent dispatch records' }}
          columns={[
            {
              title: 'Transaction ID',
              dataIndex: 'transactionId',
              key: 'transactionId',
              width: 170,
              render: (tx: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{tx}</strong>
                  <Tooltip title="Copy Transaction ID">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined style={{ fontSize: '11px' }} />}
                      onClick={() => handleCopy(tx, `t_${tx}`, 'Transaction ID')}
                    />
                  </Tooltip>
                </div>
              ),
            },
            {
              title: 'Factory RFID Tag ID',
              dataIndex: 'rfidUniqueId',
              key: 'rfidUniqueId',
              width: 230,
              render: (rfid: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#0284C7', fontWeight: 700 }}>
                    {rfid}
                  </span>
                  {rfid && (
                    <Tooltip title="Copy RFID Tag ID">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined style={{ fontSize: '11px', color: '#94a3b8' }} />}
                        onClick={() => handleCopy(rfid, `rfid_${rfid}`, 'Factory RFID Tag ID')}
                      />
                    </Tooltip>
                  )}
                </div>
              ),
            },
            {
              title: 'Work Order No. (WO)',
              dataIndex: 'workOrderNo',
              key: 'workOrderNo',
              width: 170,
              render: (wo: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag color="purple" style={{ fontFamily: 'monospace', margin: 0 }}>
                    {wo}
                  </Tag>
                  {wo && (
                    <Tooltip title="Copy Work Order No.">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined style={{ fontSize: '11px', color: '#94a3b8' }} />}
                        onClick={() => handleCopy(wo, `wo_${wo}`, 'Work Order Number')}
                      />
                    </Tooltip>
                  )}
                </div>
              ),
            },
            {
              title: 'Material Code',
              dataIndex: 'materialCode',
              key: 'materialCode',
              width: 160,
              render: (mat: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{mat}</strong>
                  {mat && (
                    <Tooltip title="Copy Material Code">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined style={{ fontSize: '11px', color: '#94a3b8' }} />}
                        onClick={() => handleCopy(mat, `mat_${mat}`, 'Material Code')}
                      />
                    </Tooltip>
                  )}
                </div>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              align: 'center',
              render: () => (
                <Tooltip title="System Status: Outbound Dispatched / Completed">
                  <Tag
                    color="success"
                    style={{
                      margin: 0,
                      fontWeight: 800,
                      fontSize: '11px',
                      borderRadius: '12px',
                      padding: '2px 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <CheckCircleOutlined />
                    DISPATCH
                  </Tag>
                </Tooltip>
              ),
            },
            {
              title: 'Timestamp',
              dataIndex: 'timestamp',
              key: 'timestamp',
              align: 'center',
              width: 160,
              render: (t: string, r: any) => (
                <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                  {formatToIST(r.labelLookupTimestamp || r.dispatchScanTimestamp || t || r.createdOn)}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default LabelGeneration;
