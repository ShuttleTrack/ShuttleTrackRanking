import React from 'react';

type GameLoaderSize = 'sm' | 'md' | 'lg';

const sizePx: Record<GameLoaderSize, number> = {
  sm: 20,
  md: 32,
  lg: 64,
};

type GameLoaderProps = {
  size?: GameLoaderSize;
  label: string;
  caption?: boolean;
  className?: string;
  /** Row layout for buttons and compact rows (no caption). */
  inline?: boolean;
  /** Omit role="status" when parent control already exposes loading text. */
  decorative?: boolean;
};

function RacketIcon({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="32" cy="22" rx="14" ry="18" strokeWidth="2.2" />
      <line x1="26" y1="14" x2="38" y2="14" strokeWidth="1.2" opacity="0.7" />
      <line x1="24" y1="22" x2="40" y2="22" strokeWidth="1.2" opacity="0.7" />
      <line x1="26" y1="30" x2="38" y2="30" strokeWidth="1.2" opacity="0.7" />
      <line x1="32" y1="40" x2="32" y2="52" strokeWidth="2.4" />
      <rect x="28" y="52" width="8" height="10" rx="1.5" strokeWidth="2" />
    </g>
  );
}

function ShuttleIcon() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -4 L3 2 L0 5 L-3 2 Z" strokeWidth="1.4" fill="currentColor" fillOpacity="0.35" />
      <path d="M-4 2 Q0 4 4 2" strokeWidth="1.2" opacity="0.85" />
      <path d="M-3 4 Q0 6 3 4" strokeWidth="1" opacity="0.6" />
    </g>
  );
}

export function GameLoader({
  size = 'lg',
  label,
  caption,
  className = 'text-primary',
  inline = false,
  decorative = false,
}: GameLoaderProps) {
  const px = sizePx[size];
  const showCaption = caption ?? size === 'lg';
  const showScene = size === 'lg';
  const layoutClass = inline || !showCaption
    ? 'inline-flex flex-row items-center'
    : 'inline-flex flex-col items-center gap-3';

  return (
    <div
      className={`${layoutClass} ${className}`}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <div
        className="relative shrink-0"
        style={{ width: px, height: px }}
        aria-hidden
      >
        {showScene && (
          <svg
            className="game-loader-court absolute inset-0 h-full w-full text-primary/25"
            viewBox="0 0 64 64"
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          </svg>
        )}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 64 64">
          {showScene && (
            <g className="game-loader-shuttle-orbit" style={{ transformOrigin: '32px 32px' }}>
              <g transform="translate(32, 32)">
                <g transform="translate(0, -26)">
                  <ShuttleIcon />
                </g>
              </g>
            </g>
          )}
          <g className="game-loader-racket-spin" style={{ transformOrigin: '32px 38px' }}>
            <RacketIcon />
          </g>
        </svg>
      </div>
      {showCaption && (
        <p className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Warming up…
        </p>
      )}
    </div>
  );
}

type PageLoaderVariant = 'compact' | 'tall' | 'screen';

const variantClass: Record<PageLoaderVariant, string> = {
  compact: 'min-h-[40vh]',
  tall: 'min-h-[50vh]',
  screen: 'min-h-screen',
};

type PageLoaderProps = {
  variant?: PageLoaderVariant;
  label: string;
};

export function PageLoader({ variant = 'compact', label }: PageLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${variantClass[variant]}`}>
      <GameLoader size="lg" label={label} />
    </div>
  );
}
