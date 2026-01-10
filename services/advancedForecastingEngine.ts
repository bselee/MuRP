/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADVANCED FORECASTING ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Multi-method forecasting with ABC/XYZ-based method selection:
 *
 * METHODS:
 * - Simple Moving Average (SMA): Baseline for low-volume items
 * - Exponential Smoothing (ETS): For stable, predictable demand (X-class)
 * - Holt-Winters (HW): For items with trend and seasonality (Y-class)
 * - Weighted Ensemble: Combines methods based on historical accuracy
 *
 * METHOD SELECTION BY ABC/XYZ:
 * - AX, BX: Exponential Smoothing (high value, predictable)
 * - AY, BY: Holt-Winters (high value, seasonal)
 * - AZ, BZ: Weighted Ensemble (high value, erratic - needs caution)
 * - CX, CY, CZ: Simple Moving Average (low value - minimize compute)
 *
 * SAFETY STOCK SERVICE LEVELS BY ABC:
 * - A items: 98% service level (z = 2.05)
 * - B items: 95% service level (z = 1.65)
 * - C items: 90% service level (z = 1.28)
 *
 * @module services/advancedForecastingEngine
 */

export type ABCClass = 'A' | 'B' | 'C';
export type XYZClass = 'X' | 'Y' | 'Z';
export type ForecastMethod = 'SMA' | 'ETS' | 'HW' | 'ENSEMBLE';

export interface DailySalesData {
  date: string; // YYYY-MM-DD
  quantity: number;
}

export interface ForecastResult {
  date: string;
  predicted: number;
  lower_bound: number;
  upper_bound: number;
  confidence: number;
}

export interface ForecastOutput {
  sku: string;
  method_used: ForecastMethod;
  forecast: ForecastResult[];
  metrics: {
    mape: number | null;  // Mean Absolute Percentage Error
    mae: number | null;   // Mean Absolute Error
    bias: number | null;  // Forecast bias (positive = over-forecast)
  };
  parameters: {
    alpha?: number;       // ETS smoothing factor
    beta?: number;        // Trend smoothing (HW)
    gamma?: number;       // Seasonal smoothing (HW)
    period?: number;      // Seasonal period
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE LEVEL Z-SCORES BY ABC CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Z-scores for safety stock calculation by ABC class
 * Based on target service levels:
 * - A: 98% (2.05)
 * - B: 95% (1.65)
 * - C: 90% (1.28)
 */
export const SERVICE_LEVEL_Z_SCORES: Record<ABCClass, { level: number; z: number }> = {
  'A': { level: 0.98, z: 2.05 },
  'B': { level: 0.95, z: 1.65 },
  'C': { level: 0.90, z: 1.28 },
};

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate mean of an array
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[], mean?: number): number {
  if (values.length < 2) return 0;
  const m = mean ?? calculateMean(values);
  const squaredDiffs = values.map(v => Math.pow(v - m, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate Coefficient of Variation (CV)
 */
export function calculateCV(values: number[]): number {
  const mean = calculateMean(values);
  if (mean === 0) return 0;
  const stdDev = calculateStdDev(values, mean);
  return stdDev / mean;
}

/**
 * Determine XYZ class from CV
 */
export function getXYZClassFromCV(cv: number): XYZClass {
  if (cv < 0.5) return 'X';
  if (cv < 1.0) return 'Y';
  return 'Z';
}

// ═══════════════════════════════════════════════════════════════════════════
// FORECAST METHOD SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select optimal forecast method based on ABC/XYZ classification
 */
export function selectForecastMethod(
  abcClass: ABCClass,
  xyzClass: XYZClass,
  dataPoints: number
): ForecastMethod {
  // Need at least 30 days for any meaningful forecast
  if (dataPoints < 30) return 'SMA';

  // C items: Use simple method to minimize compute
  if (abcClass === 'C') return 'SMA';

  // A and B items: Select based on demand variability
  switch (xyzClass) {
    case 'X':
      // Predictable demand - exponential smoothing works well
      return 'ETS';
    case 'Y':
      // Moderate variability - check for seasonality
      // Need at least 365 days for seasonal detection
      if (dataPoints >= 365) return 'HW';
      return 'ETS';
    case 'Z':
      // Erratic demand - use ensemble to reduce risk
      return dataPoints >= 90 ? 'ENSEMBLE' : 'SMA';
    default:
      return 'SMA';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE MOVING AVERAGE (SMA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple Moving Average forecast
 * Best for: Low-value items, items with stable demand, insufficient data
 */
export function forecastSMA(
  historicalData: DailySalesData[],
  daysToForecast: number,
  windowSize: number = 30
): ForecastResult[] {
  if (historicalData.length === 0) {
    return generateEmptyForecast(daysToForecast);
  }

  // Sort by date and get recent window
  const sorted = [...historicalData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const window = sorted.slice(-windowSize);
  const quantities = window.map(d => d.quantity);

  const mean = calculateMean(quantities);
  const stdDev = calculateStdDev(quantities, mean);

  const forecast: ForecastResult[] = [];
  const today = new Date();

  for (let i = 1; i <= daysToForecast; i++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + i);

    // Confidence decreases with horizon
    const confidence = Math.max(0.5, 1 - (i / daysToForecast) * 0.4);

    // 95% confidence interval
    const margin = 1.96 * stdDev;

    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predicted: Math.max(0, Math.round(mean * 100) / 100),
      lower_bound: Math.max(0, Math.round((mean - margin) * 100) / 100),
      upper_bound: Math.round((mean + margin) * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return forecast;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPONENTIAL SMOOTHING (ETS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple Exponential Smoothing (ETS)
 * Best for: Stable demand patterns without trend or seasonality
 *
 * Formula: S_t = α × Y_t + (1-α) × S_{t-1}
 *
 * @param alpha Smoothing factor (0-1). Higher = more weight on recent data
 *              Default 0.3 balances responsiveness and stability
 */
export function forecastETS(
  historicalData: DailySalesData[],
  daysToForecast: number,
  alpha: number = 0.3
): ForecastResult[] {
  if (historicalData.length < 2) {
    return forecastSMA(historicalData, daysToForecast);
  }

  const sorted = [...historicalData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const quantities = sorted.map(d => d.quantity);

  // Initialize with first observation
  let smoothed = quantities[0];

  // Apply exponential smoothing
  for (let i = 1; i < quantities.length; i++) {
    smoothed = alpha * quantities[i] + (1 - alpha) * smoothed;
  }

  // Calculate error for confidence interval
  const errors: number[] = [];
  let s = quantities[0];
  for (let i = 1; i < quantities.length; i++) {
    errors.push(Math.abs(quantities[i] - s));
    s = alpha * quantities[i] + (1 - alpha) * s;
  }
  const mae = calculateMean(errors);

  const forecast: ForecastResult[] = [];
  const today = new Date();

  for (let i = 1; i <= daysToForecast; i++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + i);

    // ETS forecast is constant (no trend)
    const predicted = smoothed;

    // Confidence decreases with horizon
    const confidence = Math.max(0.5, 0.9 - (i / daysToForecast) * 0.35);

    // Prediction interval widens with horizon
    const horizonFactor = Math.sqrt(i);
    const margin = 1.96 * mae * horizonFactor;

    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predicted: Math.max(0, Math.round(predicted * 100) / 100),
      lower_bound: Math.max(0, Math.round((predicted - margin) * 100) / 100),
      upper_bound: Math.round((predicted + margin) * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return forecast;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOLT-WINTERS (HW) - Triple Exponential Smoothing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Holt-Winters Triple Exponential Smoothing (Additive)
 * Best for: Items with trend AND seasonality
 *
 * Components:
 * - Level (L): Base value
 * - Trend (T): Direction of change
 * - Seasonal (S): Repeating pattern
 *
 * @param alpha Level smoothing (0-1)
 * @param beta Trend smoothing (0-1)
 * @param gamma Seasonal smoothing (0-1)
 * @param period Seasonal period (e.g., 7 for weekly, 12 for monthly)
 */
export function forecastHoltWinters(
  historicalData: DailySalesData[],
  daysToForecast: number,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.2,
  period: number = 7 // Weekly seasonality by default
): ForecastResult[] {
  if (historicalData.length < period * 2) {
    // Not enough data for seasonal decomposition
    return forecastETS(historicalData, daysToForecast, alpha);
  }

  const sorted = [...historicalData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const quantities = sorted.map(d => d.quantity);
  const n = quantities.length;

  // Initialize components
  // Level: average of first period
  let level = calculateMean(quantities.slice(0, period));

  // Trend: average change between first two periods
  const firstPeriodAvg = calculateMean(quantities.slice(0, period));
  const secondPeriodAvg = calculateMean(quantities.slice(period, period * 2));
  let trend = (secondPeriodAvg - firstPeriodAvg) / period;

  // Seasonal: deviation from level for each period position
  const seasonal: number[] = new Array(period);
  for (let i = 0; i < period; i++) {
    const periodValues = [];
    for (let j = i; j < n; j += period) {
      periodValues.push(quantities[j]);
    }
    seasonal[i] = calculateMean(periodValues) - level;
  }

  // Apply Holt-Winters
  const errors: number[] = [];
  for (let i = period; i < n; i++) {
    const seasonIdx = i % period;
    const predicted = level + trend + seasonal[seasonIdx];
    errors.push(Math.abs(quantities[i] - predicted));

    // Update components
    const prevLevel = level;
    level = alpha * (quantities[i] - seasonal[seasonIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[seasonIdx] = gamma * (quantities[i] - level) + (1 - gamma) * seasonal[seasonIdx];
  }

  const mae = errors.length > 0 ? calculateMean(errors) : level * 0.2;

  const forecast: ForecastResult[] = [];
  const today = new Date();

  for (let i = 1; i <= daysToForecast; i++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + i);

    const seasonIdx = (n + i - 1) % period;
    const predicted = level + trend * i + seasonal[seasonIdx];

    // Confidence decreases with horizon
    const confidence = Math.max(0.4, 0.85 - (i / daysToForecast) * 0.4);

    // Prediction interval
    const horizonFactor = Math.sqrt(i);
    const margin = 1.96 * mae * horizonFactor;

    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predicted: Math.max(0, Math.round(predicted * 100) / 100),
      lower_bound: Math.max(0, Math.round((predicted - margin) * 100) / 100),
      upper_bound: Math.round((predicted + margin) * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return forecast;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENSEMBLE FORECAST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Weighted Ensemble combining SMA, ETS, and HW
 * Best for: Erratic demand (Z-class) where single method may fail
 *
 * Weights are based on recent accuracy (lower error = higher weight)
 */
export function forecastEnsemble(
  historicalData: DailySalesData[],
  daysToForecast: number
): ForecastResult[] {
  // Get forecasts from each method
  const smaForecast = forecastSMA(historicalData, daysToForecast);
  const etsForecast = forecastETS(historicalData, daysToForecast);
  const hwForecast = forecastHoltWinters(historicalData, daysToForecast);

  // Calculate backtest errors for weighting
  const sorted = [...historicalData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Use last 30 days for backtest
  const backtestSize = Math.min(30, Math.floor(sorted.length * 0.2));
  const trainData = sorted.slice(0, -backtestSize);
  const testData = sorted.slice(-backtestSize);

  // Only backtest if we have enough data
  let weights = { sma: 0.33, ets: 0.34, hw: 0.33 };

  if (trainData.length >= 30 && testData.length >= 7) {
    const smaBacktest = forecastSMA(trainData, backtestSize);
    const etsBacktest = forecastETS(trainData, backtestSize);
    const hwBacktest = forecastHoltWinters(trainData, backtestSize);

    const smaMae = calculateBacktestMAE(smaBacktest, testData);
    const etsMae = calculateBacktestMAE(etsBacktest, testData);
    const hwMae = calculateBacktestMAE(hwBacktest, testData);

    // Inverse MAE weighting (lower error = higher weight)
    const totalInverse = (1 / (smaMae + 1)) + (1 / (etsMae + 1)) + (1 / (hwMae + 1));
    weights = {
      sma: (1 / (smaMae + 1)) / totalInverse,
      ets: (1 / (etsMae + 1)) / totalInverse,
      hw: (1 / (hwMae + 1)) / totalInverse,
    };
  }

  // Combine forecasts
  const ensemble: ForecastResult[] = [];
  for (let i = 0; i < daysToForecast; i++) {
    const predicted =
      weights.sma * smaForecast[i].predicted +
      weights.ets * etsForecast[i].predicted +
      weights.hw * hwForecast[i].predicted;

    const lowerBound =
      weights.sma * smaForecast[i].lower_bound +
      weights.ets * etsForecast[i].lower_bound +
      weights.hw * hwForecast[i].lower_bound;

    const upperBound =
      weights.sma * smaForecast[i].upper_bound +
      weights.ets * etsForecast[i].upper_bound +
      weights.hw * hwForecast[i].upper_bound;

    const confidence =
      weights.sma * smaForecast[i].confidence +
      weights.ets * etsForecast[i].confidence +
      weights.hw * hwForecast[i].confidence;

    ensemble.push({
      date: smaForecast[i].date,
      predicted: Math.max(0, Math.round(predicted * 100) / 100),
      lower_bound: Math.max(0, Math.round(lowerBound * 100) / 100),
      upper_bound: Math.round(upperBound * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return ensemble;
}

function calculateBacktestMAE(
  forecast: ForecastResult[],
  actual: DailySalesData[]
): number {
  let totalError = 0;
  let count = 0;

  for (let i = 0; i < Math.min(forecast.length, actual.length); i++) {
    totalError += Math.abs(forecast[i].predicted - actual[i].quantity);
    count++;
  }

  return count > 0 ? totalError / count : Infinity;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FORECAST FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate forecast using optimal method for the item
 */
export function generateAdvancedForecast(
  sku: string,
  historicalData: DailySalesData[],
  daysToForecast: number,
  abcClass: ABCClass,
  xyzClass?: XYZClass
): ForecastOutput {
  // Calculate XYZ if not provided
  const quantities = historicalData.map(d => d.quantity);
  const actualXYZ = xyzClass ?? getXYZClassFromCV(calculateCV(quantities));

  // Select method
  const method = selectForecastMethod(abcClass, actualXYZ, historicalData.length);

  // Generate forecast
  let forecast: ForecastResult[];
  let parameters: ForecastOutput['parameters'] = {};

  switch (method) {
    case 'ETS':
      forecast = forecastETS(historicalData, daysToForecast);
      parameters = { alpha: 0.3 };
      break;
    case 'HW':
      forecast = forecastHoltWinters(historicalData, daysToForecast);
      parameters = { alpha: 0.3, beta: 0.1, gamma: 0.2, period: 7 };
      break;
    case 'ENSEMBLE':
      forecast = forecastEnsemble(historicalData, daysToForecast);
      parameters = { alpha: 0.3, beta: 0.1, gamma: 0.2, period: 7 };
      break;
    default:
      forecast = forecastSMA(historicalData, daysToForecast);
      parameters = {};
  }

  // Calculate accuracy metrics if we have enough data
  let metrics: ForecastOutput['metrics'] = { mape: null, mae: null, bias: null };

  if (historicalData.length >= 60) {
    const sorted = [...historicalData].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const trainData = sorted.slice(0, -30);
    const testData = sorted.slice(-30);

    let backtest: ForecastResult[];
    switch (method) {
      case 'ETS':
        backtest = forecastETS(trainData, 30);
        break;
      case 'HW':
        backtest = forecastHoltWinters(trainData, 30);
        break;
      case 'ENSEMBLE':
        backtest = forecastEnsemble(trainData, 30);
        break;
      default:
        backtest = forecastSMA(trainData, 30);
    }

    metrics = calculateForecastMetrics(backtest, testData);
  }

  return {
    sku,
    method_used: method,
    forecast,
    metrics,
    parameters,
  };
}

/**
 * Calculate MAPE, MAE, and Bias
 */
function calculateForecastMetrics(
  forecast: ForecastResult[],
  actual: DailySalesData[]
): { mape: number | null; mae: number | null; bias: number | null } {
  if (forecast.length === 0 || actual.length === 0) {
    return { mape: null, mae: null, bias: null };
  }

  let totalAbsError = 0;
  let totalAbsPctError = 0;
  let totalBias = 0;
  let pctCount = 0;

  for (let i = 0; i < Math.min(forecast.length, actual.length); i++) {
    const predicted = forecast[i].predicted;
    const actualQty = actual[i].quantity;
    const error = predicted - actualQty;

    totalAbsError += Math.abs(error);
    totalBias += error;

    if (actualQty > 0) {
      totalAbsPctError += Math.abs(error) / actualQty;
      pctCount++;
    }
  }

  const count = Math.min(forecast.length, actual.length);

  return {
    mape: pctCount > 0 ? Math.round((totalAbsPctError / pctCount) * 100) : null,
    mae: count > 0 ? Math.round((totalAbsError / count) * 100) / 100 : null,
    bias: count > 0 ? Math.round((totalBias / count) * 100) / 100 : null,
  };
}

function generateEmptyForecast(days: number): ForecastResult[] {
  const forecast: ForecastResult[] = [];
  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + i);

    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predicted: 0,
      lower_bound: 0,
      upper_bound: 0,
      confidence: 0.1,
    });
  }

  return forecast;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY STOCK CALCULATION WITH LEAD TIME VARIABILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate safety stock using the complete formula with lead time variability
 *
 * Formula: SS = z × √(LT × σ_demand² + D² × σ_LT²)
 *
 * Where:
 * - z = service level z-score (varies by ABC class)
 * - LT = average lead time (days)
 * - σ_demand = standard deviation of daily demand
 * - D = average daily demand
 * - σ_LT = standard deviation of lead time
 *
 * This formula accounts for BOTH demand variability AND supply variability
 */
export function calculateSafetyStock(
  abcClass: ABCClass,
  avgDailyDemand: number,
  demandStdDev: number,
  avgLeadTimeDays: number,
  leadTimeStdDevDays: number = 0
): { safetyStock: number; z: number; serviceLevel: number } {
  const { z, level } = SERVICE_LEVEL_Z_SCORES[abcClass];

  // Complete safety stock formula with lead time variability
  // SS = z × √(LT × σ_d² + D² × σ_LT²)
  const demandVariance = avgLeadTimeDays * Math.pow(demandStdDev, 2);
  const supplyVariance = Math.pow(avgDailyDemand, 2) * Math.pow(leadTimeStdDevDays, 2);
  const combinedStdDev = Math.sqrt(demandVariance + supplyVariance);

  const safetyStock = Math.ceil(z * combinedStdDev);

  return {
    safetyStock: Math.max(0, safetyStock),
    z,
    serviceLevel: level,
  };
}

/**
 * Calculate Reorder Point (ROP) using forecast demand
 *
 * Formula: ROP = (D × LT) + SS
 *
 * Where:
 * - D = forecasted average daily demand
 * - LT = lead time (days)
 * - SS = safety stock
 */
export function calculateReorderPoint(
  forecastedDailyDemand: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  const demandDuringLeadTime = forecastedDailyDemand * leadTimeDays;
  return Math.ceil(demandDuringLeadTime + safetyStock);
}

/**
 * Calculate Economic Order Quantity (EOQ)
 *
 * Formula: EOQ = √((2 × D × S) / H)
 *
 * Where:
 * - D = annual demand
 * - S = ordering cost per order
 * - H = holding cost per unit per year
 */
export function calculateEOQ(
  annualDemand: number,
  orderingCost: number = 25, // Default $25 per order
  holdingCostRate: number = 0.25, // Default 25% of unit cost
  unitCost: number = 1
): number {
  const holdingCost = unitCost * holdingCostRate;
  if (holdingCost === 0) return annualDemand; // Avoid division by zero

  const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
  return Math.ceil(eoq);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Method selection
  selectForecastMethod,
  SERVICE_LEVEL_Z_SCORES,

  // Forecast methods
  forecastSMA,
  forecastETS,
  forecastHoltWinters,
  forecastEnsemble,
  generateAdvancedForecast,

  // Safety stock & ROP
  calculateSafetyStock,
  calculateReorderPoint,
  calculateEOQ,

  // Helpers
  calculateMean,
  calculateStdDev,
  calculateCV,
  getXYZClassFromCV,
};
