import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Table, 
  Tag, 
  message, 
  Carousel,
  Image,
  Input,
  Tooltip,
  Row,
  Col,
  Divider
} from 'antd';
import { 
  SearchOutlined, 
  ThunderboltOutlined, 
  DatabaseOutlined, 
  CheckOutlined, 
  LoadingOutlined,
  FileTextOutlined,
  QrcodeOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import confetti from 'canvas-confetti';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import type { ScannedLabelData, MarriedTransaction, MasterDataItem } from '../types';
import { TransactionsApi, getProductImageByMaterial } from '../services/api';
import { formatToIST, getCurrentIST } from '../utils/dateUtils';

export const ProductValidation: React.FC = () => {
  const { masterData, devices, marriedTransactions, queueMarryTransaction } = useData();
  const { currentRole } = useAuth();
  const { isDark } = useAppTheme();

  // Active Handheld Terminal
  const cipherDevices = devices.filter(d => d.brand === 'CIPHER' || d.category === 'handheld');
  const activeDevice = cipherDevices[0] || devices[0];

  const [isQueueing, setIsQueueing] = useState(false);
  const [lastCommittedTxn, setLastCommittedTxn] = useState<MarriedTransaction | null>(null);
  const [searchText, setSearchText] = useState('');

  // Manual Scan Input Form state
  const [manualRfid, setManualRfid] = useState('');
  const [manualMatCode, setManualMatCode] = useState('');
  const [manualWoNo, setManualWoNo] = useState('');

  // Initial Production Scanned State (starts null, populated via incoming RFID/QR scan events or trigger)
  const [currentScan, setCurrentScan] = useState<ScannedLabelData | null>(null);

  // Buffer tracking for incoming external POST /post_scan requests (e.g. from curl or physical RFID/barcode scanners)
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null);

  // Background polling listener: captures external POST /post_scan calls (from curl, Python script, or external RFID readers)
  useEffect(() => {
    let isSubscribed = true;
    const checkPending = async () => {
      try {
        const getPendingFn = TransactionsApi.getPendingScan;
        let pending: any;
        if (typeof getPendingFn === 'function') {
          pending = await getPendingFn();
        } else {
          const fetchRes = await fetch('/api/transactions/pending_scan');
          pending = await fetchRes.json();
        }
        if (!isSubscribed) return;
        if (
          pending && 
          pending.scanId && 
          pending.scanId !== lastProcessedScanId && 
          pending.status === 'AWAITING_QUEUE'
        ) {
          setLastProcessedScanId(pending.scanId);
          const matchedFromCatalog = masterData.find(
            m => m.materialCode.toUpperCase() === (pending.materialCode || '').toUpperCase()
          );

          const extractFirstImage = (img: string | string[] | undefined | null): string | null => {
            if (!img) return null;
            if (Array.isArray(img)) return img[0] || null;
            if (typeof img === 'string' && img !== 'string') return img;
            return null;
          };

          const resolvedImage =
            extractFirstImage(matchedFromCatalog?.fgImage) ||
            extractFirstImage(pending.matchedFgItem?.fgImage) ||
            getProductImageByMaterial(pending.materialCode, pending.matchedFgItem?.category || matchedFromCatalog?.category);

          const matchedFg: MasterDataItem = matchedFromCatalog
            ? {
                ...matchedFromCatalog,
                fgImage: resolvedImage,
                images: matchedFromCatalog.images?.length ? matchedFromCatalog.images : [resolvedImage],
              }
            : (pending.matchedFgItem ? {
                id: pending.matchedFgItem.id || 'temp-id',
                materialCode: pending.matchedFgItem.materialCode || pending.materialCode,
                partNumber: pending.matchedFgItem.partNumber || `FG-${pending.materialCode}`,
                category: pending.matchedFgItem.category || 'Finished Goods',
                model: pending.matchedFgItem.model || '',
                productDescription: pending.matchedFgItem.productDescription || '',
                dimensions: pending.matchedFgItem.dimensions || { lengthMm: 0, widthMm: 0, heightMm: 0 },
                netWeight: pending.matchedFgItem.netWeight || 25,
                grossWeight: pending.matchedFgItem.grossWeight || 27.5,
                packageType: pending.matchedFgItem.packageType || 'Box',
                status: pending.matchedFgItem.status || 'Active',
                productName: pending.matchedFgItem.productName || `FG Item (${pending.materialCode})`,
                fgImage: resolvedImage,
                images: pending.matchedFgItem.images?.length ? pending.matchedFgItem.images : [resolvedImage],
                createdAt: '',
              } as MasterDataItem : {
                ...masterData[0],
                materialCode: pending.materialCode,
                fgImage: resolvedImage,
                images: [resolvedImage],
              });

          setCurrentScan({
            readingSuccess: true,
            rfidUniqueId: pending.rfidUniqueId,
            rfidProtocol: pending.rfidProtocol || 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
            rfidSignalRssi: pending.rfidSignalRssi || '-44 dBm (Strong)',
            qr1MaterialCode: pending.materialCode,
            qr2WorkOrderNo: pending.workOrderNo,
            matchedFgItem: matchedFg,
            scannedAt: pending.scannedAt ? formatToIST(pending.scannedAt) : getCurrentIST(),
            deviceId: pending.deviceId || activeDevice?.id || 'dev-cpr-01',
            deviceName: pending.deviceName || activeDevice?.name || 'CIPHER RS38 UHF Reader #01',
            isQueued: false,
          });
          setLastCommittedTxn(null);
          message.info({
            content: `POST /post_scan scan received from API! Factory RFID [${pending.rfidUniqueId}], Material [${pending.materialCode}], WO [${pending.workOrderNo}] displayed in Captured Analysis.`,
            duration: 4,
          });
        }
      } catch {
        // silent polling
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 1200);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [lastProcessedScanId, masterData, activeDevice]);

  // Global Hardware Scanner Listener (for physical CipherLab RS38 / Honeywell USB/Bluetooth scanners)
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      // Physical barcode scanners send rapid keystrokes (< 50ms between keys)
      if (now - lastKeyTime > 150) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (scanBuffer.length > 2) {
          processScanData(scanBuffer);
          scanBuffer = '';
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [masterData, activeDevice]);

  // Production Hardware Scan Parsing: Parses RFID Tag ID, QR1 Material Code, and QR2 Work Order No.
  const processScanData = (
    rawText: string, 
    forceMode?: 'success' | 'rfid_fail' | 'qr1_fail' | 'qr2_fail' | 'random',
    customPayload?: { rfid?: string; matCode?: string; woNo?: string }
  ) => {
    setLastCommittedTxn(null);
    const clean = rawText.trim().toUpperCase();

    // Check for RFID Fail
    if (forceMode === 'rfid_fail' || clean.includes('NO_RFID') || clean.includes('FAIL_RFID')) {
      const mat = masterData[0];
      setCurrentScan({
        readingSuccess: false,
        failureReason: 'RFID Tag Read Failed: No UHF transponder detected in RF field (Check Inlay or distance).',
        rfidUniqueId: 'NOT_DETECTED',
        rfidProtocol: 'UHF RFID Search Timeout (No Backscatter)',
        rfidSignalRssi: '0 dBm (No Signal)',
        qr1MaterialCode: mat.materialCode,
        qr2WorkOrderNo: 'WO-2026-0831-99214',
        matchedFgItem: mat,
        scannedAt: getCurrentIST(),
        deviceId: activeDevice.id,
        deviceName: activeDevice.name,
        isQueued: false,
      });
      message.error('Reading Failed: Factory RFID tag unique ID could not be detected.');
      return;
    }

    // Check for QR 1 (Material Code) Fail
    if (forceMode === 'qr1_fail' || clean.includes('NO_QR1') || clean.includes('FAIL_MAT')) {
      setCurrentScan({
        readingSuccess: false,
        failureReason: 'QR Code 1 (Material Code) Failed: Material code unreadable or not found in Material Master Data.',
        rfidUniqueId: 'E280117020002164A5B801D3',
        rfidProtocol: 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
        rfidSignalRssi: '-44 dBm (Strong)',
        qr1MaterialCode: 'INVALID-OR-UNREADABLE',
        qr2WorkOrderNo: 'WO-2026-0831-99214',
        matchedFgItem: null,
        scannedAt: getCurrentIST(),
        deviceId: activeDevice.id,
        deviceName: activeDevice.name,
        isQueued: false,
      });
      message.error('Reading Failed: QR Code 1 (Material Code) unreadable.');
      return;
    }

    // Check for QR 2 (Work Order No.) Fail
    if (forceMode === 'qr2_fail' || clean.includes('NO_QR2') || clean.includes('FAIL_WO')) {
      const mat = masterData[0];
      setCurrentScan({
        readingSuccess: false,
        failureReason: 'QR Code 2 (Work Order No.) Failed: WO barcode is missing or scratched.',
        rfidUniqueId: 'E280117020002164A5B801D3',
        rfidProtocol: 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
        rfidSignalRssi: '-46 dBm (Strong)',
        qr1MaterialCode: mat.materialCode,
        qr2WorkOrderNo: 'MISSING_WO_CODE',
        matchedFgItem: mat,
        scannedAt: getCurrentIST(),
        deviceId: activeDevice.id,
        deviceName: activeDevice.name,
        isQueued: false,
      });
      message.error('Reading Failed: QR Code 2 (Work Order No.) missing.');
      return;
    }

    // Normal Lookup: Find Material in Master Data Catalog
    let targetCode = customPayload?.matCode;
    if (!targetCode) {
      const found = masterData.find(m => 
        clean.includes(m.materialCode.toUpperCase()) || 
        clean.includes(m.partNumber.toUpperCase())
      );
      targetCode = found ? found.materialCode : masterData[0].materialCode;
    }

    const matchedFg = masterData.find(m => m.materialCode.toUpperCase() === targetCode!.toUpperCase()) || masterData[0];
    const rfidHex = customPayload?.rfid || `E280117020002164A5B801${Math.floor(10 + Math.random() * 89).toString(16).toUpperCase()}`;
    const woNo = customPayload?.woNo || `WO-2026-${new Date().toISOString().substring(5, 10).replace('-', '')}-${Math.floor(10000 + Math.random() * 90000)}`;

    setCurrentScan({
      readingSuccess: true,
      rfidUniqueId: rfidHex,
      rfidProtocol: 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
      rfidSignalRssi: `${Math.floor(-42 - Math.random() * 10)} dBm (Strong)`,
      qr1MaterialCode: matchedFg.materialCode,
      qr2WorkOrderNo: woNo,
      matchedFgItem: matchedFg,
      scannedAt: getCurrentIST(),
      deviceId: activeDevice.id,
      deviceName: activeDevice.name,
      isQueued: false,
    });

    confetti({
      particleCount: 35,
      spread: 55,
      origin: { y: 0.6 },
    });

    message.success(`Read Success: RFID Tag ID, Material Code (${matchedFg.materialCode}) & WO (${woNo}) Captured!`);
  };

  // Cancel Action: Clear/Cancel current scan without saving to DB
  const handleCancelScan = async () => {
    setCurrentScan(null);
    setLastCommittedTxn(null);
    try {
      const cancelFn = TransactionsApi.cancelScan || (TransactionsApi as any).cancelCan;
      if (typeof cancelFn === 'function') {
        await cancelFn();
      } else {
        await fetch('/api/transactions/cancel_scan', { method: 'POST' });
      }
    } catch (err) {
      console.warn('Failed to clear pending scan on backend:', err);
    }
    message.info('Scan session cancelled — Not sent to FG WIP Transaction Records or transactions_data table.');
  };

  // Helper to evaluate Read Success / Read Failed (Material code, Work Order, RFID ID)
  const getReadStatus = () => {
    if (!currentScan) return null;
    const failedFields: string[] = [];
    if (!currentScan.rfidUniqueId || currentScan.rfidUniqueId === 'NOT_DETECTED' || currentScan.rfidUniqueId.includes('FAIL') || currentScan.rfidUniqueId.includes('INVALID')) {
      failedFields.push('RFID ID');
    }
    if (!currentScan.matchedFgItem || currentScan.qr1MaterialCode === 'INVALID-OR-UNREADABLE' || currentScan.qr1MaterialCode.includes('FAIL') || currentScan.qr1MaterialCode.includes('INVALID')) {
      failedFields.push('Material Code');
    }
    if (!currentScan.qr2WorkOrderNo || currentScan.qr2WorkOrderNo === 'MISSING_WO_CODE' || currentScan.qr2WorkOrderNo.includes('FAIL') || currentScan.qr2WorkOrderNo.includes('INVALID')) {
      failedFields.push('Work Order');
    }

    if (failedFields.length === 0 && currentScan.readingSuccess) {
      return {
        isSuccess: true,
        title: 'Read Success',
        description: 'All Auto-ID data points verified. Ready to couple with Transaction ID and commit to SQLite DB.',
      };
    } else {
      return {
        isSuccess: false,
        title: `Read Failed (${failedFields.length > 0 ? failedFields.join(', ') : 'Incomplete Read'})`,
        description: currentScan.failureReason || 'One or more required Auto-ID data points failed parity validation.',
      };
    }
  };

  // Queue Action: Marry RFID Tag ID + Material Code/Part Number + WO No. in SQLite DB
  const handleQueueTransaction = async () => {
    if (!currentScan || !currentScan.readingSuccess || !currentScan.matchedFgItem) {
      message.error('Cannot queue: Label reading is incomplete or failed.');
      return;
    }

    if (currentScan.isQueued) {
      message.info('This transaction has already been queued and saved.');
      return;
    }

    setIsQueueing(true);
    try {
      const txn = await queueMarryTransaction(currentScan, currentRole.name);
      setIsQueueing(false);
      setLastCommittedTxn(txn);
      setCurrentScan(prev => prev ? { ...prev, isQueued: true } : null);

      try {
        const cancelFn = TransactionsApi.cancelScan || (TransactionsApi as any).cancelCan;
        if (typeof cancelFn === 'function') {
          await cancelFn();
        } else {
          await fetch('/api/transactions/cancel_scan', { method: 'POST' });
        }
      } catch {
        // quiet
      }

      confetti({
        particleCount: 65,
        spread: 85,
        origin: { y: 0.5 },
      });

      message.success({
        content: `Transaction Queued! RFID [${txn.rfidUniqueId}] ⮀ Material [${txn.materialCode}] ⮀ WO [${txn.workOrderNo}] Married & Saved in SQLite DB (Record #${txn.sqliteRecordId}).`,
        duration: 4,
      });
    } catch {
      setIsQueueing(false);
      message.error('Failed to communicate with Python SQLite service.');
    }
  };

  // Maintain only the last 10 transactions for live Shop Floor scan validation
  const last10Transactions = marriedTransactions.slice(0, 10);

  const filteredMarried = last10Transactions.filter(t =>
    t.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
    t.rfidUniqueId.toLowerCase().includes(searchText.toLowerCase()) ||
    t.workOrderNo.toLowerCase().includes(searchText.toLowerCase()) ||
    t.materialCode.toLowerCase().includes(searchText.toLowerCase()) ||
    t.partNumber.toLowerCase().includes(searchText.toLowerCase()) ||
    t.deviceName.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Captured Data (RFID Unique ID + Material Code FG Display with Image Carousel + Work Order No) + Status + Queue */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800 }}>
              Captured Finished Good Label Analysis
            </span>
            {currentScan && (
              <Tag 
                color={getReadStatus()?.isSuccess ? 'success' : 'error'}
                style={{ fontSize: '12px', fontWeight: 800, padding: '2px 14px', borderRadius: '12px' }}
              >
                {getReadStatus()?.title}
              </Tag>
            )}
          </div>
        }
        bordered={false}
        style={{ 
          backgroundColor: isDark ? '#1e293b' : '#ffffff', 
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)' 
        }}
      >
        {currentScan ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Factory Generated RFID Tag Unique ID */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThunderboltOutlined style={{ color: '#E53935', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    1. Factory Generated RFID Tag Unique ID
                  </strong>
                </div>
                <Tag color={currentScan.readingSuccess ? 'green' : 'red'}>
                  {currentScan.rfidSignalRssi}
                </Tag>
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: currentScan.readingSuccess ? '#0284C7' : '#EF4444',
                  letterSpacing: '1.5px',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: `1px dashed ${currentScan.readingSuccess ? '#0284C7' : '#EF4444'}`,
                  wordBreak: 'break-all',
                }}
              >
                {currentScan.rfidUniqueId}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Protocol: {currentScan.rfidProtocol}
              </div>
            </div>

            {/* 2. QR Code 1: Material Code ➔ Displays Configured FG Master Data WITH PRODUCT IMAGE CAROUSEL */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <QrcodeOutlined style={{ color: '#0284C7', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    2. QR Code 1 (Material Code) ➔ Configured FG Master Data
                  </strong>
                </div>
                <Tag color="#0284C7" style={{ fontWeight: 700 }}>
                  MATERIAL: {currentScan.qr1MaterialCode}
                </Tag>
              </div>

              {currentScan.matchedFgItem ? (
                <div
                  style={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    padding: '16px',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  }}
                >
                  <Row gutter={[20, 16]} align="middle">
                    {/* Animated Moving Image Carousel (100% Fully Fitted) */}
                    <Col xs={24} sm={10} md={9} lg={8}>
                      <div
                        style={{
                          borderRadius: '10px',
                          overflow: 'hidden',
                          backgroundColor: '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                          position: 'relative',
                        }}
                      >
                        <Carousel
                          autoplay
                          autoplaySpeed={2800}
                          dots={{ className: 'custom-carousel-dots' }}
                          effect="scrollx"
                        >
                          {(() => {
                            let imgs: string[] = [];
                            if (Array.isArray(currentScan.matchedFgItem.images) && currentScan.matchedFgItem.images.length > 0) {
                              imgs = currentScan.matchedFgItem.images;
                            } else if (Array.isArray(currentScan.matchedFgItem.fgImage) && currentScan.matchedFgItem.fgImage.length > 0) {
                              imgs = currentScan.matchedFgItem.fgImage;
                            } else if (typeof currentScan.matchedFgItem.fgImage === 'string' && currentScan.matchedFgItem.fgImage) {
                              imgs = [currentScan.matchedFgItem.fgImage];
                            } else {
                              imgs = ['/images/no_image.svg'];
                            }
                            return imgs.map((imgSrc, idx) => (
                            <div key={idx} style={{ outline: 'none' }}>
                              <div
                                style={{
                                  position: 'relative',
                                  width: '100%',
                                  height: '210px',
                                  backgroundColor: '#0f172a',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <img
                                  src={imgSrc}
                                  alt={`${currentScan.matchedFgItem?.productName} - View ${idx + 1}`}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                    transition: 'transform 0.4s ease',
                                  }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                        </Carousel>
                      </div>
                    </Col>

                    {/* Product Master Data Specification Breakdown */}
                    <Col xs={24} sm={14} md={15} lg={16}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                          {currentScan.matchedFgItem.productDescription || currentScan.matchedFgItem.productName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          Configured FG Part Number: <strong style={{ color: '#E53935' }}>{currentScan.matchedFgItem.partNumber}</strong> • Model: <strong>{currentScan.matchedFgItem.model || 'Standard'}</strong> • Category: <Tag color="blue">{currentScan.matchedFgItem.category}</Tag>
                        </div>

                        <Divider style={{ margin: '12px 0 10px 0' }} />

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                            gap: '6px 10px',
                            fontSize: '11px',
                          }}
                        >
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Dimensions (LxWxH):</span>
                            <strong>{currentScan.matchedFgItem.dimensions.lengthMm} x {currentScan.matchedFgItem.dimensions.widthMm} x {currentScan.matchedFgItem.dimensions.heightMm} mm</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Net Weight:</span>
                            <strong>{(currentScan.matchedFgItem.netWeight ?? currentScan.matchedFgItem.weightKg ?? 25).toFixed(2)} kg ({currentScan.matchedFgItem.packageType || 'Box'})</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Variant & Build:</span>
                            <strong>{currentScan.matchedFgItem.colorVariant}</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Comfort Spec:</span>
                            <strong>{currentScan.matchedFgItem.firmnessRating}</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Warranty:</span>
                            <strong>{currentScan.matchedFgItem.warrantyYears} Years Factory Warranty</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>RFID Scheme:</span>
                            <strong>{currentScan.matchedFgItem.rfidInlayType}</strong>
                          </div>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              ) : (
                <div style={{ color: '#EF4444', fontStyle: 'italic', fontSize: '12px' }}>
                  Material Code "{currentScan.qr1MaterialCode}" could not be matched with any active Finished Good in Material Master Data.
                </div>
              )}
            </div>

            {/* 3. QR Code 2: Work Order Number (WO) */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileTextOutlined style={{ color: '#8B5CF6', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    3. QR Code 2 (Work Order Number - WO)
                  </strong>
                </div>
                <Tag color="purple">MES WORK ORDER</Tag>
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  fontWeight: 800,
                  color: currentScan.qr2WorkOrderNo && currentScan.qr2WorkOrderNo !== 'MISSING_WO_CODE' ? '#8B5CF6' : '#EF4444',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                }}
              >
                {currentScan.qr2WorkOrderNo}
              </div>
            </div>

            {/* ACTION BAR: Status Message + Cancel & Queue Buttons */}
            {(() => {
              const status = getReadStatus();
              if (!status) return null;

              return (
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '8px',
                    backgroundColor: status.isSuccess 
                      ? (isDark ? '#064e3b25' : '#ecfdf5')
                      : (isDark ? '#450a0a25' : '#fef2f2'),
                    border: `1px solid ${status.isSuccess ? '#10B98160' : '#EF444460'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: status.isSuccess ? '#059669' : '#DC2626' }}>
                      {status.title}
                    </div>
                    <div style={{ fontSize: '12px', color: isDark ? '#cbd5e1' : '#64748b', marginTop: '2px' }}>
                      {status.description}
                    </div>
                  </div>

                  <Space size="middle">
                    <Button
                      size="large"
                      icon={<CloseCircleOutlined />}
                      onClick={handleCancelScan}
                      style={{
                        height: '42px',
                        padding: '0 20px',
                        fontWeight: 600,
                        borderRadius: '8px',
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="primary"
                      size="large"
                      icon={isQueueing ? <LoadingOutlined /> : <CheckOutlined />}
                      loading={isQueueing}
                      disabled={!status.isSuccess || currentScan.isQueued}
                      style={{
                        backgroundColor: currentScan.isQueued ? '#10B981' : '#E53935',
                        borderColor: currentScan.isQueued ? '#10B981' : '#E53935',
                        height: '42px',
                        padding: '0 26px',
                        fontSize: '14px',
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        boxShadow: status.isSuccess && !currentScan.isQueued ? '0 4px 14px rgba(229, 57, 53, 0.4)' : undefined,
                        borderRadius: '8px',
                      }}
                      onClick={handleQueueTransaction}
                    >
                      {currentScan.isQueued ? '✓ Queued & Saved' : 'Queue'}
                    </Button>
                  </Space>
                </div>
              );
            })()}

            {/* Commit Confirmation Feedback */}
            {lastCommittedTxn && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#10B98115',
                  borderRadius: '6px',
                  border: '1px solid #10B981',
                  fontSize: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  ✓ SQLite Committed: <strong>{lastCommittedTxn.transactionId}</strong> (WO: {lastCommittedTxn.workOrderNo} ⮀ {lastCommittedTxn.materialCode})
                </span>
                <Tag color="success">STORED IN SQLITE</Tag>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '32px 24px',
              textAlign: 'center',
              backgroundColor: isDark ? '#0f172a' : '#f8fafc',
              borderRadius: '8px',
              border: `1px dashed ${isDark ? '#334155' : '#cbd5e1'}`,
            }}
          >
            <ThunderboltOutlined style={{ fontSize: '36px', color: '#94a3b8', marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
              Awaiting Next Scan Event
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: '420px', margin: '4px auto 20px auto' }}>
              Trigger your CIPHER RS38 handheld or stationary RFID reader, or use the simulation triggers above to scan a product.
            </div>

            {/* ── Manual Entry Form ── */}
            <div
              style={{
                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: '10px',
                padding: '20px 24px',
                maxWidth: '480px',
                margin: '0 auto 16px auto',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#94a3b8' : '#475569', marginBottom: '14px', letterSpacing: '0.5px' }}>
                MANUAL SCAN ENTRY
              </div>

              {/* RFID */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Factory Generated RFID Tag Unique ID
                </div>
                <Input
                  placeholder="e.g. E280117020002164A5B8012F"
                  value={manualRfid}
                  onChange={e => setManualRfid(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                  allowClear
                />
              </div>

              {/* Material Code */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Material Code
                </div>
                <Input
                  placeholder="e.g. WAK-MAT-787208"
                  value={manualMatCode}
                  onChange={e => setManualMatCode(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                  allowClear
                />
              </div>

              {/* Work Order No */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Work Order Number
                </div>
                <Input
                  placeholder="e.g. WO-2026-0912-10021"
                  value={manualWoNo}
                  onChange={e => setManualWoNo(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                  allowClear
                />
              </div>

              <Button
                type="primary"
                block
                disabled={!manualRfid.trim() || !manualMatCode.trim() || !manualWoNo.trim()}
                style={{ backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 700 }}
                onClick={() => {
                  processScanData(manualMatCode.trim(), 'success', {
                    rfid: manualRfid.trim(),
                    matCode: manualMatCode.trim(),
                    woNo: manualWoNo.trim(),
                  });
                  setManualRfid('');
                  setManualMatCode('');
                  setManualWoNo('');
                }}
              >
                Submit & Process Scan
              </Button>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#E53935', borderColor: '#E53935' }}
              onClick={() => processScanData('WAK-MAT-787208', 'success')}
            >
              Simulate Normal Scan
            </Button>
          </div>
        )}
      </Card>

      {/* Married Transactions SQLite Database Queue Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DatabaseOutlined style={{ color: '#10B981', fontSize: '18px' }} />
              <span style={{ fontSize: '16px', fontWeight: 700 }}>
                FG WIP Transaction Records
              </span>
              <Tag color="blue">{filteredMarried.length} Recent Records (Last 10)</Tag>
            </div>

            <Input
              placeholder="Search Transaction ID / RFID Tag / Material Code / Work Order No..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              style={{ width: '450px', minWidth: '300px' }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </div>
        }
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        <Table
          dataSource={filteredMarried}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: 'FG Image',
              key: 'img',
              width: 70,
              align: 'center',
              render: (_, r) => {
                const catalogItem = masterData.find(
                  m => m.materialCode.toUpperCase() === (r.materialCode || '').toUpperCase()
                );
                const catalogImg = Array.isArray(catalogItem?.fgImage)
                  ? catalogItem.fgImage[0]
                  : (typeof catalogItem?.fgImage === 'string' && catalogItem.fgImage !== 'string' ? catalogItem.fgImage : null);
                const imgSrc =
                  r.productImage ||
                  catalogImg ||
                  getProductImageByMaterial(r.materialCode, r.category);

                return (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Image
                      src={imgSrc}
                      alt={r.productName}
                      width={48}
                      height={36}
                      style={{ objectFit: 'cover', borderRadius: '4px', border: '1px solid #e2e8f0' }}
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
              render: (id: string) => <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{id}</strong>,
              width: 160,
            },
            {
              title: 'Timestamp (IST)',
              dataIndex: 'timestamp',
              key: 'timestamp',
              render: (t: string, r: any) => (
                <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                  {formatToIST(t || r.timestamp || r.createdOn || r.productValidationTimestamp)}
                </span>
              ),
              width: 170,
            },
            {
              title: 'Factory RFID Tag ID',
              dataIndex: 'rfidUniqueId',
              key: 'rfid',
              render: (rfid: string) => (
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#0284C7', fontWeight: 700 }}>
                  {rfid}
                </span>
              ),
              width: 220,
            },
            {
              title: 'Work Order No. (WO)',
              dataIndex: 'workOrderNo',
              key: 'wo',
              render: (wo: string) => <Tag color="purple" style={{ fontFamily: 'monospace' }}>{wo}</Tag>,
              width: 170,
            },
            {
              title: 'Material Code',
              dataIndex: 'materialCode',
              key: 'mat',
              render: (mat: string) => <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{mat}</strong>,
              width: 160,
            },
            {
              title: 'Scanner Device',
              dataIndex: 'deviceName',
              key: 'device',
              render: (d: string) => <span style={{ fontSize: '12px' }}>{d}</span>,
            },
            {
              title: 'State',
              dataIndex: 'status',
              key: 'status',
              width: 130,
              align: 'center',
              render: (status: 'WIP' | 'Dispatched') => {
                const isDispatched = status === 'Dispatched';
                return (
                  <Tooltip 
                    title={
                      isDispatched 
                        ? 'System State: Verified via Outbound Logistics RFID Dock Portal' 
                        : 'System State: Work In Progress (Packaged & Married at Line)'
                    }
                  >
                    {isDispatched ? (
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
                        Dispatched
                      </Tag>
                    ) : (
                      <Tag
                        color="warning"
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
                        <ClockCircleOutlined />
                        WIP
                      </Tag>
                    )}
                  </Tooltip>
                );
              },
            },
          ]}
        />
      </Card>
    </div>
  );
};
