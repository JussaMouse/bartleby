import { debug, warn } from '../utils/logger.js';
import {
  SETTINGS_REGISTRY,
  SETTINGS_BY_KEY,
  getSettingsByCategory,
  type SettingDefinition,
} from '../settings/registry.js';
import {
  defaultSettingsPaths,
  readSettingsFile,
  writeSettingsFile,
  type SettingsStorePaths,
} from '../settings/store.js';

const FIRST_RUN_KEY = 'system.first_run_completed';

export interface SettingsStats {
  total: number;
  byCategory: Record<string, number>;
  firstRunCompleted: boolean;
}

export class SettingsService {
  private settings: Record<string, unknown> = {};
  private secrets: Record<string, unknown> = {};
  private loaded = false;
  private firstRunCompleted = false;
  private storePaths: SettingsStorePaths;

  constructor(storePaths?: SettingsStorePaths) {
    this.storePaths = storePaths ?? defaultSettingsPaths();
  }

  async initialize(): Promise<void> {
    this.settings = readSettingsFile(this.storePaths.settingsPath);
    this.secrets = readSettingsFile(this.storePaths.secretsPath);
    this.firstRunCompleted = Boolean(this.settings[FIRST_RUN_KEY]);
    this.loaded = true;
    debug('SettingsService initialized', { settings: Object.keys(this.settings).length });
  }

  isFirstRun(): boolean {
    return !this.firstRunCompleted;
  }

  markFirstRunComplete(): void {
    this.firstRunCompleted = true;
    this.settings[FIRST_RUN_KEY] = true;
    this.persistSettings();
  }

  getSetting<T = unknown>(key: string, defaultValue?: T): T {
    const definition = SETTINGS_BY_KEY.get(key);
    if (!definition) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Unknown setting key: ${key}`);
    }

    const rawValue = this.readValue(definition);
    if (rawValue === undefined) {
      return (defaultValue !== undefined ? defaultValue : definition.default) as T;
    }

    return rawValue as T;
  }

  hasSetting(key: string): boolean {
    const definition = SETTINGS_BY_KEY.get(key);
    if (!definition) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    const source = definition.secret ? this.secrets : this.settings;
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  setSetting<T = unknown>(
    key: string,
    value: T,
    category: string,
    description?: string
  ): void {
    const definition = SETTINGS_BY_KEY.get(key);
    if (!definition) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    if (definition.category !== category) {
      warn('Setting category mismatch', { key, category, expected: definition.category });
    }

    const normalized = normalizeValue(definition, value);
    const validationError = definition.validate ? definition.validate(normalized as any) : null;
    if (validationError) {
      throw new Error(validationError);
    }

    if (definition.secret) {
      this.secrets[key] = normalized;
      this.persistSecrets();
    } else {
      this.settings[key] = normalized;
      this.persistSettings();
    }

    if (description) {
      debug('Setting updated', { key, description });
    }
  }

  getCategory(category: string): Record<string, unknown> {
    const definitions = getSettingsByCategory(category);
    const result: Record<string, unknown> = {};

    for (const definition of definitions) {
      const value = this.readValue(definition);
      const shortKey = definition.key.replace(`${category}.`, '');
      result[shortKey] = value !== undefined ? value : definition.default;
    }

    return result;
  }

  getAllSettings(): Record<string, Record<string, unknown>> {
    const categories = new Set(SETTINGS_REGISTRY.map((definition) => definition.category));
    const result: Record<string, Record<string, unknown>> = {};

    for (const category of categories) {
      result[category] = this.getCategory(category);
    }

    return result;
  }

  getStats(): SettingsStats {
    const byCategory: Record<string, number> = {};

    for (const definition of SETTINGS_REGISTRY) {
      byCategory[definition.category] = (byCategory[definition.category] || 0) + 1;
    }

    return {
      total: SETTINGS_REGISTRY.length,
      byCategory,
      firstRunCompleted: this.firstRunCompleted,
    };
  }

  clearCache(): void {
    debug('Settings cache cleared (noop for file-backed settings)');
  }

  private readValue(definition: SettingDefinition): unknown {
    const source = definition.secret ? this.secrets : this.settings;
    if (Object.prototype.hasOwnProperty.call(source, definition.key)) {
      return source[definition.key];
    }

    return undefined;
  }

  private persistSettings(): void {
    if (!this.loaded) return;
    writeSettingsFile(this.storePaths.settingsPath, this.settings);
  }

  private persistSecrets(): void {
    if (!this.loaded) return;
    writeSettingsFile(this.storePaths.secretsPath, this.secrets, { fileMode: 0o600 });
  }
}

function normalizeValue<T>(definition: SettingDefinition<T>, value: T): T {
  if (definition.type === 'string_list') {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0) as T;
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) as T;
    }
  }

  if (definition.type === 'number' && typeof value === 'string') {
    const parsed = Number(value);
    return (Number.isNaN(parsed) ? definition.default : parsed) as T;
  }

  if (definition.type === 'boolean' && typeof value === 'string') {
    return (value.toLowerCase() === 'true') as T;
  }

  if (definition.type === 'enum' && definition.options) {
    const normalized = String(value);
    if (!definition.options.includes(normalized)) {
      throw new Error(`Invalid value for ${definition.key}. Allowed: ${definition.options.join(', ')}`);
    }
  }

  return value;
}
