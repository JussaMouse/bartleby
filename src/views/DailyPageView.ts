// src/views/DailyPageView.ts
// Daily page view showing journal entry + daily events/actions

import { PageView, Section, ViewServices } from './PageView.js';
import { GardenRecord } from '../services/garden.js';

export class DailyPageView extends PageView {
  private date: Date;

  constructor(record: GardenRecord, services: ViewServices) {
    super(record, services);

    if (record.type !== 'daily') {
      throw new Error('DailyPageView requires a daily record');
    }

    // Extract date from title (expected format: YYYY-MM-DD)
    const dateMatch = record.title.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      this.date = new Date(dateMatch[1]);
    } else {
      this.date = new Date(); // Fallback to today
    }
  }

  generateSections(): Section[] {
    return [
      this.userContentSection(), // Journal entry
      this.actionsSection(),      // Actions due today
      this.eventsSection(),       // Events happening today
      this.completedSection(),    // Completed today
      this.metadataSection(),
    ].filter(s => s.content.length > 0);
  }

  private actionsSection(): Section {
    // Get actions due on this date
    const dateStr = this.date.toISOString().split('T')[0];

    const actions = this.garden.query()
      .type('action')
      .where('due_date', '=', dateStr)
      .status('active')
      .exec();

    const items = actions.map(action => this.formatAction(action));

    return {
      title: '✅ Due Today',
      content: items.join('\n'),
    };
  }

  private eventsSection(): Section {
    // Get events happening on this date
    // Note: This would typically use CalendarService
    // For now, just show placeholder
    return {
      title: '📅 Events',
      content: '_No events scheduled_', // Placeholder - would integrate with CalendarService
    };
  }

  private completedSection(): Section {
    // Get actions completed on this date
    const dateStr = this.date.toISOString().split('T')[0];

    // Query actions where completed_at matches this date
    const allActions = this.garden.query()
      .type('action')
      .status('completed')
      .exec();

    const completedToday = allActions.filter(action => {
      if (!action.completed_at) return false;
      const completedDate = action.completed_at.split('T')[0];
      return completedDate === dateStr;
    });

    const items = completedToday.map(action =>
      `- ✓ [[${action.title}]]${action.context ? ` ${action.context}` : ''}`
    );

    return {
      title: '✓ Completed',
      content: items.join('\n'),
    };
  }
}
