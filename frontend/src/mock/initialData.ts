import type { MasterDataItem, DeviceItem, ValidationRecord, GeneratedLabel, RoleInfo, MarriedTransaction } from '../types';

export const INITIAL_ROLES: RoleInfo[] = [
  {
    id: 'admin',
    name: 'System Administrator',
    badgeTitle: 'Admin',
    description: 'Full administrative access: Master Data, Device Management, and Role Administration with password control.',
    color: '#D32F2F',
    icon: 'SafetyCertificateOutlined',
    password: 'admin',
    permissions: {
      canViewDashboard: true,
      canValidateProducts: true,
      canOverrideValidation: true,
      canGenerateLabels: true,
      canBatchPrint: true,
      canReprintLabels: true,
      canManageConfiguration: true,
      canManageMasterData: true,
      canManageDevices: true,
      canAdministerRoles: true,
    }
  },
  {
    id: 'supervisor',
    name: 'Production Supervisor',
    badgeTitle: 'Supervisor',
    description: 'Shop floor supervisor for product validations, label printing, and batch execution.',
    color: '#0284C7',
    icon: 'ControlOutlined',
    password: 'supervisor',
    permissions: {
      canViewDashboard: true,
      canValidateProducts: true,
      canOverrideValidation: true,
      canGenerateLabels: true,
      canBatchPrint: true,
      canReprintLabels: true,
      canManageConfiguration: false,
      canManageMasterData: false,
      canManageDevices: false,
      canAdministerRoles: false,
    }
  },
  {
    id: 'operator',
    name: 'Line Operator',
    badgeTitle: 'Operator',
    description: 'Dedicated shop floor terminal access restricted strictly to FG Product Barcode & RFID Validation.',
    color: '#10B981',
    icon: 'BarcodeOutlined',
    password: 'operator',
    permissions: {
      canViewDashboard: false,
      canValidateProducts: true,
      canOverrideValidation: false,
      canGenerateLabels: false,
      canBatchPrint: false,
      canReprintLabels: false,
      canManageConfiguration: false,
      canManageMasterData: false,
      canManageDevices: false,
      canAdministerRoles: false,
    }
  }
];

// Empty initial arrays for dynamic backend API synchronization
export const INITIAL_MASTER_DATA: MasterDataItem[] = [];
export const INITIAL_DEVICES: DeviceItem[] = [];
export const INITIAL_VALIDATIONS: ValidationRecord[] = [];
export const INITIAL_LABELS: GeneratedLabel[] = [];
export const INITIAL_MARRIED_TRANSACTIONS: MarriedTransaction[] = [];
