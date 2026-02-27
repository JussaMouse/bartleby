// src/garden/renderers/ReplRenderer.ts
// Layer 4: Render ViewData as markdown text for the REPL.

import type { ViewData, Section } from '../types.js';

export class ReplRenderer {
  render(data: ViewData): string {
    const lines: string[] = [];

    lines.push(`# ${data.title}`);
    if (data.type) {
      lines.push(`*${data.type}*`);
    }
    lines.push('');

    for (const section of data.sections) {
      lines.push(this.renderSection(section));
    }

    return lines.join('\n').trimEnd();
  }

  private renderSection(section: Section): string {
    const lines: string[] = [];

    switch (section.kind) {
      case 'content':
        lines.push(`## ${section.title}`);
        lines.push('');
        lines.push(section.markdown);
        lines.push('');
        break;

      case 'list': {
        lines.push(`## ${section.title} (${section.count})`);
        lines.push('');
        for (const item of section.items) {
          const status = statusIcon(item.status);
          const context = item.context ? `  ${item.context}` : '';
          const due = item.due ? `  due: ${item.due}` : '';
          lines.push(`  ${status} ${item.title}${context}${due}`);
        }
        lines.push('');
        break;
      }

      case 'metadata': {
        lines.push(`## ${section.title}`);
        lines.push('');
        const pairs = section.fields.map(f => `${f.label}: ${f.value}`).join('  |  ');
        lines.push(`  ${pairs}`);
        lines.push('');
        break;
      }

      case 'graph':
        lines.push(`## ${section.title}`);
        lines.push(`  ${section.nodes.length} nodes, ${section.edges.length} connections`);
        lines.push('');
        break;
    }

    return lines.join('\n');
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'waiting':   return '⏳';
    case 'someday':   return '○';
    case 'archived':  return '—';
    default:          return '☐';
  }
}
