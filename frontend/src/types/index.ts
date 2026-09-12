export type RoleId = 
  | 'admin' 
  | 'supervisor' 
  | 'operator';

export interface RoleInfo {
  id: RoleId;
  name: string;
  badgeTitle: string;
  description: string;
  color: string;
  icon: string;
  password?: string;
  permissions: {
    canViewDashboard: boolean;
    canValidateProducts: boolean;
    canOverrideValidation: boolean;
    canGenerateLabels: boolean;
    canBatchPrint: boolean;
    canReprintLabels: boolean;
    canManageConfiguration: boolean;
    canManageMasterData: boolean;
    canManageDevices: boolean;
    canAdministerRoles: boolean;
  };
}

export type MasterDataStatus = 'Active' | 'On hold' | 'Inactive';

export interface MasterDataItem {
  id: string;
  fgImage: string | string[]; // FG Image URL(s) - List of up to 4 URLs e.g. AWS S3 links
  materialCode: string;       // Material Code e.g. WAK-MAT-787208
  partNumber: string;         // Part Number e.g. FG-ORT-KNG-08
  category: string;           // Category e.g. Mattress, Sofa, Recliner
  model: string;              // Model e.g. ShapeSense Ortho Pro
  productDescription: string; // Product Description
  dimensions: {
    lengthMm: number;
    widthMm: number;
    heightMm: number;
  };
  netWeight: number;          // Net Weight (KG)
  grossWeight: number;        // Gross Weight (KG)
  packageType: string;        // Package Type e.g. Rolled Vacuum Box, Corrugated Carton
  status: MasterDataStatus;   // Status: Active, On hold, Inactive

  // Optional/compat aliases
  productName?: string;
  weightKg?: number;
  images?: string[];
  isActive?: boolean;
  uom?: string;
  mrp?: number;
  standardBarcodeType?: 'Code128' | 'GS1-128' | 'QR' | 'DataMatrix';
  rfidInlayType?: 'EPC Gen2 SGTIN-96' | 'EPC Gen2 GRAI-96' | 'NFC NTAG213';
  colorVariant?: string;
  firmnessRating?: string;
  warrantyYears?: number;
  createdAt: string;
  updatedAt: string;
}

export type DeviceCategory = 'gateway' | 'rfid_fixed' | 'handheld' | 'barcode';

export type DeviceStatus = 'online' | 'offline' | 'error';

export type ConnectionType = 'TCP/IP' | 'Serial (RS-232)' | 'USB-HID' | 'Bluetooth' | 'Websocket';

export type ScanMode = 'Manual Scan' | 'Automatic Scan';

export interface AutoIDDevice {
  // Identity
  deviceId: string;              // System-generated UUID
  id: string;                    // Alias for deviceId
  displayName: string;           // DisplayName
  name: string;                  // Alias for displayName
  assetCode: string;             // AssetCode
  code: string;                  // Alias for assetCode
  category: DeviceCategory;      // Category
  manufacturer: string;          // Manufacturer
  model: string;                 // Model
  serialNumber: string;          // SerialNumber
  macAddress: string;            // MACAddress

  // Assignment
  stationId: string;             // StationID
  locationLine: string;          // Alias for stationId

  // Connectivity
  connectionType: ConnectionType;// ConnectionType
  ipAddress?: string;            // IPAddress
  subnetMask?: string;           // SubnetMask e.g. 255.255.255.0
  gateway?: string;              // Gateway e.g. 192.168.10.1
  port?: number;                 // Port
  comPort?: string;              // COMPort
  connectionParameters?: string; // ConnectionParameters

  // Operation
  scanMode: ScanMode;            // ScanMode
  triggerMode: ScanMode;         // Alias for scanMode

  // Runtime
  status: DeviceStatus;          // Status
  lastSeen: string;              // LastSeen
  lastPing: string;              // Alias for lastSeen
  firmwareVersion: string;       // FirmwareVersion
  lastError?: string;            // LastError

  // Additional Hardware Telemetry
  batteryLevel?: number;
  signalStrengthDbm?: number;
  antennaCount?: number;
  frequencyBand?: string;
  baudRate?: string;
  lastMaintenance?: string;
  assignedOperator?: string;
  brand?: string;
}

export type DeviceItem = AutoIDDevice;

export interface ScannedLabelData {
  readingSuccess: boolean;
  failureReason?: string;
  
  // 1. Factory Generated RFID Tag Unique ID
  rfidUniqueId: string;
  rfidProtocol: string;
  rfidSignalRssi: string;

  // 2. QR Code 1: Material Code
  qr1MaterialCode: string;

  // 3. QR Code 2: Work Order Number (WO)
  qr2WorkOrderNo: string;

  // Matched FG Configuration from Material Master Data
  matchedFgItem: MasterDataItem | null;

  scannedAt: string;
  deviceId: string;
  deviceName: string;
  isQueued?: boolean;
}

export type FGTransactionStatus = 'WIP' | 'Dispatched';

export interface MarriedTransaction {
  id: string;
  transactionId: string;      // e.g. TXN-20260831-0089
  timestamp: string;
  rfidUniqueId: string;       // Factory RFID Unique ID
  workOrderNo: string;        // 2 QR Code for WO (Work Order No.)
  materialCode: string;       // 1 QR Code for Material Code
  partNumber: string;         // Configured FG Part Number from Master Data
  productName: string;        // Configured FG Description
  category: string;
  mrp: number;
  productImage?: string;
  deviceId: string;
  deviceName: string;
  operatorRole: string;
  status: FGTransactionStatus; // 'WIP' | 'Dispatched'
  wipScanTimestamp?: string;   // Timestamp when WIP scan/marriage occurred
  dispatchScanTimestamp?: string; // Timestamp when outbound dispatch scan occurred
  dbStatus: 'COMMITTED_TO_SQLITE' | 'QUEUED' | 'SYNCED_MES';
  sqliteDatabasePath: string; // "/data/sqlite/wakefit_fg_marriage.db"
  sqliteRecordId: number;
}

export interface ValidationRecord {
  id: string;
  timestamp: string;
  materialCode: string;
  partNumber: string;
  productName: string;
  scannedCode: string;
  scannedVia: 'CIPHER RS38 UHF Reader' | 'Handheld QR/RFID' | 'Fixed RFID Portal' | 'Barcode Scanner' | 'Manual Verification';
  deviceId: string;
  deviceName: string;
  result: 'PASS' | 'FAIL';
  failureReason?: string;
  operatorRole: string;
  lineId: string;
  inspections: {
    materialCodeMatch: boolean;
    partNumberMatch: boolean;
    rfidEpcMatch: boolean;
    weightToleranceCheck: boolean;
    barcodeGradeCheck: boolean;
  };
}

export interface GeneratedLabel {
  id: string;
  serialNumber: string;
  labelId: string;
  materialCode: string;
  partNumber: string;
  productName: string;
  category: string;
  batchNumber: string;
  poNumber: string;
  productionDate: string;
  shift: 'Shift A' | 'Shift B' | 'Shift C' | 'General';
  lineId: string;
  mrp: number;
  dimensions: string;
  weight: string;
  epcHex: string;
  qrPayload: string;
  barcodePayload: string;
  templateType: 'shipping_4x6' | 'box_4x2' | 'rfid_inlay_tag' | 'compact_qr';
  targetPrinter: string;
  printedCopies: number;
  printedByRole: string;
  reprintCount: number;
  packageType?: string;
  createdAt: string;
}

export type ThemeMode = 'light' | 'dark';
