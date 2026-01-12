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

  close(): void {}
}
