// src/garden/assemblers/EventAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class EventAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const contacts  = rels.getOutbound(record.id, 'involves');
    const projects  = rels.getOutbound(record.id, 'belongs_to');
    const backlinks = rels.getInbound(record.id, 'references');

    const fields = [
      { label: 'Status',   value: record.status },
      { label: 'Starts',   value: record.starts_at ?? '—' },
      { label: 'Ends',     value: record.ends_at ?? '—' },
      { label: 'All Day',  value: record.all_day ? 'Yes' : 'No' },
      { label: 'Location', value: record.location ?? '—' },
    ].filter(f => f.value !== '—' && f.value !== 'No');

    const sections: Section[] = [
      { kind: 'content',  title: 'Description', markdown: record.content ?? '' },
      { kind: 'metadata', title: 'When',        fields },
      { kind: 'list',     title: 'Attendees',   items: toSummaries(contacts),  count: contacts.length },
      { kind: 'list',     title: 'Project',     items: toSummaries(projects),  count: projects.length },
      { kind: 'list',     title: 'Backlinks',   items: toSummaries(backlinks), count: backlinks.length },
    ];

    return {
      id: record.id,
      type: 'event',
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
