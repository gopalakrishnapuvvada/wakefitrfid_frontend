import React from 'react';

interface UaimLogoProps {
  size?: 'small' | 'medium' | 'large' | 'huge';
  showText?: boolean;
  textColor?: string;
  poweredBy?: boolean;
  className?: string;
}

export const UaimLogo: React.FC<UaimLogoProps> = ({
  size = 'medium',
  showText = true,
  poweredBy = false,
  className = '',
}) => {
  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 28;
      case 'medium':
        return 40;
      case 'large':
        return 56;
      case 'huge':
        return 80;
      default:
        return 40;
    }
  };

  const iconPx = getIconSize();

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      {/* High-res UAIM Logo Image with SVG fallback */}
      <img
        src="/uaim-logo.png"
        alt="UAIM Logo"
        style={{
          width: `${iconPx}px`,
          height: `${iconPx}px`,
          objectFit: 'contain',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
        }}
        onError={(e) => {
          // Fallback to stylized SVG if PNG not available
          e.currentTarget.style.display = 'none';
        }}
      />

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          {poweredBy && (
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.75, fontWeight: 600 }}>
              Powered by
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                fontSize: size === 'huge' ? '28px' : size === 'large' ? '22px' : size === 'medium' ? '18px' : '15px',
                fontWeight: 800,
                letterSpacing: '1.5px',
                fontFamily: `'Outfit', sans-serif`,
              }}
            >
              U<span style={{ color: '#E53935' }}>A</span>IM
            </span>
            <span
              style={{
                fontSize: size === 'huge' ? '12px' : '10px',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: '4px',
                backgroundColor: '#1E3A5F',
                color: '#ffffff',
                letterSpacing: '0.5px',
                marginLeft: '4px',
              }}
            >
              TECH
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
