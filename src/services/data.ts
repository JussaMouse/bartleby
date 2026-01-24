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

    // Build column map: sanitized name -> { originalName, type }
    const columnMap = columnNames.map((originalName, i) => ({
      originalName,
      type: columns[i].type,
    }));

    const insertMany = this.db.transaction((rows: any[]) => {
      for (const row of rows) {
        const values = columnMap.map(col => {
          const val = row[col.originalName];
          if (val === '' || val === undefined || val === null) return null;
          
          // Coerce numeric values (strip commas for REAL columns)
          if (col.type === 'REAL' && typeof val === 'string') {
            const cleaned = val.replace(/,/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? val : num;
          }
          if (col.type === 'INTEGER' && typeof val === 'string') {
            const num = parseInt(val, 10);
            return isNaN(num) ? val : num;
          }
          
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

    // Return sanitized column names (as they appear in the database)
    const sanitizedColumns = columns.map(c => ({
      ...c,
      name: this.sanitizeIdentifier(c.name),
    }));

    return {
      table: safeTableName,
      rowCount: records.length,
      columns: sanitizedColumns,
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

  // === Safe Mutations ===

  /**
   * Preview what rows would be affected by an UPDATE or DELETE
   * Converts "UPDATE table SET ... WHERE ..." to "SELECT * FROM table WHERE ..."
   */
  previewMutation(sql: string, maxRows: number = 20): QueryResult {
    const trimmed = sql.trim();
    
    // Extract table and WHERE clause from UPDATE
    const updateMatch = trimmed.match(/^UPDATE\s+["']?(\w+)["']?\s+SET\s+.+?(WHERE\s+.+)?$/is);
    if (updateMatch) {
      const table = updateMatch[1];
      const whereClause = updateMatch[2] || '';
      const previewSql = `SELECT rowid, * FROM "${table}" ${whereClause}`;
      return this.query(previewSql, maxRows);
    }

    // Extract table and WHERE clause from DELETE
    const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+["']?(\w+)["']?\s*(WHERE\s+.+)?$/is);
    if (deleteMatch) {
      const table = deleteMatch[1];
      const whereClause = deleteMatch[2] || '';
      const previewSql = `SELECT rowid, * FROM "${table}" ${whereClause}`;
      return this.query(previewSql, maxRows);
    }

    throw new Error('Can only preview UPDATE or DELETE statements');
  }

  /**
   * Create a backup snapshot of a table before mutation
   */
  snapshot(tableName: string): string {
    const safeTable = this.sanitizeIdentifier(tableName);
    
    if (!this.tableExists(safeTable)) {
      throw new Error(`Table "${tableName}" not found`);
    }

    const timestamp = new Date().toISOString().replace(/[:.T-]/g, '_').slice(0, 19);
    const snapshotName = `${safeTable}_snapshot_${timestamp}`;

    this.db.exec(`CREATE TABLE "${snapshotName}" AS SELECT * FROM "${safeTable}"`);
    
    const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${snapshotName}"`).get() as { cnt: number };
    
    this.audit(`SNAPSHOT: ${safeTable} -> ${snapshotName} (${count.cnt} rows)`);
    info('Table snapshot created', { source: safeTable, snapshot: snapshotName, rows: count.cnt });

    return snapshotName;
  }

  /**
   * Restore a table from a snapshot
   */
  restoreSnapshot(snapshotName: string, targetTable: string): number {
    const safeSnapshot = this.sanitizeIdentifier(snapshotName);
    const safeTarget = this.sanitizeIdentifier(targetTable);

    if (!this.tableExists(safeSnapshot)) {
      throw new Error(`Snapshot "${snapshotName}" not found`);
    }

    // Drop target and recreate from snapshot
    this.db.exec(`DROP TABLE IF EXISTS "${safeTarget}"`);
    this.db.exec(`CREATE TABLE "${safeTarget}" AS SELECT * FROM "${safeSnapshot}"`);

    const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${safeTarget}"`).get() as { cnt: number };
    
    this.audit(`RESTORE: ${safeSnapshot} -> ${safeTarget} (${count.cnt} rows)`);
    info('Table restored from snapshot', { snapshot: safeSnapshot, target: safeTarget, rows: count.cnt });

    return count.cnt;
  }

  /**
   * List available snapshots
   */
  listSnapshots(): TableInfo[] {
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name LIKE '%_snapshot_%'
      ORDER BY name DESC
    `).all() as { name: string }[];

    return tables.map(t => {
      const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
      return { name: t.name, rowCount: count.cnt };
    });
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
