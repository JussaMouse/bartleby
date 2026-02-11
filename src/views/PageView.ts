// src/views/PageView.ts
import type { GardenRecord, GardenService } from '../services/garden.js';
import type { GardenGraph } from '../graph/GardenGraph.js';
import type { QueryBuilder } from '../query/QueryBuilder.js';
import type { FactsService } from '../services/facts.js';

/**
 * View Layer - Dynamic Page Generation
 *
 * PageView provides a framework for building rich, dynamic pages by composing
 * sections from multiple data sources:
 * - User content (markdown body)
 * - Graph relationships (backlinks, children, references)
 * - Query results (filtered lists, counts)
 * - Facts/metadata (view counts, momentum, statistics)
 * - Calendar events (deadlines, scheduled items)
 *
 * Each page type (project, contact, etc.) extends PageView and implements
 * generateSections() to define what sections appear and in what order.
 *
 * Example:
 * ```typescript
 * class ProjectPageView extends PageView {
 *   generateSections(): Section[] {
 *     return [
 *       this.userContentSection(),
 *       this.actionsSection(),
 *       this.notesSection(),
 *     ];
 *   }
 * }
 * ```
 */

export interface Section {
  /** Section title (e.g., "✅ Next Actions") */
  title: string;
  /** Markdown content */
  content: string;
  /** Optional metadata for JSON rendering */
  metadata?: Record<string, unknown>;
}

export interface ViewServices {
  garden: GardenService;
  graph: GardenGraph;
  facts: FactsService;
}

/**
 * Base class for dynamic page views
 */
export abstract class PageView {
  protected record: GardenRecord;
  protected garden: GardenService;
  protected graph: GardenGraph;
  protected facts: FactsService;

  constructor(record: GardenRecord, services: ViewServices) {
    this.record = record;
    this.garden = services.garden;
    this.graph = services.graph;
    this.facts = services.facts;
  }

  /**
   * Generate all sections for this page
   * Subclasses must implement this to define page structure
   */
  abstract generateSections(): Section[];

  /**
   * Render page as markdown
   */
  render(): string {
    const sections = this.generateSections();
    return this.formatAsMarkdown(sections);
  }

  /**
   * Render page as JSON for API
   */
  toJSON(): object {
    const sections = this.generateSections();
    return {
      id: this.record.id,
      type: this.record.type,
      title: this.record.title,
      sections: sections.map(s => ({
        title: s.title,
        content: s.content,
        metadata: s.metadata,
      })),
    };
  }

  /**
   * Format sections as markdown document
   */
  protected formatAsMarkdown(sections: Section[]): string {
    const parts: string[] = [];

    for (const section of sections) {
      // Skip empty sections
      if (!section.content || section.content.trim() === '') {
        continue;
      }

      // Add section title and content
      parts.push(`## ${section.title}\n\n${section.content}\n`);
    }

    return parts.join('\n');
  }

  /**
   * Get user-authored content section
   */
  protected userContentSection(): Section {
    return {
      title: 'Content',
      content: this.record.content || '_No content yet._',
    };
  }

  /**
   * Get metadata section (facts, stats)
   */
  protected metadataSection(): Section {
    const recordFacts = this.facts.getFacts(this.record.id);
    if (!recordFacts || Object.keys(recordFacts).length === 0) {
      return { title: 'Metadata', content: '' };
    }

    const lines: string[] = [];

    // Common facts
    if (recordFacts.viewCount) {
      lines.push(`- Views: ${recordFacts.viewCount}`);
    }
    if (recordFacts.lastViewed) {
      const date = new Date(recordFacts.lastViewed as string);
      lines.push(`- Last viewed: ${this.formatDate(date)}`);
    }
    if (recordFacts.lastEdited) {
      const date = new Date(recordFacts.lastEdited as string);
      lines.push(`- Last edited: ${this.formatDate(date)}`);
    }

    return {
      title: '📊 Stats',
      content: lines.join('\n'),
      metadata: recordFacts,
    };
  }

  /**
   * Get backlinks section (who references this page?)
   */
  protected backlinksSection(): Section {
    const backlinks = this.graph.getBacklinks(this.record.id);

    if (backlinks.length === 0) {
      return { title: 'Backlinks', content: '' };
    }

    const lines = backlinks.map(r => `- [[${r.title}]]`);

    return {
      title: '🔗 Backlinks',
      content: lines.join('\n'),
      metadata: { count: backlinks.length },
    };
  }

  /**
   * Helper: Format date for display
   */
  protected formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Helper: Format action for display
   */
  protected formatAction(action: GardenRecord): string {
    let line = `- [ ] ${action.title}`;

    const parts: string[] = [];

    // Add context
    if (action.context) {
      parts.push(`@${action.context}`);
    }

    // Add due date
    if (action.due_date) {
      const date = new Date(action.due_date);
      parts.push(`due:${this.formatDate(date)}`);
    }

    // Add tags
    if (action.tags && Array.isArray(action.tags) && action.tags.length > 0) {
      parts.push(...action.tags.map(t => `#${t}`));
    }

    if (parts.length > 0) {
      line += ` (${parts.join(' ')})`;
    }

    return line;
  }

  /**
   * Helper: Format note for display
   */
  protected formatNote(note: GardenRecord): string {
    let line = `- [[${note.title}]]`;

    // Add preview of content if available
    if (note.content) {
      const preview = note.content.substring(0, 60).replace(/\n/g, ' ');
      if (preview.length < note.content.length) {
        line += ` — ${preview}...`;
      } else {
        line += ` — ${preview}`;
      }
    }

    return line;
  }

  /**
   * Helper: Create empty section
   */
  protected emptySection(title: string, message: string = ''): Section {
    return {
      title,
      content: message || '',
    };
  }
}
