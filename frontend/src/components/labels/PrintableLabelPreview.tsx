import React, { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { Tag } from 'antd';
import type { GeneratedLabel } from '../../types';

interface PrintableLabelPreviewProps {
  label: Partial<GeneratedLabel>;
  scale?: number;
  showBorder?: boolean;
}

export const PrintableLabelPreview: React.FC<PrintableLabelPreviewProps> = ({
  label,
  scale = 1,
  showBorder = true,
}) => {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  const barcodeValue = label.barcodePayload || label.materialCode || 'WAK7872080104';
  const qrValue = label.qrPayload || `WAKEFIT|${label.materialCode}|${label.partNumber}|${label.serialNumber}|UAIM`;

  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: 'CODE128',
          width: 1.6,
          height: 48,
          displayValue: true,
          fontSize: 11,
          font: 'monospace',
          textMargin: 2,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.warn('JsBarcode rendering fallback:', err);
      }
    }
  }, [barcodeValue, label.templateType]);

  const template = label.templateType || 'shipping_4x6';

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        transition: 'transform 0.2s ease',
      }}
    >
      {template === 'shipping_4x6' && (
        <div
          id="printable-label"
          style={{
            width: '384px',
            minHeight: '576px',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '16px',
            fontFamily: `'Inter', 'Arial', sans-serif`,
            border: showBorder ? '2px dashed #94a3b8' : 'none',
            borderRadius: '4px',
            boxShadow: showBorder ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ borderBottom: '2px solid #111827', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.5px', color: '#1E3A5F' }}>
                    wakefit<span style={{ color: '#E53935' }}>.</span>
                  </span>
                  <Tag color="#1E3A5F" style={{ fontSize: '10px', fontWeight: 700, margin: 0, padding: '0 4px' }}>
                    FG UNIT
                  </Tag>
                </div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#64748b' }}>
                  Finished Goods Identification
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <img
                  src="/uaim-logo.png"
                  alt="UAIM"
                  style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div style={{ lineHeight: 1.1 }}>
                  <div style={{ fontSize: '8px', color: '#64748b', fontWeight: 600 }}>POWERED BY</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E3A5F' }}>
                    U<span style={{ color: '#E53935' }}>A</span>IM
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#334155',
              }}
            >
              <span>📡 EPC RFID Gen2: {label.epcHex || '3074257BF419DC0000000068'}</span>
              <span style={{ color: '#10B981', fontWeight: 700 }}>● ENCODED</span>
            </div>
          </div>

          <div style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Product Description
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginTop: '2px' }}>
              {label.productName || 'Orthopaedic Memory Foam Mattress (King - 78x72x8)'}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              padding: '8px 0',
              borderBottom: '1px solid #e2e8f0',
              fontSize: '11px',
            }}
          >
            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                Material Code
              </span>
              <strong style={{ fontSize: '12px', color: '#0f172a' }}>{label.materialCode || 'WAK-MAT-787208'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                Part Number
              </span>
              <strong style={{ fontSize: '12px', color: '#0f172a' }}>{label.partNumber || 'FG-ORT-KNG-08'}</strong>
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                Batch / PO No
              </span>
              <span>{label.batchNumber || 'BATCH-2026-0831'} / {label.poNumber || 'PO-99214'}</span>
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                MFG Date / Shift
              </span>
              <span>{label.productionDate || '2026-08-31'} ({label.shift || 'Shift A'})</span>
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                Dimensions (LxWxH)
              </span>
              <span>{label.dimensions || '1981 x 1828 x 203 mm'}</span>
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                Net Weight
              </span>
              <span>{label.weight || '28.50 KG'}</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '2px solid #111827',
            }}
          >
            <div>
              <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Manufacturing Serial Number
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '-0.3px' }}>
                {label.serialNumber || 'SN-WAK-26083100104'}
              </div>
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>
                Package: <strong style={{ color: '#0f172a' }}>{label.packageType || 'Rolled Vacuum Box'}</strong> • QA: <strong style={{ color: '#10B981' }}>VERIFIED</strong>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '4px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <QRCodeSVG
                value={qrValue}
                size={84}
                level="M"
                includeMargin={false}
              />
              <span style={{ fontSize: '7px', fontWeight: 700, color: '#64748b', marginTop: '2px' }}>
                SCAN 2D PASS
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'center', paddingTop: '6px' }}>
            <svg ref={barcodeRef} style={{ maxWidth: '100%', height: '56px' }}></svg>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '8px',
                color: '#64748b',
                marginTop: '4px',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '3px',
              }}
            >
              <span>Label ID: {label.labelId || 'LBL-2026-0831-0104'}</span>
              <span>Station: {label.lineId || 'Line 1 - Final Pack'}</span>
              <span>UAIM SmartTrack™</span>
            </div>
          </div>
        </div>
      )}

      {template === 'box_4x2' && (
        <div
          id="printable-label"
          style={{
            width: '384px',
            minHeight: '192px',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '12px',
            fontFamily: `'Inter', 'Arial', sans-serif`,
            border: showBorder ? '2px dashed #94a3b8' : 'none',
            borderRadius: '4px',
            boxShadow: showBorder ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#1E3A5F' }}>
              wakefit<span style={{ color: '#E53935' }}>.</span> (OUTER CARTON)
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#0284C7' }}>
              LOGISTICS PACK
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 800 }}>{label.productName || 'Pure Memory Foam Pillow'}</div>
              <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                Code: <strong>{label.materialCode || 'WAK-PIL-MEM-002'}</strong> | Part: <strong>{label.partNumber || 'FG-ACC-MEM-PIL'}</strong>
              </div>
              <div style={{ fontSize: '8px', color: '#64748b' }}>
                SN: {label.serialNumber || 'SN-WAK-26083100100'} | {label.batchNumber || 'BATCH-2026-A'}
              </div>
            </div>

            <QRCodeSVG value={qrValue} size={50} level="M" />
          </div>

          <div style={{ textAlign: 'center' }}>
            <svg ref={barcodeRef} style={{ maxWidth: '100%', height: '38px' }}></svg>
          </div>
        </div>
      )}

      {template === 'rfid_inlay_tag' && (
        <div
          id="printable-label"
          style={{
            width: '320px',
            minHeight: '160px',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '10px',
            fontFamily: `'Inter', 'Arial', sans-serif`,
            border: showBorder ? '2px dashed #94a3b8' : 'none',
            borderRadius: '4px',
            boxShadow: showBorder ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)' : 'none',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E3A5F', color: '#fff', padding: '3px 6px', borderRadius: '3px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800 }}>📡 RFID SMART INLAY (EPC GEN2)</span>
            <span style={{ fontSize: '9px', color: '#10B981', fontWeight: 700 }}>● ENCODED</span>
          </div>

          <div style={{ margin: '6px 0', fontSize: '10px' }}>
            <div style={{ fontWeight: 800 }}>{label.materialCode} - {label.partNumber}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#E53935', wordBreak: 'break-all', marginTop: '2px' }}>
              HEX: {label.epcHex || '3074257BF419DC0000000068'}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <svg ref={barcodeRef} style={{ maxWidth: '100%', height: '36px' }}></svg>
          </div>
        </div>
      )}

      {template === 'compact_qr' && (
        <div
          id="printable-label"
          style={{
            width: '192px',
            minHeight: '192px',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '8px',
            fontFamily: `'Inter', 'Arial', sans-serif`,
            border: showBorder ? '2px dashed #94a3b8' : 'none',
            borderRadius: '4px',
            boxShadow: showBorder ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#1E3A5F', marginBottom: '4px' }}>
            wakefit. FG QR
          </div>
          <QRCodeSVG value={qrValue} size={90} level="M" />
          <div style={{ fontSize: '9px', fontWeight: 700, marginTop: '4px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label.materialCode}
          </div>
          <div style={{ fontSize: '8px', color: '#64748b' }}>
            {label.serialNumber?.substring(0, 16)}
          </div>
        </div>
      )}
    </div>
  );
};
