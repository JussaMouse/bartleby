// src/tools/weather.ts
import { Tool } from './types.js';

export const getWeather: Tool = {
  name: 'getWeather',
  description: 'Get current weather',

  routing: {
    patterns: [
      /^weather$/i,
      /^what('s| is) the weather/i,
      /^how('s| is) the weather/i,
    ],
    keywords: {
      verbs: ['show', 'get', 'what'],
      nouns: ['weather', 'temperature', 'forecast'],
    },
    priority: 50,
  },

  execute: async (args, context) => {
    const weather = await context.services.weather.getCurrent();

    if (!weather) {
      return 'Weather service not configured. Set WEATHER_CITY and OPENWEATHERMAP_API_KEY in .env';
    }

    return `**${weather.city}** - ${weather.temp}°, ${weather.description}\nHigh: ${weather.high}° | Low: ${weather.low}°`;
  },
};

export const weatherTools: Tool[] = [getWeather];
