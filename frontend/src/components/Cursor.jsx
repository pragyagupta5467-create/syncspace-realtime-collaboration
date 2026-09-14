import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Single Remote Multiplayer Cursor with Spotlight Effects
 */
export const MultiplayerCursor = memo(function MultiplayerCursor({
  x,
  y,
  displayName,
  userColor = '#6366f1',
  isSpotlight = false,
}) {
  return (
    <div
      className="absolute top-0 left-0 pointer-events-none transition-transform duration-75 ease-out z-40 select-none"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        willChange: 'transform',
      }}
    >
      {/* Active Spotlight Effect */}
      {isSpotlight && (
        <div className="absolute -top-7 -left-7 h-16 w-16 pointer-events-none flex items-center justify-center">
          {/* Outer Pulse Ping */}
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-40"
            style={{ backgroundColor: userColor }}
          />
          {/* Radial Glowing Aura */}
          <div
            className="h-12 w-12 rounded-full blur-md opacity-70 animate-pulse"
            style={{ backgroundColor: userColor }}
          />
        </div>
      )}

      {/* SVG Mouse Pointer */}
      <svg
        className={`w-5 h-5 drop-shadow-md relative ${isSpotlight ? 'scale-125 transition-transform' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
          fill={userColor}
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Collaborator Badge Tag */}
      <div
        className={`absolute left-4 top-2 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-lg flex items-center gap-1 ring-1 ring-black/20 ${
          isSpotlight ? 'ring-2 ring-amber-400 font-bold scale-105 transition-all' : ''
        }`}
        style={{ backgroundColor: userColor }}
      >
        {isSpotlight && <Sparkles className="h-2.5 w-2.5 text-amber-300 animate-spin" />}
        <span>{displayName || 'Collaborator'}</span>
        {isSpotlight && <span className="text-[9px] bg-amber-400/30 px-1 rounded text-amber-100 font-mono">SPOTLIGHT</span>}
      </div>
    </div>
  );
});

/**
 * Multiplayer Cursors Overlay Container
 */
export default function MultiplayerCursorsOverlay({ remoteCursors = {}, containerDimensions = { width: 0, height: 0 } }) {
  const { width, height } = containerDimensions;
  if (!width || !height) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {Object.entries(remoteCursors).map(([userId, cursor]) => {
        // Calculate absolute pixel coordinates from normalized percentages
        const pixelX = (cursor.x / 100) * width;
        const pixelY = (cursor.y / 100) * height;

        return (
          <MultiplayerCursor
            key={userId}
            x={pixelX}
            y={pixelY}
            displayName={cursor.userName || cursor.displayName}
            userColor={cursor.userColor}
            isSpotlight={cursor.isSpotlight}
          />
        );
      })}
    </div>
  );
}
