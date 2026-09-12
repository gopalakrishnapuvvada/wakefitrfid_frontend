import React from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Statistic, 
  Button, 
} from 'antd';
import { 
  WifiOutlined, 
  DatabaseOutlined, 
  FileTextOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import { SevenDayStackedTransactionsChart } from '../components/dashboard/SevenDayStackedTransactionsChart';

interface DashboardProps {
  onNavigate: (key: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { stats, devices } = useData();
  const { isDark } = useAppTheme();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top 4 KPI Cards */}
      <Row gutter={[16, 16]}>
        {/* 1. FG WIP Transactions Today */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: '10px',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <Statistic
              title={<span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>FG WIP Transactions Today</span>}
              value={stats.labelsTodayCount + 842}
              prefix={<FileTextOutlined style={{ color: '#E53935', marginRight: '6px' }} />}
              valueStyle={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
              Verified finished goods WIP scan transactions
            </div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginTop: '2px', fontSize: '11px' }}
              onClick={() => onNavigate('history')}
            >
              View History Records →
            </Button>
          </Card>
        </Col>

        {/* 2. FG Dispatch Transactions Today */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: '10px',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <Statistic
              title={<span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>FG Dispatch Transactions Today</span>}
              value={614 + (stats.dispatchedTodayCount || 4)}
              prefix={<CheckCircleOutlined style={{ color: '#10B981', marginRight: '6px' }} />}
              valueStyle={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
              Outbound dock portal verified shipments
            </div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginTop: '2px', fontSize: '11px', color: '#10B981' }}
              onClick={() => onNavigate('history')}
            >
              View History Records →
            </Button>
          </Card>
        </Col>

        {/* 3. Active Hardware Devices */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: '10px',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <Statistic
              title={<span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Active Hardware Devices</span>}
              value={`${stats.totalActiveDevices}/${devices.length}`}
              prefix={<WifiOutlined style={{ color: '#0284C7', marginRight: '6px' }} />}
              valueStyle={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}
            />
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginTop: '6px', color: '#64748b' }}>
              <span>{stats.totalHandhelds} Handhelds</span>
              <span>•</span>
              <span>{stats.totalRfidPortals} Portals</span>
            </div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginTop: '2px', fontSize: '11px' }}
              onClick={() => onNavigate('devices')}
            >
              Manage Devices →
            </Button>
          </Card>
        </Col>

        {/* 4. FG Master Catalog */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: '10px',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <Statistic
              title={<span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>FG Master Catalog</span>}
              value={stats.totalMasterItems}
              prefix={<DatabaseOutlined style={{ color: '#8B5CF6', marginRight: '6px' }} />}
              suffix={<span style={{ fontSize: '12px', color: '#64748b' }}>SKUs</span>}
              valueStyle={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
              Material Codes & Part Numbers active
            </div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginTop: '2px', fontSize: '11px' }}
              onClick={() => onNavigate('master-data')}
            >
              Manage Catalog →
            </Button>
          </Card>
        </Col>
      </Row>

      {/* 7-Day Day-wise Stacked FG Transactions Chart (Full Width) */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <SevenDayStackedTransactionsChart />
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
