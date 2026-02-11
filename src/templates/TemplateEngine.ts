// src/templates/TemplateEngine.ts
// Template-based page creation with variable substitution

import fs from 'fs';
import path from 'path';
import { GardenService, GardenRecord, RecordType } from '../services/garden.js';
import { Config, resolvePath } from '../config.js';
import { info, warn } from '../utils/logger.js';

export interface Template {
  name: string;
  description: string;
  type: RecordType;
  content: string;
  defaultValues?: Record<string, string>;
}

export interface TemplateVars {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Template engine for creating Garden records from templates
 */
export class TemplateEngine {
  private templates = new Map<string, Template>();
  private templateDir: string;

  constructor(
    private garden: GardenService,
    private config: Config
  ) {
    this.templateDir = path.join(resolvePath(config, 'garden'), 'templates');
  }

  /**
   * Initialize the template engine
   * - Create templates directory if needed
   * - Load templates from disk
   */
  async initialize(): Promise<void> {
    // Ensure templates directory exists
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
      info('Created templates directory', { path: this.templateDir });
    }

    // Load templates from disk
    await this.loadTemplates();

    info('TemplateEngine initialized', {
      templateCount: this.templates.size,
      templates: Array.from(this.templates.keys()),
    });
  }

  /**
   * Register a template programmatically
   */
  register(template: Template): void {
    this.templates.set(template.name, template);
    info('Template registered', { name: template.name, type: template.type });
  }

  /**
   * Get a template by name
   */
  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  /**
   * List all available templates
   */
  list(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Render a template with variables
   */
  render(templateName: string, vars: TemplateVars): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Merge default values with provided vars
    const allVars = { ...template.defaultValues, ...vars };

    // Perform variable substitution
    let result = template.content;
    for (const [key, value] of Object.entries(allVars)) {
      const placeholder = `{{${key}}}`;
      const stringValue = value !== undefined ? String(value) : '';
      result = result.replace(new RegExp(placeholder, 'g'), stringValue);
    }

    // Replace any remaining unsubstituted placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  /**
   * Create a Garden record from a template
   */
  createFromTemplate(
    templateName: string,
    vars: TemplateVars,
    overrides?: Partial<GardenRecord>
  ): GardenRecord {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Render template content
    const content = this.render(templateName, vars);

    // Create record data
    const recordData: any = {
      type: template.type,
      content,
      ...overrides,
    };

    // If title not provided in overrides, try to extract from content or use var
    if (!recordData.title) {
      recordData.title = this.extractTitle(content) || String(vars.title || 'Untitled');
    }

    // Create the record
    const record = this.garden.create(recordData);

    info('Created record from template', {
      template: templateName,
      recordId: record.id,
      title: record.title,
    });

    return record;
  }

  /**
   * Load templates from disk
   */
  private async loadTemplates(): Promise<void> {
    if (!fs.existsSync(this.templateDir)) {
      return;
    }

    const files = fs.readdirSync(this.templateDir);
    const templateFiles = files.filter(f => f.endsWith('.md'));

    for (const file of templateFiles) {
      try {
        const filePath = path.join(this.templateDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Parse template
        const template = this.parseTemplate(file, content);
        if (template) {
          this.templates.set(template.name, template);
        }
      } catch (err) {
        warn('Failed to load template', { file, error: String(err) });
      }
    }
  }

  /**
   * Parse a template file
   */
  private parseTemplate(filename: string, content: string): Template | null {
    // Template file format:
    // ---
    // name: project-template
    // description: GTD project template
    // type: project
    // defaults:
    //   status: active
    // ---
    // # {{title}}
    //
    // {{description}}
    //
    // ## Goals
    // - Goal 1
    // - Goal 2

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      warn('Template missing frontmatter', { filename });
      return null;
    }

    const [, frontmatter, body] = frontmatterMatch;

    // Parse frontmatter
    const meta: any = {};
    const lines = frontmatter.split('\n');

    let currentKey: string | null = null;
    for (const line of lines) {
      const keyMatch = line.match(/^(\w+):\s*(.*)$/);
      if (keyMatch) {
        const [, key, value] = keyMatch;
        currentKey = key;
        meta[key] = value.trim();
      } else if (currentKey && line.startsWith('  ')) {
        // Multi-line value (like defaults)
        if (!meta.defaults) meta.defaults = {};
        const subMatch = line.trim().match(/^(\w+):\s*(.*)$/);
        if (subMatch) {
          const [, subKey, subValue] = subMatch;
          meta.defaults[subKey] = subValue.trim();
        }
      }
    }

    // Validate required fields
    if (!meta.name || !meta.type) {
      warn('Template missing required fields (name, type)', { filename });
      return null;
    }

    return {
      name: meta.name,
      description: meta.description || '',
      type: meta.type as RecordType,
      content: body.trim(),
      defaultValues: meta.defaults || {},
    };
  }

  /**
   * Extract title from markdown content (first heading)
   */
  private extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Save a template to disk
   */
  saveTemplate(template: Template): void {
    const filename = `${template.name}.md`;
    const filePath = path.join(this.templateDir, filename);

    // Build frontmatter
    const frontmatter: string[] = [];
    frontmatter.push('---');
    frontmatter.push(`name: ${template.name}`);
    frontmatter.push(`description: ${template.description}`);
    frontmatter.push(`type: ${template.type}`);

    if (template.defaultValues && Object.keys(template.defaultValues).length > 0) {
      frontmatter.push('defaults:');
      for (const [key, value] of Object.entries(template.defaultValues)) {
        frontmatter.push(`  ${key}: ${value}`);
      }
    }

    frontmatter.push('---');

    // Write file
    const fileContent = `${frontmatter.join('\n')}\n${template.content}\n`;
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    info('Template saved to disk', { name: template.name, path: filePath });
  }

  /**
   * Delete a template
   */
  deleteTemplate(name: string): boolean {
    const template = this.templates.get(name);
    if (!template) {
      return false;
    }

    // Remove from memory
    this.templates.delete(name);

    // Delete file if exists
    const filename = `${name}.md`;
    const filePath = path.join(this.templateDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    info('Template deleted', { name });
    return true;
  }

  /**
   * Create default templates if templates directory is empty
   */
  createDefaultTemplates(): void {
    if (this.templates.size > 0) {
      info('Templates already exist, skipping default creation');
      return;
    }

    // GTD Project Template
    const projectTemplate: Template = {
      name: 'gtd-project',
      description: 'GTD project with goals and success criteria',
      type: 'project',
      content: `# {{title}}

{{description}}

## Goals
- {{goal1}}
- {{goal2}}
- {{goal3}}

## Success Criteria
- [ ] {{criteria1}}
- [ ] {{criteria2}}
- [ ] {{criteria3}}

## Next Actions
- [ ] Define project scope
- [ ] Identify stakeholders
- [ ] Create initial timeline`,
      defaultValues: {
        goal1: 'Goal 1',
        goal2: 'Goal 2',
        goal3: 'Goal 3',
        criteria1: 'Criterion 1',
        criteria2: 'Criterion 2',
        criteria3: 'Criterion 3',
        status: 'active',
      },
    };

    // Meeting Notes Template
    const meetingTemplate: Template = {
      name: 'meeting-notes',
      description: 'Structured meeting notes template',
      type: 'note',
      content: `# {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Agenda
1. {{agenda1}}
2. {{agenda2}}
3. {{agenda3}}

## Discussion Notes


## Decisions Made
-

## Action Items
- [ ] {{action1}}
- [ ] {{action2}}

## Next Meeting
**Date:** {{nextMeeting}}`,
      defaultValues: {
        date: new Date().toISOString().split('T')[0],
        agenda1: 'Topic 1',
        agenda2: 'Topic 2',
        agenda3: 'Topic 3',
        action1: 'Action 1',
        action2: 'Action 2',
      },
    };

    // Contact Template
    const contactTemplate: Template = {
      name: 'contact',
      description: 'Contact information template',
      type: 'contact',
      content: `# {{name}}

{{bio}}

## Contact Information
- **Email:** {{email}}
- **Phone:** {{phone}}
- **Company:** {{company}}
- **Role:** {{role}}

## Notes


## Related Projects
`,
      defaultValues: {
        bio: 'Background and context...',
        company: '',
        role: '',
      },
    };

    // Register and save default templates
    this.register(projectTemplate);
    this.register(meetingTemplate);
    this.register(contactTemplate);

    this.saveTemplate(projectTemplate);
    this.saveTemplate(meetingTemplate);
    this.saveTemplate(contactTemplate);

    info('Default templates created', {
      count: 3,
      templates: ['gtd-project', 'meeting-notes', 'contact'],
    });
  }
}
