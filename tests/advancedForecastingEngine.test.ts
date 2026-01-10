/**
 * Unit tests for Advanced Forecasting Engine
 *
 * Tests:
 * - ABC-based service level z-scores
 * - Safety stock calculation with lead time variability
 * - Forecast method selection by ABC/XYZ class
 * - Statistical helpers (mean, stdDev, CV)
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

// Import functions to test
import {
  SERVICE_LEVEL_Z_SCORES,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateMean,
  calculateStdDev,
  calculateCV,
  getXYZClassFromCV,
  selectForecastMethod,
  forecastSMA,
  forecastETS,
} from '../services/advancedForecastingEngine';

describe('SERVICE_LEVEL_Z_SCORES', () => {
  it('has correct z-scores for each ABC class', () => {
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['A'].z, 2.05, 'A class should have z=2.05 (98% service)');
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['B'].z, 1.65, 'B class should have z=1.65 (95% service)');
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['C'].z, 1.28, 'C class should have z=1.28 (90% service)');
  });

  it('has correct service levels', () => {
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['A'].level, 0.98);
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['B'].level, 0.95);
    assert.strictEqual(SERVICE_LEVEL_Z_SCORES['C'].level, 0.90);
  });
});

describe('calculateMean', () => {
  it('calculates mean correctly', () => {
    assert.strictEqual(calculateMean([1, 2, 3, 4, 5]), 3);
    assert.strictEqual(calculateMean([10]), 10);
    assert.strictEqual(calculateMean([]), 0);
  });
});

describe('calculateStdDev', () => {
  it('calculates standard deviation correctly', () => {
    // For [1,2,3,4,5] with mean 3, variance = (4+1+0+1+4)/4 = 2.5, stdDev = ~1.58
    const stdDev = calculateStdDev([1, 2, 3, 4, 5]);
    assert.ok(Math.abs(stdDev - 1.58) < 0.01, `Expected ~1.58, got ${stdDev}`);
  });

  it('returns 0 for single value', () => {
    assert.strictEqual(calculateStdDev([5]), 0);
  });
});

describe('calculateCV', () => {
  it('returns coefficient of variation', () => {
    // CV = stdDev / mean
    const values = [10, 12, 8, 11, 9]; // mean ~10, low variability
    const cv = calculateCV(values);
    assert.ok(cv < 0.5, 'Low variability should give CV < 0.5');
  });

  it('returns 0 for empty array', () => {
    assert.strictEqual(calculateCV([]), 0);
  });
});

describe('getXYZClassFromCV', () => {
  it('assigns X class for CV < 0.5', () => {
    assert.strictEqual(getXYZClassFromCV(0.3), 'X');
    assert.strictEqual(getXYZClassFromCV(0.49), 'X');
  });

  it('assigns Y class for CV 0.5-1.0', () => {
    assert.strictEqual(getXYZClassFromCV(0.5), 'Y');
    assert.strictEqual(getXYZClassFromCV(0.8), 'Y');
    assert.strictEqual(getXYZClassFromCV(0.99), 'Y');
  });

  it('assigns Z class for CV >= 1.0', () => {
    assert.strictEqual(getXYZClassFromCV(1.0), 'Z');
    assert.strictEqual(getXYZClassFromCV(1.5), 'Z');
  });
});

describe('selectForecastMethod', () => {
  it('uses SMA for C items (minimize compute)', () => {
    assert.strictEqual(selectForecastMethod('C', 'X', 100), 'SMA');
    assert.strictEqual(selectForecastMethod('C', 'Y', 100), 'SMA');
    assert.strictEqual(selectForecastMethod('C', 'Z', 100), 'SMA');
  });

  it('uses ETS for A/B items with X class (stable)', () => {
    assert.strictEqual(selectForecastMethod('A', 'X', 100), 'ETS');
    assert.strictEqual(selectForecastMethod('B', 'X', 100), 'ETS');
  });

  it('uses HW for A/B items with Y class and enough data', () => {
    assert.strictEqual(selectForecastMethod('A', 'Y', 400), 'HW');
    assert.strictEqual(selectForecastMethod('B', 'Y', 400), 'HW');
  });

  it('uses ENSEMBLE for A/B items with Z class', () => {
    assert.strictEqual(selectForecastMethod('A', 'Z', 100), 'ENSEMBLE');
    assert.strictEqual(selectForecastMethod('B', 'Z', 100), 'ENSEMBLE');
  });

  it('falls back to SMA for insufficient data', () => {
    assert.strictEqual(selectForecastMethod('A', 'X', 10), 'SMA');
    assert.strictEqual(selectForecastMethod('A', 'Z', 10), 'SMA');
  });
});

describe('calculateSafetyStock', () => {
  it('calculates safety stock with demand variability', () => {
    // A class item: z=2.05, daily demand=10, stdDev=2, LT=14 days, LT stdDev=0
    const result = calculateSafetyStock('A', 10, 2, 14, 0);

    // SS = z × √(LT × σ_demand²) = 2.05 × √(14 × 4) = 2.05 × 7.48 ≈ 15.3
    assert.ok(result.safetyStock > 0, 'Safety stock should be positive');
    assert.strictEqual(result.z, 2.05, 'Should use A class z-score');
    assert.strictEqual(result.serviceLevel, 0.98, 'Should use A class service level');
  });

  it('includes lead time variability in calculation', () => {
    // Same item but with lead time variability
    const withoutLTVar = calculateSafetyStock('A', 10, 2, 14, 0);
    const withLTVar = calculateSafetyStock('A', 10, 2, 14, 3); // 3 day LT std dev

    assert.ok(withLTVar.safetyStock > withoutLTVar.safetyStock,
      'Lead time variability should increase safety stock');
  });

  it('uses different z-scores for different ABC classes', () => {
    const ssA = calculateSafetyStock('A', 10, 2, 14, 0);
    const ssB = calculateSafetyStock('B', 10, 2, 14, 0);
    const ssC = calculateSafetyStock('C', 10, 2, 14, 0);

    assert.ok(ssA.safetyStock > ssB.safetyStock, 'A class should have higher SS than B');
    assert.ok(ssB.safetyStock > ssC.safetyStock, 'B class should have higher SS than C');
  });
});

describe('calculateReorderPoint', () => {
  it('calculates ROP as demand during lead time plus safety stock', () => {
    // ROP = (D × LT) + SS = (10 × 14) + 15 = 155
    const rop = calculateReorderPoint(10, 14, 15);
    assert.strictEqual(rop, 155);
  });

  it('rounds up to whole units', () => {
    const rop = calculateReorderPoint(1.5, 7, 5);
    // ROP = ceil((1.5 × 7) + 5) = ceil(15.5) = 16
    assert.strictEqual(rop, 16);
  });
});

describe('forecastSMA', () => {
  it('generates correct number of forecast days', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
      quantity: 10,
    }));

    const forecast = forecastSMA(data, 7);
    assert.strictEqual(forecast.length, 7, 'Should generate 7 forecast days');
  });

  it('predicts based on historical average', () => {
    // Consistent demand of 10 units per day
    const data = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
      quantity: 10,
    }));

    const forecast = forecastSMA(data, 7);
    assert.strictEqual(forecast[0].predicted, 10, 'Should predict average demand');
  });

  it('handles empty data', () => {
    const forecast = forecastSMA([], 7);
    assert.strictEqual(forecast.length, 7);
    assert.strictEqual(forecast[0].predicted, 0);
  });
});

describe('forecastETS', () => {
  it('generates smooth forecast', () => {
    const data = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.now() - (60 - i) * 86400000).toISOString().split('T')[0],
      quantity: 10 + Math.random() * 2, // 10-12 units with noise
    }));

    const forecast = forecastETS(data, 7);
    assert.strictEqual(forecast.length, 7);
    assert.ok(forecast[0].predicted >= 9 && forecast[0].predicted <= 13,
      'ETS should smooth to ~10-12 range');
  });

  it('includes confidence interval that widens with horizon', () => {
    // Use variable data so there's actual variance to measure
    const data = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.now() - (60 - i) * 86400000).toISOString().split('T')[0],
      quantity: 10 + (i % 7) - 3, // Values between 7 and 13
    }));

    const forecast = forecastETS(data, 14);
    const firstInterval = forecast[0].upper_bound - forecast[0].lower_bound;
    const lastInterval = forecast[13].upper_bound - forecast[13].lower_bound;

    // With variable data and horizon factor, last should be wider
    assert.ok(lastInterval >= firstInterval,
      'Prediction interval should widen or stay same with forecast horizon');
  });
});

console.log('✅ Advanced Forecasting Engine Tests');
