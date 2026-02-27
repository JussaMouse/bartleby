// src/garden/assemblers/TagAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class TagAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    // All notes that have a tagged_with edge pointing at this tag
    const notes = rels.getInbound(record.id, 'tagged_with');

    const sections: Section[] = [
      { kind: 'content', title: 'Description', markdown: record.content ?? '' },
      { kind: 'list',    title: 'Notes',        items: toSummaries(notes),  count: notes.length },
      { kind: 'metadata', title: 'Details', fields: [
        { label: 'Status',  value: record.status },
        { label: 'Notes',   value: String(notes.length) },
      ]},
    ];

    return {
      id: record.id,
      type: 'tag',
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
