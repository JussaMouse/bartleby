# Data Feature

Import, query, and analyze tabular data (CSV/spreadsheets) within Bartleby.

## Purpose

Enable financial record-keeping and analysis directly in Bartleby:
- Import transaction data from services like Summ (crypto tax prep)
- Run SQL queries for custom analysis
- Export results for tax filing or further processing
- Build a permanent, queryable financial history

## Architecture

```
bartleby/
  database/
    data.sqlite3    ← NEW: tabular data (finances, etc.)
    garden.sqlite3  ← existing: GTD/notes/calendar
    memory.sqlite3  ← existing: context/facts
```

**Why separate database?**
- Financial data is structurally different (tabular, not documents)
- Keeps it portable (easy to backup/export just finances)
- No risk of corrupting GTD data during development
- Can grow large without affecting core performance

## Phase 1: Minimal Commands

### `ingest csv <file> as <table>`

Import a CSV file into SQLite.

```
> ingest csv ~/Downloads/summ-2025.csv as transactions
✓ Imported 1,247 rows into "transactions"
  Columns: date, type, asset, amount, cost_basis, proceeds, gain_loss, term
```

**Behavior:**
- Auto-detects column types (text, numeric, date)
- Creates table if not exists
- Option to append or replace existing data
- Preserves original CSV unchanged in `data/sources/` for reference

### `sql <query>`

Run raw SQL queries.

```
> sql SELECT type, SUM(gain_loss) as total FROM transactions GROUP BY type
┌──────────┬───────────┐
│ type     │ total     │
├──────────┼───────────┤
│ trade    │ 12,345.67 │
│ income   │ 2,100.00  │
│ transfer │ 0.00      │
└──────────┴───────────┘
```

**Behavior:**
- Full SQLite SQL support
- Pretty-printed table output
- Shows row count
- Large results paginate or truncate

### `export <query> to <file>`

Export query results to CSV.

```
> export "SELECT * FROM transactions WHERE term = 'short'" to short-term-gains.csv
✓ Exported 892 rows to short-term-gains.csv
```

### `tables` / `describe <table>`

Explore schema.

```
> tables
transactions (1,247 rows)
cost_basis_adjustments (23 rows)

> describe transactions
┌─────────────┬─────────┬─────────┐
│ column      │ type    │ sample  │
├─────────────┼─────────┼─────────┤
│ date        │ TEXT    │ 2025-01 │
│ type        │ TEXT    │ trade   │
│ asset       │ TEXT    │ ETH     │
│ amount      │ REAL    │ 1.5     │
│ ...         │ ...     │ ...     │
└─────────────┴─────────┴─────────┘
```

## Phase 2: Convenience Commands (As Needed)

Add these as patterns emerge from real use:

```
# Date filtering
> sql transactions where date between 2025-01-01 and 2025-12-31

# Quick aggregations  
> sum transactions.gain_loss where term = 'short'
> count transactions where type = 'trade'

# Named queries (save common queries)
> save query short_gains "SELECT * FROM transactions WHERE term = 'short'"
> run short_gains

# Views
> create view taxable_2025 as SELECT ... 
```

## Phase 3: Natural Language (Future)

```
> ask data what were my total short term gains in 2025?
Based on your transactions table, your short-term capital gains for 2025 were $12,345.67
across 892 transactions.
```

LLM generates SQL, executes, summarizes results.

## Data Considerations

### Source Preservation
- Keep original CSVs in `data/sources/` 
- Never modify source files
- Track import history (when imported, row counts)

### Type Detection
SQLite is flexible, but we should detect:
- Dates → store as TEXT in ISO format for sorting
- Currency → store as REAL (consider integer cents for precision)
- Categories → TEXT

### Multi-table Support
As complexity grows:
```
transactions     ← raw imported data
cost_basis       ← manual adjustments
assets           ← asset metadata (acquisition dates, etc.)
tax_lots         ← FIFO/LIFO tracking
```

## Tax-Specific Considerations

### Short-term vs Long-term
- Short-term: held < 1 year (taxed as ordinary income)
- Long-term: held ≥ 1 year (preferential rates)
- Need acquisition date to calculate

### Cost Basis Methods
- FIFO (First In, First Out) - default
- LIFO (Last In, First Out)
- Specific identification
- Average cost (for certain assets)

### Wash Sales
- Can't claim loss if you buy same asset within 30 days
- Summ may handle this, but we might need to verify

### What Summ Provides
The "Summ" (formerly Crypto Tax Calculator) export likely includes:
- Transaction date
- Transaction type (trade, transfer, income, etc.)
- Asset symbol
- Amount
- Cost basis
- Proceeds
- Gain/loss
- Term (short/long)
- Possibly: exchange, wallet, tx hash

## File Locations

```
bartleby/
  database/
    data.sqlite3         ← main data database
  data/
    sources/             ← original CSV files (preserved)
      summ-2025.csv
      bank-statement-jan.csv
    exports/             ← generated reports
      short-term-gains-2025.csv
```

## Implementation Plan

1. **DataService** (`src/services/data.ts`)
   - Manages `data.sqlite3`
   - CSV parsing and import
   - Query execution
   - Export functionality

2. **Data Tools** (`src/tools/data.ts`)
   - `ingestCsv` - import CSV
   - `sqlQuery` - run SQL
   - `exportQuery` - export to CSV
   - `listTables` - show tables
   - `describeTable` - show schema

3. **Router Integration**
   - Pattern matching for `ingest csv`, `sql`, `export`
   - Keep it simple - most work is raw SQL

## Open Questions

- [ ] Should we support Excel (.xlsx) import?
- [ ] How to handle CSV encoding issues?
- [ ] Should queries be logged for audit trail?
- [ ] Integration with calendar (tax deadlines)?
- [ ] Backup strategy for financial data?

---

*This is a living document. Update as we build and learn from real usage.*
