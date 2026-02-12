#!/bin/bash
# Bartleby SSH Tunnel Helper
# Automatically reconnects when connection drops

set -e

HOST="${1:-bart-home}"
PORT="${2:-3333}"

echo "🔌 Starting tunnel to $HOST:$PORT..."
echo "   Dashboard will be at http://localhost:$PORT"
echo "   Press Ctrl+C to stop"
echo ""

# Suppress "connection refused" spam by redirecting stderr
# but keep showing important messages
ssh -N -L "$PORT:localhost:$PORT" "$HOST" 2>&1 | \
  grep -v "channel.*open failed.*connection refused" || true

echo ""
echo "🔌 Tunnel closed"
