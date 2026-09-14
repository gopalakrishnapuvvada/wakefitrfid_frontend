import React, { useState, useEffect, useRef } from 'react';
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
  Modal
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
  CheckCircleOutlined,
  BarcodeOutlined,
  ExclamationCircleOutlined
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


  // Initial Production Scanned State (starts null, populated via incoming RFID/QR scan events or trigger)
  const [currentScan, setCurrentScan] = useState<ScannedLabelData | null>(null);

  // Buffer tracking for incoming external POST /post_scan requests (e.g. from curl or physical RFID/barcode scanners)
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null);

  // References to eliminate React closure stale state issues during async polling & confirmations
  const currentScanRef = useRef<ScannedLabelData | null>(null);
  const lastProcessedScanIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentScanRef.current = currentScan;
  }, [currentScan]);

  useEffect(() => {
    lastProcessedScanIdRef.current = lastProcessedScanId;
  }, [lastProcessedScanId]);

  // Helper: Resolve full MasterDataItem and product images for a Material Code (Foreign Key constraint)
  const resolveFgItem = (matVal: string, fallbackItem?: any): MasterDataItem | null => {
    if (!matVal) return null;
    const cleanMat = matVal.trim().toUpperCase();
    const matchedFromCatalog = masterData.find(
      m => m.materialCode.toUpperCase() === cleanMat || m.partNumber?.toUpperCase() === cleanMat
    );

    const extractFirstImage = (img: string | string[] | undefined | null): string | null => {
      if (!img) return null;
      if (Array.isArray(img)) return img[0] || null;
      if (typeof img === 'string' && img !== 'string') return img;
      return null;
    };

    if (matchedFromCatalog) {
      const resolvedImage: string =
        extractFirstImage(matchedFromCatalog.fgImage) ||
        getProductImageByMaterial(matVal, matchedFromCatalog.category) ||
        '/images/no_image.svg';

      return {
        ...matchedFromCatalog,
        fgImage: resolvedImage,
        images: matchedFromCatalog.images?.length ? matchedFromCatalog.images : [resolvedImage],
      };
    }

    // Only accept fallback if it is a real database record from API (not a synthetic temp item)
    if (fallbackItem && fallbackItem.id && !String(fallbackItem.id).startsWith('temp-')) {
      const resolvedImage: string =
        extractFirstImage(fallbackItem.fgImage) ||
        getProductImageByMaterial(matVal, fallbackItem.category) ||
        '/images/no_image.svg';

      return {
        ...fallbackItem,
        fgImage: resolvedImage,
        images: fallbackItem.images?.length ? fallbackItem.images : [resolvedImage],
      } as MasterDataItem;
    }

    // Strict Foreign Key Enforcement: Return null if not present in Master Data Management
    return null;
  };

  // State update commit: creates new state and updates currentScan + currentScanRef
  const applyScanUpdate = (
    newRfid: string,
    newMat: string,
    newWo: string,
    meta?: {
      deviceId?: string;
      deviceName?: string;
      rfidProtocol?: string;
      rfidSignalRssi?: string;
      matchedFgItem?: any;
    }
  ) => {
    const cur = currentScanRef.current;
    const isComplete = Boolean(newRfid && newMat && newWo);
    const matchedFg = newMat ? resolveFgItem(newMat, meta?.matchedFgItem || cur?.matchedFgItem) : null;

    const nextState: ScannedLabelData = {
      readingSuccess: isComplete,
      rfidUniqueId: newRfid,
      rfidProtocol: cur?.rfidProtocol || meta?.rfidProtocol || 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
      rfidSignalRssi: newRfid ? (cur?.rfidSignalRssi || meta?.rfidSignalRssi || '-44 dBm (Strong)') : 'Awaiting RF Signal',
      qr1MaterialCode: newMat,
      qr2WorkOrderNo: newWo,
      matchedFgItem: matchedFg,
      scannedAt: getCurrentIST(),
      deviceId: meta?.deviceId || cur?.deviceId || activeDevice?.id || 'dev-cpr-01',
      deviceName: meta?.deviceName || cur?.deviceName || activeDevice?.name || 'CIPHER RS38 UHF Reader #01',
      isQueued: false,
    };

    setCurrentScan(nextState);
    currentScanRef.current = nextState;
    setLastCommittedTxn(null);

    const capturedCount = [newRfid, newMat, newWo].filter(Boolean).length;
    if (isComplete) {
      confetti({
        particleCount: 45,
        spread: 65,
        origin: { y: 0.5 },
      });
      message.success({
        content: `All 3 data points captured! Ready to Queue.`,
        duration: 3,
      });
    } else {
      message.info({
        content: `Handheld scan accepted (${capturedCount}/3 captured). Please scan remaining items.`,
        duration: 2.5,
      });
    }
  };

  // Central Scanner State Machine:
  // - Same value scanned -> Ignore (discard duplicate, warn operator)
  // - Different value scanned when slot already has value -> Show warning confirmation modal (Replace vs Keep)
  // - Empty slot -> Accept immediately
  const handleIncomingScan = (incoming: {
    rawRfid?: string | null;
    rawMat?: string | null;
    rawWo?: string | null;
    deviceId?: string;
    deviceName?: string;
    matchedFgItem?: any;
    rfidProtocol?: string;
    rfidSignalRssi?: string;
    materialInMaster?: boolean;
    alreadyCommitted?: boolean;
    existingTransaction?: any;
  }) => {
    const incRfid = (incoming.rawRfid || '').trim();
    const incMat = (incoming.rawMat || '').trim();
    const incWo = (incoming.rawWo || '').trim();

    // If completely empty payload, skip
    if (!incRfid && !incMat && !incWo) return;

    let cur = currentScanRef.current;
    // If previous transaction was queued, start a fresh session
    if (cur && cur.isQueued) {
      cur = null;
      currentScanRef.current = null;
      setCurrentScan(null);
    }

    // Merge incoming scan with active session to determine the full candidate triplet
    const candRfid = (incRfid || cur?.rfidUniqueId || '').trim();
    const candMat = (incMat || cur?.qr1MaterialCode || '').trim();
    const candWo = (incWo || cur?.qr2WorkOrderNo || '').trim();

    // The composite triplet (RFID Tag + Material Code + Work Order No) is unique.
    // Check if the complete combination already exists in SQLite / committed transactions.
    const isFullTriplet = Boolean(candRfid && candMat && candWo);
    const alreadyMarried = isFullTriplet
      ? incoming.alreadyCommitted && incoming.existingTransaction
        ? incoming.existingTransaction
        : marriedTransactions.find(
            t =>
              t.rfidUniqueId?.toUpperCase() === candRfid.toUpperCase() &&
              t.materialCode?.toUpperCase() === candMat.toUpperCase() &&
              t.workOrderNo?.toUpperCase() === candWo.toUpperCase()
          )
      : null;

    if (alreadyMarried) {
      Modal.warning({
        title: (
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>
            ⚠️ Combination Already Scanned & Submitted
          </span>
        ),
        icon: <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: '24px' }} />,
        centered: true,
        width: 540,
        okText: 'Understood, Scan Next Product',
        okButtonProps: { type: 'primary', danger: true, style: { fontWeight: 700 } },
        content: (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', marginBottom: '12px' }}>
              The combination of <strong>RFID Tag + Material Code + Work Order No</strong> has <strong>already been scanned and committed</strong> to the SQLite database! The same combination cannot be repeated.
            </p>
            <div
              style={{
                backgroundColor: isDark ? '#1e293b' : '#fef2f2',
                border: `1px solid ${isDark ? '#991b1b' : '#fecaca'}`,
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ marginBottom: '4px' }}>
                <strong>Committed Transaction:</strong>{' '}
                <span style={{ color: '#dc2626', fontFamily: 'monospace', fontWeight: 800 }}>
                  {alreadyMarried.transactionId}
                </span>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Factory RFID Tag ID:</strong>{' '}
                <span style={{ fontFamily: 'monospace', color: '#0284C7', fontWeight: 700 }}>
                  {alreadyMarried.rfidUniqueId || candRfid}
                </span>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Material Code:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {alreadyMarried.materialCode || candMat}
                </span>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>Work Order No:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {alreadyMarried.workOrderNo || candWo}
                </span>
              </div>
              <div>
                <Tag color="error">DUPLICATE COMBINATION REJECTED</Tag>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
              Duplicate combination is not allowed. Please scan a new, uncommitted product.
            </div>
          </div>
        ),
      });
      return;
    }

    // Check Foreign Key Constraint: Material Code MUST exist in Master Data Management
    if (incMat) {
      const cleanMat = incMat.toUpperCase();
      const isMatInCatalog = masterData.some(
        m => m.materialCode.toUpperCase() === cleanMat || m.partNumber?.toUpperCase() === cleanMat
      ) || (incoming.matchedFgItem && !String(incoming.matchedFgItem.id).startsWith('temp-'));

      if (!isMatInCatalog || incoming.materialInMaster === false) {
        Modal.error({
          title: (
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>
              ⚠️ Material Code Not in Master Data Management
            </span>
          ),
          icon: <CloseCircleOutlined style={{ color: '#dc2626', fontSize: '24px' }} />,
          centered: true,
          width: 520,
          okText: 'Acknowledge',
          okButtonProps: { type: 'primary', danger: true, style: { fontWeight: 700 } },
          content: (
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', marginBottom: '12px' }}>
                The scanned Material Code <strong>does not exist in Master Data Management</strong>.
              </p>
              <div
                style={{
                  backgroundColor: isDark ? '#1e293b' : '#fef2f2',
                  border: `1px solid ${isDark ? '#991b1b' : '#fecaca'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <strong>Scanned Material Code:</strong>{' '}
                  <span style={{ color: '#dc2626', fontFamily: 'monospace', fontWeight: 800 }}>
                    {incMat}
                  </span>
                </div>
                <div style={{ marginTop: '6px' }}>
                  <Tag color="error">FOREIGN KEY VIOLATION — NOT IN MASTER DATA</Tag>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                This record cannot be inserted into the database. Please register this Material Code in Master Data Management first.
              </div>
            </div>
          ),
        });
      }
    }

    const curRfid = (cur?.rfidUniqueId || '').trim();
    const curMat = (cur?.qr1MaterialCode || '').trim();
    const curWo = (cur?.qr2WorkOrderNo || '').trim();

    // Check 1: RFID Tag
    let targetRfid = curRfid;
    let rfidNeedsConfirm = false;
    if (incRfid) {
      if (!curRfid || curRfid === 'NOT_DETECTED' || curRfid.includes('FAIL') || curRfid.includes('INVALID')) {
        targetRfid = incRfid;
      } else if (curRfid.toUpperCase() === incRfid.toUpperCase()) {
        // Same RFID -> Ignore!
        message.warning({
          content: `Duplicate RFID Tag scanned [${incRfid}] — Ignored.`,
          duration: 3,
        });
      } else {
        // Different RFID -> Prompt user confirmation
        rfidNeedsConfirm = true;
      }
    }

    // Check 2: Material Code
    let targetMat = curMat;
    let matNeedsConfirm = false;
    if (incMat) {
      if (!curMat || curMat === 'INVALID-OR-UNREADABLE' || curMat.includes('FAIL') || curMat.includes('INVALID')) {
        targetMat = incMat;
      } else if (curMat.toUpperCase() === incMat.toUpperCase()) {
        // Same Material Code -> Ignore!
        message.warning({
          content: `Duplicate Material Code scanned [${incMat}] — Ignored.`,
          duration: 3,
        });
      } else {
        // Different Material Code -> Prompt user confirmation
        matNeedsConfirm = true;
      }
    }

    // Check 3: Work Order Number
    let targetWo = curWo;
    let woNeedsConfirm = false;
    if (incWo) {
      if (!curWo || curWo === 'MISSING_WO_CODE' || curWo.includes('FAIL') || curWo.includes('INVALID')) {
        targetWo = incWo;
      } else if (curWo.toUpperCase() === incWo.toUpperCase()) {
        // Same Work Order Number -> Ignore!
        message.warning({
          content: `Duplicate Work Order scanned [${incWo}] — Ignored.`,
          duration: 3,
        });
      } else {
        // Different Work Order Number -> Prompt user confirmation
        woNeedsConfirm = true;
      }
    }

    // If any field needs user confirmation before replacing:
    if (rfidNeedsConfirm || matNeedsConfirm || woNeedsConfirm) {
      const diffs: { field: string; current: string; incoming: string }[] = [];
      if (rfidNeedsConfirm) {
        diffs.push({ field: 'Factory RFID Tag ID', current: curRfid, incoming: incRfid });
      }
      if (matNeedsConfirm) {
        diffs.push({ field: 'Material Code', current: curMat, incoming: incMat });
      }
      if (woNeedsConfirm) {
        diffs.push({ field: 'Work Order Number', current: curWo, incoming: incWo });
      }

      const fieldTitles = diffs.map(d => d.field).join(', ');

      Modal.confirm({
        title: (
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#d97706' }}>
            ⚠️ Warning: Different {fieldTitles} Scanned
          </span>
        ),
        icon: <ExclamationCircleOutlined style={{ color: '#d97706', fontSize: '24px' }} />,
        centered: true,
        width: 520,
        okText: `Yes, Replace with Incoming Data`,
        okType: 'primary',
        okButtonProps: { danger: true, style: { fontWeight: 700 } },
        cancelText: `No, Keep Current Data`,
        cancelButtonProps: { style: { fontWeight: 600 } },
        content: (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
              The handheld scanner sent new data differing from what is currently captured on screen:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {diffs.map((d, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: isDark ? '#94a3b8' : '#334155', marginBottom: '4px' }}>
                    {d.field}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ color: '#64748b' }}>
                      Current: <strong style={{ color: '#0284C7', fontFamily: 'monospace' }}>{d.current}</strong>
                    </div>
                    <div style={{ fontWeight: 800, color: '#94a3b8' }}>➔</div>
                    <div style={{ color: '#64748b' }}>
                      Incoming: <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{d.incoming}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
              Do you want to REPLACE the active data with this new scan, or KEEP the existing data?
            </div>
          </div>
        ),
        onOk() {
          const finalRfid = rfidNeedsConfirm ? incRfid : targetRfid;
          const finalMat = matNeedsConfirm ? incMat : targetMat;
          const finalWo = woNeedsConfirm ? incWo : targetWo;

          applyScanUpdate(finalRfid, finalMat, finalWo, {
            deviceId: incoming.deviceId,
            deviceName: incoming.deviceName,
            rfidProtocol: incoming.rfidProtocol,
            rfidSignalRssi: incoming.rfidSignalRssi,
            matchedFgItem: incoming.matchedFgItem,
          });
          message.success(`Replaced ${fieldTitles} with incoming scan.`);
        },
        onCancel() {
          // If any non-conflicting field was scanned, update that, but keep conflicting one
          if (targetRfid !== curRfid || targetMat !== curMat || targetWo !== curWo) {
            applyScanUpdate(targetRfid, targetMat, targetWo, {
              deviceId: incoming.deviceId,
              deviceName: incoming.deviceName,
              rfidProtocol: incoming.rfidProtocol,
              rfidSignalRssi: incoming.rfidSignalRssi,
              matchedFgItem: incoming.matchedFgItem,
            });
          }
          message.info(`Kept existing ${fieldTitles}.`);
        },
      });
      return;
    }

    // If no confirmation needed, apply any non-duplicate updates
    if (targetRfid !== curRfid || targetMat !== curMat || targetWo !== curWo) {
      applyScanUpdate(targetRfid, targetMat, targetWo, {
        deviceId: incoming.deviceId,
        deviceName: incoming.deviceName,
        rfidProtocol: incoming.rfidProtocol,
        rfidSignalRssi: incoming.rfidSignalRssi,
        matchedFgItem: incoming.matchedFgItem,
      });
    }
  };

  // Background polling listener: captures external POST /post_scan calls (from RS38, curl, or external RFID readers)
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
          pending.scanId !== lastProcessedScanIdRef.current && 
          pending.status === 'AWAITING_QUEUE'
        ) {
          lastProcessedScanIdRef.current = pending.scanId;
          setLastProcessedScanId(pending.scanId);

          const rawRfid = pending.rawRfid !== undefined ? pending.rawRfid : pending.rfidUniqueId;
          const rawMat = pending.rawMaterialCode !== undefined ? pending.rawMaterialCode : pending.materialCode;
          const rawWo = pending.rawWorkOrderNo !== undefined ? pending.rawWorkOrderNo : pending.workOrderNo;

          handleIncomingScan({
            rawRfid,
            rawMat,
            rawWo,
            deviceId: pending.deviceId,
            deviceName: pending.deviceName,
            matchedFgItem: pending.matchedFgItem,
            rfidProtocol: pending.rfidProtocol,
            rfidSignalRssi: pending.rfidSignalRssi,
            materialInMaster: pending.materialInMaster,
            alreadyCommitted: pending.alreadyCommitted,
            existingTransaction: pending.existingTransaction,
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
  }, [masterData, activeDevice]);

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

    // Normal Hardware Scan: Identify data type (Material, WO, or RFID) and route through handleIncomingScan
    if (!forceMode) {
      if (customPayload?.rfid || customPayload?.matCode || customPayload?.woNo) {
        handleIncomingScan({
          rawRfid: customPayload.rfid,
          rawMat: customPayload.matCode,
          rawWo: customPayload.woNo,
          deviceId: activeDevice.id,
          deviceName: activeDevice.name,
        });
        return;
      }

      const isMat = masterData.some(
        m => m.materialCode.toUpperCase() === clean || m.partNumber.toUpperCase() === clean
      );
      const isWo = clean.startsWith('WO') || /^\d{7,14}$/.test(clean);
      const isRfid = clean.startsWith('E280') || (/^[0-9A-F]{16,32}$/i.test(clean));

      if (isMat) {
        handleIncomingScan({ rawMat: clean, deviceId: activeDevice.id, deviceName: activeDevice.name });
        return;
      }
      if (isWo) {
        handleIncomingScan({ rawWo: clean, deviceId: activeDevice.id, deviceName: activeDevice.name });
        return;
      }
      if (isRfid) {
        handleIncomingScan({ rawRfid: clean, deviceId: activeDevice.id, deviceName: activeDevice.name });
        return;
      }
    }

    // Fallback simulation mode
    const matchedFg = masterData.find(m => clean.includes(m.materialCode.toUpperCase())) || masterData[0];
    const rfidHex = customPayload?.rfid || `E280117020002164A5B801${Math.floor(10 + Math.random() * 89).toString(16).toUpperCase()}`;
    const woNo = customPayload?.woNo || `WO-2026-${new Date().toISOString().substring(5, 10).replace('-', '')}-${Math.floor(10000 + Math.random() * 90000)}`;

    handleIncomingScan({
      rawRfid: rfidHex,
      rawMat: matchedFg.materialCode,
      rawWo: woNo,
      deviceId: activeDevice.id,
      deviceName: activeDevice.name,
    });
  };

  // Cancel Action: Clear/Cancel current scan without saving to DB
  const handleCancelScan = async () => {
    setCurrentScan(null);
    currentScanRef.current = null;
    setLastCommittedTxn(null);
    setLastProcessedScanId(null);
    lastProcessedScanIdRef.current = null;
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
    message.info('Scan session reset.');
  };

  // Helper to evaluate Read Success / Read Failed (Material code, Work Order, RFID ID)
  const getReadStatus = (scan: ScannedLabelData | null = currentScan) => {
    const missingFields: string[] = [];
    if (!scan?.rfidUniqueId || scan.rfidUniqueId === 'NOT_DETECTED' || scan.rfidUniqueId.includes('FAIL') || scan.rfidUniqueId.includes('INVALID')) {
      missingFields.push('RFID Tag');
    }
    if (!scan?.qr1MaterialCode || !scan.matchedFgItem || scan.qr1MaterialCode === 'INVALID-OR-UNREADABLE' || scan.qr1MaterialCode.includes('FAIL') || scan.qr1MaterialCode.includes('INVALID')) {
      if (scan?.qr1MaterialCode && !scan.matchedFgItem) {
        missingFields.push('Material Code (Not in Master Data)');
      } else {
        missingFields.push('Material Code');
      }
    }
    if (!scan?.qr2WorkOrderNo || scan.qr2WorkOrderNo === 'MISSING_WO_CODE' || scan.qr2WorkOrderNo.includes('FAIL') || scan.qr2WorkOrderNo.includes('INVALID')) {
      missingFields.push('Work Order No');
    }

    const capturedCount = 3 - missingFields.length;

    if (capturedCount === 3 && scan?.readingSuccess) {
      return {
        isSuccess: true,
        title: 'Ready for Queue (3/3 Verified)',
        description: 'All 3 Auto-ID data points verified. Review information below and click Queue to save to SQLite DB.',
        capturedCount: 3,
        missingFields,
      };
    } else if (capturedCount > 0) {
      return {
        isSuccess: false,
        title: `Scan In Progress (${capturedCount}/3 Captured)`,
        description: `Waiting for: ${missingFields.join(' and ')}. Trigger RS38 handheld reader to scan the remaining code(s).`,
        capturedCount,
        missingFields,
      };
    } else {
      return {
        isSuccess: false,
        title: 'Listening for Live Scanner Data (0/3 Captured)',
        description: `Active Device: ${activeDevice?.name || 'CIPHER RS38 Handheld Reader'}. Awaiting live barcode/RFID scan events from device.`,
        capturedCount: 0,
        missingFields,
      };
    }
  };

  // Queue Action: Marry RFID Tag ID + Material Code/Part Number + WO No. in SQLite DB
  const handleQueueTransaction = async () => {
    if (!currentScan) return;

    // Strict foreign key pre-validation
    const cleanMat = (currentScan.qr1MaterialCode || '').trim().toUpperCase();
    const existsInMaster = masterData.some(
      m => m.materialCode.toUpperCase() === cleanMat || m.partNumber?.toUpperCase() === cleanMat
    ) || (currentScan.matchedFgItem && !String(currentScan.matchedFgItem.id).startsWith('temp-'));

    if (!existsInMaster || !currentScan.matchedFgItem) {
      Modal.error({
        title: (
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>
            ⚠️ Material Code Not in Master Data Management
          </span>
        ),
        icon: <CloseCircleOutlined style={{ color: '#dc2626', fontSize: '24px' }} />,
        centered: true,
        width: 520,
        okText: 'Acknowledge',
        okButtonProps: { type: 'primary', danger: true, style: { fontWeight: 700 } },
        content: (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', marginBottom: '12px' }}>
              Cannot insert into SQLite database: Material Code <strong>'{currentScan.qr1MaterialCode}'</strong> is not present in Master Data Management.
            </p>
            <div
              style={{
                backgroundColor: isDark ? '#1e293b' : '#fef2f2',
                border: `1px solid ${isDark ? '#991b1b' : '#fecaca'}`,
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                marginBottom: '12px',
              }}
            >
              <div>
                <strong>Material Code:</strong>{' '}
                <span style={{ color: '#dc2626', fontFamily: 'monospace', fontWeight: 800 }}>
                  {currentScan.qr1MaterialCode}
                </span>
              </div>
              <div style={{ marginTop: '6px' }}>
                <Tag color="error">FOREIGN KEY RELATIONSHIP REQUIRED</Tag>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
              Under database foreign key constraints, this item cannot be inserted until it is registered in Material Management.
            </div>
          </div>
        ),
      });
      return;
    }

    if (!currentScan.readingSuccess) {
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
      // Once submitted, return to the original screen waiting for scanned data
      setCurrentScan(null);
      currentScanRef.current = null;
      setLastProcessedScanId(null);
      lastProcessedScanIdRef.current = null;

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
    } catch (err: any) {
      setIsQueueing(false);
      const errMsg = err?.message || 'Failed to communicate with Python SQLite service.';
      if (
        errMsg.toLowerCase().includes('foreign key') ||
        errMsg.toLowerCase().includes('master data') ||
        errMsg.toLowerCase().includes('material management')
      ) {
        Modal.error({
          title: (
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>
              ⚠️ Database Foreign Key Constraint Failed
            </span>
          ),
          icon: <CloseCircleOutlined style={{ color: '#dc2626', fontSize: '24px' }} />,
          centered: true,
          width: 520,
          okText: 'Acknowledge',
          okButtonProps: { type: 'primary', danger: true, style: { fontWeight: 700 } },
          content: (
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', marginBottom: '12px' }}>
                Database rejection: The Material Code is <strong>not present in Master Data Management</strong>.
              </p>
              <div
                style={{
                  backgroundColor: isDark ? '#1e293b' : '#fef2f2',
                  border: `1px solid ${isDark ? '#991b1b' : '#fecaca'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <strong>Material Code:</strong>{' '}
                  <span style={{ color: '#dc2626', fontFamily: 'monospace', fontWeight: 800 }}>
                    {currentScan?.qr1MaterialCode}
                  </span>
                </div>
                <div style={{ marginTop: '6px' }}>
                  <Tag color="error">SQLITE FOREIGN KEY VIOLATION</Tag>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                {errMsg}
              </div>
            </div>
          ),
        });
      } else {
        message.error(errMsg);
      }
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
            {(() => {
              const status = getReadStatus();
              if (status.isSuccess) {
                return (
                  <Tag 
                    color="success" 
                    style={{ fontSize: '12px', fontWeight: 800, padding: '3px 14px', borderRadius: '12px' }}
                  >
                    ✓ ALL 3 VERIFIED
                  </Tag>
                );
              }
              if (status.capturedCount > 0) {
                return (
                  <Tag 
                    color="warning" 
                    style={{ fontSize: '12px', fontWeight: 800, padding: '3px 14px', borderRadius: '12px' }}
                  >
                    SCANNING IN PROGRESS ({status.capturedCount}/3)
                  </Tag>
                );
              }
              return (
                <Tag 
                  color="processing" 
                  style={{ fontSize: '12px', fontWeight: 800, padding: '3px 14px', borderRadius: '12px' }}
                >
                  🟢 LIVE SCANNER ACTIVE (0/3)
                </Tag>
              );
            })()}
          </div>
        }
        bordered={false}
        style={{ 
          backgroundColor: isDark ? '#1e293b' : '#ffffff', 
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)' 
        }}
      >
        {/* Previous Commit Confirmation Feedback */}
        {lastCommittedTxn && (
          <div
            style={{
              padding: '12px 18px',
              backgroundColor: '#10B98115',
              borderRadius: '8px',
              border: '1px solid #10B981',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircleOutlined />
                <span>Previous Item Successfully Committed & Saved in SQLite DB!</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: isDark ? '#cbd5e1' : '#475569' }}>
                <strong>{lastCommittedTxn.transactionId}</strong> — RFID:{' '}
                <span style={{ color: '#0284C7', fontFamily: 'monospace' }}>
                  {lastCommittedTxn.rfidUniqueId}
                </span>{' '}
                ⮀ Material:{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {lastCommittedTxn.materialCode}
                </span>{' '}
                ⮀ WO:{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {lastCommittedTxn.workOrderNo}
                </span>
              </div>
            </div>
            <Tag color="success" style={{ fontWeight: 800 }}>STORED IN SQLITE</Tag>
          </div>
        )}

        {(() => {
          const activeScan = currentScan || {
            readingSuccess: false,
            rfidUniqueId: '',
            rfidProtocol: 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)',
            rfidSignalRssi: 'Awaiting RF Signal',
            qr1MaterialCode: '',
            qr2WorkOrderNo: '',
            matchedFgItem: null,
            scannedAt: '',
            deviceId: activeDevice?.id || 'dev-cpr-01',
            deviceName: activeDevice?.name || 'CIPHER RS38 Handheld Reader',
            isQueued: false,
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Factory Generated RFID Tag Unique ID */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${activeScan.rfidUniqueId ? (isDark ? '#334155' : '#e2e8f0') : (isDark ? '#78350f' : '#fef3c7')}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThunderboltOutlined style={{ color: activeScan.rfidUniqueId ? '#E53935' : '#f59e0b', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    1. Factory Generated RFID Tag Unique ID
                  </strong>
                </div>
                <Tag color={activeScan.rfidUniqueId ? 'green' : 'gold'}>
                  {activeScan.rfidUniqueId ? (activeScan.rfidSignalRssi || '-44 dBm (Strong)') : '⏳ AWAITING RFID SCAN'}
                </Tag>
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: activeScan.rfidUniqueId ? '#0284C7' : '#94a3b8',
                  letterSpacing: '1.5px',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: `1px dashed ${activeScan.rfidUniqueId ? '#0284C7' : (isDark ? '#78350f' : '#f59e0b')}`,
                  wordBreak: 'break-all',
                }}
              >
                {activeScan.rfidUniqueId || '--- Waiting for RFID Tag scan event ---'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Protocol: {activeScan.rfidProtocol || 'EPC Gen2 / ISO 18000-6C (UHF 865.7 MHz)'}
              </div>
            </div>

            {/* 2. QR Code 1: Material Code ➔ Displays Configured FG Master Data WITH PRODUCT IMAGE CAROUSEL */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${activeScan.qr1MaterialCode ? (activeScan.matchedFgItem ? (isDark ? '#334155' : '#e2e8f0') : '#dc2626') : (isDark ? '#78350f' : '#fef3c7')}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <QrcodeOutlined style={{ color: activeScan.qr1MaterialCode ? (activeScan.matchedFgItem ? '#0284C7' : '#dc2626') : '#f59e0b', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    2. QR Code 1 (Material Code) ➔ Configured FG Master Data
                  </strong>
                </div>
                <Tag color={activeScan.qr1MaterialCode ? (activeScan.matchedFgItem ? '#0284C7' : 'error') : 'gold'} style={{ fontWeight: 700 }}>
                  {activeScan.qr1MaterialCode
                    ? (activeScan.matchedFgItem
                        ? `MATERIAL: ${activeScan.qr1MaterialCode}`
                        : `NOT IN MASTER: ${activeScan.qr1MaterialCode}`)
                    : '⏳ AWAITING MATERIAL CODE SCAN'}
                </Tag>
              </div>

              {activeScan.qr1MaterialCode && activeScan.matchedFgItem ? (
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
                            if (Array.isArray(activeScan.matchedFgItem.images) && activeScan.matchedFgItem.images.length > 0) {
                              imgs = activeScan.matchedFgItem.images;
                            } else if (Array.isArray(activeScan.matchedFgItem.fgImage) && activeScan.matchedFgItem.fgImage.length > 0) {
                              imgs = activeScan.matchedFgItem.fgImage;
                            } else if (typeof activeScan.matchedFgItem.fgImage === 'string' && activeScan.matchedFgItem.fgImage) {
                              imgs = [activeScan.matchedFgItem.fgImage];
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
                                  alt={`${activeScan.matchedFgItem?.productName} - View ${idx + 1}`}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                    transition: 'transform 0.4s ease',
                                  }}
                                />
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '8px',
                                    right: '8px',
                                    backgroundColor: 'rgba(0,0,0,0.65)',
                                    color: '#ffffff',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.5px',
                                  }}
                                >
                                  ANGLE {idx + 1}/{imgs.length}
                                </div>
                              </div>
                            </div>
                          ));
                          })()}
                        </Carousel>
                      </div>
                    </Col>

                    {/* Master Data Specs Details */}
                    <Col xs={24} sm={14} md={15} lg={16}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
                              {activeScan.matchedFgItem.category}
                            </Tag>
                            <Tag color="green" style={{ margin: 0, fontWeight: 700 }}>
                              {activeScan.matchedFgItem.status}
                            </Tag>
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                            {activeScan.matchedFgItem.productName}
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            Part Number: <strong style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{activeScan.matchedFgItem.partNumber}</strong>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                            gap: '8px',
                            backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                            padding: '10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Dimensions (LxWxH):</span>
                            <strong>
                              {activeScan.matchedFgItem.dimensions.lengthMm} x {activeScan.matchedFgItem.dimensions.widthMm} x {activeScan.matchedFgItem.dimensions.heightMm} mm
                            </strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Net / Gross Weight:</span>
                            <strong>
                              {activeScan.matchedFgItem.netWeight} kg / {activeScan.matchedFgItem.grossWeight} kg
                            </strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Package Type:</span>
                            <strong>{activeScan.matchedFgItem.packageType}</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Color Variant:</span>
                            <strong>{activeScan.matchedFgItem.colorVariant}</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Firmness Rating:</span>
                            <strong>{activeScan.matchedFgItem.firmnessRating}</strong>
                          </div>

                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Warranty:</span>
                            <strong>{activeScan.matchedFgItem.warrantyYears} Years Factory Warranty</strong>
                          </div>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: isDark ? '#1e293b' : (activeScan.qr1MaterialCode ? '#fef2f2' : '#ffffff'),
                    padding: '28px 16px',
                    borderRadius: '8px',
                    border: `1px dashed ${activeScan.qr1MaterialCode ? '#dc2626' : (isDark ? '#334155' : '#cbd5e1')}`,
                    textAlign: 'center',
                    color: '#94a3b8',
                  }}
                >
                  <BarcodeOutlined style={{ fontSize: '28px', color: activeScan.qr1MaterialCode ? '#dc2626' : '#94a3b8', marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: activeScan.qr1MaterialCode ? '#dc2626' : (isDark ? '#cbd5e1' : '#475569') }}>
                    {activeScan.qr1MaterialCode 
                      ? `⚠️ Material Code [${activeScan.qr1MaterialCode}] is NOT registered in Master Data Management!`
                      : 'Waiting for Material Code QR/Barcode scan...'}
                  </div>
                  <div style={{ fontSize: '11px', color: activeScan.qr1MaterialCode ? '#b91c1c' : '#64748b', marginTop: '4px' }}>
                    {activeScan.qr1MaterialCode
                      ? 'Foreign Key Constraint: This material code must exist in Master Data before it can be validated or inserted into SQLite.'
                      : 'Scan QR code 1 on product label using your RS38 handheld to display product details.'}
                  </div>
                </div>
              )}
            </div>

            {/* 3. QR Code 2: Work Order Number (WO) */}
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                border: `1px solid ${activeScan.qr2WorkOrderNo ? (isDark ? '#334155' : '#e2e8f0') : (isDark ? '#78350f' : '#fef3c7')}`,
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileTextOutlined style={{ color: activeScan.qr2WorkOrderNo ? '#8B5CF6' : '#f59e0b', fontSize: '16px' }} />
                  <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    3. QR Code 2 (Work Order Number - WO)
                  </strong>
                </div>
                <Tag color={activeScan.qr2WorkOrderNo ? 'purple' : 'gold'} style={{ fontWeight: 700 }}>
                  {activeScan.qr2WorkOrderNo ? `WO: ${activeScan.qr2WorkOrderNo}` : '⏳ AWAITING WORK ORDER SCAN'}
                </Tag>
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  fontWeight: 800,
                  color: activeScan.qr2WorkOrderNo ? '#8B5CF6' : '#94a3b8',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: `1px dashed ${activeScan.qr2WorkOrderNo ? (isDark ? '#334155' : '#e2e8f0') : (isDark ? '#78350f' : '#f59e0b')}`,
                }}
              >
                {activeScan.qr2WorkOrderNo || '--- Waiting for Work Order barcode scan ---'}
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
                      : (isDark ? '#78350f20' : '#fffbeb'),
                    border: `1px solid ${status.isSuccess ? '#10B98160' : '#f59e0b60'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: status.isSuccess ? '#059669' : '#d97706' }}>
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
                      Cancel / Reset
                    </Button>

                    <Button
                      type="primary"
                      size="large"
                      icon={isQueueing ? <LoadingOutlined /> : <CheckOutlined />}
                      loading={isQueueing}
                      disabled={!status.isSuccess || activeScan.isQueued}
                      style={{
                        backgroundColor: activeScan.isQueued ? '#10B981' : (status.isSuccess ? '#E53935' : undefined),
                        borderColor: activeScan.isQueued ? '#10B981' : (status.isSuccess ? '#E53935' : undefined),
                        height: '42px',
                        padding: '0 26px',
                        fontSize: '14px',
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        boxShadow: status.isSuccess && !activeScan.isQueued ? '0 4px 14px rgba(229, 57, 53, 0.4)' : undefined,
                        borderRadius: '8px',
                      }}
                      onClick={handleQueueTransaction}
                    >
                      {activeScan.isQueued ? '✓ Queued & Saved' : (status.isSuccess ? 'Queue & Commit to DB' : `Queue (${status.capturedCount}/3 Scanned)`)}
                    </Button>
                  </Space>
                </div>
              );
            })()}
          </div>
        );
      })()}
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
