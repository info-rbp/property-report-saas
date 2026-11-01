import React from 'react';

interface ProInspectLogoProps {
  className?: string;
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ProInspectLogo: React.FC<ProInspectLogoProps> = ({
  className = '',
  showTagline = true,
  size = 'md'
}) => {
  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 52 : 38;
  const titleSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  const taglineSize = size === 'sm' ? 'text-[7.5px]' : size === 'lg' ? 'text-[10px]' : 'text-[8.5px]';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Precision Vector Emblem matching user's ProInspect logo */}
      <div className="shrink-0 relative flex items-center justify-center">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible"
        >
          {/* Clipboard behind */}
          <rect x="48" y="22" width="40" height="52" rx="4" stroke="#1e293b" strokeWidth="5" fill="#f8fafc" />
          <path d="M58 18h20v6H58z" fill="#1e293b" rx="2" />
          <path d="M64 15h8v4h-8z" fill="#0f172a" rx="1" />
          {/* Clipboard tick 1 */}
          <path d="M56 34l3 3 7-7" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* Clipboard tick 2 */}
          <path d="M56 46l3 3 7-7" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* Clipboard line */}
          <line x1="70" y1="36" x2="80" y2="36" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="48" x2="80" y2="48" stroke="#334155" strokeWidth="3" strokeLinecap="round" />

          {/* House Roof & Chimney in Deep Navy */}
          <path d="M12 48L42 22l18 15.5v-10h7v16" stroke="#0a2540" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {/* Window in Roof */}
          <rect x="36" y="38" width="5.5" height="5.5" fill="#0a2540" rx="0.5" />
          <rect x="43" y="38" width="5.5" height="5.5" fill="#0a2540" rx="0.5" />
          <rect x="36" y="45" width="5.5" height="5.5" fill="#0a2540" rx="0.5" />
          <rect x="43" y="45" width="5.5" height="5.5" fill="#0a2540" rx="0.5" />

          {/* Teal Magnifying Glass with Checkmark */}
          <circle cx="56" cy="56" r="18" stroke="#0891b2" strokeWidth="6" fill="#ffffff" />
          <path d="M49 56l5 5 10-10" stroke="#0891b2" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Magnifier Handle */}
          <path d="M69 69l15 15" stroke="#0a2540" strokeWidth="7" strokeLinecap="round" />
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col justify-center">
        <div className={`font-black tracking-tight leading-none text-[#0a2540] ${titleSize}`}>
          <span>Pro</span>
          <span className="text-[#1e293b]">Inspect</span>
        </div>
        {showTagline && (
          <span className={`font-extrabold tracking-[0.2em] text-[#0a2540] uppercase mt-1 ${taglineSize}`}>
            INSPECT. REPORT. PROTECT.
          </span>
        )}
      </div>
    </div>
  );
};
