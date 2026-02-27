// src/garden/assemblers/NoteAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class NoteAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const tags      = rels.getOutbound(record.id, 'tagged_with');
    const projects  = rels.getOutbound(record.id, 'belongs_to');
    const backlinks = rels.getInbound(record.id, 'references');

    const sections: Section[] = [
      { kind: 'content',  title: 'Content',   markdown: record.content ?? '' },
      { kind: 'list',     title: 'Tags',       items: toSummaries(tags),      count: tags.length },
      { kind: 'list',     title: 'Project',    items: toSummaries(projects),  count: projects.length },
      { kind: 'list',     title: 'Backlinks',  items: toSummaries(backlinks), count: backlinks.length },
      { kind: 'metadata', title: 'Details', fields: [
        { label: 'Status',  value: record.status },
        { label: 'Created', value: record.created_at },
        { label: 'Updated', value: record.updated_at },
      ]},
    ];

    return {
      id: record.id,
      type: 'note',
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
