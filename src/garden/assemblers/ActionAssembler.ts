// src/garden/assemblers/ActionAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class ActionAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const projects   = rels.getOutbound(record.id, 'belongs_to');
    const waitingOn  = rels.getOutbound(record.id, 'waiting_on');

    const fields = [
      { label: 'Status',    value: record.status },
      { label: 'Context',   value: record.context ?? '—' },
      { label: 'Energy',    value: record.energy ?? '—' },
      { label: 'Estimate',  value: record.time_estimate ?? '—' },
      { label: 'Due',       value: record.due_date ?? '—' },
    ];

    const sections: Section[] = [
      { kind: 'content',  title: 'Notes',       markdown: record.content ?? '' },
      { kind: 'list',     title: 'Project',     items: toSummaries(projects), count: projects.length },
      { kind: 'list',     title: 'Waiting On',  items: toSummaries(waitingOn), count: waitingOn.length },
      { kind: 'metadata', title: 'Details',     fields },
    ];

    return {
      id: record.id,
      type: 'action',
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
