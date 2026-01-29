#!/usr/bin/env bash
# Bartleby Security Audit
# Checks security posture and provides recommendations

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
WARN="${YELLOW}⚠${NC}"
FAIL="${RED}✗${NC}"
INFO="${BLUE}ℹ${NC}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================="
echo "Bartleby Security Audit"
echo "========================================="
echo ""

# Track overall status
ISSUES=0
WARNINGS=0

# === 1. File Permissions ===
echo "1. File Permissions"
echo "-------------------"

# Check .env permissions
if [ -f .env ]; then
    PERMS=$(stat -f "%A" .env 2>/dev/null || stat -c "%a" .env 2>/dev/null)
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "400" ]; then
        echo -e "$PASS .env permissions: $PERMS (secure)"
    else
        echo -e "$FAIL .env permissions: $PERMS (should be 600)"
        echo "   Fix: chmod 600 .env"
        ((ISSUES++))
    fi
else
    echo -e "$WARN .env not found"
    ((WARNINGS++))
fi

# Check directory permissions
for DIR in garden database shed logs data; do
    if [ -d "$DIR" ]; then
        PERMS=$(stat -f "%A" "$DIR" 2>/dev/null || stat -c "%a" "$DIR" 2>/dev/null)
        if [ "$PERMS" = "700" ]; then
            echo -e "$PASS $DIR/ permissions: $PERMS (secure)"
        else
            echo -e "$WARN $DIR/ permissions: $PERMS (recommended: 700)"
            echo "   Fix: chmod 700 $DIR"
            ((WARNINGS++))
        fi
    fi
done

echo ""

# === 2. Network Configuration ===
echo "2. Network Configuration"
echo "------------------------"

if [ -f .env ]; then
    # Source .env safely
    export $(grep -v '^#' .env | xargs)

    # Check DASHBOARD_HOST
    if [ -n "${DASHBOARD_HOST:-}" ]; then
        if [ "$DASHBOARD_HOST" = "localhost" ] || [ "$DASHBOARD_HOST" = "127.0.0.1" ]; then
            echo -e "$PASS DASHBOARD_HOST=$DASHBOARD_HOST (secure - local only)"
        elif [[ "$DASHBOARD_HOST" =~ ^100\. ]]; then
            echo -e "$PASS DASHBOARD_HOST=$DASHBOARD_HOST (secure - Tailscale VPN)"
        elif [ "$DASHBOARD_HOST" = "0.0.0.0" ]; then
            echo -e "$FAIL DASHBOARD_HOST=$DASHBOARD_HOST (INSECURE - exposed to all networks!)"
            echo "   Risk: Anyone on your network can access/modify your data"
            echo "   Fix: Set DASHBOARD_HOST=localhost or Tailscale IP"
            ((ISSUES++))
        else
            echo -e "$WARN DASHBOARD_HOST=$DASHBOARD_HOST (verify this is intentional)"
            ((WARNINGS++))
        fi
    else
        echo -e "$INFO DASHBOARD_HOST not set (will default to localhost)"
    fi

    # Check API token
    if [ -n "${BARTLEBY_API_TOKEN:-}" ]; then
        echo -e "$PASS BARTLEBY_API_TOKEN is set (remote access protected)"
    else
        if [ "${DASHBOARD_HOST:-localhost}" != "localhost" ] && [ "${DASHBOARD_HOST:-localhost}" != "127.0.0.1" ]; then
            echo -e "$WARN BARTLEBY_API_TOKEN not set (remote chat/capture endpoints unprotected)"
            ((WARNINGS++))
        else
            echo -e "$INFO BARTLEBY_API_TOKEN not set (OK for localhost-only)"
        fi
    fi
else
    echo -e "$WARN Cannot check network config (.env missing)"
fi

echo ""

# === 3. LLM Endpoints ===
echo "3. LLM Endpoints (Data Privacy)"
echo "-------------------------------"

if [ -f .env ]; then
    LOCAL_PATTERN="^(http://|https://)(localhost|127\.0\.0\.1|0\.0\.0\.0|100\.)"

    for VAR in ROUTER_URL FAST_URL THINKING_URL EMBEDDINGS_URL OCR_URL; do
        VAL="${!VAR:-}"
        if [ -n "$VAL" ]; then
            if [[ "$VAL" =~ $LOCAL_PATTERN ]]; then
                echo -e "$PASS $VAR=$VAL (local)"
            else
                echo -e "$FAIL $VAR=$VAL (external - data leaves your machine!)"
                ((ISSUES++))
            fi
        fi
    done
else
    echo -e "$WARN Cannot check LLM endpoints (.env missing)"
fi

echo ""

# === 4. Logging Configuration ===
echo "4. Logging Configuration"
echo "------------------------"

if [ -f .env ]; then
    LOG_LEVEL="${LOG_LEVEL:-info}"
    LOG_LLM_VERBOSE="${LOG_LLM_VERBOSE:-false}"

    if [ "$LOG_LEVEL" = "info" ] || [ "$LOG_LEVEL" = "warn" ] || [ "$LOG_LEVEL" = "error" ]; then
        echo -e "$PASS LOG_LEVEL=$LOG_LEVEL (appropriate for production)"
    elif [ "$LOG_LEVEL" = "debug" ]; then
        echo -e "$WARN LOG_LEVEL=debug (may log sensitive data)"
        echo "   Fix: Set LOG_LEVEL=info in .env"
        ((WARNINGS++))
    fi

    if [ "$LOG_LLM_VERBOSE" = "false" ]; then
        echo -e "$PASS LOG_LLM_VERBOSE=false (secure)"
    else
        echo -e "$FAIL LOG_LLM_VERBOSE=true (logs full LLM conversations!)"
        echo "   Fix: Set LOG_LLM_VERBOSE=false in .env"
        ((ISSUES++))
    fi
fi

echo ""

# === 5. Full-Disk Encryption ===
echo "5. Full-Disk Encryption"
echo "-----------------------"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - check FileVault
    FV_STATUS=$(fdesetup status 2>/dev/null || echo "unknown")
    if [[ "$FV_STATUS" == *"On"* ]]; then
        echo -e "$PASS FileVault is enabled"
    else
        echo -e "$FAIL FileVault is OFF - data at rest is unencrypted!"
        echo "   Risk: Anyone with physical access can read your data"
        echo "   Fix: System Settings → Privacy & Security → FileVault → Turn On"
        ((ISSUES++))
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - check for LUKS/dm-crypt
    if command -v lsblk &> /dev/null; then
        ENCRYPTED=$(lsblk -o NAME,TYPE | grep -c crypt || true)
        if [ "$ENCRYPTED" -gt 0 ]; then
            echo -e "$PASS Encrypted volumes detected ($ENCRYPTED)"
        else
            echo -e "$WARN No encrypted volumes detected (check manually)"
            echo "   Run: lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINT"
            ((WARNINGS++))
        fi
    else
        echo -e "$INFO Cannot auto-detect encryption (verify manually)"
    fi
else
    echo -e "$INFO OS type: $OSTYPE (verify encryption manually)"
fi

echo ""

# === 6. Backup Status ===
echo "6. Backup Status"
echo "----------------"

BACKUP_FOUND=0
BACKUP_LOCATIONS=(
    "$HOME/backups"
    "$HOME/Backups"
    "$HOME/Documents/backups"
    "$PROJECT_ROOT/../bartleby-backups"
    "/Volumes/*/bartleby*"
)

for LOC in "${BACKUP_LOCATIONS[@]}"; do
    # Expand glob
    for DIR in $LOC; do
        if [ -d "$DIR" ]; then
            RECENT=$(find "$DIR" -name "*bartleby*" -o -name "*backup*" 2>/dev/null | head -5)
            if [ -n "$RECENT" ]; then
                echo -e "$INFO Found backups in: $DIR"
                BACKUP_FOUND=1
            fi
        fi
    done
done

if [ $BACKUP_FOUND -eq 0 ]; then
    echo -e "$WARN No backup directories found in common locations"
    echo "   Recommendation: Set up encrypted backups"
    echo "   Example: tar -cz garden database .env | gpg -c > ~/backups/bartleby-\$(date +%F).tar.gz.gpg"
    ((WARNINGS++))
fi

# Check Time Machine (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    TM_STATUS=$(tmutil status 2>/dev/null | grep -o "Running = [0-9]" | cut -d' ' -f3 || echo "")
    if [ "$TM_STATUS" = "1" ]; then
        echo -e "$PASS Time Machine backup in progress"
    else
        TM_DEST=$(tmutil destinationinfo 2>/dev/null | grep "Name" | head -1)
        if [ -n "$TM_DEST" ]; then
            echo -e "$PASS Time Machine configured: $TM_DEST"
        else
            echo -e "$INFO Time Machine not configured (manual backups recommended)"
        fi
    fi
fi

echo ""

# === 7. Sensitive Data Locations ===
echo "7. Sensitive Data Inventory"
echo "---------------------------"

DATA_SIZE=0
for DIR in garden database shed data logs; do
    if [ -d "$DIR" ]; then
        SIZE=$(du -sh "$DIR" 2>/dev/null | cut -f1)
        echo -e "$INFO $DIR/: $SIZE"
    fi
done

# Check for .env in git
if [ -d .git ]; then
    if git ls-files --error-unmatch .env &> /dev/null; then
        echo -e "$FAIL .env is tracked by git (secrets will be committed!)"
        echo "   Fix: git rm --cached .env && echo '.env' >> .gitignore"
        ((ISSUES++))
    else
        echo -e "$PASS .env is not tracked by git"
    fi
fi

echo ""

# === 8. Data Subdirectories (Financial Data) ===
echo "8. Financial Data Protection"
echo "-----------------------------"

if [ -d data ]; then
    echo -e "$INFO data/ directory exists (contains financial records)"

    # Check data.sqlite3
    if [ -f database/data.sqlite3 ]; then
        SIZE=$(du -sh database/data.sqlite3 2>/dev/null | cut -f1)
        echo -e "$INFO database/data.sqlite3: $SIZE"

        # Check permissions
        PERMS=$(stat -f "%A" database/data.sqlite3 2>/dev/null || stat -c "%a" database/data.sqlite3 2>/dev/null)
        if [ "$PERMS" = "600" ]; then
            echo -e "$PASS data.sqlite3 permissions: $PERMS"
        else
            echo -e "$WARN data.sqlite3 permissions: $PERMS (recommended: 600)"
            ((WARNINGS++))
        fi
    fi

    # Check for CSV sources
    if [ -d data/sources ]; then
        CSV_COUNT=$(find data/sources -type f | wc -l | tr -d ' ')
        if [ "$CSV_COUNT" -gt 0 ]; then
            echo -e "$INFO $CSV_COUNT source file(s) in data/sources/"
        fi
    fi
else
    echo -e "$INFO data/ directory not created yet (no financial data imported)"
fi

echo ""

# === Summary ===
echo "========================================="
echo "Summary"
echo "========================================="

if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "$PASS No issues found! Security posture is strong."
elif [ $ISSUES -eq 0 ]; then
    echo -e "$WARN $WARNINGS warning(s) - review recommendations above"
else
    echo -e "$FAIL $ISSUES critical issue(s), $WARNINGS warning(s)"
    echo ""
    echo "Critical issues require immediate attention."
fi

echo ""

# === Quick Fix Commands ===
if [ $ISSUES -gt 0 ] || [ $WARNINGS -gt 0 ]; then
    echo "Quick Fix Commands:"
    echo "-------------------"
    echo "chmod 600 .env"
    echo "chmod 700 garden database shed logs data"

    if [ -f database/data.sqlite3 ]; then
        echo "chmod 600 database/data.sqlite3"
    fi

    echo ""
    echo "For full recommendations, see: devs-notes/SECURITY.md"
fi

echo ""
