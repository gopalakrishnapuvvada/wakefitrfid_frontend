import React, { useState, useMemo } from 'react';
import { Card, Select, Tag, Tooltip } from 'antd';
import { 
  BarChartOutlined, 
  FilterOutlined, 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useData } from '../../context/DataContext';
import { useAppTheme } from '../../context/ThemeContext';

const { Option } = Select;

// Distinct harmonious color palette for Material Codes
const MATERIAL_COLOR_MAP: Record<string, { color: string; label: string }> = {
  'WAK-MAT-787208': { color: '#E53935', label: 'Orthopaedic King Mattress' },
  'WAK-SOF-NAP-3ST': { color: '#1E3A5F', label: 'Napper 3-Seater Sofa' },
  'WAK-REC-MOT-BRN': { color: '#D97706', label: 'Motorized Single Recliner' },
  'WAK-BED-TEK-QN': { color: '#8B5CF6', label: 'Teak Wood Queen Bed' },
  'WAK-PIL-MEM-STD': { color: '#0284C7', label: 'Cooling Gel Memory Pillow' },
  'WAK-MAT-727206': { color: '#10B981', label: 'Orthopaedic Queen Mattress' },
  'WAK-MAT-756006': { color: '#EC4899', label: 'Dual Comfort Foam Mattress' },
  'WAK-SOF-CHS-3ST': { color: '#6366F1', label: 'Chesterfield Velvet Sofa' },
};

const DEFAULT_COLOR = '#64748B';

export const SevenDayStackedTransactionsChart: React.FC = () => {
  const { marriedTransactions, masterData } = useData();
  const { isDark } = useAppTheme();

  // Selected Material Code Filter ('ALL' for all stacked material codes)
  const [selectedMaterial, setSelectedMaterial] = useState<string>('ALL');

  // List of distinct material codes from master data and married transactions
  const availableMaterialCodes = useMemo(() => {
    const codes = new Set<string>();
    masterData.forEach(item => {
      if (item.materialCode) codes.add(item.materialCode);
    });
    marriedTransactions.forEach(item => {
      if (item.materialCode) codes.add(item.materialCode);
    });
    return Array.from(codes);
  }, [masterData, marriedTransactions]);

  // Generate 7 Days data array ending on today
  const sevenDayData = useMemo(() => {
    const days: {
      dateStr: string;        // '2026-08-31'
      displayDate: string;    // '31 Aug'
      dayName: string;        // 'Mon'
      isToday: boolean;
      materialCounts: Record<string, number>;
      totalTransactions: number;
    }[] = [];

    // Pre-calculated realistic baseline distribution per day for rich multi-day trends
    const baselineDistribution: Record<number, Record<string, number>> = {
      6: { 'WAK-MAT-787208': 68, 'WAK-SOF-NAP-3ST': 45, 'WAK-REC-MOT-BRN': 32, 'WAK-BED-TEK-QN': 28, 'WAK-PIL-MEM-STD': 25, 'WAK-MAT-727206': 18 },
      5: { 'WAK-MAT-787208': 74, 'WAK-SOF-NAP-3ST': 52, 'WAK-REC-MOT-BRN': 38, 'WAK-BED-TEK-QN': 31, 'WAK-PIL-MEM-STD': 29, 'WAK-MAT-727206': 22 },
      4: { 'WAK-MAT-787208': 82, 'WAK-SOF-NAP-3ST': 58, 'WAK-REC-MOT-BRN': 41, 'WAK-BED-TEK-QN': 36, 'WAK-PIL-MEM-STD': 34, 'WAK-MAT-727206': 26 },
      3: { 'WAK-MAT-787208': 65, 'WAK-SOF-NAP-3ST': 48, 'WAK-REC-MOT-BRN': 30, 'WAK-BED-TEK-QN': 25, 'WAK-PIL-MEM-STD': 20, 'WAK-MAT-727206': 15 },
      2: { 'WAK-MAT-787208': 89, 'WAK-SOF-NAP-3ST': 62, 'WAK-REC-MOT-BRN': 45, 'WAK-BED-TEK-QN': 40, 'WAK-PIL-MEM-STD': 38, 'WAK-MAT-727206': 30 },
      1: { 'WAK-MAT-787208': 94, 'WAK-SOF-NAP-3ST': 67, 'WAK-REC-MOT-BRN': 48, 'WAK-BED-TEK-QN': 44, 'WAK-PIL-MEM-STD': 42, 'WAK-MAT-727206': 33 },
      0: { 'WAK-MAT-787208': 78, 'WAK-SOF-NAP-3ST': 56, 'WAK-REC-MOT-BRN': 42, 'WAK-BED-TEK-QN': 38, 'WAK-PIL-MEM-STD': 32, 'WAK-MAT-727206': 25 },
    };

    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day');
      const dateStr = d.format('YYYY-MM-DD');
      const displayDate = d.format('DD MMM');
      const dayName = d.format('ddd');
      const isToday = i === 0;

      // Start with baseline counts
      const counts: Record<string, number> = { ...(baselineDistribution[i] || {}) };

      // Integrate real-time live married transactions into the matching day's bucket
      marriedTransactions.forEach(txn => {
        const txnDate = txn.timestamp.split(' ')[0];
        if (txnDate === dateStr && txn.materialCode) {
          counts[txn.materialCode] = (counts[txn.materialCode] || 0) + 1;
        }
      });

      // Filter by selected material code if one is chosen
      let total = 0;
      if (selectedMaterial === 'ALL') {
        total = Object.values(counts).reduce((sum, v) => sum + v, 0);
      } else {
        total = counts[selectedMaterial] || 0;
      }

      days.push({
        dateStr,
        displayDate,
        dayName,
        isToday,
        materialCounts: counts,
        totalTransactions: total,
      });
    }

    return days;
  }, [marriedTransactions, selectedMaterial]);

  const maxDayValue = useMemo(() => {
    const highest = Math.max(...sevenDayData.map(d => d.totalTransactions), 10);
    // Round up to nice number
    return Math.ceil(highest / 50) * 50;
  }, [sevenDayData]);

  // Chart Y-Axis Scale Marks
  const yTicks = [maxDayValue, Math.round(maxDayValue * 0.75), Math.round(maxDayValue * 0.5), Math.round(maxDayValue * 0.25), 0];

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: '12px',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: '20px' } }}
    >
      {/* Header with Title and Material Code Filter Dropdown */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '16px',
          borderBottom: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: isDark ? '#0f172a' : '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChartOutlined style={{ color: '#E53935', fontSize: '18px' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                Day-wise FG Dispatch Transactions (Last 7 Days)
              </span>
              <Tag color="red" style={{ fontWeight: 700, borderRadius: '12px', fontSize: '10px' }}>
                LIVE TREND
              </Tag>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Finished goods dispatch transactions breakdown across material codes.
            </div>
          </div>
        </div>

        {/* Filter by Material Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FilterOutlined style={{ color: '#0284C7', fontSize: '14px' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>
              Filter by Material Code:
            </span>
          </div>

          <Select
            value={selectedMaterial}
            onChange={setSelectedMaterial}
            style={{ width: 280 }}
            dropdownStyle={{ minWidth: 320 }}
          >
            <Option value="ALL">
              <strong>All Material Codes (Stacked View)</strong>
            </Option>
            {availableMaterialCodes.map(code => {
              const meta = MATERIAL_COLOR_MAP[code] || { color: DEFAULT_COLOR, label: code };
              return (
                <Option key={code} value={code}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '2px',
                        backgroundColor: meta.color,
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{code}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>({meta.label})</span>
                  </div>
                </Option>
              );
            })}
          </Select>
        </div>
      </div>

      {/* Main Stacked Bar Chart Graphic */}
      <div
        style={{
          position: 'relative',
          height: '420px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '10px 10px 0 45px',
        }}
      >
        {/* Y-Axis Grid Lines & Tick Labels */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: '42px',
            left: 0,
            right: 0,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {yTicks.map((val, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                borderBottom: idx === yTicks.length - 1 
                  ? `1.5px solid ${isDark ? '#475569' : '#cbd5e1'}` 
                  : `1px dashed ${isDark ? '#334155' : '#e2e8f0'}`,
              }}
            >
              <span
                style={{
                  width: '40px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: isDark ? '#64748b' : '#94a3b8',
                  textAlign: 'right',
                  paddingRight: '6px',
                }}
              >
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* 7 Columns for Days */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'flex-end',
            height: '360px',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {sevenDayData.map(day => {
            const barHeightPct = maxDayValue > 0 ? Math.min(100, (day.totalTransactions / maxDayValue) * 100) : 0;
            
            // Build detailed tooltip content
            const tooltipContent = (
              <div style={{ padding: '4px', minWidth: '220px' }}>
                <div style={{ fontWeight: 800, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{day.dayName}, {day.displayDate} {day.isToday && '(Today)'}</span>
                  <Tag color="red" style={{ margin: 0, fontSize: '10px' }}>{day.totalTransactions} Total</Tag>
                </div>
                <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedMaterial === 'ALL' ? (
                    Object.entries(day.materialCounts).map(([mat, count]) => {
                      const meta = MATERIAL_COLOR_MAP[mat] || { color: DEFAULT_COLOR, label: mat };
                      const pct = day.totalTransactions > 0 ? Math.round((count / day.totalTransactions) * 100) : 0;
                      return (
                        <div key={mat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: meta.color }} />
                            <span>{mat}</span>
                          </div>
                          <strong>{count} ({pct}%)</strong>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{selectedMaterial}:</span>
                      <strong>{day.totalTransactions} units</strong>
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <Tooltip key={day.dateStr} title={tooltipContent} color="#0f172a">
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    cursor: 'pointer',
                    width: `${100 / 8}%`,
                    maxWidth: '68px',
                  }}
                >
                  {/* Total Number Label on Top of the Bar */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: day.isToday ? '#E53935' : isDark ? '#cbd5e1' : '#334155',
                      marginBottom: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {day.totalTransactions}
                  </span>

                  {/* The Stacked Bar Column */}
                  <div
                    style={{
                      width: '100%',
                      height: `${barHeightPct}%`,
                      minHeight: day.totalTransactions > 0 ? '6px' : '0px',
                      borderRadius: '6px 6px 2px 2px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      boxShadow: day.isToday ? '0 4px 12px rgba(229, 57, 53, 0.3)' : '0 2px 6px rgba(0,0,0,0.06)',
                      border: day.isToday ? '1.5px solid #E53935' : `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    {selectedMaterial === 'ALL' ? (
                      // Stacked Segments
                      Object.entries(day.materialCounts).map(([mat, count]) => {
                        const segHeightPct = day.totalTransactions > 0 ? (count / day.totalTransactions) * 100 : 0;
                        const meta = MATERIAL_COLOR_MAP[mat] || { color: DEFAULT_COLOR, label: mat };
                        return (
                          <div
                            key={mat}
                            style={{
                              height: `${segHeightPct}%`,
                              width: '100%',
                              backgroundColor: meta.color,
                              borderTop: `0.5px solid rgba(255,255,255,0.25)`,
                              transition: 'height 0.3s ease',
                            }}
                          />
                        );
                      })
                    ) : (
                      // Single Selected Material Bar
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          backgroundColor: MATERIAL_COLOR_MAP[selectedMaterial]?.color || '#E53935',
                        }}
                      />
                    )}
                  </div>

                  {/* X-Axis Date & Day Label */}
                  <div
                    style={{
                      marginTop: '8px',
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: day.isToday ? 800 : 600,
                        color: day.isToday ? '#E53935' : isDark ? '#f8fafc' : '#0f172a',
                      }}
                    >
                      {day.displayDate}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {day.dayName}
                    </div>
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default SevenDayStackedTransactionsChart;
