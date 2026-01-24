// src/services/data.ts
// Financial data service - CSV import, SQL queries, exports

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Config, resolvePath, getDbPath, ensureDir } from '../config.js';
import { info, debug, warn, error } from '../utils/logger.js';

// === Types ===

export interface ImportOptions {
  replace?: boolean;     // DROP TABLE IF EXISTS
  append?: boolean;      // INSERT into existing table
  delimiter?: string;    // Auto-detect if not specified
  hasHeader?: boolean;   // Default: true
}

export interface ImportResult {
  table: string;
  rowCount: number;
  columns: ColumnInfo[];
  sourcePath: string;
}

export interface ColumnInfo {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL';
  sample?: string;
}

export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  truncated: boolean;
}

export interface ExportResult {
  path: string;
  rowCount: number;
}

// === Service ===

export class DataService {
  private db: Database.Database;
  private sourcesPath: string;
  private exportsPath: string;
  private auditPath: string;

  constructor(private config: Config) {
    const dbPath = getDbPath(config, 'data.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Create data directories
    const dataDir = path.join(resolvePath(config, 'database'), '..', 'data');
    this.sourcesPath = path.join(dataDir, 'sources');
    this.exportsPath = path.join(dataDir, 'exports');
    this.auditPath = path.join(dataDir, 'audit.log');

    ensureDir(this.sourcesPath);
    ensureDir(this.exportsPath);

    info('DataService initialized', { 
      db: dbPath,
      sources: this.sourcesPath,
      exports: this.exportsPath,
    });
  }

  // === CSV Import ===

  importCsv(filepath: string, tableName: string, options: ImportOptions = {}): ImportResult {
    const resolvedPath = path.isAbsolute(filepath) 
      ? filepath 
      : path.join(process.cwd(), filepath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // Read file
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    
    // Auto-detect delimiter
    const delimiter = options.delimiter || this.detectDelimiter(content);
    debug('Detected delimiter', { delimiter: delimiter === '\t' ? 'TAB' : delimiter });

    // Parse CSV/TSV
    const records = parse(content, {
      delimiter,
      columns: options.hasHeader !== false, // Default true
      skip_empty_lines: true,
      relax_column_count: true, // Handle inconsistent column counts
      trim: true,
    });

    if (records.length === 0) {
      throw new Error('No data found in file');
    }

    // Get column names
    const columnNames = options.hasHeader !== false
      ? Object.keys(records[0])
      : Object.keys(records[0]).map((_, i) => `col_${i + 1}`);

    // Detect column types
    const columns = this.detectColumnTypes(records, columnNames);

    // Sanitize table name
    const safeTableName = this.sanitizeIdentifier(tableName);

    // Handle existing table
    const tableExists = this.tableExists(safeTableName);
    if (tableExists) {
      if (options.replace) {
        this.db.exec(`DROP TABLE IF EXISTS "${safeTableName}"`);
      } else if (!options.append) {
        throw new Error(`Table "${safeTableName}" already exists. Use --replace or --append.`);
      }
    }

    // Create table if needed
    if (!tableExists || options.replace) {
      const columnDefs = columns
        .map(c => `"${this.sanitizeIdentifier(c.name)}" ${c.type}`)
        .join(', ');
      this.db.exec(`CREATE TABLE "${safeTableName}" (${columnDefs})`);
    }

    // Insert data
    const placeholders = columns.map(() => '?').join(', ');
    const insert = this.db.prepare(
      `INSERT INTO "${safeTableName}" VALUES (${placeholders})`
    );

    const insertMany = this.db.transaction((rows: any[]) => {
      for (const row of rows) {
        const values = columns.map(c => {
          const val = row[c.name];
          if (val === '' || val === undefined || val === null) return null;
          return val;
        });
        insert.run(values);
      }
    });

    insertMany(records);

    // Copy source file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sourceFilename = `${path.basename(resolvedPath, path.extname(resolvedPath))}_${timestamp}${path.extname(resolvedPath)}`;
    const sourceDest = path.join(this.sourcesPath, sourceFilename);
    fs.copyFileSync(resolvedPath, sourceDest);

    // Log import
    this.audit(`IMPORT: ${records.length} rows into "${safeTableName}" from ${path.basename(resolvedPath)}`);

    info('CSV imported', { 
      table: safeTableName, 
      rows: records.length, 
      columns: columns.length,
    });

    return {
      table: safeTableName,
      rowCount: records.length,
      columns,
      sourcePath: sourceDest,
    };
  }

  // === SQL Query ===

  query(sql: string, maxRows: number = 100): QueryResult {
    const trimmedSql = sql.trim();
    
    // Log mutating queries
    const isMutating = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)/i.test(trimmedSql);
    if (isMutating) {
      this.audit(`MUTATE: ${trimmedSql.slice(0, 200)}`);
    }

    try {
      const stmt = this.db.prepare(trimmedSql);
      
      // Check if it's a SELECT or other read query
      if (stmt.reader) {
        const allRows = stmt.all() as Record<string, any>[];
        const columns = allRows.length > 0 ? Object.keys(allRows[0]) : [];
        const truncated = allRows.length > maxRows;
        const rows = allRows.slice(0, maxRows).map(row => columns.map(c => row[c]));
        
        return {
          columns,
          rows,
          rowCount: allRows.length,
          truncated,
        };
      } else {
        // Non-SELECT (INSERT, UPDATE, etc.)
        const result = stmt.run();
        return {
          columns: ['changes'],
          rows: [[result.changes]],
          rowCount: 1,
          truncated: false,
        };
      }
    } catch (err: any) {
      throw new Error(`SQL error: ${err.message}`);
    }
  }

  // === Export ===

  export(sql: string, filename: string): ExportResult {
    const result = this.query(sql, 100000); // Higher limit for exports
    
    // Ensure filename has .csv extension
    const csvFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    const outputPath = path.join(this.exportsPath, csvFilename);

    // Handle filename collision
    let finalPath = outputPath;
    if (fs.existsSync(outputPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const base = path.basename(csvFilename, '.csv');
      finalPath = path.join(this.exportsPath, `${base}_${timestamp}.csv`);
    }

    // Write CSV
    const csvContent = stringify([result.columns, ...result.rows]);
    fs.writeFileSync(finalPath, csvContent);

    this.audit(`EXPORT: ${result.rowCount} rows to ${path.basename(finalPath)}`);

    info('Query exported', { path: finalPath, rows: result.rowCount });

    return {
      path: finalPath,
      rowCount: result.rowCount,
    };
  }

  // === Schema Exploration ===

  listTables(): TableInfo[] {
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string }[];

    return tables.map(t => {
      const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
      return { name: t.name, rowCount: count.cnt };
    });
  }

  describeTable(tableName: string): ColumnInfo[] {
    const safeTable = this.sanitizeIdentifier(tableName);
    
    if (!this.tableExists(safeTable)) {
      throw new Error(`Table "${tableName}" not found`);
    }

    const pragma = this.db.prepare(`PRAGMA table_info("${safeTable}")`).all() as any[];
    
    // Get sample values
    const sampleRow = this.db.prepare(`SELECT * FROM "${safeTable}" LIMIT 1`).get() as any;

    return pragma.map(col => ({
      name: col.name,
      type: col.type as 'TEXT' | 'INTEGER' | 'REAL',
      sample: sampleRow ? String(sampleRow[col.name] ?? '').slice(0, 30) : undefined,
    }));
  }

  // === Helpers ===

  private detectDelimiter(content: string): string {
    const firstLine = content.split('\n')[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    if (semicolonCount > commaCount) return ';';
    return ',';
  }

  private detectColumnTypes(records: any[], columnNames: string[]): ColumnInfo[] {
    return columnNames.map(name => {
      // Sample first 100 rows
      const samples = records.slice(0, 100).map(r => r[name]).filter(v => v !== '' && v !== null && v !== undefined);
      
      if (samples.length === 0) {
        return { name, type: 'TEXT' as const };
      }

      // Check if all are integers
      const allIntegers = samples.every(v => /^-?\d+$/.test(String(v)));
      if (allIntegers) {
        return { name, type: 'INTEGER' as const, sample: String(samples[0]) };
      }

      // Check if all are numeric
      const allNumeric = samples.every(v => !isNaN(parseFloat(String(v).replace(/,/g, ''))));
      if (allNumeric) {
        return { name, type: 'REAL' as const, sample: String(samples[0]) };
      }

      return { name, type: 'TEXT' as const, sample: String(samples[0]).slice(0, 30) };
    });
  }

  private sanitizeIdentifier(name: string): string {
    // Remove or replace problematic characters
    return name
      .replace(/[^\w\s-]/g, '')  // Remove special chars except underscore, space, hyphen
      .replace(/\s+/g, '_')       // Spaces to underscores
      .replace(/-+/g, '_')        // Hyphens to underscores
      .replace(/_+/g, '_')        // Collapse multiple underscores
      .replace(/^_|_$/g, '')      // Trim underscores
      .slice(0, 64);              // Limit length
  }

  private tableExists(name: string): boolean {
    const result = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name = ?
    `).get(name);
    return !!result;
  }

  private audit(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} | ${message}\n`;
    fs.appendFileSync(this.auditPath, line);
    debug('Data audit', { message });
  }

  close(): void {
    this.db.close();
  }
}
