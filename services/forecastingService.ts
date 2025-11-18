import type { HistoricalSale } from '../types';

export interface Forecast {
    date: string; // YYYY-MM-DD
    sku: string;
    quantity: number;
    confidence?: number;
    lowerBound?: number;
    upperBound?: number;
}

export interface TrendMetrics {
  growthRate: number; // % change 30d vs 90d
  acceleration: number; // rate of change
  direction: 'up' | 'down' | 'stable';
  confidence: number; // 0-1 based on data variance
}

export interface SeasonalPattern {
  month: number;
  seasonalFactor: number; // multiplier (1.0 = average, 1.2 = 20% above average)
  confidence: number;
}

/**
 * Calculate trend metrics (growth rate, acceleration)
 */
export function calculateTrendMetrics(
  sales30day: number,
  sales90day: number,
  sales180day?: number
): TrendMetrics {
  const avg30 = sales30day / 30;
  const avg90 = sales90day / 90;
  
  const growthRate = avg90 > 0 ? ((avg30 - avg90) / avg90) * 100 : 0;
  
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (growthRate > 15) direction = 'up';
  else if (growthRate < -15) direction = 'down';
  
  // Calculate acceleration if 180-day data available
  let acceleration = 0;
  if (sales180day) {
    const avg180 = sales180day / 180;
    const growth3090 = avg90 > 0 ? ((avg30 - avg90) / avg90) : 0;
    const growth90180 = avg180 > 0 ? ((avg90 - avg180) / avg180) : 0;
    acceleration = growth3090 - growth90180;
  }
  
  // Confidence based on variance
  const variance = Math.abs(avg30 - avg90) / Math.max(avg30, avg90, 1);
  const confidence = Math.max(0, Math.min(1, 1 - variance));
  
  return { growthRate, acceleration, direction, confidence };
}

/**
 * Detect seasonal patterns using year-over-year comparison
 */
export function detectSeasonalPatterns(
  historicalSales: Array<{ date: string; quantity: number }>,
  minMonths: number = 12
): SeasonalPattern[] {
  // Group sales by month
  const monthlyData = new Map<number, number[]>();
  
  historicalSales.forEach(sale => {
    const month = new Date(sale.date).getMonth();
    if (!monthlyData.has(month)) {
      monthlyData.set(month, []);
    }
    monthlyData.get(month)!.push(sale.quantity);
  });
  
  // Calculate average and seasonal factors
  const patterns: SeasonalPattern[] = [];
  const overallAvg = historicalSales.reduce((sum, s) => sum + s.quantity, 0) / historicalSales.length;
  
  for (let month = 0; month < 12; month++) {
    const monthData = monthlyData.get(month) || [];
    
    if (monthData.length === 0) {
      patterns.push({ month, seasonalFactor: 1.0, confidence: 0 });
      continue;
    }
    
    const monthAvg = monthData.reduce((sum, v) => sum + v, 0) / monthData.length;
    const seasonalFactor = overallAvg > 0 ? monthAvg / overallAvg : 1.0;
    const confidence = Math.min(1, monthData.length / minMonths);
    
    patterns.push({ month, seasonalFactor, confidence });
  }
  
  return patterns;
}

// Simple Moving Average Forecast
export const generateForecast = (
    sku: string,
    historicalSales: HistoricalSale[],
    daysToForecast: number,
    period: number = 30 // moving average period
): Forecast[] => {
    const productSales = historicalSales
        .filter(s => s.sku === sku)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (productSales.length < period) {
        // Not enough data, return a flat, low-confidence forecast
        const forecast: Forecast[] = [];
        const today = new Date();
        for (let i = 1; i <= daysToForecast; i++) {
            const forecastDate = new Date(today);
            forecastDate.setDate(today.getDate() + i);
            forecast.push({
                sku,
                date: forecastDate.toISOString().split('T')[0],
                quantity: 1, // default low forecast
            });
        }
        return forecast;
    }

    const lastPeriodSales = productSales.slice(-period);
    const averageDailySales = lastPeriodSales.reduce((sum, sale) => sum + sale.quantity, 0) / period;
    
    // Simple forecast assumes average continues
    const dailyForecast = Math.ceil(averageDailySales);
    
    const forecast: Forecast[] = [];
    const today = new Date();

    for (let i = 1; i <= daysToForecast; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        
        // Add some weekly seasonality (e.g., slightly lower on weekends)
        const dayOfWeek = forecastDate.getDay();
        let demand = dailyForecast;
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
            demand = Math.floor(dailyForecast * 0.8);
        }

        forecast.push({
            sku,
            date: forecastDate.toISOString().split('T')[0],
            quantity: demand > 0 ? demand : 0,
        });
    }

    return forecast;
};

/**
 * Enhanced forecast with trend and seasonality
 */
export function generateEnhancedForecast(
  sku: string,
  historicalSales: Array<{ date: string; quantity: number }>,
  daysToForecast: number,
  options?: {
    includeTrend?: boolean;
    includeSeasonality?: boolean;
    confidenceInterval?: boolean;
  }
): Forecast[] {
  const { includeTrend = true, includeSeasonality = true, confidenceInterval = true } = options || {};
  
  // Get base forecast
  const baseForecast = generateForecast(sku, historicalSales, daysToForecast);
  
  // Calculate trend if enabled
  let trendFactor = 0;
  if (includeTrend && historicalSales.length >= 90) {
    const recent30 = historicalSales.slice(-30).reduce((sum, s) => sum + s.quantity, 0) / 30;
    const previous30 = historicalSales.slice(-60, -30).reduce((sum, s) => sum + s.quantity, 0) / 30;
    trendFactor = previous30 > 0 ? (recent30 - previous30) / previous30 : 0;
  }
  
  // Get seasonal patterns if enabled
  let seasonalPatterns: SeasonalPattern[] = [];
  if (includeSeasonality && historicalSales.length >= 365) {
    seasonalPatterns = detectSeasonalPatterns(historicalSales);
  }
  
  // Apply adjustments
  return baseForecast.map((forecast, index) => {
    let adjustedQuantity = forecast.quantity;
    
    // Apply trend
    if (includeTrend) {
      const trendAdjustment = 1 + (trendFactor * (index / daysToForecast));
      adjustedQuantity *= trendAdjustment;
    }
    
    // Apply seasonality
    if (includeSeasonality && seasonalPatterns.length > 0) {
      const forecastDate = new Date(forecast.date);
      const month = forecastDate.getMonth();
      const pattern = seasonalPatterns[month];
      if (pattern) {
        adjustedQuantity *= pattern.seasonalFactor;
      }
    }
    
    // Calculate confidence interval
    let confidence = 0.8; // default
    let lowerBound = adjustedQuantity;
    let upperBound = adjustedQuantity;
    
    if (confidenceInterval) {
      // Confidence decreases with forecast horizon
      confidence = Math.max(0.5, 0.9 - (index / daysToForecast) * 0.4);
      
      // 95% confidence interval (approximately ±2 standard deviations)
      const variance = adjustedQuantity * 0.3; // assume 30% variance
      lowerBound = Math.max(0, adjustedQuantity - variance * 2);
      upperBound = adjustedQuantity + variance * 2;
    }
    
    return {
      ...forecast,
      quantity: Math.round(adjustedQuantity),
      confidence,
      lowerBound: Math.round(lowerBound),
      upperBound: Math.round(upperBound),
    };
  });
}
