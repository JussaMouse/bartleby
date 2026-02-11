// src/views/ContactPageView.ts
// Contact page view with relationships and activity

import { PageView, Section, ViewServices } from './PageView.js';
import { GardenRecord } from '../services/garden.js';

export class ContactPageView extends PageView {
  constructor(record: GardenRecord, services: ViewServices) {
    super(record, services);

    if (record.type !== 'contact') {
      throw new Error('ContactPageView requires a contact record');
    }
  }

  generateSections(): Section[] {
    return [
      this.userContentSection(),
      this.contactInfoSection(),
      this.projectsSection(),
      this.actionsSection(),
      this.notesSection(),
      this.metadataSection(),
      this.backlinksSection(),
    ].filter(s => s.content.length > 0);
  }

  private contactInfoSection(): Section {
    const items: string[] = [];

    // Email
    const email = (this.record as any).email;
    if (email) {
      items.push(`- **Email:** ${email}`);
    }

    // Phone
    const phone = (this.record as any).phone;
    if (phone) {
      items.push(`- **Phone:** ${phone}`);
    }

    // Birthday
    const birthday = (this.record as any).birthday;
    if (birthday) {
      items.push(`- **Birthday:** ${birthday}`);
    }

    return {
      title: '📧 Contact Information',
      content: items.join('\n'),
    };
  }

  private projectsSection(): Section {
    // Get projects this contact is involved in
    const allRelated = this.graph.getRelated(this.record.id, {
      direction: 'incoming',
      recordTypes: ['project'],
    });

    const items = allRelated
      .filter(r => r.status === 'active')
      .map(project => `- [[${project.title}]]${project.due_date ? ` (due: ${this.formatDate(new Date(project.due_date))})` : ''}`);

    return {
      title: '📁 Projects',
      content: items.join('\n'),
    };
  }

  private actionsSection(): Section {
    // Get actions assigned to or mentioning this contact
    const allRelated = this.graph.getRelated(this.record.id, {
      direction: 'incoming',
      recordTypes: ['action'],
    });

    const activeActions = allRelated
      .filter(r => r.status === 'active')
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

    const items = activeActions.map(action => this.formatAction(action));

    return {
      title: '✅ Actions',
      content: items.join('\n'),
    };
  }

  private notesSection(): Section {
    // Get notes mentioning this contact
    const allRelated = this.graph.getRelated(this.record.id, {
      direction: 'incoming',
      recordTypes: ['note'],
    });

    const items = allRelated
      .map(note => {
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
}
