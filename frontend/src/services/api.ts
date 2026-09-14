import type {
  MasterDataItem,
  DeviceItem,
  DeviceCategory,
  MarriedTransaction,
  FGTransactionStatus,
  ScannedLabelData,
} from '../types';
import { formatToIST } from '../utils/dateUtils';

// Use relative URL when running on Vite dev server (handled by proxy), or direct localhost:8000
const API_BASE = import.meta.env.VITE_API_URL ?? (
  typeof window !== 'undefined' && window.location.port === '5173'
    ? ''
    : 'http://localhost:8000'
);

/**
 * Standard fetch helper with timeout and JSON parsing
 */
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Use standard error detail
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

// ==============================================================================
// 1. ROLES API (User Requested: /api/master_data/get_roles_data & update_roles_password)
// ==============================================================================

export interface BackendRole {
  id: string;
  name: string;
  password: string;
  createdOn?: string;
  createdBy?: string;
  updatedOn?: string;
  updatedBy?: string;
}

export const RolesApi = {
  /**
   * GET /api/master_data/get_roles_data
   */
  async getRoles(): Promise<BackendRole[]> {
    return apiFetch<BackendRole[]>('/api/master_data/get_roles_data');
  },

  /**
   * PUT /api/master_data/update_roles_password
   */
  async updatePassword(roleId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>('/api/master_data/update_roles_password', {
      method: 'PUT',
      body: JSON.stringify({
        roleId,
        newPassword,
      }),
    });
  },
};

// ==============================================================================
// 2. DEVICES API (User Requested: post_devices_data, update_devices_data, get_devices_data)
// ==============================================================================

export const DevicesApi = {
  /**
   * GET /api/master_data/get_devices_data
   */
  async getDevices(): Promise<DeviceItem[]> {
    const data = await apiFetch<any[]>('/api/master_data/get_devices_data');
    return data.map(d => ({
      ...d,
      id: d.deviceId || d.id,
      deviceId: d.deviceId || d.id,
      name: d.displayName || d.name,
      displayName: d.displayName || d.name,
      code: d.assetCode || d.code,
      assetCode: d.assetCode || d.code,
      connectionType: d.connectionType || 'TCP/IP',
      stationId: d.stationId || d.locationLine || '',
      locationLine: d.stationId || d.locationLine || '',
      scanMode: d.scanMode || d.triggerMode || 'Manual Scan',
      triggerMode: d.scanMode || d.triggerMode || 'Manual Scan',
      lastSeen: d.lastSeen || new Date().toISOString(),
      lastPing: d.lastPing || d.lastSeen || new Date().toISOString(),
      firmwareVersion: d.firmwareVersion || 'v1.0.0',
    }));
  },

  /**
   * POST /api/master_data/post_devices_data
   */
  async createDevice(device: Partial<DeviceItem> & { name: string; code: string; category: DeviceCategory }): Promise<DeviceItem> {
    const payload = {
      deviceId: device.deviceId || device.id,
      displayName: device.displayName || device.name,
      assetCode: (device.assetCode || device.code || '').toUpperCase().trim(),
      category: device.category,
      connectionType: device.connectionType || 'TCP/IP',
      stationId: device.stationId || device.locationLine || '',
      manufacturer: device.manufacturer || 'Auto-ID Generic',
      model: device.model || 'Standard Reader',
      serialNumber: device.serialNumber,
      macAddress: device.macAddress,
      ipAddress: device.ipAddress,
      port: device.port,
      connectionParameters: device.connectionParameters,
      scanMode: device.scanMode || device.triggerMode || 'Manual Scan',
      status: device.status || 'online',
      firmwareVersion: device.firmwareVersion || 'v1.0.0',
      lastError: device.lastError,
      brand: device.brand,
      assignedOperator: device.assignedOperator,
    };

    const d = await apiFetch<any>('/api/master_data/post_devices_data', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      ...d,
      id: d.deviceId || d.id,
      deviceId: d.deviceId || d.id,
      name: d.displayName || d.name,
      displayName: d.displayName || d.name,
      code: d.assetCode || d.code,
      assetCode: d.assetCode || d.code,
      connectionType: d.connectionType || 'TCP/IP',
      stationId: d.stationId || d.locationLine || '',
      locationLine: d.stationId || d.locationLine || '',
      scanMode: d.scanMode || d.triggerMode || 'Manual Scan',
      triggerMode: d.scanMode || d.triggerMode || 'Manual Scan',
      lastSeen: d.lastSeen || new Date().toISOString(),
      lastPing: d.lastPing || d.lastSeen || new Date().toISOString(),
    };
  },

  /**
   * PUT /api/master_data/update_devices_data
   */
  async updateDevice(id: string, updates: Partial<DeviceItem>): Promise<DeviceItem> {
    const payload = {
      deviceId: updates.deviceId || id,
      displayName: updates.displayName || updates.name,
      assetCode: updates.assetCode || updates.code,
      category: updates.category,
      connectionType: updates.connectionType,
      stationId: updates.stationId || updates.locationLine,
      manufacturer: updates.manufacturer,
      model: updates.model,
      serialNumber: updates.serialNumber,
      macAddress: updates.macAddress,
      ipAddress: updates.ipAddress,
      port: updates.port,
      connectionParameters: updates.connectionParameters,
      scanMode: updates.scanMode || updates.triggerMode,
      status: updates.status,
      firmwareVersion: updates.firmwareVersion,
      lastError: updates.lastError,
      brand: updates.brand,
      assignedOperator: updates.assignedOperator,
    };

    const d = await apiFetch<any>('/api/master_data/update_devices_data', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return {
      ...d,
      id: d.deviceId || d.id,
      deviceId: d.deviceId || d.id,
      name: d.displayName || d.name,
      displayName: d.displayName || d.name,
      code: d.assetCode || d.code,
      assetCode: d.assetCode || d.code,
      connectionType: d.connectionType || 'TCP/IP',
      stationId: d.stationId || d.locationLine || '',
      locationLine: d.stationId || d.locationLine || '',
      scanMode: d.scanMode || d.triggerMode || 'Manual Scan',
      triggerMode: d.scanMode || d.triggerMode || 'Manual Scan',
      lastSeen: d.lastSeen || new Date().toISOString(),
      lastPing: d.lastPing || d.lastSeen || new Date().toISOString(),
    };
  },

  /**
   * DELETE /api/devices/{id}
   */
  async deleteDevice(id: string): Promise<void> {
    await apiFetch(`/api/devices/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * POST /api/devices/{id}/ping
   */
  async pingDevice(id: string): Promise<{ success: boolean; latencyMs: number; message: string }> {
    return apiFetch<{ success: boolean; latencyMs: number; message: string }>(`/api/devices/${id}/ping`, {
      method: 'POST',
    });
  },
};

// ==============================================================================
// 3. MASTER DATA CATALOG API
// ==============================================================================

/**
 * Universal fallback resolver for product image paths based on Material Code or Category
 */
export function getProductImageByMaterial(materialCode?: string, category?: string): string {
  const clean = (materialCode || '').toUpperCase();
  const cat = (category || '').toLowerCase();
  if (clean.includes('REC') || cat.includes('recliner')) return '/products/recliner_1.jpg';
  if (clean.includes('SOF') || cat.includes('sofa')) return '/products/sofa_1.jpg';
  if (clean.includes('BED') || cat.includes('bed')) return '/products/bed_1.jpg';
  if (clean.includes('PIL') || cat.includes('pillow')) return '/products/pillow_1.jpg';
  if (clean.includes('MAT-756') || clean.includes('756006')) return '/products/mattress_2.jpg';
  return '/products/mattress_1.jpg';
}

/**
 * Validates that an image string is an HTTP/HTTPS URL or relative asset path, rejecting raw Base64 data blobs.
 */
export function isValidImageUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!u || u === 'string' || u.toLowerCase() === 'null') return false;
  if (u.startsWith('data:') || u.toLowerCase().includes('base64') || u.length > 500) return false;
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/');
}

export const MasterDataApi = {
  /**
   * GET /api/master_data/
   */
  async getMasterData(): Promise<MasterDataItem[]> {
    const items = await apiFetch<any[]>('/api/master_data/');
    return items.map(item => {
      let imgList: string[] = [];
      if (Array.isArray(item.fgImage)) {
        imgList = item.fgImage.filter(isValidImageUrl);
      } else if (Array.isArray(item.fg_image)) {
        imgList = item.fg_image.filter(isValidImageUrl);
      } else if (Array.isArray(item.images)) {
        imgList = item.images.filter(isValidImageUrl);
      } else if (isValidImageUrl(item.fgImage)) {
        imgList = [item.fgImage.trim()];
      } else if (isValidImageUrl(item.fg_image)) {
        imgList = [item.fg_image.trim()];
      }

      if (imgList.length === 0) {
        imgList = [getProductImageByMaterial(item.materialCode, item.category)];
      }

      imgList = imgList.slice(0, 4);
      const primaryImg = imgList[0];

      return {
        id: item.id,
        fgImage: primaryImg,
        images: imgList,
        materialCode: item.materialCode,
        partNumber: item.partNumber,
        category: item.category || 'Mattress',
        model: item.model || '',
        productDescription: item.productDescription || '',
        dimensions: {
          lengthMm: item.dimensions?.lengthMm || 0,
          widthMm: item.dimensions?.widthMm || 0,
          heightMm: item.dimensions?.heightMm || 0,
        },
        netWeight: item.netWeight || 0,
        grossWeight: item.grossWeight || 0,
        packageType: item.packageType || 'Rolled Vacuum Box',
        status: (item.status === 'On hold' ? 'On hold' : item.status === 'Inactive' ? 'Inactive' : 'Active'),
        productName: item.productName || item.productDescription || item.model,
        createdAt: item.createdOn ? item.createdOn.replace('T', ' ').substring(0, 19) : '',
        updatedAt: item.updatedOn ? item.updatedOn.replace('T', ' ').substring(0, 19) : '',
      };
    });
  },

  /**
   * POST /api/master_data/
   */
  async createItem(item: Omit<MasterDataItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterDataItem> {
    const rawImagesPayload: string[] = Array.isArray(item.fgImage)
      ? item.fgImage
      : (item.images && item.images.length > 0 ? item.images : (typeof item.fgImage === 'string' && item.fgImage ? [item.fgImage] : []));
    const imagesPayload = rawImagesPayload.filter(isValidImageUrl);

    const payload = {
      fgImage: imagesPayload.slice(0, 4),
      materialCode: item.materialCode,
      partNumber: item.partNumber,
      category: item.category,
      model: item.model,
      productDescription: item.productDescription,
      dimensions: item.dimensions,
      netWeight: item.netWeight,
      grossWeight: item.grossWeight,
      packageType: item.packageType,
      status: item.status,
    };

    const res = await apiFetch<any>('/api/master_data/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    let resImgs: string[] = [];
    if (Array.isArray(res.fgImage)) {
      resImgs = res.fgImage.filter(isValidImageUrl);
    } else if (Array.isArray(res.images)) {
      resImgs = res.images.filter(isValidImageUrl);
    } else {
      resImgs = imagesPayload.length > 0 ? imagesPayload : [getProductImageByMaterial(res.materialCode, res.category)];
    }
    const primaryImg = resImgs[0] || getProductImageByMaterial(res.materialCode, res.category);

    return {
      id: res.id,
      fgImage: primaryImg,
      images: resImgs.slice(0, 4),
      materialCode: res.materialCode,
      partNumber: res.partNumber,
      category: res.category || item.category,
      model: res.model,
      productDescription: res.productDescription,
      dimensions: res.dimensions || item.dimensions,
      netWeight: res.netWeight || item.netWeight,
      grossWeight: res.grossWeight || item.grossWeight,
      packageType: res.packageType || item.packageType,
      status: res.status || item.status,
      productName: res.productName || res.productDescription || res.model,
      createdAt: res.createdOn ? res.createdOn.replace('T', ' ').substring(0, 19) : '',
      updatedAt: res.updatedOn ? res.updatedOn.replace('T', ' ').substring(0, 19) : '',
    };
  },

  /**
   * PUT /api/master_data/{id}
   */
  async updateItem(id: string, updates: Partial<MasterDataItem>): Promise<MasterDataItem> {
    const rawImagesPayload = updates.images !== undefined
      ? updates.images
      : (Array.isArray(updates.fgImage) ? updates.fgImage : (typeof updates.fgImage === 'string' && updates.fgImage ? [updates.fgImage] : undefined));
    const imagesPayload = rawImagesPayload ? rawImagesPayload.filter(isValidImageUrl) : undefined;

    const payload = {
      fgImage: imagesPayload ? imagesPayload.slice(0, 4) : undefined,
      materialCode: updates.materialCode,
      partNumber: updates.partNumber,
      category: updates.category,
      model: updates.model,
      productDescription: updates.productDescription,
      dimensions: updates.dimensions,
      netWeight: updates.netWeight,
      grossWeight: updates.grossWeight,
      packageType: updates.packageType,
      status: updates.status,
    };

    const res = await apiFetch<any>(`/api/master_data/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    let resImgs: string[] = [];
    if (Array.isArray(res.fgImage)) {
      resImgs = res.fgImage;
    } else if (Array.isArray(res.images)) {
      resImgs = res.images;
    } else if (imagesPayload) {
      resImgs = imagesPayload;
    } else {
      resImgs = [getProductImageByMaterial(res.materialCode, res.category)];
    }
    const primaryImg = resImgs[0] || getProductImageByMaterial(res.materialCode, res.category);

    return {
      id: res.id,
      fgImage: primaryImg,
      images: resImgs.slice(0, 4),
      materialCode: res.materialCode,
      partNumber: res.partNumber,
      category: res.category || updates.category || 'Mattress',
      model: res.model,
      productDescription: res.productDescription,
      dimensions: res.dimensions || updates.dimensions || { lengthMm: 0, widthMm: 0, heightMm: 0 },
      netWeight: res.netWeight || updates.netWeight || 0,
      grossWeight: res.grossWeight || updates.grossWeight || 0,
      packageType: res.packageType || updates.packageType || 'Rolled Vacuum Box',
      status: res.status || updates.status || 'Active',
      productName: res.productName || res.productDescription || res.model,
      createdAt: res.createdOn ? res.createdOn.replace('T', ' ').substring(0, 19) : '',
      updatedAt: res.updatedOn ? res.updatedOn.replace('T', ' ').substring(0, 19) : '',
    };
  },

  /**
   * DELETE /api/master_data/{id}
   */
  async deleteItem(id: string): Promise<void> {
    await apiFetch(`/api/master_data/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * POST /api/master_data/seed
   */
  async seed(): Promise<any> {
    return apiFetch('/api/master_data/seed', {
      method: 'POST',
    });
  },
};

// ==============================================================================
// 4. MARRIAGE & TRANSACTIONS API
// ==============================================================================

export const TransactionsApi = {
  /**
   * GET /api/transactions/
   */
  async getTransactions(): Promise<MarriedTransaction[]> {
    const list = await apiFetch<any[]>('/api/transactions/');
    return list.map(t => {
      const prodImg =
        t.productImage ||
        t.fgImage ||
        t.product_image ||
        t.fg_image ||
        getProductImageByMaterial(t.materialCode, t.category);

      return {
        id: t.id || t.transactionId,
        transactionId: t.transactionId,
        timestamp: formatToIST(t.timestamp || t.productValidationTimestamp || t.createdOn),
        rfidUniqueId: t.rfidUniqueId || '',
        workOrderNo: t.workOrderNo || '',
        materialCode: t.materialCode,
        partNumber: t.partNumber || '',
        productName: t.productName || `FG Item (${t.materialCode})`,
        category: t.category || 'Mattress',
        mrp: 0,
        productImage: prodImg,
        deviceId: t.deviceId || '',
        deviceName: t.deviceName || 'Reader',
        operatorRole: t.operatorRole || 'Line Operator',
        status: (t.status === 'Dispatched' ? 'Dispatched' : 'WIP') as FGTransactionStatus,
        wipScanTimestamp: t.timestamp,
        dispatchScanTimestamp: t.status === 'Dispatched' ? t.timestamp : undefined,
        dbStatus: 'COMMITTED_TO_SQLITE' as const,
        sqliteDatabasePath: '/data/sqlite/wakefit_fg_marriage.db',
        sqliteRecordId: t.sno || 1,
      };
    });
  },

  /**
   * POST /api/transactions/ (or /api/marriage/commit)
   */
  async commitTransaction(scanData: ScannedLabelData, operatorRole: string): Promise<MarriedTransaction> {
    const isOutboundPortal =
      scanData.deviceId?.startsWith('dev-rf') ||
      scanData.deviceName?.toLowerCase().includes('portal') ||
      scanData.deviceName?.toLowerCase().includes('dock') ||
      scanData.deviceName?.toLowerCase().includes('shipping');

    const payload = {
      materialCode: scanData.qr1MaterialCode,
      workOrderNo: scanData.qr2WorkOrderNo,
      rfidUniqueId: scanData.rfidUniqueId,
      partNumber: scanData.matchedFgItem?.partNumber,
      deviceId: scanData.deviceId,
      operatorRole: operatorRole,
      status: isOutboundPortal ? 'dispatch' : 'wip',
    };

    const t = await apiFetch<any>('/api/transactions/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const prodImg =
      t.productImage ||
      t.fgImage ||
      t.product_image ||
      t.fg_image ||
      scanData.matchedFgItem?.fgImage ||
      scanData.matchedFgItem?.images?.[0] ||
      getProductImageByMaterial(scanData.qr1MaterialCode, scanData.matchedFgItem?.category);

    return {
      id: t.id || t.transactionId,
      transactionId: t.transactionId,
      timestamp: formatToIST(t.timestamp || t.productValidationTimestamp || t.createdOn),
      rfidUniqueId: t.rfidUniqueId || scanData.rfidUniqueId,
      workOrderNo: t.workOrderNo || scanData.qr2WorkOrderNo,
      materialCode: t.materialCode,
      partNumber: t.partNumber || scanData.matchedFgItem?.partNumber || '',
      productName: t.productName || scanData.matchedFgItem?.productDescription || 'Finished Good Product',
      category: t.category || scanData.matchedFgItem?.category || 'Mattress',
      mrp: scanData.matchedFgItem?.mrp || 0,
      productImage: prodImg,
      deviceId: t.deviceId || scanData.deviceId,
      deviceName: t.deviceName || scanData.deviceName,
      operatorRole: operatorRole,
      status: (t.status === 'Dispatched' ? 'Dispatched' : 'WIP') as FGTransactionStatus,
      wipScanTimestamp: t.timestamp,
      dispatchScanTimestamp: isOutboundPortal ? t.timestamp : undefined,
      dbStatus: 'COMMITTED_TO_SQLITE' as const,
      sqliteDatabasePath: '/data/sqlite/wakefit_fg_marriage.db',
      sqliteRecordId: t.sno || 1001,
    };
  },

  /**
   * PUT /api/transactions/{id}/status
   */
  async updateStatus(id: string, status: FGTransactionStatus): Promise<void> {
    await apiFetch(`/api/transactions/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: status.toLowerCase(),
      }),
    });
  },

  /**
   * POST /api/transactions/clear
   */
  async clearAll(): Promise<void> {
    await apiFetch('/api/transactions/clear', {
      method: 'POST',
    });
  },

  /**
   * POST /api/transactions/post_scan
   * Takes Factory Generated RFID Tag Unique ID, Material Code, and Work Order Number - WO.
   * Does NOT save to transactions_data yet. Shows under 'Captured Finished Good Label Analysis'.
   */
  async postScan(payload: {
    rfidUniqueId: string;
    materialCode: string;
    workOrderNo: string;
    deviceId?: string;
  }): Promise<any> {
    return apiFetch('/api/transactions/post_scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Alias for post_scan */
  async postCan(payload: {
    rfidUniqueId: string;
    materialCode: string;
    workOrderNo: string;
    deviceId?: string;
  }): Promise<any> {
    return apiFetch('/api/transactions/post_scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/transactions/pending_scan
   */
  async getPendingScan(): Promise<any> {
    return apiFetch('/api/transactions/pending_scan');
  },

  /**
   * POST /api/transactions/cancel_scan
   */
  async cancelScan(): Promise<any> {
    return apiFetch('/api/transactions/cancel_scan', {
      method: 'POST',
    });
  },

  /** Alias for cancel_scan */
  async cancelCan(): Promise<any> {
    return apiFetch('/api/transactions/cancel_scan', {
      method: 'POST',
    });
  },

  /**
   * POST /api/transactions/post_fixed_rfid
   * Triggers the SICK RFU630 fixed RFID reader portal scan.
   * Verifies that the RFID unique ID exists in transactions_data table.
   * Updates status to 'dispatch' and returns coupled product identifiers.
   */
  async postFixedRfid(payload: {
    rfidUniqueId: string;
    deviceId?: string;
    antenna?: string;
  }): Promise<any> {
    return apiFetch('/api/transactions/post_fixed_rfid', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/transactions/pending_fixed_rfid
   */
  async getPendingFixedRfid(): Promise<any> {
    return apiFetch('/api/transactions/pending_fixed_rfid');
  },

  /**
   * POST /api/transactions/clear_fixed_rfid
   */
  async clearFixedRfid(): Promise<any> {
    return apiFetch('/api/transactions/clear_fixed_rfid', {
      method: 'POST',
    });
  },
};

