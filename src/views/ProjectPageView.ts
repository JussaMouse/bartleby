// src/views/ProjectPageView.ts
import { PageView, type Section } from './PageView.js';
import type { GardenRecord } from '../services/garden.js';

/**
 * Project Page View
 *
 * Generates a rich project page with sections for:
 * - User content (project description/notes)
 * - People (contacts involved)
 * - Next actions (active tasks)
 * - Notes (related notes and documentation)
 * - Media (files and images)
 * - Stats (view counts, activity)
 * - Backlinks (references to this project)
 *
 * Example output:
 * ```markdown
 * ## Content
 * [user's project description]
 *
 * ## 👥 People
 * - [[John Doe]]
 * - [[Jane Smith]]
 *
 * ## ✅ Next Actions
 * - [ ] Complete design mockups (@computer due:tomorrow)
 * - [ ] Send proposal to client (@email #urgent)
 *
 * ## 📝 Notes
 * - [[Meeting notes 2026-02-11]] — Discussed timeline and budget...
 *
 * ## 📊 Stats
 * - Views: 42
 * - Last viewed: today
 * ```
 */
export class ProjectPageView extends PageView {
  /**
   * Generate all sections for the project page
   */
  generateSections(): Section[] {
    return [
      this.userContentSection(),
      this.contactsSection(),
      this.actionsSection(),
      this.notesSection(),
      this.mediaSection(),
      this.metadataSection(),
      this.backlinksSection(),
    ];
  }

  /**
   * Get contacts section - people involved in this project
   */
  private contactsSection(): Section {
    // Get all contacts referenced by this project
    const contacts = this.graph.getRelated(this.record.id, {
      direction: 'outgoing',
      types: ['reference'],
      recordTypes: ['contact'],
    });

    if (contacts.length === 0) {
      return this.emptySection('👥 People');
    }

    const lines = contacts.map(c => `- [[${c.title}]]`);

    return {
      title: '👥 People',
      content: lines.join('\n'),
      metadata: { count: contacts.length },
    };
  }

  /**
   * Get actions section - active next actions for this project
   */
  private actionsSection(): Section {
    // Find all actions that have this project as parent
    const allChildren = this.graph.getChildren(this.record.id);

    // Filter for active actions only
    const actions = allChildren
      .filter(r => r.type === 'action' && r.status === 'active')
      .sort((a, b) => {
        // Sort by due date
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

    if (actions.length === 0) {
      return this.emptySection('✅ Next Actions', '_No active actions._');
    }

    const lines = actions.map(a => this.formatAction(a));

    return {
      title: '✅ Next Actions',
      content: lines.join('\n'),
      metadata: { count: actions.length },
    };
  }

  /**
   * Get notes section - notes related to this project
   */
  private notesSection(): Section {
    // Find notes that reference this project or are children
    const notes = this.graph.getRelated(this.record.id, {
      direction: 'incoming',
      types: ['parent', 'reference'],
      recordTypes: ['note'],
    });

    if (notes.length === 0) {
      return this.emptySection('📝 Notes');
    }

    const lines = notes.map(n => this.formatNote(n));

    return {
      title: '📝 Notes',
      content: lines.join('\n'),
      metadata: { count: notes.length },
    };
  }

  /**
   * Get media section - files and images
   */
  private mediaSection(): Section {
    // Find media that references this project
    const media = this.graph.getRelated(this.record.id, {
      direction: 'incoming',
      types: ['parent', 'reference'],
      recordTypes: ['media'],
    });

    if (media.length === 0) {
      return this.emptySection('📎 Media');
    }

    const lines = media.map(m => `- [[${m.title}]]`);

    return {
      title: '📎 Media',
      content: lines.join('\n'),
      metadata: { count: media.length },
    };
  }
}
