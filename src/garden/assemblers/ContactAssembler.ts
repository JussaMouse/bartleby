// src/garden/assemblers/ContactAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class ContactAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const projects  = rels.getInbound(record.id, 'involves');
    const waiting   = rels.getInbound(record.id, 'waiting_on');
    const events    = rels.getOutbound(record.id, 'attends');

    const fields = [
      { label: 'Email',    value: record.email    ?? '—' },
      { label: 'Phone',    value: record.phone    ?? '—' },
      { label: 'Company',  value: record.company  ?? '—' },
      { label: 'Address',  value: record.address  ?? '—' },
      { label: 'Birthday', value: record.birthday ?? '—' },
    ].filter(f => f.value !== '—');

    const sections: Section[] = [
      { kind: 'content',  title: 'Bio',           markdown: record.content ?? '' },
      { kind: 'metadata', title: 'Contact Info',  fields },
      { kind: 'list',     title: 'Projects',      items: toSummaries(projects), count: projects.length },
      { kind: 'list',     title: 'Waiting On',    items: toSummaries(waiting),  count: waiting.length },
      { kind: 'list',     title: 'Events',        items: toSummaries(events),   count: events.length },
    ];

    return {
      id: record.id,
      type: 'contact',
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
