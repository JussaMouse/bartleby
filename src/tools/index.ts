// src/tools/index.ts
import { Tool } from './types.js';
import { gtdTools } from './gtd.js';
import { calendarTools } from './calendar.js';
import { contactTools } from './contacts.js';
import { contextTools } from './context.js';
import { shedTools } from './shed.js';
import { schedulerTools } from './scheduler.js';
import { weatherTools } from './weather.js';
import { systemTools } from './system.js';

// Aggregate all tools
export const allTools: Tool[] = [
  ...gtdTools,
  ...calendarTools,
  ...contactTools,
  ...contextTools,
  ...shedTools,
  ...schedulerTools,
  ...weatherTools,
  ...systemTools,
];

export function getToolByName(name: string): Tool | undefined {
  return allTools.find(t => t.name === name);
}

export function getToolsByPriority(): Tool[] {
  return [...allTools].sort((a, b) => {
    const pa = a.routing?.priority ?? 0;
    const pb = b.routing?.priority ?? 0;
    return pb - pa;
  });
}

export function getToolDescriptions(): string {
  return allTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
}

// Re-export
export * from './types.js';
