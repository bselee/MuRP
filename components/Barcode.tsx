// Barcode Display Component
// Generates visual barcode from barcode number using Code128 format

import React from 'react';

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
}

const Barcode: React.FC<BarcodeProps> = ({
  value,
  width = 2,
  height = 100,
  displayValue = true
}) => {
  if (!value || value.trim() === '') {
    return null;
  }

  // Simple Code128 encoding (subset of actual algorithm for demonstration)
  // In production, you'd use jsbarcode or similar library
  // This creates a simplified visual representation

  const barcodeValue = value.replace(/[^0-9]/g, ''); // Only numbers for simplicity

  if (barcodeValue.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic">
        Invalid barcode format
      </div>
    );
  }

  // Create simple bar pattern (alternating black/white bars)
  // Real Code128 would use specific patterns
  const bars: number[] = [];
  for (let i = 0; i < barcodeValue.length; i++) {
    const digit = parseInt(barcodeValue[i]);
    // Create pattern based on digit (simplified)
    bars.push(1, 1, digit % 2 === 0 ? 2 : 3, 1);
  }

  // Add start/stop patterns
  const fullPattern = [3, 1, 1, ...bars, 1, 1, 3];

  let xPosition = 0;
  const totalWidth = fullPattern.reduce((sum, w) => sum + w, 0) * width;

  return (
    <div className="inline-flex flex-col items-center">
      <svg
        width={totalWidth}
        height={height}
        className="bg-white"
        style={{ maxWidth: '100%' }}
      >
        {fullPattern.map((barWidth, index) => {
          const isBlack = index % 2 === 0;
          const x = xPosition;
          xPosition += barWidth * width;

          if (!isBlack) return null; // Skip white bars (they're the background)

          return (
            <rect
              key={index}
              x={x}
              y={0}
              width={barWidth * width}
              height={height}
              fill="black"
            />
          );
        })}
      </svg>
      {displayValue && (
        <div className="mt-2 text-sm font-mono text-gray-700 bg-white px-2">
          {value}
        </div>
      )}
    </div>
  );
};

export default Barcode;
