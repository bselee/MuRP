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

/**
 * Seasonal factor data for UI display
 */
export interface SeasonalFactorData {
  sku: string;
  product_name: string;
  annual_value?: number;
  monthly_factors: number[]; // 12 elements for Jan-Dec
}

/**
 * Get seasonal factors for top SKUs by value
 * Returns monthly demand factors relative to annual average
 */
export async function getSeasonalFactors(
  maxItems: number = 20
): Promise<SeasonalFactorData[]> {
  // Import supabase client dynamically to avoid circular dependencies
  const { supabase } = await import('../lib/supabase/client');

  try {
    // Get top SKUs by annual value (using sales_last_90_days as proxy)
    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('sku, name, unit_cost, sales_last_30_days, sales_last_60_days, sales_last_90_days')
      .eq('status', 'active')
      .or('is_dropship.is.null,is_dropship.eq.false')
      .gt('sales_last_90_days', 0)
      .order('sales_last_90_days', { ascending: false })
      .limit(maxItems * 2); // Get extra to filter

    if (error) throw error;
    if (!items || items.length === 0) return [];

    // Calculate annual value and filter to top items
    const itemsWithValue = items.map(item => {
      const dailyDemand = (item.sales_last_90_days || 0) / 90;
      const unitCost = item.unit_cost || 1;
      const annualValue = dailyDemand * 365 * unitCost;
      return { ...item, annualValue };
    });

    // Sort by annual value and take top N
    const topItems = itemsWithValue
      .sort((a, b) => b.annualValue - a.annualValue)
      .slice(0, maxItems);

    // Generate seasonal factors from available data
    // Use 30/60/90 day sales to estimate seasonal patterns
    const results: SeasonalFactorData[] = topItems.map(item => {
      const sales30 = item.sales_last_30_days || 0;
      const sales60 = item.sales_last_60_days || 0;
      const sales90 = item.sales_last_90_days || 0;

      // Calculate daily rates
      const rate30 = sales30 / 30;
      const rate60 = sales60 / 60;
      const rate90 = sales90 / 90;
      const avgRate = (rate30 + rate60 + rate90) / 3 || 1;

      // Calculate variability factor (used for generating realistic seasonal patterns)
      const variability = avgRate > 0 ? Math.abs(rate30 - rate90) / avgRate : 0.2;

      // Generate 12 monthly factors
      // Without full historical data, we estimate using current trends
      const currentMonth = new Date().getMonth();
      const monthly_factors: number[] = [];

      for (let m = 0; m < 12; m++) {
        // Create a realistic seasonal wave pattern
        // Many products peak in Q2/Q3 (spring/summer) or Q4 (holiday)
        const monthOffset = (m - currentMonth + 12) % 12;

        // Base seasonal pattern (simplified sine wave with some variation)
        // This creates a gentle seasonal effect
        let factor = 1.0;

        // If we have enough data showing trends, incorporate that
        if (monthOffset <= 1) {
          // Near-term months use recent data
          factor = avgRate > 0 ? rate30 / avgRate : 1.0;
        } else if (monthOffset <= 3) {
          // Mid-term months
          factor = avgRate > 0 ? (rate30 * 0.5 + rate60 * 0.5) / avgRate : 1.0;
        } else {
          // Further out months - add seasonal estimation
          // Simple sine wave pattern (adjustable)
          const seasonalWave = Math.sin((m - 3) * Math.PI / 6) * 0.15 * variability;
          factor = 1.0 + seasonalWave;
        }

        // Clamp to reasonable range
        monthly_factors.push(Math.max(0.6, Math.min(1.4, factor)));
      }

      return {
        sku: item.sku,
        product_name: item.name || item.sku,
        annual_value: item.annualValue,
        monthly_factors,
      };
    });

    return results;
  } catch (error) {
    console.error('[ForecastingService] Failed to get seasonal factors:', error);
    return [];
  }
}

export default {
  calculateTrendMetrics,
  detectSeasonalPatterns,
  generateForecast,
  generateEnhancedForecast,
  getSeasonalFactors,
};
