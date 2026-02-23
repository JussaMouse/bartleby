# Manual Testing Guide - Import System

Quick manual testing checklist for new import features (Phase 1-2).

## Prerequisites

```bash
pnpm start
```

## Test 1: Import History & Duplicate Detection

```bash
# Add test files to inbox
echo "Test invoice" > inbox/invoice-test.txt
echo "Meeting notes" > inbox/notes.txt

# Import files
> import files
> confirm import

# Check history
> import history

# Try importing same files again (should detect duplicates)
> import files
> confirm import
# Expected: Should show skipped duplicates

# Verify in history
> import history
# Expected: Only original imports shown
```

## Test 2: Import Rule Management

```bash
# Create a rule
> create import rule
# Provide: name="Financial Docs", filenamePattern="invoice.*",
#          project="+finances", privacy="confidential"

# View rules
> show import rules

# Test rule against inbox
> test import rule Financial Docs

# Edit rule
> edit import rule Financial Docs

# Delete rule
> delete import rule Financial Docs
```

## Test 3: Rule-Based Import

```bash
# Create import rule first
# Add matching file to inbox: invoice-jan-2026.pdf

# Import with rules
> import files
> confirm import
# Expected: Rule should auto-apply project/privacy metadata

# Verify in garden
> search invoice
# Expected: Should have correct project and privacy tags
```

## Test 4: Error Handling

```bash
# Try invalid rule
> create import rule
# Provide: name="" (empty - should reject with clear error)

# Try duplicate rule name
> create import rule
# Provide: name matching existing rule
# Expected: Clear error about duplicate

# Check empty inbox
> import files
# Expected: "Inbox is empty" message
```

## Test 5: Import Statistics

```bash
# After importing several files
> import history
# Expected: Shows by date, with stats by type

# Search history
# Expected: Can find files by name/path
```

## Success Criteria

- ✅ Duplicate detection prevents re-imports
- ✅ Import history tracks all imports with hashes
- ✅ Rules can be created/edited/deleted interactively
- ✅ Rule matching works and applies metadata
- ✅ Clear error messages for validation failures
- ✅ Import statistics show correct counts
- ✅ Search finds historical imports

## Test 6: Settings System

```bash
# View all settings
> settings

# View specific category
> settings calendar
> settings llm

# Set a value
> set calendar.timezone to America/New_York
> set llm.router-model to qwen3:1b

# View stats
> settings stats

# Check settings were saved
> settings calendar
# Expected: Should show updated timezone
```

## Test 7: Dry-Run Mode

```bash
# Add multiple files to inbox
echo "Test 1" > inbox/test1.txt
echo "Test 2" > inbox/test2.txt
echo "Invoice" > inbox/invoice.pdf

# Preview import
> import all --dry-run
# Expected: Shows what would be imported, rules matched, no actual import

# Preview specific type
> import only text --dry-run
# Expected: Shows only text files that would be imported
```

## Database Verification (Optional)

```bash
sqlite3 database/garden.sqlite3

# Check import_history table
SELECT COUNT(*) FROM import_history;
SELECT * FROM import_history LIMIT 5;

# Check for duplicates (should be 0)
SELECT file_hash, COUNT(*)
FROM import_history
GROUP BY file_hash
HAVING COUNT(*) > 1;

# View indexes
.indexes import_history

# Check settings table
SELECT COUNT(*) FROM settings;
SELECT category, COUNT(*) FROM settings GROUP BY category;
SELECT * FROM settings LIMIT 5;

# Check settings metadata
SELECT * FROM settings_metadata;
```
