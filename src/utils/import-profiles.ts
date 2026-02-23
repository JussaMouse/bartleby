// src/utils/import-profiles.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { z } from 'zod';

/**
 * Import profile schema
 */
export const ImportProfileSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1).max(200),
  defaultProject: z.string().optional(),
  defaultContext: z.string().optional(),
  defaultPrivacy: z.enum(['public', 'private', 'confidential']).optional(),
  enableOcr: z.boolean().default(false),
  autoConfirm: z.boolean().default(false),
  duplicateAction: z.enum(['skip', 'prompt', 'reimport']).default('prompt'),
  rulesEnabled: z.boolean().default(true),
});

export type ImportProfile = z.infer<typeof ImportProfileSchema>;

/**
 * Profiles file schema
 */
const ProfilesFileSchema = z.object({
  profiles: z.array(ImportProfileSchema),
});

type ProfilesFile = z.infer<typeof ProfilesFileSchema>;

/**
 * Import Profile Manager
 *
 * Manages named import profiles with preset configurations.
 */
export class ImportProfileManager {
  private profilesPath: string;
  private profiles: Map<string, ImportProfile>;

  constructor(profilesPath: string = './import-profiles.json') {
    this.profilesPath = profilesPath;
    this.profiles = new Map();
    this.load();
  }

  /**
   * Load profiles from file
   */
  private load(): void {
    if (!existsSync(this.profilesPath)) {
      // Create empty profiles file
      this.save();
      return;
    }

    try {
      const content = readFileSync(this.profilesPath, 'utf-8');
      const data = JSON.parse(content) as ProfilesFile;
      const validated = ProfilesFileSchema.parse(data);

      this.profiles.clear();
      for (const profile of validated.profiles) {
        this.profiles.set(profile.name, profile);
      }
    } catch (err) {
      throw new Error(`Failed to load import profiles: ${String(err)}`);
    }
  }

  /**
   * Save profiles to file
   */
  private save(): void {
    const data: ProfilesFile = {
      profiles: Array.from(this.profiles.values()),
    };

    writeFileSync(this.profilesPath, JSON.stringify(data, null, 2));
  }

  /**
   * Get a profile by name
   */
  get(name: string): ImportProfile | undefined {
    return this.profiles.get(name);
  }

  /**
   * List all profiles
   */
  list(): ImportProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Create a new profile
   */
  create(profile: ImportProfile): void {
    if (this.profiles.has(profile.name)) {
      throw new Error(`Profile already exists: ${profile.name}`);
    }

    // Validate
    const validated = ImportProfileSchema.parse(profile);
    this.profiles.set(validated.name, validated);
    this.save();
  }

  /**
   * Update an existing profile
   */
  update(name: string, updates: Partial<Omit<ImportProfile, 'name'>>): void {
    const existing = this.profiles.get(name);
    if (!existing) {
      throw new Error(`Profile not found: ${name}`);
    }

    const updated = { ...existing, ...updates };
    const validated = ImportProfileSchema.parse(updated);
    this.profiles.set(name, validated);
    this.save();
  }

  /**
   * Delete a profile
   */
  delete(name: string): boolean {
    const deleted = this.profiles.delete(name);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Check if a profile exists
   */
  exists(name: string): boolean {
    return this.profiles.has(name);
  }
}
