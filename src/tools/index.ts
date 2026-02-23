// src/tools/index.ts
import { Tool } from './types.js';
import { promptHandler } from './prompt-handler.js';
import { gtdTools } from './gtd.js';
import { calendarTools } from './calendar.js';
import { contactTools } from './contacts.js';
import { contextTools } from './context.js';
import { memoryTools } from './memory.js';
import { shedTools } from './shed.js';
import { schedulerTools } from './scheduler.js';
import { weatherTools } from './weather.js';
import { systemTools } from './system.js';
import { ocrTools } from './ocr.js';
import { dataTools } from './data.js';
import { mediaTools } from './media.js';
import { insightsTools } from './insights.js';
import { relatedTools } from './related.js';
import { historyTools } from './history.js';
import { importTools } from './import.js';
import { importRuleTools } from './import-rules-tool.js';
import { importRuleMgmtTools } from './import-rules-mgmt.js';
import { batchImportTools } from './import-batch.js';
import { urlImportTools } from './import-url.js';
import { settingsTools } from './settings.js';
import { firstRunTools } from './first-run-wizard.js';
import { settingsMigrationTools } from './settings-migration.js';
import { importProfileTools } from './import-profiles.js';

// Aggregate all tools
// promptHandler MUST be first for Layer 0 contextual routing
export const allTools: Tool[] = [
  promptHandler,  // Layer 0: pending prompts bypass all routing
  ...gtdTools,
  ...calendarTools,
  ...contactTools,
  ...contextTools,
  ...memoryTools,  // Agent-controlled memory operations
  ...insightsTools,
  ...relatedTools,
  ...historyTools,
  ...shedTools,
  ...mediaTools,
  ...importTools,
  ...importRuleTools,
  ...importRuleMgmtTools,
  ...batchImportTools,
  ...urlImportTools,
  ...importProfileTools,
  ...schedulerTools,
  ...weatherTools,
  ...systemTools,
  ...settingsTools,
  ...firstRunTools,
  ...settingsMigrationTools,
  ...ocrTools,
  ...dataTools,
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
