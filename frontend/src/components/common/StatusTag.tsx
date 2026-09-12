import React from 'react';
import { Tag, Tooltip } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  WifiOutlined,
  DisconnectOutlined
} from '@ant-design/icons';
import type { DeviceStatus } from '../../types';

export const DeviceStatusTag: React.FC<{ status: DeviceStatus; showTooltip?: boolean }> = ({ status, showTooltip = true }) => {
  switch (status) {
    case 'online': {
      const tag = (
        <Tag color="success" icon={<WifiOutlined />} style={{ borderRadius: '12px', padding: '1px 10px', fontWeight: 600 }}>
          ONLINE
        </Tag>
      );
      return showTooltip ? (
        <Tooltip title="🟢 Online: Device is reachable and communicating normally">
          {tag}
        </Tooltip>
      ) : tag;
    }

    case 'offline': {
      const tag = (
        <Tag color="default" icon={<DisconnectOutlined />} style={{ borderRadius: '12px', padding: '1px 10px', fontWeight: 600 }}>
          OFFLINE
        </Tag>
      );
      return showTooltip ? (
        <Tooltip title="⚫ Offline: Device is not reachable / communication lost">
          {tag}
        </Tooltip>
      ) : tag;
    }

    case 'error': {
      const tag = (
        <Tag color="error" icon={<CloseCircleOutlined />} style={{ borderRadius: '12px', padding: '1px 10px', fontWeight: 600 }}>
          ERROR
        </Tag>
      );
      return showTooltip ? (
        <Tooltip title="🔴 Error: Device is reachable, but reports a fault or cannot perform its intended function">
          {tag}
        </Tooltip>
      ) : tag;
    }

    default:
      return <Tag>{status}</Tag>;
  }
};

export const ValidationResultTag: React.FC<{ result: 'PASS' | 'FAIL' }> = ({ result }) => {
  if (result === 'PASS') {
    return (
      <Tag 
        color="success" 
        icon={<CheckCircleOutlined />} 
        style={{ 
          fontSize: '13px', 
          fontWeight: 700, 
          padding: '3px 12px', 
          borderRadius: '6px',
          letterSpacing: '0.5px' 
        }}
      >
        PASS
      </Tag>
    );
  }
  return (
    <Tag 
      color="error" 
      icon={<CloseCircleOutlined />} 
      style={{ 
        fontSize: '13px', 
        fontWeight: 700, 
        padding: '3px 12px', 
        borderRadius: '6px',
        letterSpacing: '0.5px' 
      }}
    >
      MISMATCH
    </Tag>
  );
};
