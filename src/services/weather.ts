// src/services/weather.ts
import { Config } from '../config.js';
import { info, warn } from '../utils/logger.js';

export interface WeatherData {
  city: string;
  temp: number;
  description: string;
  high: number;
  low: number;
  humidity: number;
}

export interface ForecastDay {
  date: Date;
  dayName: string;
  high: number;
  low: number;
  description: string;
}

export class WeatherService {
  private config: Config;
  private available = false;

  constructor(config: Config) {
    this.config = config;
    this.available = !!(config.weather.apiKey && config.weather.city);
  }

  async initialize(): Promise<void> {
    if (this.available) {
      info('WeatherService initialized');
    } else {
      info('WeatherService: not configured (optional)');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async getCurrent(): Promise<WeatherData | null> {
    if (!this.available) return null;

    try {
      const units = this.config.weather.units === 'C' ? 'metric' : 'imperial';
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(this.config.weather.city!)}&appid=${this.config.weather.apiKey}&units=${units}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as {
        name: string;
        main: { temp: number; temp_max: number; temp_min: number; humidity: number };
        weather: Array<{ description: string }>;
      };

      return {
        city: data.name,
        temp: Math.round(data.main.temp),
        description: data.weather[0]?.description || 'Unknown',
        high: Math.round(data.main.temp_max),
        low: Math.round(data.main.temp_min),
        humidity: data.main.humidity,
      };
    } catch (err) {
      warn('Weather fetch failed', { error: String(err) });
      return null;
    }
  }

  /**
   * Get weather forecast for today and the next N days.
   * Uses OpenWeatherMap 5-day/3-hour forecast API.
   */
  async getForecast(days: number = 3): Promise<ForecastDay[] | null> {
    if (!this.available) return null;

    try {
      const units = this.config.weather.units === 'C' ? 'metric' : 'imperial';
      const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(this.config.weather.city!)}&appid=${this.config.weather.apiKey}&units=${units}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as {
        city: { name: string };
        list: Array<{
          dt: number;
          main: { temp_min: number; temp_max: number };
          weather: Array<{ description: string }>;
        }>;
      };

      // Group by day and extract high/low
      const dayMap = new Map<string, { highs: number[]; lows: number[]; descriptions: string[] }>();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (const entry of data.list) {
        const date = new Date(entry.dt * 1000);
        const dateKey = date.toISOString().split('T')[0];

        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { highs: [], lows: [], descriptions: [] });
        }

        const day = dayMap.get(dateKey)!;
        day.highs.push(entry.main.temp_max);
        day.lows.push(entry.main.temp_min);
        if (entry.weather[0]?.description) {
          day.descriptions.push(entry.weather[0].description);
        }
      }

      // Convert to ForecastDay array, limit to requested days
      const forecast: ForecastDay[] = [];
      const sortedDates = Array.from(dayMap.keys()).sort();

      for (const dateKey of sortedDates.slice(0, days)) {
        const dayData = dayMap.get(dateKey)!;
        const date = new Date(dateKey);

        // Get most common description
        const descCounts = new Map<string, number>();
        for (const desc of dayData.descriptions) {
          descCounts.set(desc, (descCounts.get(desc) || 0) + 1);
        }
        const mostCommonDesc = Array.from(descCounts.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

        forecast.push({
          date,
          dayName: dayNames[date.getDay()],
          high: Math.round(Math.max(...dayData.highs)),
          low: Math.round(Math.min(...dayData.lows)),
          description: mostCommonDesc,
        });
      }

      return forecast;
    } catch (err) {
      warn('Weather forecast fetch failed', { error: String(err) });
      return null;
    }
  }

  /**
   * Format forecast as a compact string for messages.
   * Shows both F and C for clarity.
   */
  formatForecast(forecast: ForecastDay[]): string {
    const isMetric = this.config.weather.units === 'C';
    const lines = forecast.map((day, i) => {
      const label = i === 0 ? 'Today' : day.dayName;
      // Convert and show both units
      const highC = isMetric ? day.high : Math.round((day.high - 32) * 5/9);
      const lowC = isMetric ? day.low : Math.round((day.low - 32) * 5/9);
      const highF = isMetric ? Math.round(day.high * 9/5 + 32) : day.high;
      const lowF = isMetric ? Math.round(day.low * 9/5 + 32) : day.low;
      return `${label}: ${highF}/${lowF}°F (${highC}/${lowC}°C) ${day.description}`;
    });
    return lines.join('\n');
  }

  close(): void {}
}
