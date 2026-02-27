// src/garden/assemblers/ItemAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, type AssemblerServices } from './base.js';

export class ItemAssembler extends Assembler {
  assemble(record: GardenRecord, _services: AssemblerServices): ViewData {
    const sections: Section[] = [
      { kind: 'content',  title: 'Content', markdown: record.content ?? '' },
      { kind: 'metadata', title: 'Details', fields: [
        { label: 'Status',  value: record.status },
        { label: 'Source',  value: record.source ?? '—' },
        { label: 'Created', value: record.created_at },
      ].filter(f => f.value !== '—')},
    ];

    return {
      id: record.id,
      type: 'item',
      title: record.title,
      sections: filterSections(sections),
    };
  }
}

function filterSections(sections: Section[]): Section[] {
  return sections.filter(s => {
    if (s.kind === 'content')  return s.markdown.trim().length > 0;
    if (s.kind === 'list')     return s.count > 0;
    if (s.kind === 'metadata') return s.fields.length > 0;
    return true;
  });
}
