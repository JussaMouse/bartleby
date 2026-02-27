import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export interface SettingsStorePaths {
  settingsPath: string;
  secretsPath: string;
}

export interface SettingsStoreOptions {
  fileMode?: number;
}

export function defaultSettingsPaths(cwd: string = process.cwd()): SettingsStorePaths {
  return {
    settingsPath: path.join(cwd, 'settings.yaml'),
    secretsPath: path.join(cwd, 'secrets.yaml'),
  };
}

export function readSettingsFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return {};

  const parsed = YAML.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

export function writeSettingsFile(
  filePath: string,
  data: Record<string, unknown>,
  options: SettingsStoreOptions = {}
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = data[key];
  }

  const content = YAML.stringify(sorted);
  const tmpPath = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}`);

  fs.writeFileSync(tmpPath, content, { encoding: 'utf-8' });

  if (options.fileMode !== undefined) {
    fs.chmodSync(tmpPath, options.fileMode);
  }

  fs.renameSync(tmpPath, filePath);

  if (options.fileMode !== undefined) {
    fs.chmodSync(filePath, options.fileMode);
  }
}
