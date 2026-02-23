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
 *
 * @deprecated This class is now a compatibility wrapper around ImportConfigService.
 * Access the service directly via context.services.importConfig for new code.
 */
export class ImportProfileManager {
  private service: any; // ImportConfigService (avoiding circular dependency)
  private profilesPath: string;

  constructor(profilesPath: string = './import-profiles.json') {
    this.profilesPath = profilesPath;

    if (profilesPath !== './import-profiles.json') {
      console.warn('ImportProfileManager profilesPath parameter is deprecated. Profiles are now stored in database.');
    }

    // Service will be injected via setService method
  }

  /**
   * Set the ImportConfigService instance (called from tools)
   */
  setService(service: any): void {
    this.service = service;
  }

  /**
   * Get a profile by name
   */
  get(name: string): ImportProfile | undefined {
    if (!this.service) {
      console.warn('ImportProfileManager: service not set');
      return undefined;
    }
    return this.service.getProfile(name);
  }

  /**
   * List all profiles
   */
  list(): ImportProfile[] {
    if (!this.service) {
      console.warn('ImportProfileManager: service not set, returning empty list');
      return [];
    }
    return this.service.getProfiles();
  }

  /**
   * Create a new profile
   */
  create(profile: ImportProfile): void {
    if (!this.service) {
      throw new Error('ImportProfileManager: service not set');
    }
    this.service.createProfile(profile);
  }

  /**
   * Update an existing profile
   */
  update(name: string, updates: Partial<Omit<ImportProfile, 'name'>>): void {
    if (!this.service) {
      throw new Error('ImportProfileManager: service not set');
    }
    this.service.updateProfile(name, updates);
  }

  /**
   * Delete a profile
   */
  delete(name: string): boolean {
    if (!this.service) {
      console.warn('ImportProfileManager: service not set');
      return false;
    }
    return this.service.deleteProfile(name);
  }

  /**
   * Check if a profile exists
   */
  exists(name: string): boolean {
    return this.get(name) !== undefined;
  }
}
