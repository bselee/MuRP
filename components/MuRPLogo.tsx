import React from 'react';
import { useTheme } from './ThemeProvider';

interface MuRPLogoProps {
  collapsed?: boolean;
}

/**
 * MuRP Logo Component
 *
 * CRITICAL SPECIFICATIONS:
 * - Font size: ALWAYS text-2xl (24px) - never changes
 * - Font weight: ALWAYS font-bold (700)
 * - Color: text-black in light mode, text-white in dark mode
 * - Container height: ALWAYS h-16 (64px) - matches header
 * - Letter spacing: tracking-tight for clean appearance
 * - Logo itself NEVER changes size - only container alignment changes
 */
const MuRPLogo: React.FC<MuRPLogoProps> = ({ collapsed = false }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div
      className={`h-16 flex items-center w-full ${
        collapsed ? 'justify-center' : 'justify-start px-4'
      }`}
    >
      <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-black'}`}>
        MuRP
      </h1>
    </div>
  );
};

export default MuRPLogo;
