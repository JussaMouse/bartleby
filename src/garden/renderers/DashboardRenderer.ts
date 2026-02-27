// src/garden/renderers/DashboardRenderer.ts
// Layer 4: Render ViewData as JSON for the WebSocket dashboard.
// Passes ViewData through with markdown rendered to HTML in content fields.

import type { ViewData, Section } from '../types.js';

export interface DashboardSection {
  kind: string;
  title: string;
  // content sections
  html?: string;
  // list sections
  items?: DashboardItem[];
  count?: number;
  // metadata sections
  fields?: { label: string; value: string }[];
  // graph sections
  nodes?: { id: string; type: string; title: string }[];
  edges?: { from: string; to: string; type: string }[];
}

export interface DashboardItem {
  id: string;
  type: string;
  title: string;
  status: string;
  context?: string;
  due?: string;
  project?: string;
}

export interface DashboardViewData {
  id?: string;
  type?: string;
  title: string;
  sections: DashboardSection[];
}

export class DashboardRenderer {
  render(data: ViewData): DashboardViewData {
    return {
      id: data.id,
      type: data.type,
      title: data.title,
      sections: data.sections.map(s => this.renderSection(s)),
    };
  }

  private renderSection(section: Section): DashboardSection {
    switch (section.kind) {
      case 'content':
        return {
          kind: 'content',
          title: section.title,
          html: markdownToHtml(section.markdown),
        };

      case 'list':
        return {
          kind: 'list',
          title: section.title,
          count: section.count,
          items: section.items.map(item => ({
            id: item.id,
            type: item.type,
            title: item.title,
            status: item.status,
            context: item.context,
            due: item.due,
            project: item.project,
          })),
        };

      case 'metadata':
        return {
          kind: 'metadata',
          title: section.title,
          fields: section.fields,
        };

      case 'graph':
        return {
          kind: 'graph',
          title: section.title,
          nodes: section.nodes,
          edges: section.edges,
        };
    }
  }
}

/**
 * Minimal markdown → HTML conversion for dashboard display.
 * Handles headings, bold, italic, code, and line breaks.
 * Full markdown parsing can be added later with a library if needed.
 */
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  return markdown
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^(.+)/, '<p>$1')
    .replace(/(.+)$/, '$1</p>');
}
