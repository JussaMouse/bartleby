// src/utils/content-processors.ts
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pdfParse from 'pdf-parse';
import { FileType } from './file-type-detection.js';
import type { OCRService } from '../services/ocr.js';

/**
 * Result of content processing
 */
export interface ProcessingResult {
  success: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * CSV parsing result with structured metadata
 */
interface CsvAnalysis {
  rows: number;
  columns: number;
  headers: string[];
  sample: string[][];
}

/**
 * Extract text content from a PDF file
 *
 * @param filePath - Path to PDF file
 * @returns Processing result with extracted text
 */
export async function extractPdfText(filePath: string): Promise<ProcessingResult> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return {
      success: true,
      content: data.text,
      metadata: {
        pageCount: data.numpages,
        charCount: data.text.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `PDF extraction failed: ${String(err)}`,
    };
  }
}

/**
 * Parse and analyze a CSV/TSV file
 *
 * @param filePath - Path to CSV/TSV file
 * @returns Processing result with CSV analysis
 */
export async function parseCsv(filePath: string): Promise<ProcessingResult> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Detect delimiter (CSV or TSV)
    const delimiter = filePath.endsWith('.tsv') ? '\t' : ',';

    // Parse CSV
    const records = parse(content, {
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true, // Handle inconsistent columns
    }) as string[][];

    if (records.length === 0) {
      return {
        success: false,
        error: 'CSV file is empty',
      };
    }

    // Analyze structure
    const headers = records[0];
    const dataRows = records.slice(1);
    const sampleRows = dataRows.slice(0, 5);

    const analysis: CsvAnalysis = {
      rows: dataRows.length,
      columns: headers.length,
      headers,
      sample: sampleRows,
    };

    // Build content summary
    let summary = `## CSV Structure\n`;
    summary += `- Rows: ${analysis.rows}\n`;
    summary += `- Columns: ${analysis.columns} (${analysis.headers.join(', ')})\n\n`;

    if (sampleRows.length > 0) {
      summary += `## Sample Data (first ${sampleRows.length} rows)\n`;
      summary += '| ' + headers.join(' | ') + ' |\n';
      summary += '|' + headers.map(() => '---').join('|') + '|\n';

      for (const row of sampleRows) {
        summary += '| ' + row.join(' | ') + ' |\n';
      }
    }

    return {
      success: true,
      content: summary,
      metadata: {
        rows: analysis.rows,
        columns: analysis.columns,
        headers: analysis.headers,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `CSV parsing failed: ${String(err)}`,
    };
  }
}

/**
 * Read content from a text file
 *
 * @param filePath - Path to text file
 * @returns Processing result with file content
 */
export async function readTextFile(filePath: string): Promise<ProcessingResult> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Limit content to reasonable size (first 5000 chars)
    const truncated = content.length > 5000;
    const displayContent = truncated ? content.substring(0, 5000) + '\n\n[... truncated]' : content;

    return {
      success: true,
      content: displayContent,
      metadata: {
        charCount: content.length,
        truncated,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Text file reading failed: ${String(err)}`,
    };
  }
}

/**
 * Extract text from an image using OCR
 *
 * @param filePath - Path to image file
 * @param ocrService - OCR service instance
 * @returns Processing result with extracted text
 */
export async function extractImageOcr(
  filePath: string,
  ocrService: OCRService
): Promise<ProcessingResult> {
  try {
    // Check if OCR is enabled
    if (!ocrService) {
      return {
        success: false,
        error: 'OCR service not available',
      };
    }

    // Call OCR service
    const text = await ocrService.extractText(filePath);

    if (!text) {
      return {
        success: false,
        error: 'OCR returned no text',
      };
    }

    return {
      success: true,
      content: text,
      metadata: {
        charCount: text.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `OCR extraction failed: ${String(err)}`,
    };
  }
}

/**
 * Process a file based on its type
 *
 * @param filePath - Path to file
 * @param fileType - Detected file type
 * @param options - Processing options
 * @returns Processing result
 */
export async function processFile(
  filePath: string,
  fileType: FileType,
  options: {
    enableOcr?: boolean;
    ocrService?: OCRService;
  } = {}
): Promise<ProcessingResult> {
  const ext = path.extname(filePath).toLowerCase();

  // PDF processing
  if (fileType === FileType.DOCUMENT && ext === '.pdf') {
    return await extractPdfText(filePath);
  }

  // CSV/TSV processing
  if (fileType === FileType.SPREADSHEET && (ext === '.csv' || ext === '.tsv')) {
    return await parseCsv(filePath);
  }

  // Text file processing
  if (fileType === FileType.TEXT) {
    return await readTextFile(filePath);
  }

  // Image OCR processing (opt-in)
  if (fileType === FileType.IMAGE && options.enableOcr && options.ocrService) {
    return await extractImageOcr(filePath, options.ocrService);
  }

  // No processing for other types
  return {
    success: false,
    error: 'No processing available for this file type',
  };
}

/**
 * Build enriched content for Garden record
 *
 * @param fileName - Original file name
 * @param fileType - File type
 * @param fileSize - File size in bytes
 * @param filePath - Path to stored file
 * @param processingResult - Result from content processing
 * @returns Formatted content string
 */
export function buildRecordContent(
  fileName: string,
  fileType: string,
  fileSize: string,
  filePath: string,
  processingResult?: ProcessingResult
): string {
  let content = `File: ${fileName}\n`;
  content += `Type: ${fileType}\n`;
  content += `Size: ${fileSize}\n`;
  content += `Imported: ${new Date().toISOString()}\n\n`;

  // Add extracted content if processing succeeded
  if (processingResult?.success && processingResult.content) {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.pdf') {
      content += `## Extracted Text (PDF)\n`;
      content += processingResult.content.substring(0, 5000);
      if (processingResult.content.length > 5000) {
        content += '\n\n[... text truncated, see source file for full content]';
      }
    } else if (ext === '.csv' || ext === '.tsv') {
      content += processingResult.content;
    } else if (fileType === 'text') {
      content += `## File Content\n`;
      content += '```\n';
      content += processingResult.content;
      content += '\n```';
    } else if (fileType === 'image') {
      content += `## OCR Extracted Text\n`;
      content += processingResult.content;
    }

    content += '\n\n';
  } else if (processingResult?.error) {
    content += `_Note: Content extraction failed: ${processingResult.error}_\n\n`;
  }

  content += `Path: ${filePath}`;

  return content;
}
