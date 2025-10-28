import type { HistoricalSale } from '../types';

export interface Forecast {
    date: string; // YYYY-MM-DD
    sku: string;
    quantity: number;
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
