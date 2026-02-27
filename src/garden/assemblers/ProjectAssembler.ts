// src/garden/assemblers/ProjectAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class ProjectAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const children = rels.getInbound(record.id, 'belongs_to');
    const actions  = children.filter(r => r.type === 'action' && r.status === 'active');
    const waiting  = children.filter(r => r.type === 'action' && r.status === 'waiting');
    const someday  = children.filter(r => r.type === 'action' && r.status === 'someday');
    const notes    = children.filter(r => r.type === 'note');
    const media    = children.filter(r => r.type === 'media');
    const contacts = rels.getOutbound(record.id, 'involves');
    const backlinks = rels.getInbound(record.id, 'references');

    const sections: Section[] = [
      { kind: 'content',  title: 'About',        markdown: record.content ?? '' },
      { kind: 'list',     title: 'Next Actions',  items: toSummaries(actions, record.title),  count: actions.length },
      { kind: 'list',     title: 'Waiting',       items: toSummaries(waiting, record.title),  count: waiting.length },
      { kind: 'list',     title: 'Someday',       items: toSummaries(someday, record.title),  count: someday.length },
      { kind: 'list',     title: 'Notes',         items: toSummaries(notes,   record.title),  count: notes.length },
      { kind: 'list',     title: 'People',        items: toSummaries(contacts),               count: contacts.length },
      { kind: 'list',     title: 'Media',         items: toSummaries(media,   record.title),  count: media.length },
      { kind: 'list',     title: 'Backlinks',     items: toSummaries(backlinks),              count: backlinks.length },
      { kind: 'metadata', title: 'Details', fields: [
        { label: 'Status',  value: record.status },
        { label: 'Due',     value: record.due_date ?? '—' },
        { label: 'Created', value: record.created_at },
      ]},
    ];

    return {
      id: record.id,
      type: 'project',
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
