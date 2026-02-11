// src/views/TagPageView.ts
// Tag page view showing all records with a tag

import { PageView, Section, ViewServices } from './PageView.js';
import { GardenRecord } from '../services/garden.js';

export class TagPageView extends PageView {
  private tagName: string;

  constructor(record: GardenRecord, services: ViewServices, tagName: string) {
    super(record, services);
    this.tagName = tagName;
  }

  generateSections(): Section[] {
    return [
      this.overviewSection(),
      this.projectsSection(),
      this.actionsSection(),
      this.notesSection(),
      this.contactsSection(),
      this.otherSection(),
    ].filter(s => s.content.length > 0);
  }

  private overviewSection(): Section {
    // Query all records with this tag
    const allRecords = this.garden.query()
      .tag(this.tagName)
      .exec();

    const content = `**Tag:** #${this.tagName}\n**Total items:** ${allRecords.length}`;

    return {
      title: '📊 Overview',
      content,
    };
  }

  private projectsSection(): Section {
    const projects = this.garden.query()
      .type('project')
      .tag(this.tagName)
      .status('active')
      .exec();

    const items = projects.map(p =>
      `- [[${p.title}]]${p.due_date ? ` (due: ${this.formatDate(new Date(p.due_date))})` : ''}`
    );

    return {
      title: '📁 Projects',
      content: items.join('\n'),
    };
  }

  private actionsSection(): Section {
    const actions = this.garden.query()
      .type('action')
      .tag(this.tagName)
      .status('active')
      .exec()
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

    const items = actions.map(action => this.formatAction(action));

    return {
      title: '✅ Actions',
      content: items.join('\n'),
    };
  }

  private notesSection(): Section {
    const notes = this.garden.query()
      .type(['note', 'entry'])
      .tag(this.tagName)
      .exec();

    const items = notes.map(note => {
      const preview = note.content
        ? note.content.slice(0, 100).replace(/\n/g, ' ') + '...'
        : '';
      return `- [[${note.title}]]${preview ? ` — ${preview}` : ''}`;
    });

    return {
      title: '📝 Notes',
      content: items.join('\n'),
    };
  }

  private contactsSection(): Section {
    const contacts = this.garden.query()
      .type('contact')
      .tag(this.tagName)
      .exec();

    const items = contacts.map(c => {
      const email = (c as any).email;
      return `- [[${c.title}]]${email ? ` (${email})` : ''}`;
    });

    return {
      title: '👥 People',
      content: items.join('\n'),
    };
  }

  private otherSection(): Section {
    // Get other types (media, lists, etc.)
    const other = this.garden.query()
      .tag(this.tagName)
      .exec()
      .filter(r => !['project', 'action', 'note', 'entry', 'contact'].includes(r.type));

    const items = other.map(r => `- [[${r.title}]] (${r.type})`);

    return {
      title: '📦 Other',
      content: items.join('\n'),
    };
  }
}
