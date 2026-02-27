// src/garden/assemblers/MediaAssembler.ts
import type { GardenRecord, ViewData, Section } from '../types.js';
import { Assembler, toSummaries, type AssemblerServices } from './base.js';

export class MediaAssembler extends Assembler {
  assemble(record: GardenRecord, { rels }: AssemblerServices): ViewData {
    const projects  = rels.getOutbound(record.id, 'belongs_to');
    const backlinks = rels.getInbound(record.id, 'references');

    const fields = [
      { label: 'Status',    value: record.status },
      { label: 'File',      value: record.file_path  ?? '—' },
      { label: 'Type',      value: record.mime_type  ?? '—' },
      { label: 'Size',      value: record.file_size != null ? formatBytes(record.file_size) : '—' },
    ].filter(f => f.value !== '—');

    const sections: Section[] = [
      { kind: 'content',  title: 'Notes',      markdown: record.content ?? '' },
      { kind: 'metadata', title: 'File Info',  fields },
      { kind: 'list',     title: 'Project',    items: toSummaries(projects),  count: projects.length },
      { kind: 'list',     title: 'Backlinks',  items: toSummaries(backlinks), count: backlinks.length },
    ];

    return {
      id: record.id,
      type: 'media',
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
