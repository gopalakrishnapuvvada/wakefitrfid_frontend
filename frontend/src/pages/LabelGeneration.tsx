import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  SearchOutlined
} from '@ant-design/icons';
import confetti from 'canvas-confetti';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import { ConveyorAnimation, type SickScanPhase } from '../components/lookup/ConveyorAnimation';
import type { MasterDataItem } from '../types';
import { TransactionsApi } from '../services/api';
import { formatToIST, getCurrentIST } from '../utils/dateUtils';

const { Option } = Select;

const DISPATCH_READS_KEY = 'wakefit_recent_conveyor_reads_v3';
const LAST_FIXED_SCAN_KEY = 'wakefit_last_fixed_rfid_scan_v3';

interface RecentConveyorRead {
  id: string;
  timestamp: string;
  transactionId: string;
  rfidTag: string;
  materialCode: string;
  partNumber: string;
  workOrderNo: string;
  productName: string;
  status: string;
  antenna: string;
}

const INITIAL_FALLBACK_READS: RecentConveyorRead[] = [
  {
    id: 'READ-001',
    timestamp: '2026-08-31 15:42:19',
    transactionId: 'TXN-20260831-0089',
    rfidTag: 'E280117020002164A5B801D3',
    materialCode: 'WAK-MAT-787208',
    partNumber: 'FG-ORT-KNG-08',
    workOrderNo: 'WO-2026-0831-99214',
    productName: 'Orthopaedic Memory Foam Mattress (King - 78x72x8)',
    status: 'Dispatch',
    antenna: 'Port 1 (Overhead)',
  },
  {
    id: 'READ-002',
    timestamp: '2026-08-31 15:41:45',
    transactionId: 'TXN-20260831-0088',
    rfidTag: 'E280117020002164A5B801C2',
    materialCode: 'WAK-SOF-NAP-3ST',
    partNumber: 'FG-NAP-SOF-03',
    workOrderNo: 'WO-2026-0831-99210',
    productName: 'Napper 3-Seater Premium Fabric Sofa (Navy Blue)',
    status: 'Dispatch',
    antenna: 'Port 1 (Overhead)',
  },
  {
    id: 'READ-003',
    timestamp: '2026-08-31 15:40:50',
    transactionId: 'TXN-20260831-0087',
    rfidTag: 'E280117020002164A5B801B1',
    materialCode: 'WAK-REC-MOT-BRN',
    partNumber: 'FG-MOT-REC-01',
    workOrderNo: 'WO-2026-0831-99205',
    productName: 'Motorized Single Recliner (Brown Leatherette)',
    status: 'Dispatch',
    antenna: 'Port 1 (Overhead)',
  },
];

export const LabelGeneration: React.FC = () => {
  const { masterData, updateTransactionStatus, marriedTransactions } = useData();
  const { isDark } = useAppTheme();

  // Restore latest scan state or defaults from localStorage
  const savedLastScan = useMemo(() => {
    try {
      const s = localStorage.getItem(LAST_FIXED_SCAN_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }, []);

  // Active SKU on the conveyor (Persisted across refreshes)
  const [selectedSkuIndex, setSelectedSkuIndex] = useState<number>(() => {
    return savedLastScan?.selectedSkuIndex ?? 0;
  });
  const currentProduct: MasterDataItem = masterData[selectedSkuIndex] || masterData[0];

  // Scan Lifecycle & Trigger State
  const [scanPhase, setScanPhase] = useState<SickScanPhase>('idle');
  const [autoStream, setAutoStream] = useState<boolean>(false);
  const [scanPulseToken, setScanPulseToken] = useState<number>(0);

  // Recent Conveyor Reads History Stream (Persisted in localStorage across refreshes)
  const [recentReads, setRecentReads] = useState<RecentConveyorRead[]>(() => {
    try {
      const saved = localStorage.getItem(DISPATCH_READS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_FALLBACK_READS;
  });

  // Automatically save recentReads to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(DISPATCH_READS_KEY, JSON.stringify(recentReads));
    } catch {
      // ignore
    }
  }, [recentReads]);

  // Synchronize dispatched transactions from DataContext (backed by SQLite DB) into recentReads
  useEffect(() => {
    if (!marriedTransactions || marriedTransactions.length === 0) return;

    const dispatchedTxns = marriedTransactions.filter(
      t => t.status === 'Dispatched' || (t as any).statusId === 'dispatch'
    );

    if (dispatchedTxns.length === 0) return;

    setRecentReads(prev => {
      let updated = [...prev];
      let hasChange = false;

      for (const dt of dispatchedTxns) {
        const existingIdx = updated.findIndex(
          r => r.transactionId === dt.transactionId || r.rfidTag === dt.rfidUniqueId
        );
        const dtTimestamp = formatToIST(
          dt.dispatchScanTimestamp || dt.timestamp || (dt as any).createdOn || (dt as any).productValidationTimestamp || new Date()
        );
        const readItem: RecentConveyorRead = {
          id: existingIdx >= 0 ? updated[existingIdx].id : `READ-${dt.transactionId}`,
          timestamp: dtTimestamp,
          transactionId: dt.transactionId,
          rfidTag: dt.rfidUniqueId,
          materialCode: dt.materialCode,
          partNumber: dt.partNumber || '',
          workOrderNo: dt.workOrderNo || '',
          productName: dt.productName || 'Finished Good',
          status: 'Dispatch',
          antenna: 'Port 1 (Overhead)',
        };

        if (existingIdx >= 0) {
          if (updated[existingIdx].status !== 'Dispatch' || updated[existingIdx].timestamp !== dtTimestamp) {
            updated[existingIdx] = { ...updated[existingIdx], ...readItem };
            hasChange = true;
          }
        } else {
          updated = [readItem, ...updated];
          hasChange = true;
        }
      }

      return hasChange ? updated : prev;
    });
  }, [marriedTransactions]);

  // Active Read RFID & Traceability States (Persisted across refreshes)
  const [activeTransactionId, setActiveTransactionId] = useState<string>(() => {
    return savedLastScan?.transactionId || recentReads[0]?.transactionId || 'TXN-20260831-0089';
  });
  const [activeRfidTag, setActiveRfidTag] = useState<string>(() => {
    return savedLastScan?.rfidTag || recentReads[0]?.rfidTag || 'E280117020002164A5B801D3';
  });
  const [activeWorkOrder, setActiveWorkOrder] = useState<string>(() => {
    return savedLastScan?.workOrderNo || recentReads[0]?.workOrderNo || 'WO-2026-0831-99214';
  });
  const activeBatch = 'BATCH-2026-0831-A';

  // Keep last scan details saved in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        LAST_FIXED_SCAN_KEY,
        JSON.stringify({
          transactionId: activeTransactionId,
          rfidTag: activeRfidTag,
          workOrderNo: activeWorkOrder,
          selectedSkuIndex,
        })
      );
    } catch {
      // ignore
    }
  }, [activeTransactionId, activeRfidTag, activeWorkOrder, selectedSkuIndex]);

  // Copy success indicator states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Standby auto-reset effect: After detection, return scanner UI to standby (Green Steady - No FG Detected) after 2 seconds
  useEffect(() => {
    if (scanPhase === 'reading_success') {
      const timer = setTimeout(() => {
        setScanPhase('idle');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [scanPhase, scanPulseToken]);

  // Buffer tracking for continuous SICK RFU630 fixed RFID reader listener
  const lastProcessedFixedScanIdRef = useRef<string | null>(null);

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
          setScanPulseToken(prev => prev + 1);

          // 2. Update Live Traceability & Coupled Product Identifiers tiles
          setActiveTransactionId(pending.transactionId);
          setActiveRfidTag(pending.rfidUniqueId);
          setActiveWorkOrder(pending.workOrderNo);

          // Find matching Master Data item and update active SKU
          let newSkuIdx = selectedSkuIndex;
          const matchedIdx = masterData.findIndex(
            m => m.materialCode.toUpperCase() === (pending.materialCode || '').toUpperCase()
          );
          if (matchedIdx >= 0) {
            setSelectedSkuIndex(matchedIdx);
            newSkuIdx = matchedIdx;
          }

          // Format full IST date & time: 'YYYY-MM-DD HH:mm:ss'
          const scanTimestamp = formatToIST(pending.fullTimestamp || pending.timestamp || new Date());

          // 3. Parallely add to FG Dispatch Transaction Records table and persist
          const newReadRecord: RecentConveyorRead = {
            id: `READ-${Date.now()}`,
            timestamp: scanTimestamp,
            transactionId: pending.transactionId,
            rfidTag: pending.rfidUniqueId,
            materialCode: pending.materialCode,
            partNumber: pending.partNumber || '',
            workOrderNo: pending.workOrderNo || '',
            productName: pending.productName || 'Finished Good',
            status: 'Dispatch',
            antenna: pending.antenna || 'Port 1 (Overhead)',
          };

          setRecentReads(prev => {
            const next = [
              newReadRecord,
              ...prev.filter(r => r.transactionId !== pending.transactionId).slice(0, 14),
            ];
            try {
              localStorage.setItem(DISPATCH_READS_KEY, JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });

          // Save last scan key to localStorage immediately
          try {
            localStorage.setItem(
              LAST_FIXED_SCAN_KEY,
              JSON.stringify({
                transactionId: pending.transactionId,
                rfidTag: pending.rfidUniqueId,
                workOrderNo: pending.workOrderNo,
                selectedSkuIndex: newSkuIdx,
              })
            );
          } catch {
            // ignore
          }

          // 4. Confetti and toast notification
          confetti({
            particleCount: 30,
            spread: 60,
            origin: { y: 0.5, x: 0.5 },
            colors: ['#F97316', '#EA580C', '#FB923C', '#10B981'],
          });

          message.success({
            content: `SICK RFID Portal Detected Tag [${pending.rfidUniqueId}]! Coupled to Transaction [${pending.transactionId}], WO [${pending.workOrderNo}], Material [${pending.materialCode}]. Status: DISPATCH.`,
            duration: 3,
          });

          // 5. Update status in DataContext
          if (updateTransactionStatus) {
            updateTransactionStatus(pending.transactionId, 'Dispatched');
          }

          // 6. Clear backend buffer
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
    };
  }, [masterData, selectedSkuIndex, updateTransactionStatus]);

  // Search filter for bottom transaction records table
  const [tableSearchText, setTableSearchText] = useState<string>('');

  const filteredReads = useMemo(() => {
    if (!tableSearchText.trim()) return recentReads;
    const q = tableSearchText.toLowerCase().trim();
    return recentReads.filter(
      r =>
        r.transactionId.toLowerCase().includes(q) ||
        r.materialCode.toLowerCase().includes(q) ||
        r.partNumber.toLowerCase().includes(q) ||
        r.workOrderNo.toLowerCase().includes(q) ||
        r.rfidTag.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.timestamp.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.antenna.toLowerCase().includes(q)
    );
  }, [recentReads, tableSearchText]);

  // Trigger SICK Reader Read Success Event (Orange Blinking on FG Detected)
  const handleTriggerSickScan = useCallback(() => {
    if (scanPhase === 'reading_success') return;

    const timeStr = getCurrentIST();
    const randTag = `E280117020002164A5B80${Math.floor(100 + Math.random() * 900)}`;
    const randTxn = `TXN-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const randWo = `WO-${new Date().toISOString().substring(0, 10)}-${Math.floor(10000 + Math.random() * 90000)}`;

    setActiveTransactionId(randTxn);
    setActiveRfidTag(randTag);
    setActiveWorkOrder(randWo);
    setScanPhase('reading_success');
    setScanPulseToken(prev => prev + 1);

    // Save to localStorage
    try {
      localStorage.setItem(
        LAST_FIXED_SCAN_KEY,
        JSON.stringify({
          transactionId: randTxn,
          rfidTag: randTag,
          workOrderNo: randWo,
          selectedSkuIndex,
        })
      );
    } catch {
      // ignore
    }

    // Trigger Celebration Confetti Flash
    confetti({
      particleCount: 25,
      spread: 50,
      origin: { y: 0.5, x: 0.5 },
      colors: ['#F97316', '#EA580C', '#FB923C', '#10B981'],
    });

    // Add to recent audit stream
    const newRecord: RecentConveyorRead = {
      id: `READ-${Date.now()}`,
      timestamp: timeStr,
      transactionId: randTxn,
      rfidTag: randTag,
      materialCode: currentProduct.materialCode,
      partNumber: currentProduct.partNumber,
      workOrderNo: randWo,
      productName: currentProduct.productDescription || currentProduct.productName || 'Finished Good',
      status: 'Dispatch',
      antenna: 'Port 1 (Overhead)',
    };

    setRecentReads(prev => {
      const next = [newRecord, ...prev.slice(0, 14)];
      try {
        localStorage.setItem(DISPATCH_READS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [scanPhase, selectedSkuIndex, currentProduct]);

  // Auto-continuous scan simulation effect
  useEffect(() => {
    if (!autoStream) return;
    const timer = setInterval(() => {
      // Pick next product SKU periodically
      setSelectedSkuIndex(prev => (prev + 1) % masterData.length);
      handleTriggerSickScan();
    }, 6500);
    return () => clearInterval(timer);
  }, [autoStream, handleTriggerSickScan, masterData.length]);

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
    const payload = `=== WAKEFIT FG TRACEABILITY DATA ===
Transaction ID: ${activeTransactionId}
Material Code:  ${currentProduct.materialCode}
Part Number:    ${currentProduct.partNumber}
Work Order No:  ${activeWorkOrder}
RFID Tag EPC:   ${activeRfidTag}
Product Name:   ${currentProduct.productDescription || currentProduct.productName}
Category:       ${currentProduct.category}
Dimensions:     ${currentProduct.dimensions.lengthMm} x ${currentProduct.dimensions.widthMm} x ${currentProduct.dimensions.heightMm} mm
Net Weight:     ${(currentProduct.netWeight ?? currentProduct.weightKg ?? 25).toFixed(2)} kg
Batch Number:   ${activeBatch}
Scanner Device: SICK RFU630-13100 Fixed RFID Reader
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
        rfidTag={activeRfidTag}
        scanPhase={scanPhase}
        onTriggerScan={handleTriggerSickScan}
        autoStream={autoStream}
        onToggleAutoStream={setAutoStream}
      />

      {/* 3. Four Key Copyable Traceability Data Fields (Highlighted Requirement) */}
      <Card
        bordered={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DatabaseOutlined style={{ color: '#E53935' }} />
              <span style={{ fontWeight: 800, fontSize: '15px' }}>
                Live Traceability & Coupled Product Identifiers
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Select
                value={selectedSkuIndex}
                onChange={val => setSelectedSkuIndex(val)}
                style={{ width: 250 }}
                size="small"
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
        <Row gutter={[16, 16]}>
          {/* Field 1: Transaction ID */}
          <Col xs={24} sm={12} lg={6}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
                    TRANSACTION ID
                  </span>
                  <Tag color="blue" style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    Auto-Coupled
                  </Tag>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: isDark ? '#f8fafc' : '#0f172a', wordBreak: 'break-all' }}>
                  {activeTransactionId}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                icon={copiedKey === 'txn' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => handleCopy(activeTransactionId, 'txn', 'Transaction ID')}
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

          {/* Field 2: Material Code */}
          <Col xs={24} sm={12} lg={6}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#fef2f2',
                border: `1px solid ${isDark ? '#334155' : '#fecaca'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#E53935', letterSpacing: '0.5px' }}>
                    MATERIAL CODE
                  </span>
                  <Tag color="red" style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    Primary SKU
                  </Tag>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'monospace', color: '#E53935', wordBreak: 'break-all' }}>
                  {currentProduct.materialCode}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                icon={copiedKey === 'mat' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => handleCopy(currentProduct.materialCode, 'mat', 'Material Code')}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'mat' ? '#10B981' : '#E53935',
                  borderColor: copiedKey === 'mat' ? '#10B981' : '#fca5a5',
                }}
              >
                {copiedKey === 'mat' ? 'Copied Material Code!' : 'Copy Material Code'}
              </Button>
            </div>
          </Col>

          {/* Field 3: Part Number */}
          <Col xs={24} sm={12} lg={6}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
                    PART NUMBER (FG SKU)
                  </span>
                  <Tag color="cyan" style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    Engineering
                  </Tag>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 800, fontFamily: 'monospace', color: isDark ? '#f8fafc' : '#0f172a', wordBreak: 'break-all' }}>
                  {currentProduct.partNumber}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                icon={copiedKey === 'part' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => handleCopy(currentProduct.partNumber, 'part', 'Part Number')}
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

          {/* Field 4: Work Order Number */}
          <Col xs={24} sm={12} lg={6}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0f172a' : '#faf5ff',
                border: `1px solid ${isDark ? '#334155' : '#e9d5ff'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B5CF6', letterSpacing: '0.5px' }}>
                    WORK ORDER NUMBER
                  </span>
                  <Tag color="purple" style={{ fontSize: '10px', margin: 0, borderRadius: '4px' }}>
                    Production Run
                  </Tag>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 800, fontFamily: 'monospace', color: '#7c3aed', wordBreak: 'break-all' }}>
                  {activeWorkOrder}
                </div>
              </div>

              <Button
                type="dashed"
                size="small"
                icon={copiedKey === 'wo' ? <CheckOutlined style={{ color: '#10B981' }} /> : <CopyOutlined />}
                onClick={() => handleCopy(activeWorkOrder, 'wo', 'Work Order Number')}
                style={{
                  marginTop: '12px',
                  fontWeight: 600,
                  width: '100%',
                  color: copiedKey === 'wo' ? '#10B981' : '#7c3aed',
                  borderColor: copiedKey === 'wo' ? '#10B981' : '#d8b4fe',
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
                FG Dispatch Transaction Records ({filteredReads.length}{filteredReads.length !== recentReads.length ? ` of ${recentReads.length}` : ''})
              </span>
            </div>
            <Space size="middle" wrap>
              <Input
                placeholder="Search transaction, material, part no, work order, RFID..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={tableSearchText}
                onChange={e => setTableSearchText(e.target.value)}
                allowClear
                style={{ width: 380, minWidth: 260 }}
                size="small"
              />
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
          size="small"
          dataSource={filteredReads}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: tableSearchText ? `No dispatch records matching "${tableSearchText}"` : 'No recent conveyor records' }}
          columns={[
            {
              title: 'Date & Time',
              dataIndex: 'timestamp',
              key: 'timestamp',
              width: 160,
              render: (t: string) => (
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                  {formatToIST(t)}
                </span>
              ),
            },
            {
              title: 'Transaction ID',
              dataIndex: 'transactionId',
              key: 'transactionId',
              width: 190,
              render: (tx: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>{tx}</span>
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
              title: 'Material Code',
              dataIndex: 'materialCode',
              key: 'materialCode',
              width: 160,
              render: (mat: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ color: '#E53935', fontFamily: 'monospace', fontSize: '12px' }}>{mat}</strong>
                  <Tooltip title="Copy Material Code">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined style={{ fontSize: '11px', color: '#E53935' }} />}
                      onClick={() => handleCopy(mat, `m_${mat}`, 'Material Code')}
                    />
                  </Tooltip>
                </div>
              ),
            },
            {
              title: 'Part Number',
              dataIndex: 'partNumber',
              key: 'partNumber',
              width: 160,
              render: (part: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>{part}</span>
                  <Tooltip title="Copy Part Number">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined style={{ fontSize: '11px' }} />}
                      onClick={() => handleCopy(part, `p_${part}`, 'Part Number')}
                    />
                  </Tooltip>
                </div>
              ),
            },
            {
              title: 'Work Order No',
              dataIndex: 'workOrderNo',
              key: 'workOrderNo',
              width: 180,
              render: (wo: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: '#7c3aed' }}>{wo}</span>
                  <Tooltip title="Copy Work Order">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined style={{ fontSize: '11px', color: '#7c3aed' }} />}
                      onClick={() => handleCopy(wo, `w_${wo}`, 'Work Order Number')}
                    />
                  </Tooltip>
                </div>
              ),
            },
            {
              title: 'RFID ID',
              dataIndex: 'rfidTag',
              key: 'rfidTag',
              render: (rfid: string) => (
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0284C7' }}>{rfid}</span>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              align: 'center',
              render: (status: string) => (
                <Tag color="green" style={{ margin: 0, fontWeight: 700, borderRadius: '4px', fontSize: '11px' }}>
                  {status || 'Dispatch'}
                </Tag>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default LabelGeneration;
