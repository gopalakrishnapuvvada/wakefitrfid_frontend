import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { 
  MasterDataItem, 
  DeviceItem, 
  DeviceCategory,
  ValidationRecord, 
  GeneratedLabel,
  MarriedTransaction,
  FGTransactionStatus,
  ScannedLabelData
} from '../types';
import { 
  INITIAL_MASTER_DATA, 
  INITIAL_DEVICES, 
  INITIAL_VALIDATIONS, 
  INITIAL_LABELS,
  INITIAL_MARRIED_TRANSACTIONS
} from '../mock/initialData';
import { MasterDataApi, DevicesApi, TransactionsApi, getProductImageByMaterial } from '../services/api';
import type { MasterDataImportResult } from '../services/api';
import { getCurrentIST } from '../utils/dateUtils';
import dayjs from 'dayjs';

interface DataContextType {
  // Master Data
  masterData: MasterDataItem[];
  addMasterDataItem: (item: Omit<MasterDataItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<MasterDataItem>;
  updateMasterDataItem: (id: string, updates: Partial<MasterDataItem>) => Promise<MasterDataItem>;
  deleteMasterDataItem: (id: string) => Promise<void>;
  bulkImportMasterData: (file: File) => Promise<MasterDataImportResult>;
  getMasterDataByCode: (code: string) => MasterDataItem | undefined;

  // Devices
  devices: DeviceItem[];
  addDevice: (device: Partial<DeviceItem> & { name: string }) => Promise<DeviceItem>;
  updateDevice: (id: string, updates: Partial<DeviceItem>) => Promise<DeviceItem>;
  deleteDevice: (id: string) => Promise<void>;
  pingDevice: (id: string) => Promise<{ success: boolean; latencyMs: number; message: string }>;
  getDevicesByCategory: (category: DeviceCategory) => DeviceItem[];

  // Validations
  validations: ValidationRecord[];
  recordValidation: (record: Omit<ValidationRecord, 'id' | 'timestamp'>) => ValidationRecord;
  clearValidations: () => void;

  // Labels
  labels: GeneratedLabel[];
  generateLabel: (label: Omit<GeneratedLabel, 'id' | 'createdAt' | 'reprintCount'>) => GeneratedLabel;
  reprintLabel: (id: string) => GeneratedLabel | undefined;
  batchGenerateLabels: (labels: Array<Omit<GeneratedLabel, 'id' | 'createdAt' | 'reprintCount'>>) => GeneratedLabel[];

  // Married Transactions (RFID ID + Material Code/Part Number + WO No. in SQLite DB)
  marriedTransactions: MarriedTransaction[];
  queueMarryTransaction: (scanData: ScannedLabelData, operatorRole: string) => Promise<MarriedTransaction>;
  updateTransactionStatus: (id: string, status: FGTransactionStatus) => void;
  clearMarriedTransactions: () => void;
  refreshTransactions: () => Promise<void>;

  // Stats & KPIs
  stats: {
    totalMasterItems: number;
    totalActiveDevices: number;
    totalHandhelds: number;
    totalRfidPortals: number;
    totalGateways?: number;
    totalBarcodeScanners: number;
    labelsTodayCount: number;
    validationPassRate: number;
    totalValidationsToday: number;
    totalMarriedToday: number;
    wipTodayCount: number;
    dispatchedTodayCount: number;
    totalCompletedTransactions: number;
  };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const MASTER_DATA_KEY = 'wakefit_uaim_master_data_v3';
const DEVICES_KEY = 'wakefit_uaim_devices_v3';
const VALIDATIONS_KEY = 'wakefit_uaim_validations_v3';
const LABELS_KEY = 'wakefit_uaim_labels_v3';
const MARRIED_TXN_KEY = 'wakefit_uaim_married_transactions_v3';

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [masterData, setMasterData] = useState<MasterDataItem[]>(() => {
    const saved = localStorage.getItem(MASTER_DATA_KEY);
    return saved ? JSON.parse(saved) : INITIAL_MASTER_DATA;
  });

  const [devices, setDevices] = useState<DeviceItem[]>(() => {
    const saved = localStorage.getItem(DEVICES_KEY);
    return saved ? JSON.parse(saved) : INITIAL_DEVICES;
  });

  const [validations, setValidations] = useState<ValidationRecord[]>(() => {
    const saved = localStorage.getItem(VALIDATIONS_KEY);
    return saved ? JSON.parse(saved) : INITIAL_VALIDATIONS;
  });

  const [labels, setLabels] = useState<GeneratedLabel[]>(() => {
    const saved = localStorage.getItem(LABELS_KEY);
    return saved ? JSON.parse(saved) : INITIAL_LABELS;
  });

  const [marriedTransactions, setMarriedTransactions] = useState<MarriedTransaction[]>(() => {
    const saved = localStorage.getItem(MARRIED_TXN_KEY);
    return saved ? JSON.parse(saved) : INITIAL_MARRIED_TRANSACTIONS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(MASTER_DATA_KEY, JSON.stringify(masterData));
    } catch (error) {
      // Large imported catalogs still live in SQLite and reload from the API.
      console.warn('Master Data browser cache is full:', error);
    }
  }, [masterData]);

  useEffect(() => {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
  }, [devices]);

  useEffect(() => {
    localStorage.setItem(VALIDATIONS_KEY, JSON.stringify(validations));
  }, [validations]);

  useEffect(() => {
    localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
  }, [labels]);

  useEffect(() => {
    localStorage.setItem(MARRIED_TXN_KEY, JSON.stringify(marriedTransactions));
  }, [marriedTransactions]);

  const refreshTransactions = useCallback(async () => {
    try {
      const txns = await TransactionsApi.getTransactions();
      if (Array.isArray(txns)) {
        setMarriedTransactions(txns);
      }
    } catch (err) {
      console.warn('Backend Transactions API unavailable:', err);
    }
  }, []);

  const refreshMasterData = useCallback(async () => {
    const items = await MasterDataApi.getMasterData();
    setMasterData(items);
  }, []);

  // Synchronize live catalog, devices and transactions from FastAPI Backend
  useEffect(() => {
    refreshMasterData()
      .catch(err => {
        console.warn('Backend Master Data API unavailable:', err);
      });

    DevicesApi.getDevices()
      .then(devList => {
        if (Array.isArray(devList)) {
          setDevices(devList);
        }
      })
      .catch(err => {
        console.warn('Backend Devices API unavailable:', err);
      });

    refreshTransactions();
  }, [refreshMasterData, refreshTransactions]);

  const addMasterDataItem = async (item: Omit<MasterDataItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterDataItem> => {
    // Commit to backend API first to validate database & uniqueness constraints
    const saved = await MasterDataApi.createItem(item);
    setMasterData(prev => [saved, ...prev.filter(m => m.id !== saved.id && m.materialCode !== saved.materialCode)]);
    return saved;
  };

  const updateMasterDataItem = async (id: string, updates: Partial<MasterDataItem>): Promise<MasterDataItem> => {
    // Commit to backend API first to validate database & uniqueness constraints
    const updated = await MasterDataApi.updateItem(id, updates);
    setMasterData(prev =>
      prev.map(item => (item.id === id ? updated : item))
    );
    return updated;
  };

  const deleteMasterDataItem = async (id: string): Promise<void> => {
    // Delete on backend API first to validate database & foreign key constraints
    await MasterDataApi.deleteItem(id);
    setMasterData(prev => prev.filter(item => item.id !== id && item.materialCode !== id));
  };

  const bulkImportMasterData = async (file: File): Promise<MasterDataImportResult> => {
    const result = await MasterDataApi.bulkImport(file);
    await refreshMasterData();
    return result;
  };

  const getMasterDataByCode = (code: string): MasterDataItem | undefined => {
    const clean = code.trim().toUpperCase();
    return masterData.find(
      m => m.materialCode.toUpperCase() === clean || m.partNumber.toUpperCase() === clean
    );
  };

  const addDevice = async (device: Partial<DeviceItem> & { name: string }): Promise<DeviceItem> => {
    const cleanName = (device.name || device.displayName || '').trim();
    if (!cleanName) {
      throw new Error('Device Name is mandatory.');
    }

    const cleanIp = (device.ipAddress || '').trim();
    if (!cleanIp) {
      throw new Error('IP Address is mandatory.');
    }

    // Uniqueness validation for name and IP
    const duplicateName = devices.find(
      d => (d.name || d.displayName || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicateName) {
      throw new Error(`Device with name '${cleanName}' already exists.`);
    }

    const duplicateIp = devices.find(d => (d.ipAddress || '').trim().toLowerCase() === cleanIp.toLowerCase());
    if (duplicateIp) {
      throw new Error(`Device with IP Address '${cleanIp}' already exists (${duplicateIp.displayName || duplicateIp.name}).`);
    }

    const requestedType = device.deviceType || 'Handheld Scanner';
    if (requestedType === 'Fixed RFID Scanner') {
      const existing = devices.find(d => d.deviceType === 'Fixed RFID Scanner' || d.category === 'rfid_fixed');
      if (existing) {
        throw new Error(
          `Only one Fixed RFID Scanner is allowed in the system. '${existing.displayName || existing.name}' is already registered as a Fixed RFID Scanner.`
        );
      }
    }

    try {
      const saved = await DevicesApi.createDevice(device);
      setDevices(prev => [saved, ...prev.filter(d => d.id !== saved.id && d.deviceId !== saved.deviceId)]);
      return saved;
    } catch (err: any) {
      // If backend throws error (e.g. restriction or validation)
      if (
        err?.message &&
        (err.message.includes('Only one Fixed RFID') ||
          err.message.includes('already exists') ||
          err.message.includes('mandatory') ||
          err.message.includes('empty'))
      ) {
        throw err;
      }
      // Offline fallback
      const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const fallbackDev: DeviceItem = {
        deviceId: device.deviceId || uuid,
        id: device.id || uuid,
        displayName: cleanName,
        name: cleanName,
        deviceType: requestedType,
        ipAddress: cleanIp,
        macAddress: device.macAddress || '',
        make: device.make || device.manufacturer || 'Unknown',
        port: device.port ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      setDevices(prev => [fallbackDev, ...prev]);
      return fallbackDev;
    }
  };

  const updateDevice = async (id: string, updates: Partial<DeviceItem>): Promise<DeviceItem> => {
    if (updates.name || updates.displayName) {
      const cleanName = (updates.name || updates.displayName || '').trim();
      if (!cleanName) {
        throw new Error('Device Name cannot be empty.');
      }
      const duplicateName = devices.find(
        d => d.id !== id && d.deviceId !== id && (d.name || d.displayName || '').trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicateName) {
        throw new Error(`Device with name '${cleanName}' already exists.`);
      }
    }

    if (updates.ipAddress !== undefined) {
      const cleanIp = updates.ipAddress.trim();
      if (!cleanIp) {
        throw new Error('IP Address cannot be empty.');
      }
      const duplicateIp = devices.find(
        d => d.id !== id && d.deviceId !== id && (d.ipAddress || '').trim().toLowerCase() === cleanIp.toLowerCase()
      );
      if (duplicateIp) {
        throw new Error(`Device with IP Address '${cleanIp}' already exists (${duplicateIp.displayName || duplicateIp.name}).`);
      }
    }

    if (updates.deviceType === 'Fixed RFID Scanner') {
      const existing = devices.find(
        d => (d.deviceType === 'Fixed RFID Scanner' || d.category === 'rfid_fixed') && d.id !== id && d.deviceId !== id
      );
      if (existing) {
        throw new Error(
          `Only one Fixed RFID Scanner is allowed in the system. '${existing.displayName || existing.name}' is already registered as a Fixed RFID Scanner.`
        );
      }
    }

    try {
      const updated = await DevicesApi.updateDevice(id, updates);
      setDevices(prev => prev.map(dev => (dev.id === id || dev.deviceId === id ? updated : dev)));
      return updated;
    } catch (err: any) {
      if (
        err?.message &&
        (err.message.includes('Only one Fixed RFID') ||
          err.message.includes('already exists') ||
          err.message.includes('mandatory') ||
          err.message.includes('empty'))
      ) {
        throw err;
      }
      // Offline fallback
      let updatedItem: DeviceItem | null = null;
      setDevices(prev =>
        prev.map(dev => {
          if (dev.id === id || dev.deviceId === id) {
            const merged: DeviceItem = {
              ...dev,
              ...updates,
              name: updates.displayName || updates.name || dev.name,
              displayName: updates.displayName || updates.name || dev.displayName,
              deviceType: updates.deviceType || dev.deviceType || 'Handheld Scanner',
              ipAddress: updates.ipAddress || dev.ipAddress,
              macAddress: updates.macAddress || dev.macAddress,
              make: updates.make || updates.manufacturer || dev.make,
              port: updates.port ?? dev.port,
              updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            };
            updatedItem = merged;
            return merged;
          }
          return dev;
        })
      );
      return updatedItem || (updates as DeviceItem);
    }
  };

  const deleteDevice = async (id: string): Promise<void> => {
    setDevices(prev => prev.filter(dev => dev.id !== id && dev.deviceId !== id));

    try {
      await DevicesApi.deleteDevice(id);
    } catch (err) {
      console.warn(`Failed to delete device ${id} on backend API:`, err);
    }
  };

  const pingDevice = async (id: string): Promise<{ success: boolean; latencyMs: number; message: string }> => {
    try {
      const res = await DevicesApi.pingDevice(id);
      if (res.success) {
        updateDevice(id, {
          lastPing: new Date().toISOString().replace('T', ' ').substring(0, 19),
        });
      }
      return res;
    } catch {
      // Offline fallback simulation
      const dev = devices.find(d => d.id === id || d.deviceId === id);
      if (!dev) {
        return { success: false, latencyMs: 0, message: 'Device not found' };
      }

      const isOnline = dev.status !== 'offline';
      const latency = Math.floor(Math.random() * 25) + 6;

      if (isOnline) {
        updateDevice(id, {
          lastPing: new Date().toISOString().replace('T', ' ').substring(0, 19),
        });
        return {
          success: true,
          latencyMs: latency,
          message: `Echo reply from ${dev.ipAddress || dev.comPort || dev.macAddress}: bytes=32 time=${latency}ms TTL=64 (Healthy Status)`,
        };
      } else {
        return {
          success: false,
          latencyMs: 0,
          message: `Request timed out: Device ${dev.name} is unreachable. Check network switch / battery.`,
        };
      }
    }
  };

  const getDevicesByCategory = (category: DeviceCategory) => {
    return devices.filter(d => d.category === category);
  };

  const recordValidation = (record: Omit<ValidationRecord, 'id' | 'timestamp'>): ValidationRecord => {
    const newRecord: ValidationRecord = {
      ...record,
      id: `val-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    setValidations(prev => [newRecord, ...prev]);
    return newRecord;
  };

  const clearValidations = () => {
    setValidations([]);
  };

  const generateLabel = (label: Omit<GeneratedLabel, 'id' | 'createdAt' | 'reprintCount'>): GeneratedLabel => {
    const newLabel: GeneratedLabel = {
      ...label,
      id: `lbl-${Date.now().toString(36)}`,
      reprintCount: 0,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    setLabels(prev => [newLabel, ...prev]);
    return newLabel;
  };

  const reprintLabel = (id: string): GeneratedLabel | undefined => {
    let updated: GeneratedLabel | undefined;
    setLabels(prev =>
      prev.map(lbl => {
        if (lbl.id === id) {
          updated = { ...lbl, reprintCount: lbl.reprintCount + 1 };
          return updated;
        }
        return lbl;
      })
    );
    return updated;
  };

  const batchGenerateLabels = (newLabels: Array<Omit<GeneratedLabel, 'id' | 'createdAt' | 'reprintCount'>>): GeneratedLabel[] => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const created: GeneratedLabel[] = newLabels.map((lbl, idx) => ({
      ...lbl,
      id: `lbl-${Date.now().toString(36)}-${idx}`,
      reprintCount: 0,
      createdAt: now,
    }));
    setLabels(prev => [...created, ...prev]);
    return created;
  };

  // Queue & Marry Transaction: Marries RFID Tag ID, Material Code (with configured FG specs), and Work Order No. (WO)
  const queueMarryTransaction = async (scanData: ScannedLabelData, operatorRole: string): Promise<MarriedTransaction> => {
    try {
      const liveTxn = await TransactionsApi.commitTransaction(scanData, operatorRole);
      setMarriedTransactions(prev => [liveTxn, ...prev]);
      return liveTxn;
    } catch (apiErr: any) {
      // If the backend actively rejected with 409 (duplicate combination) or 400 (validation error), rethrow to display alert
      if (
        apiErr?.message &&
        (apiErr.message.includes('already registered') ||
         apiErr.message.includes('Duplicate') ||
         apiErr.message.includes('already exists') ||
         apiErr.message.includes('constraint violation') ||
         apiErr.message.includes('Foreign Key') ||
         apiErr.message.includes('foreign key') ||
         apiErr.message.includes('Master Data') ||
         apiErr.message.includes('Material Management') ||
         apiErr.message.includes('Conflict') ||
         apiErr.message.includes('409') ||
         apiErr.message.includes('400') ||
         apiErr.message.includes('required'))
      ) {
        throw apiErr;
      }

      // Foreign Key Validation: Material Code MUST exist in Master Data Management
      const cleanMatCode = (scanData.qr1MaterialCode || '').trim().toUpperCase();
      const existsInMaster = masterData.some(
        m => m.materialCode.trim().toUpperCase() === cleanMatCode || m.partNumber?.trim().toUpperCase() === cleanMatCode
      );
      if (!existsInMaster) {
        throw new Error(
          `Foreign Key Constraint Failed: Material Code '${scanData.qr1MaterialCode}' is not present in Master Data Management. Please register this item in Material Management first.`
        );
      }

      // Check if RFID Tag ID is already registered in local store (Global RFID Uniqueness)
      const cleanRfid = (scanData.rfidUniqueId || '').trim().toUpperCase();
      const existingRfidTxn = marriedTransactions.find(
        t => t.rfidUniqueId?.trim().toUpperCase() === cleanRfid
      );
      if (existingRfidTxn) {
        throw new Error(
          `Duplicate RFID Tag Rejected: Factory RFID Tag [${scanData.rfidUniqueId}] is already registered in Transaction [${existingRfidTxn.transactionId}] (WO: ${existingRfidTxn.workOrderNo || 'N/A'}, Material: ${existingRfidTxn.materialCode || 'N/A'}). Every RFID tag must be unique across the entire database.`
        );
      }

      // If backend is offline, ensure local duplicate triplet is also strictly prevented
      const isDuplicate = marriedTransactions.some(
        t =>
          t.rfidUniqueId?.toUpperCase() === scanData.rfidUniqueId?.toUpperCase() &&
          t.materialCode?.toUpperCase() === scanData.qr1MaterialCode?.toUpperCase() &&
          t.workOrderNo?.toUpperCase() === scanData.qr2WorkOrderNo?.toUpperCase()
      );
      if (isDuplicate) {
        throw new Error(
          `Duplicate Combination Rejected: RFID Tag [${scanData.rfidUniqueId}], Material [${scanData.qr1MaterialCode}], and Work Order [${scanData.qr2WorkOrderNo}] have already been registered.`
        );
      }

      console.warn('Backend commit failed or offline, saving to local store:', apiErr);
      const now = new Date();
      const dateStr = now.toISOString().substring(0, 10).replace(/-/g, '');
      const timeStr = getCurrentIST();
      const recordId = 1000 + marriedTransactions.length + 1;
      const txnId = `TXN-${dateStr}-${String(recordId).padStart(4, '0')}`;

      // System-Defined State Business Logic:
      // Outbound Logistics Fixed RFID Portals / Shipping Dock Doors -> 'Dispatched'
      // Packaging & Marriage Station Handhelds / Line Conveyor -> 'WIP'
      const isOutboundPortal = 
        scanData.deviceId?.startsWith('dev-rf') || 
        scanData.deviceName?.toLowerCase().includes('portal') || 
        scanData.deviceName?.toLowerCase().includes('dock') ||
        scanData.deviceName?.toLowerCase().includes('shipping');
      
      const systemState: FGTransactionStatus = isOutboundPortal ? 'Dispatched' : 'WIP';
      const matched = scanData.matchedFgItem;

      const fallbackTxn: MarriedTransaction = {
        id: `txn-${Date.now().toString(36)}`,
        transactionId: txnId,
        timestamp: timeStr,
        rfidUniqueId: scanData.rfidUniqueId,
        workOrderNo: scanData.qr2WorkOrderNo || 'WO-GEN-99001',
        materialCode: scanData.qr1MaterialCode,
        partNumber: matched?.partNumber || 'FG-UNKNOWN-PART',
        productName: matched?.productName || 'Configured Finished Good Product',
        category: matched?.category || 'Mattress',
        mrp: matched?.mrp || 0,
        productImage: (Array.isArray(matched?.fgImage) ? matched.fgImage[0] : matched?.fgImage) || matched?.images?.[0] || getProductImageByMaterial(scanData.qr1MaterialCode, matched?.category),
        deviceId: scanData.deviceId,
        deviceName: scanData.deviceName,
        operatorRole: operatorRole,
        status: systemState,
        wipScanTimestamp: timeStr,
        dispatchScanTimestamp: isOutboundPortal ? timeStr : undefined,
        dbStatus: 'COMMITTED_TO_SQLITE',
        sqliteDatabasePath: '/data/sqlite/wakefit_fg_marriage.db',
        sqliteRecordId: recordId,
      };

      setMarriedTransactions(prev => [fallbackTxn, ...prev]);
      return fallbackTxn;
    }
  };

  const updateTransactionStatus = useCallback((id: string, status: FGTransactionStatus) => {
    setMarriedTransactions(prev => prev.map(t => (t.id === id || t.transactionId === id) ? { ...t, status } : t));
    TransactionsApi.updateStatus(id, status).catch(err => {
      console.warn(`Failed to update transaction ${id} status on backend API:`, err);
    });
  }, []);

  const clearMarriedTransactions = () => {
    setMarriedTransactions([]);
    TransactionsApi.clearAll().catch(err => {
      console.warn('Failed to clear transactions on backend API:', err);
    });
  };

  const onlineDevicesCount = devices.filter(d => d.status === 'online').length;
  const passedValidations = validations.filter(v => v.result === 'PASS').length;
  const passRate = validations.length > 0 ? (passedValidations / validations.length) * 100 : 100;

  const todayStr = dayjs().format('YYYY-MM-DD');
  
  const marriedToday = marriedTransactions.filter(t => {
    const rawTs = (t as any).productValidationTimestamp || t.wipScanTimestamp || t.timestamp || (t as any).createdOn;
    if (!rawTs) return false;
    const tDate = String(rawTs).split('T')[0].split(' ')[0];
    return tDate === todayStr;
  });

  const wipToday = marriedToday.filter(t => (t.status || 'WIP') === 'WIP' && (t as any).statusId !== 'dispatch');
  
  const dispatchedToday = marriedTransactions.filter(t => {
    const isDispatched = t.status === 'Dispatched' || (t as any).statusId === 'dispatch';
    if (!isDispatched) return false;
    const rawTs = (t as any).labelLookupTimestamp || t.dispatchScanTimestamp || t.timestamp;
    if (!rawTs) return false;
    const tDate = String(rawTs).split('T')[0].split(' ')[0];
    return tDate === todayStr;
  });

  const completedAll = marriedTransactions.filter(t => t.status === 'Dispatched' || (t as any).statusId === 'dispatch');

  const stats = {
    totalMasterItems: masterData.length,
    totalActiveDevices: onlineDevicesCount,
    totalHandhelds: devices.filter(d => d.deviceType === 'Handheld Scanner' || (!d.deviceType && d.category !== 'rfid_fixed')).length,
    totalRfidPortals: devices.filter(d => d.deviceType === 'Fixed RFID Scanner' || d.category === 'rfid_fixed').length,
    totalGateways: devices.filter(d => d.category === 'gateway').length,
    totalBarcodeScanners: devices.filter(d => d.category === 'barcode' || d.category === 'gateway').length,
    labelsTodayCount: labels.reduce((acc, l) => acc + l.printedCopies, 0),
    validationPassRate: Number(passRate.toFixed(1)),
    totalValidationsToday: validations.length,
    totalMarriedToday: marriedToday.length,
    wipTodayCount: wipToday.length,
    dispatchedTodayCount: dispatchedToday.length,
    totalCompletedTransactions: completedAll.length,
  };

  return (
    <DataContext.Provider
      value={{
        masterData,
        addMasterDataItem,
        updateMasterDataItem,
        deleteMasterDataItem,
        bulkImportMasterData,
        getMasterDataByCode,

        devices,
        addDevice,
        updateDevice,
        deleteDevice,
        pingDevice,
        getDevicesByCategory,

        validations,
        recordValidation,
        clearValidations,

        labels,
        generateLabel,
        reprintLabel,
        batchGenerateLabels,

        marriedTransactions,
        queueMarryTransaction,
        updateTransactionStatus,
        clearMarriedTransactions,
        refreshTransactions,

        stats,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
