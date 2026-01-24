// src/tools/data.ts
// Tools for financial data management - CSV import, SQL queries, exports

import type { Tool, ToolContext } from './types.js';
import path from 'path';

// === Helpers ===

function formatTable(columns: string[], rows: any[][], maxWidth: number = 30): string {
  if (columns.length === 0) return 'No columns';
  if (rows.length === 0) return 'No rows';

  // Calculate column widths
  const widths = columns.map((col, i) => {
    const colWidth = col.length;
    const maxRowWidth = Math.max(...rows.map(row => String(row[i] ?? '').length));
    return Math.min(Math.max(colWidth, maxRowWidth), maxWidth);
  });

  // Build header
  const header = columns.map((col, i) => col.slice(0, widths[i]).padEnd(widths[i])).join(' │ ');
  const separator = widths.map(w => '─'.repeat(w)).join('─┼─');

  // Build rows
  const rowStrings = rows.map(row =>
    row.map((cell, i) => {
      const str = String(cell ?? '');
      return str.slice(0, widths[i]).padEnd(widths[i]);
    }).join(' │ ')
  );

  return [header, separator, ...rowStrings].join('\n');
}

// === Tools ===

export const ingestCsv: Tool = {
  name: 'ingestCsv',
  description: 'Import a CSV or TSV file into the data database',

  routing: {
    patterns: [
      /^ingest\s+csv\s+(.+?)\s+as\s+(\w+)(.*)$/i,
      /^import\s+csv\s+(.+?)\s+as\s+(\w+)(.*)$/i,
    ],
    keywords: {
      verbs: ['ingest', 'import', 'load'],
      nouns: ['csv', 'tsv', 'spreadsheet', 'data'],
    },
    examples: [
      'ingest csv ~/Downloads/transactions.csv as transactions',
      'import csv summ-2025.tsv as crypto_trades --replace',
    ],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      const flags = match[3] || '';
      // Parse --skip-lines N
      const skipMatch = flags.match(/--skip-lines\s+(\d+)/);
      return {
        filepath: match[1].trim(),
        tableName: match[2].trim(),
        replace: flags.includes('--replace'),
        append: flags.includes('--append'),
        noHeader: flags.includes('--no-header'),
        skipLines: skipMatch ? parseInt(skipMatch[1], 10) : 0,
      };
    }
    return {};
  },

  execute: async (args, context) => {
    const { filepath, tableName, replace, append, noHeader, skipLines } = args as {
      filepath?: string;
      tableName?: string;
      replace?: boolean;
      append?: boolean;
      noHeader?: boolean;
      skipLines?: number;
    };

    if (!filepath || !tableName) {
      return `**Usage:** \`ingest csv <filepath> as <tablename>\`

**Options:**
- \`--replace\` — Drop existing table first
- \`--append\` — Add to existing table
- \`--no-header\` — File has no header row (columns named col_1, col_2, etc)
- \`--skip-lines N\` — Skip N lines at start (for preambles/metadata)

**Example:**
\`\`\`
ingest csv ~/Downloads/summ-2025.csv as transactions
ingest csv data.tsv as trades --replace
ingest csv summ-report.csv as summ --skip-lines 12
\`\`\``;
    }

    try {
      const result = context.services.data.importCsv(filepath, tableName, {
        replace,
        append,
        hasHeader: !noHeader,
        skipLines,
      });

      const colList = result.columns.slice(0, 10).map(c => `- ${c.name} (${c.type})`).join('\n');
      const moreCount = result.columns.length > 10 ? `\n- ... and ${result.columns.length - 10} more` : '';

      return `✓ **Imported ${result.rowCount.toLocaleString()} rows** into \`${result.table}\`

**Columns (${result.columns.length}):**
${colList}${moreCount}

**Source preserved:** \`${path.basename(result.sourcePath)}\`

**Next:** \`sql SELECT * FROM ${result.table} LIMIT 5\``;
    } catch (err: any) {
      return `**Import failed:** ${err.message}`;
    }
  },
};

export const sqlQuery: Tool = {
  name: 'sqlQuery',
  description: 'Run a SQL query on the data database',

  routing: {
    patterns: [
      /^sql\s+(.+)$/is,  // 's' flag for multiline
    ],
    keywords: {
      verbs: ['sql', 'query', 'select'],
      nouns: ['data', 'table'],
    },
    examples: [
      'sql SELECT * FROM transactions LIMIT 10',
      'sql SELECT type, SUM(value) FROM trades GROUP BY type',
    ],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      return { sql: match[1].trim() };
    }
    // Try to extract SQL from input
    const sqlMatch = input.match(/^sql\s+(.+)$/is);
    if (sqlMatch) {
      return { sql: sqlMatch[1].trim() };
    }
    return {};
  },

  execute: async (args, context) => {
    const { sql } = args as { sql?: string };

    if (!sql) {
      return `**Usage:** \`sql <query>\`

**Examples:**
\`\`\`
sql SELECT * FROM transactions LIMIT 10
sql SELECT type, COUNT(*) as cnt FROM trades GROUP BY type
sql SELECT asset, SUM(value) as total FROM transactions WHERE type = 'Buy' GROUP BY asset
\`\`\``;
    }

    try {
      const result = context.services.data.query(sql);

      if (result.rowCount === 0) {
        return `**0 rows returned**`;
      }

      const table = formatTable(result.columns, result.rows);
      const truncatedNote = result.truncated 
        ? `\n\n*Showing first 100 of ${result.rowCount.toLocaleString()} rows*` 
        : '';

      return `\`\`\`
${table}
\`\`\`
**${result.rowCount.toLocaleString()} row${result.rowCount !== 1 ? 's' : ''}**${truncatedNote}`;
    } catch (err: any) {
      return `**Query failed:** ${err.message}`;
    }
  },
};

export const exportQuery: Tool = {
  name: 'exportQuery',
  description: 'Export SQL query results to a CSV file',

  routing: {
    patterns: [
      /^export\s+"([^"]+)"\s+to\s+(\S+)$/i,
      /^export\s+'([^']+)'\s+to\s+(\S+)$/i,
      /^export\s+(.+?)\s+to\s+(\S+)$/i,
    ],
    keywords: {
      verbs: ['export', 'save'],
      nouns: ['csv', 'file', 'query'],
    },
    examples: [
      'export "SELECT * FROM transactions" to all-transactions.csv',
      'export "SELECT * FROM trades WHERE term = \'short\'" to short-term.csv',
    ],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      return {
        sql: match[1].trim(),
        filename: match[2].trim(),
      };
    }
    return {};
  },

  execute: async (args, context) => {
    const { sql, filename } = args as { sql?: string; filename?: string };

    if (!sql || !filename) {
      return `**Usage:** \`export "<query>" to <filename>\`

**Example:**
\`\`\`
export "SELECT * FROM transactions WHERE type = 'Buy'" to buys.csv
export "SELECT asset, SUM(value) FROM trades GROUP BY asset" to summary.csv
\`\`\``;
    }

    try {
      const result = context.services.data.export(sql, filename);

      return `✓ **Exported ${result.rowCount.toLocaleString()} rows** to \`${path.basename(result.path)}\`

**Full path:** \`${result.path}\``;
    } catch (err: any) {
      return `**Export failed:** ${err.message}`;
    }
  },
};

export const listTables: Tool = {
  name: 'listTables',
  description: 'List all tables in the data database',

  routing: {
    patterns: [
      /^(tables|show tables|list tables)$/i,
      /^data tables$/i,
    ],
    keywords: {
      verbs: ['show', 'list'],
      nouns: ['tables', 'data'],
    },
    examples: ['tables', 'show tables'],
    priority: 85,
  },

  execute: async (args, context) => {
    const tables = context.services.data.listTables();

    if (tables.length === 0) {
      return `**No tables yet**

Import data with:
\`\`\`
ingest csv ~/Downloads/your-file.csv as tablename
\`\`\``;
    }

    const tableList = tables
      .map(t => `- **${t.name}** — ${t.rowCount.toLocaleString()} rows`)
      .join('\n');

    return `**Data Tables:**

${tableList}

**Commands:**
- \`describe <table>\` — Show columns
- \`sql SELECT * FROM <table> LIMIT 5\` — Preview data`;
  },
};

export const describeTable: Tool = {
  name: 'describeTable',
  description: 'Show the schema of a data table',

  routing: {
    patterns: [
      /^describe\s+(\w+)$/i,
      /^schema\s+(\w+)$/i,
      /^columns\s+(\w+)$/i,
    ],
    keywords: {
      verbs: ['describe', 'show'],
      nouns: ['schema', 'columns', 'table'],
    },
    examples: ['describe transactions', 'schema trades'],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      return { table: match[1].trim() };
    }
    return {};
  },

  execute: async (args, context) => {
    const { table } = args as { table?: string };

    if (!table) {
      return `**Usage:** \`describe <tablename>\``;
    }

    try {
      const columns = context.services.data.describeTable(table);

      const colList = columns
        .map(c => {
          const sample = c.sample ? ` — e.g. "${c.sample}"` : '';
          return `- **${c.name}** (${c.type})${sample}`;
        })
        .join('\n');

      return `**Table: ${table}**

${colList}`;
    } catch (err: any) {
      return `**Error:** ${err.message}`;
    }
  },
};

export const previewMutation: Tool = {
  name: 'previewMutation',
  description: 'Preview what rows would be affected by an UPDATE or DELETE',

  routing: {
    patterns: [
      /^preview\s+(UPDATE\s+.+|DELETE\s+.+)$/is,
      /^dry[\s-]?run\s+(UPDATE\s+.+|DELETE\s+.+)$/is,
    ],
    keywords: {
      verbs: ['preview', 'dry-run', 'check'],
      nouns: ['update', 'delete', 'mutation'],
    },
    examples: [
      'preview UPDATE summ SET type = \'Buy\' WHERE type = \'Incoming\'',
      'preview DELETE FROM summ WHERE value = 0',
    ],
    priority: 90, // Higher than sqlQuery
  },

  parseArgs: (input, match) => {
    if (match) {
      return { sql: match[1].trim() };
    }
    return {};
  },

  execute: async (args, context) => {
    const { sql } = args as { sql?: string };

    if (!sql) {
      return `**Usage:** \`preview <UPDATE or DELETE statement>\`

Shows rows that would be affected WITHOUT making changes.

**Examples:**
\`\`\`
preview UPDATE summ SET type = 'Buy' WHERE type = 'Incoming' AND value > 100
preview DELETE FROM summ WHERE price IS NULL
\`\`\``;
    }

    try {
      const result = context.services.data.previewMutation(sql);

      if (result.rowCount === 0) {
        return `**0 rows would be affected**

No changes needed, or WHERE clause matches nothing.`;
      }

      const table = formatTable(result.columns, result.rows);
      const truncatedNote = result.truncated 
        ? `\n\n*Showing first 20 of ${result.rowCount.toLocaleString()} rows*` 
        : '';

      return `**${result.rowCount.toLocaleString()} row${result.rowCount !== 1 ? 's' : ''} would be affected:**

\`\`\`
${table}
\`\`\`${truncatedNote}

**To execute:** \`sql ${sql}\`
**To backup first:** \`snapshot <tablename>\``;
    } catch (err: any) {
      return `**Preview failed:** ${err.message}`;
    }
  },
};

export const snapshotTable: Tool = {
  name: 'snapshotTable',
  description: 'Create a backup snapshot of a table before making changes',

  routing: {
    patterns: [
      /^snapshot\s+(\w+)$/i,
      /^backup\s+(\w+)$/i,
    ],
    keywords: {
      verbs: ['snapshot', 'backup', 'save'],
      nouns: ['table', 'data'],
    },
    examples: ['snapshot summ', 'backup transactions'],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      return { table: match[1].trim() };
    }
    return {};
  },

  execute: async (args, context) => {
    const { table } = args as { table?: string };

    if (!table) {
      return `**Usage:** \`snapshot <tablename>\`

Creates a backup copy before you make changes.

**Example:**
\`\`\`
snapshot summ
sql UPDATE summ SET type = 'Buy' WHERE ...
\`\`\`

If something goes wrong: \`restore <snapshot_name> to summ\``;
    }

    try {
      const snapshotName = context.services.data.snapshot(table);

      return `✓ **Snapshot created:** \`${snapshotName}\`

Now safe to make changes. To restore if needed:
\`\`\`
restore ${snapshotName} to ${table}
\`\`\``;
    } catch (err: any) {
      return `**Snapshot failed:** ${err.message}`;
    }
  },
};

export const restoreSnapshot: Tool = {
  name: 'restoreSnapshot',
  description: 'Restore a table from a snapshot backup',

  routing: {
    patterns: [
      /^restore\s+(\w+)\s+to\s+(\w+)$/i,
      /^restore\s+(\w+)$/i,
    ],
    keywords: {
      verbs: ['restore', 'revert', 'rollback'],
      nouns: ['snapshot', 'backup'],
    },
    examples: [
      'restore summ_snapshot_2025_01_15 to summ',
    ],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match) {
      const snapshot = match[1].trim();
      // If no target specified, try to extract from snapshot name
      let target = match[2]?.trim();
      if (!target) {
        // Extract table name from snapshot: "tablename_snapshot_timestamp"
        const parts = snapshot.split('_snapshot_');
        target = parts[0];
      }
      return { snapshot, target };
    }
    return {};
  },

  execute: async (args, context) => {
    const { snapshot, target } = args as { snapshot?: string; target?: string };

    if (!snapshot || !target) {
      return `**Usage:** \`restore <snapshot_name> to <tablename>\`

**List snapshots:** \`snapshots\`

**Example:**
\`\`\`
snapshots
restore summ_snapshot_2025-01-15T10-30-00 to summ
\`\`\``;
    }

    try {
      const rowCount = context.services.data.restoreSnapshot(snapshot, target);

      return `✓ **Restored ${rowCount.toLocaleString()} rows** from \`${snapshot}\` to \`${target}\`

The snapshot is still available if you need it again.
To delete old snapshots: \`sql DROP TABLE ${snapshot}\``;
    } catch (err: any) {
      return `**Restore failed:** ${err.message}`;
    }
  },
};

export const listSnapshots: Tool = {
  name: 'listSnapshots',
  description: 'List available table snapshots',

  routing: {
    patterns: [
      /^snapshots$/i,
      /^list snapshots$/i,
      /^show snapshots$/i,
    ],
    keywords: {
      verbs: ['show', 'list'],
      nouns: ['snapshots', 'backups'],
    },
    examples: ['snapshots'],
    priority: 85,
  },

  execute: async (args, context) => {
    const snapshots = context.services.data.listSnapshots();

    if (snapshots.length === 0) {
      return `**No snapshots**

Create one before making changes:
\`\`\`
snapshot <tablename>
\`\`\``;
    }

    const list = snapshots
      .map(s => {
        // Parse timestamp from name (format: _snapshot_YYYY_MM_DD_HH_MM_SS)
        const match = s.name.match(/_snapshot_(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})/);
        const timestamp = match ? match[1].replace(/_/g, '-').slice(0, 10) + ' ' + match[1].slice(11).replace(/_/g, ':') : '';
        return `- **${s.name}** — ${s.rowCount.toLocaleString()} rows${timestamp ? ` (${timestamp})` : ''}`;
      })
      .join('\n');

    return `**Available Snapshots:**

${list}

**To restore:** \`restore <snapshot_name> to <tablename>\`
**To delete:** \`sql DROP TABLE <snapshot_name>\``;
  },
};

// Export all data tools
export const dataTools: Tool[] = [
  ingestCsv,
  sqlQuery,
  exportQuery,
  listTables,
  describeTable,
  previewMutation,
  snapshotTable,
  restoreSnapshot,
  listSnapshots,
];
