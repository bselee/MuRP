/**
 * Seasonal Forecasting Tests
 * 
 * Tests for demand forecasting with seasonal adjustments.
 * BuildASoil has strong seasonal patterns (spring rush, winter lull).
 * 
 * CLAUDE CODE: These tests validate that seasonal indices apply correctly.
 * The indices in fixtures reflect actual BuildASoil sales patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  seasonalIndices,
  forecastScenarios,
  products
} from '../__fixtures__/buildaSoilData';
import { roundTo } from '../__helpers__/testUtils';

describe('Seasonal Index Management', () => {
  
  // ===========================================================================
  // INDEX DATA VALIDATION
  // ===========================================================================
  
  describe('seasonal index data integrity', () => {
    
    it('has indices for all 12 months', () => {
      expect(seasonalIndices.length).toBe(12);
      
      const months = seasonalIndices.map(si => si.month);
      expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
    
    it('all indices are positive', () => {
      seasonalIndices.forEach(si => {
        expect(si.index_value).toBeGreaterThan(0);
      });
    });
    
    it('average index is approximately 1.0 (should balance out)', () => {
      const sum = seasonalIndices.reduce((acc, si) => acc + si.index_value, 0);
      const avg = sum / 12;
      
      // Should be close to 1.0 (allow some variance for business reality)
      expect(avg).toBeGreaterThan(0.8);
      expect(avg).toBeLessThan(1.2);
    });
    
    it('spring months (March-May) have highest indices', () => {
      const springIndices = seasonalIndices
        .filter(si => [3, 4, 5].includes(si.month))
        .map(si => si.index_value);

      const avgSpring = springIndices.reduce((a, b) => a + b, 0) / springIndices.length;
      const avgAll = seasonalIndices.reduce((a, b) => a + b.index_value, 0) / seasonalIndices.length;

      // Spring average should be significantly above overall average
      expect(avgSpring).toBeGreaterThan(avgAll);
      // Spring should include the peak month (May at 1.90)
      expect(Math.max(...springIndices)).toBe(1.90);
    });
    
    it('December has lowest index', () => {
      const december = seasonalIndices.find(si => si.month === 12);
      const minIndex = Math.min(...seasonalIndices.map(si => si.index_value));
      
      expect(december?.index_value).toBe(minIndex);
      expect(december?.index_value).toBe(0.50);
    });
    
    it('May has peak index', () => {
      const may = seasonalIndices.find(si => si.month === 5);
      const maxIndex = Math.max(...seasonalIndices.map(si => si.index_value));
      
      expect(may?.index_value).toBe(maxIndex);
      expect(may?.index_value).toBe(1.90);
    });
  });
});

describe('Demand Forecast Calculation', () => {
  
  // ===========================================================================
  // BASE FORECAST APPLICATION
  // ===========================================================================
  
  const calculateSeasonalForecast = (
    baseForecast: number,
    seasonalIndex: number
  ): number => {
    return Math.ceil(baseForecast * seasonalIndex);
  };
  
  describe('seasonal adjustment application', () => {
    
    it('applies index of 1.0 (no change)', () => {
      const base = 100;
      const index = 1.0;
      
      const result = calculateSeasonalForecast(base, index);
      
      expect(result).toBe(100);
    });
    
    it('applies spring rush index (1.8x)', () => {
      const base = 100;
      const index = 1.8; // April
      
      const result = calculateSeasonalForecast(base, index);
      
      expect(result).toBe(180);
    });
    
    it('applies winter lull index (0.5x)', () => {
      const base = 100;
      const index = 0.5; // December
      
      const result = calculateSeasonalForecast(base, index);
      
      expect(result).toBe(50);
    });
    
    it('rounds UP for partial units', () => {
      const base = 100;
      const index = 0.65; // November
      
      const result = calculateSeasonalForecast(base, index);
      
      expect(result).toBe(65); // 100 × 0.65 = 65 exactly
    });
    
    it('rounds UP when needed', () => {
      const base = 33;
      const index = 1.4; // March
      
      const result = calculateSeasonalForecast(base, index);
      
      // 33 × 1.4 = 46.2 → ceil → 47
      expect(result).toBe(47);
    });
  });
  
  // ===========================================================================
  // SCENARIO VALIDATION
  // ===========================================================================
  
  describe('forecast scenario calculations', () => {
    
    it('normal scenario applies 1.0 index', () => {
      const scenario = forecastScenarios.normal;
      
      scenario.forEach(f => {
        expect(f.seasonal_index).toBe(1.0);
      });
    });
    
    it('spring rush scenario multiplies demand by 1.8', () => {
      const scenario = forecastScenarios.springRush;
      const craft8 = scenario.find(f => f.product_id === 'CRAFT8')!;
      
      expect(craft8.seasonal_index).toBe(1.8);
      
      const adjustedForecast = calculateSeasonalForecast(
        craft8.base_forecast,
        craft8.seasonal_index
      );
      
      expect(adjustedForecast).toBe(36); // 20 × 1.8 = 36
    });
    
    it('winter lull scenario reduces demand by 40%', () => {
      const scenario = forecastScenarios.winterLull;
      const craft8 = scenario.find(f => f.product_id === 'CRAFT8')!;
      
      expect(craft8.seasonal_index).toBe(0.6);
      
      const adjustedForecast = calculateSeasonalForecast(
        craft8.base_forecast,
        craft8.seasonal_index
      );
      
      expect(adjustedForecast).toBe(12); // 20 × 0.6 = 12
    });
  });
});

describe('Component Requirements with Seasonality', () => {
  
  // ===========================================================================
  // END-TO-END SEASONAL FLOW
  // ===========================================================================
  
  describe('seasonal demand flowing to components', () => {
    
    it('spring rush increases component requirements proportionally', () => {
      // CRAFT8 uses 1.5 FM104 per unit
      const baseCraft8Demand = 20;
      const springIndex = 1.8;
      const fm104PerCraft8 = 1.5;
      
      const seasonalDemand = Math.ceil(baseCraft8Demand * springIndex); // 36
      const fm104Needed = seasonalDemand * fm104PerCraft8;
      
      expect(fm104Needed).toBe(54); // 36 × 1.5
    });
    
    it('winter lull decreases component requirements proportionally', () => {
      const baseCraft8Demand = 20;
      const winterIndex = 0.5;
      const fm104PerCraft8 = 1.5;
      
      const seasonalDemand = Math.ceil(baseCraft8Demand * winterIndex); // 10
      const fm104Needed = seasonalDemand * fm104PerCraft8;
      
      expect(fm104Needed).toBe(15); // 10 × 1.5
    });
    
    it('seasonal swing is 3.8x from winter to peak (Dec to May)', () => {
      const decemberIndex = 0.5;
      const mayIndex = 1.9;
      
      const ratio = mayIndex / decemberIndex;
      
      expect(ratio).toBe(3.8);
    });
  });
  
  // ===========================================================================
  // MULTI-MONTH PLANNING
  // ===========================================================================
  
  describe('multi-month forecast planning', () => {
    
    const calculateMonthlyForecasts = (
      baseDemand: number,
      startMonth: number,
      months: number
    ): number[] => {
      const forecasts: number[] = [];
      
      for (let i = 0; i < months; i++) {
        const month = ((startMonth - 1 + i) % 12) + 1;
        const index = seasonalIndices.find(si => si.month === month)?.index_value || 1.0;
        forecasts.push(Math.ceil(baseDemand * index));
      }
      
      return forecasts;
    };
    
    it('Q1 forecast shows increasing demand', () => {
      const baseDemand = 100;
      const q1Forecasts = calculateMonthlyForecasts(baseDemand, 1, 3);
      
      // January: 60, February: 80, March: 140
      expect(q1Forecasts).toEqual([60, 80, 140]);
      
      // Should be increasing
      expect(q1Forecasts[2]).toBeGreaterThan(q1Forecasts[1]);
      expect(q1Forecasts[1]).toBeGreaterThan(q1Forecasts[0]);
    });
    
    it('Q2 forecast shows peak then decline', () => {
      const baseDemand = 100;
      const q2Forecasts = calculateMonthlyForecasts(baseDemand, 4, 3);
      
      // April: 180, May: 190, June: 150
      expect(q2Forecasts).toEqual([180, 190, 150]);
      
      // May is peak
      expect(q2Forecasts[1]).toBeGreaterThan(q2Forecasts[0]);
      expect(q2Forecasts[1]).toBeGreaterThan(q2Forecasts[2]);
    });
    
    it('total annual demand with seasonality', () => {
      const baseDemand = 100;
      const annualForecasts = calculateMonthlyForecasts(baseDemand, 1, 12);
      const totalAnnual = annualForecasts.reduce((sum, f) => sum + f, 0);
      
      // Sum of all monthly forecasts
      // Base would be 1200 (100 × 12)
      // With seasonality, should be close to that
      expect(totalAnnual).toBeGreaterThan(1000);
      expect(totalAnnual).toBeLessThan(1400);
    });
  });
});

describe('Seasonal Index Edge Cases', () => {
  
  // ===========================================================================
  // DATA QUALITY ISSUES
  // ===========================================================================
  
  describe('index data quality', () => {
    
    it('index of exactly 0 would be invalid', () => {
      // If index were 0, all demand would disappear
      const zeroIndex = seasonalIndices.find(si => si.index_value === 0);
      expect(zeroIndex).toBeUndefined();
    });
    
    it('all indices are at least 0.1', () => {
      const minIndex = Math.min(...seasonalIndices.map(si => si.index_value));
      expect(minIndex).toBeGreaterThanOrEqual(0.5);
    });
    
    it('no index exceeds 3.0 (unrealistic)', () => {
      const maxIndex = Math.max(...seasonalIndices.map(si => si.index_value));
      expect(maxIndex).toBeLessThanOrEqual(2.0);
    });
  });
  
  // ===========================================================================
  // MISSING DATA HANDLING
  // ===========================================================================
  
  describe('handling missing seasonal data', () => {
    
    const getSeasonalIndex = (month: number, category: string): number => {
      const found = seasonalIndices.find(
        si => si.month === month && si.category === category
      );
      return found?.index_value ?? 1.0; // Default to 1.0 if not found
    };
    
    it('returns 1.0 for unknown category', () => {
      const index = getSeasonalIndex(5, 'unknown-category');
      expect(index).toBe(1.0);
    });
    
    it('returns 1.0 for invalid month', () => {
      const index = getSeasonalIndex(13, 'soil');
      expect(index).toBe(1.0);
    });
    
    it('finds correct index for valid inputs', () => {
      const mayIndex = getSeasonalIndex(5, 'soil');
      expect(mayIndex).toBe(1.90);
    });
  });
});

describe('Promotional Lift Integration', () => {
  
  // ===========================================================================
  // PROMO EVENTS OVERLAY
  // ===========================================================================
  
  const calculateForecastWithPromo = (
    baseForecast: number,
    seasonalIndex: number,
    promoLift: number = 0
  ): number => {
    const seasonalForecast = baseForecast * seasonalIndex;
    return Math.ceil(seasonalForecast + promoLift);
  };
  
  describe('promotional event handling', () => {
    
    it('adds promo lift on top of seasonal forecast', () => {
      const base = 100;
      const seasonal = 1.5;
      const promo = 50; // Black Friday promo units
      
      const result = calculateForecastWithPromo(base, seasonal, promo);
      
      expect(result).toBe(200); // (100 × 1.5) + 50
    });
    
    it('promo lift of 0 has no effect', () => {
      const base = 100;
      const seasonal = 1.5;
      const promo = 0;
      
      const result = calculateForecastWithPromo(base, seasonal, promo);
      
      expect(result).toBe(150); // Just seasonal
    });
    
    it('Black Friday scenario (November + promo)', () => {
      const novemberIndex = 0.65;
      const base = 100;
      const blackFridayPromo = 75; // Extra units for sale
      
      const result = calculateForecastWithPromo(base, novemberIndex, blackFridayPromo);
      
      expect(result).toBe(140); // (100 × 0.65) + 75 = 65 + 75
    });
  });
});
