// src/views/ViewRegistry.ts
import type { GardenRecord, RecordType } from '../services/garden.js';
import { PageView, type ViewServices, type Section } from './PageView.js';
import { ProjectPageView } from './ProjectPageView.js';
import { ContactPageView } from './ContactPageView.js';
import { DailyPageView } from './DailyPageView.js';

/**
 * View Registry - Factory for creating page views
 *
 * Maps record types to view classes, allowing dynamic view creation based on
 * the record type. Views can be registered for any record type, with a default
 * fallback for unregistered types.
 *
 * Example:
 * ```typescript
 * // Register views
 * ViewRegistry.register('project', ProjectPageView);
 * ViewRegistry.register('contact', ContactPageView);
 *
 * // Create view for a record
 * const view = ViewRegistry.create(record, services);
 * const markdown = view.render();
 * ```
 */

/**
 * Default view for records without a registered view
 * Shows user content, metadata, and backlinks
 */
class DefaultPageView extends PageView {
  generateSections(): Section[] {
    return [
      this.userContentSection(),
      this.metadataSection(),
      this.backlinksSection(),
    ];
  }
}

/**
 * Type for view class constructors
 */
type ViewClass = new (record: GardenRecord, services: ViewServices) => PageView;

/**
 * View Registry - Factory pattern for page views
 */
export class ViewRegistry {
  private static views = new Map<RecordType, ViewClass>();

  /**
   * Register a view class for a record type
   */
  static register(type: RecordType, viewClass: ViewClass): void {
    this.views.set(type, viewClass);
  }

  /**
   * Create a view for a record
   * Returns registered view if available, otherwise default view
   */
  static create(record: GardenRecord, services: ViewServices): PageView {
    const ViewClass = this.views.get(record.type) || DefaultPageView;
    return new ViewClass(record, services);
  }

  /**
   * Check if a view is registered for a record type
   */
  static has(type: RecordType): boolean {
    return this.views.has(type);
  }

  /**
   * Get all registered record types
   */
  static getRegisteredTypes(): RecordType[] {
    return Array.from(this.views.keys());
  }

  /**
   * Clear all registered views (useful for testing)
   */
  static clear(): void {
    this.views.clear();
  }
}

// Register built-in views
ViewRegistry.register('project', ProjectPageView);
ViewRegistry.register('contact', ContactPageView);
ViewRegistry.register('daily', DailyPageView);
