// src/utils/markdown.ts
import matter from 'gray-matter';

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function parseMarkdown(text: string): ParsedMarkdown {
  const { data, content } = matter(text);
  return { frontmatter: data, content: content.trim() };
}

export function generateMarkdown(
  frontmatter: Record<string, unknown>,
  content: string
): string {
  const yaml = matter.stringify(content, frontmatter);
  return yaml;
}

export function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .trim();
}
