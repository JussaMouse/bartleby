import { stat } from 'fs/promises';
import { extname } from 'path';
import { lookup } from 'mime-types';

/**
 * File type categories for import classification
 */
export enum FileType {
  DOCUMENT = 'document',
  SPREADSHEET = 'spreadsheet',
  IMAGE = 'image',
  TEXT = 'text',
  ARCHIVE = 'archive',
  EMAIL = 'email',
  WEB = 'web',
  OTHER = 'other',
}

/**
 * Extension to file type mapping
 */
const EXTENSION_MAP: Record<string, FileType> = {
  // Documents
  '.pdf': FileType.DOCUMENT,
  '.doc': FileType.DOCUMENT,
  '.docx': FileType.DOCUMENT,
  '.odt': FileType.DOCUMENT,
  '.rtf': FileType.DOCUMENT,
  '.pages': FileType.DOCUMENT,

  // Spreadsheets
  '.xls': FileType.SPREADSHEET,
  '.xlsx': FileType.SPREADSHEET,
  '.csv': FileType.SPREADSHEET,
  '.ods': FileType.SPREADSHEET,
  '.numbers': FileType.SPREADSHEET,
  '.tsv': FileType.SPREADSHEET,

  // Images
  '.png': FileType.IMAGE,
  '.jpg': FileType.IMAGE,
  '.jpeg': FileType.IMAGE,
  '.gif': FileType.IMAGE,
  '.bmp': FileType.IMAGE,
  '.svg': FileType.IMAGE,
  '.webp': FileType.IMAGE,
  '.tiff': FileType.IMAGE,
  '.tif': FileType.IMAGE,
  '.heic': FileType.IMAGE,
  '.heif': FileType.IMAGE,

  // Text
  '.txt': FileType.TEXT,
  '.md': FileType.TEXT,
  '.markdown': FileType.TEXT,
  '.rst': FileType.TEXT,
  '.log': FileType.TEXT,
  '.json': FileType.TEXT,
  '.xml': FileType.TEXT,
  '.yaml': FileType.TEXT,
  '.yml': FileType.TEXT,
  '.toml': FileType.TEXT,

  // Archives
  '.zip': FileType.ARCHIVE,
  '.tar': FileType.ARCHIVE,
  '.gz': FileType.ARCHIVE,
  '.bz2': FileType.ARCHIVE,
  '.7z': FileType.ARCHIVE,
  '.rar': FileType.ARCHIVE,
  '.xz': FileType.ARCHIVE,

  // Email
  '.eml': FileType.EMAIL,
  '.msg': FileType.EMAIL,
  '.mbox': FileType.EMAIL,

  // Web
  '.html': FileType.WEB,
  '.htm': FileType.WEB,
  '.mhtml': FileType.WEB,
  '.webarchive': FileType.WEB,
};

/**
 * File metadata interface
 */
export interface FileMetadata {
  filePath: string;
  fileName: string;
  fileType: FileType;
  fileSize: number;
  mimeType: string | null;
  modifiedAt: Date;
}

/**
 * Detect file type based on extension
 *
 * @param filePath - Path to the file
 * @returns FileType classification
 */
export function detectFileType(filePath: string): FileType {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || FileType.OTHER;
}

/**
 * Get comprehensive file metadata
 *
 * @param filePath - Path to the file
 * @returns File metadata including type, size, MIME type
 */
export async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  const stats = await stat(filePath);
  const fileName = filePath.split('/').pop() || filePath;
  const fileType = detectFileType(filePath);
  const mimeType = lookup(filePath) || null;

  return {
    filePath,
    fileName,
    fileType,
    fileSize: stats.size,
    mimeType,
    modifiedAt: stats.mtime,
  };
}

/**
 * Check if a file type is supported for import
 *
 * @param fileType - File type to check
 * @returns True if the file type can be imported
 */
export function isSupportedFileType(fileType: FileType): boolean {
  // All file types are supported for basic import
  // Future phases may restrict certain types
  return true;
}

/**
 * Get human-readable file size string
 *
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get file type icon for display
 *
 * @param fileType - File type
 * @returns Icon string representation
 */
export function getFileTypeIcon(fileType: FileType): string {
  const icons: Record<FileType, string> = {
    [FileType.DOCUMENT]: '📄',
    [FileType.SPREADSHEET]: '📊',
    [FileType.IMAGE]: '🖼️',
    [FileType.TEXT]: '📝',
    [FileType.ARCHIVE]: '📦',
    [FileType.EMAIL]: '📧',
    [FileType.WEB]: '🌐',
    [FileType.OTHER]: '📎',
  };

  return icons[fileType];
}
