import React from 'react';
import { Tag, Select, Button, Tooltip } from 'antd';
import { 
  WifiOutlined, 
  CheckCircleFilled, 
  RadarChartOutlined, 
  BarcodeOutlined,
  ClockCircleOutlined 
} from '@ant-design/icons';
import { useAppTheme } from '../../context/ThemeContext';
import type { MasterDataItem } from '../../types';

export type SickScanPhase = 'idle' | 'conveyor_moving' | 'reading_success' | 'completed';

interface ConveyorAnimationProps {
  currentProduct: MasterDataItem;
  rfidTag: string;
  scanPhase: SickScanPhase;
  countdown?: number;
  displayDuration?: number;
  onResetToStandby?: () => void;
  onChangeDuration?: (seconds: number) => void;
}

export const ConveyorAnimation: React.FC<ConveyorAnimationProps> = ({
  currentProduct,
  rfidTag,
  scanPhase,
  countdown,
  displayDuration,
  onResetToStandby,
  onChangeDuration,
}) => {
  const { isDark } = useAppTheme();
  const isDetected = scanPhase === 'reading_success';

  return (
    <div
      style={{
        borderRadius: '12px',
        backgroundColor: isDark ? '#0f172a' : '#1e293b',
        border: `1px solid ${isDark ? '#334155' : '#334155'}`,
        color: '#f8fafc',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      }}
    >
      {/* Clean Keyframe Animations: Orange Blinking vs Green Steady */}
      <style>{`
        @keyframes sickOrangeBlink {
          0%, 100% {
            background-color: #F97316;
            box-shadow: 0 0 25px rgba(249, 115, 22, 0.95), 0 0 50px rgba(249, 115, 22, 0.5);
            border-color: #EA580C;
            color: #ffffff;
          }
          50% {
            background-color: #7C2D12;
            box-shadow: 0 0 6px rgba(249, 115, 22, 0.2);
            border-color: #9A3412;
            color: #fed7aa;
          }
        }
        @keyframes rfWaveOrange {
          0% {
            opacity: 0.8;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.2;
            transform: scale(1.05);
          }
          100% {
            opacity: 0.8;
            transform: scale(0.95);
          }
        }
        @keyframes popIn {
          0% {
            transform: scale(0.96);
            opacity: 0.6;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

      {/* Top Telemetry Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Real-time Hardware LED status indicator */}
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isDetected ? '#F97316' : '#10B981',
              boxShadow: isDetected 
                ? '0 0 16px #F97316' 
                : '0 0 8px #10B981',
              animation: isDetected ? 'sickOrangeBlink 0.35s infinite' : 'none',
            }}
          />
          <span style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '0.5px', color: '#f8fafc' }}>
            SICK RFU630-13100 FIXED RFID READER
          </span>
        </div>

        {/* Status Mode Badge & Duration Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Duration Selector */}
          {onChangeDuration && displayDuration !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Tooltip title="Configure how long scanned carton details remain visible before returning to standby">
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ClockCircleOutlined style={{ color: '#38bdf8' }} /> Hold Time:
                </span>
              </Tooltip>
              <Select
                size="small"
                value={displayDuration}
                onChange={onChangeDuration}
                style={{ width: 135 }}
                options={[
                  { value: 10, label: '10 Seconds' },
                  { value: 15, label: '15 Seconds' },
                  { value: 20, label: '20 Seconds' },
                  { value: 30, label: '30 Seconds' },
                  { value: 60, label: '60 Seconds' },
                  { value: 0, label: 'Until Next Scan' },
                ]}
              />
            </div>
          )}

          {/* Mode Badge */}
          <div
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isDetected ? 'rgba(249, 115, 22, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${isDetected ? '#F97316' : '#10B981'}`,
              color: isDetected ? '#FB923C' : '#34D399',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isDetected ? '#F97316' : '#10B981',
                animation: isDetected ? 'sickOrangeBlink 0.35s infinite' : 'none',
              }}
            />
            {isDetected ? (
              <span>
                ORANGE BLINKING (FG DETECTED)
                {countdown !== undefined && countdown > 0 && (
                  <span style={{ marginLeft: '6px', color: '#fed7aa', fontWeight: 700 }}>
                    ({countdown}s remaining)
                  </span>
                )}
                {displayDuration === 0 && (
                  <span style={{ marginLeft: '6px', color: '#38bdf8', fontWeight: 700 }}>
                    (HOLD)
                  </span>
                )}
              </span>
            ) : (
              'GREEN STEADY (NO FG DETECTED)'
            )}
          </div>

          {/* Standby Now Button */}
          {isDetected && onResetToStandby && (
            <Button
              size="small"
              onClick={onResetToStandby}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#f8fafc',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderColor: 'rgba(255,255,255,0.25)',
                borderRadius: '12px',
                height: '24px',
                padding: '0 10px',
              }}
            >
              Standby Now
            </Button>
          )}
        </div>
      </div>

      {/* Main SICK Reader & Detection Bay Viewport */}
      <div
        style={{
          marginTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 320px) 1fr',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* Left Column: SICK RFU630 Hardware Module Panel */}
        <div
          style={{
            backgroundColor: '#0b1120',
            borderRadius: '10px',
            border: '1px solid #1e293b',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle Industrial Grid Background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
              `,
              backgroundSize: '16px 16px',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.8px' }}>
                DEVICE HARDWARE
              </span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#38bdf8' }}>
                IP: 192.168.1.140
              </span>
            </div>

            {/* SICK Hardware Visual Bar */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: `2px solid ${isDetected ? '#EA580C' : '#059669'}`,
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: isDetected 
                  ? '0 0 20px rgba(249, 115, 22, 0.4)' 
                  : '0 0 10px rgba(16, 185, 129, 0.2)',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <WifiOutlined style={{ fontSize: '20px', color: isDetected ? '#F97316' : '#10B981' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff', letterSpacing: '0.5px' }}>
                    SICK RFU630
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    UHF RFID Port 1
                  </div>
                </div>
              </div>

              {/* Hardware LED Light Bank */}
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontWeight: 900,
                  fontSize: '11px',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isDetected ? '#F97316' : '#10B981',
                  color: '#ffffff',
                  border: `1px solid ${isDetected ? '#EA580C' : '#059669'}`,
                  boxShadow: isDetected 
                    ? '0 0 18px rgba(249, 115, 22, 0.9)' 
                    : '0 0 10px rgba(16, 185, 129, 0.4)',
                  animation: isDetected ? 'sickOrangeBlink 0.35s infinite' : 'none',
                }}
              >
                <span>{isDetected ? '⚡ SCAN' : 'READY'}</span>
              </div>
            </div>
          </div>

          {/* SICK Diagnostic Channels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Power LED</div>
              <div style={{ color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                Steady Green
              </div>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Scan Status LED</div>
              <div style={{ color: isDetected ? '#F97316' : '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: isDetected ? '#F97316' : '#10B981',
                    animation: isDetected ? 'sickOrangeBlink 0.35s infinite' : 'none'
                  }} 
                />
                {isDetected ? 'Orange Blinking' : 'Green Steady'}
              </div>
            </div>
          </div>

          {/* Reader Protocol Summary */}
          <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Frequency:</span>
              <strong style={{ color: '#f8fafc' }}>865-868 MHz (EU/IN)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <span>Continuous Read Rate:</span>
              <strong style={{ color: '#38bdf8' }}>Autonomous Poll</strong>
            </div>
          </div>
        </div>

        {/* Right Column: Active Detection Zone & Live FG View */}
        <div
          style={{
            backgroundColor: '#0b1120',
            borderRadius: '10px',
            border: `1px solid ${isDetected ? '#F97316' : '#1e293b'}`,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '180px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 0.3s ease',
          }}
        >
          {/* SICK RF Signal Wave Halo Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isDetected
                ? 'radial-gradient(ellipse at 50% 20%, rgba(249, 115, 22, 0.18) 0%, transparent 70%)'
                : 'radial-gradient(ellipse at 50% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
              animation: isDetected ? 'rfWaveOrange 1s infinite' : 'none',
            }}
          />

          {isDetected ? (
            /* STATE A: FG Detected (Scan Event Triggered) -> Clean FG Card Display */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '18px',
                flexWrap: 'wrap',
                animation: 'popIn 0.25s ease-out',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {/* Product Image with Embedded RFID Inlay Badge */}
              <div
                style={{
                  position: 'relative',
                  width: '110px',
                  height: '110px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '2px solid #F97316',
                  boxShadow: '0 0 20px rgba(249, 115, 22, 0.5)',
                  flexShrink: 0,
                  backgroundColor: '#1e293b',
                }}
              >
                <img
                  src={(Array.isArray(currentProduct?.fgImage) ? currentProduct.fgImage[0] : currentProduct?.fgImage) || currentProduct?.images?.[0] || '/images/no_image.svg'}
                  alt={currentProduct?.productName || 'FG Item'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    backgroundColor: '#F97316',
                    color: '#ffffff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 800,
                    boxShadow: '0 0 8px #F97316',
                  }}
                >
                  RFID INLAY
                </div>
              </div>

              {/* Detected Finished Good Identification Details */}
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <Tag color="orange" style={{ fontWeight: 800, margin: 0, fontSize: '11px', animation: 'sickOrangeBlink 0.35s infinite' }}>
                    <CheckCircleFilled /> FG DETECTED
                  </Tag>
                  {countdown !== undefined && countdown > 0 && (
                    <Tag color="volcano" style={{ fontWeight: 700, margin: 0, fontSize: '11px' }}>
                      <ClockCircleOutlined /> Active ({countdown}s)
                    </Tag>
                  )}
                  {displayDuration === 0 && (
                    <Tag color="blue" style={{ fontWeight: 700, margin: 0, fontSize: '11px' }}>
                      Hold Until Next Scan
                    </Tag>
                  )}
                  <Tag color="#E53935" style={{ fontWeight: 700, margin: 0, fontSize: '11px', fontFamily: 'monospace' }}>
                    {currentProduct?.materialCode || 'WAK-MAT-787208'}
                  </Tag>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Part: <strong style={{ color: '#f8fafc' }}>{currentProduct?.partNumber || 'FG-ORT-KNG'}</strong>
                  </span>
                </div>

                <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
                  {currentProduct?.productDescription || currentProduct?.productName || 'Wakefit Orthopaedic Memory Foam Mattress'}
                </div>

                {/* RFID EPC & Transmission Stats Bar */}
                <div
                  style={{
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    border: '1px solid rgba(249, 115, 22, 0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BarcodeOutlined style={{ color: '#F97316' }} />
                    <span style={{ color: '#94a3b8' }}>EPC:</span>
                    <strong style={{ color: '#fed7aa', fontFamily: 'monospace' }}>{rfidTag}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span>Status: <Tag color="green" style={{ margin: 0, fontWeight: 700, borderRadius: '4px', fontSize: '10px' }}>Dispatch</Tag></span>
                    <span>Confidence: <strong style={{ color: '#38bdf8' }}>99.8%</strong></span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STATE B: No FG Detected (Continuous Scan Standby) -> Minimalist Clean Listening Bay */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '24px 16px',
                border: '2px dashed rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.03)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                  color: '#10B981',
                  fontSize: '20px',
                  boxShadow: '0 0 14px rgba(16, 185, 129, 0.3)',
                }}
              >
                <RadarChartOutlined />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', marginBottom: '2px' }}>
                SICK RFID Portal Listening in Continuous Scan Mode
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '420px' }}>
                <span style={{ color: '#10B981', fontWeight: 700 }}>Green Steady:</span> No Finished Good currently in reader antenna field. Ready for passing tags.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConveyorAnimation;
