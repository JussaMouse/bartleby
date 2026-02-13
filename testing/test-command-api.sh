#!/bin/bash
# Test script for command API endpoints

API_URL="http://localhost:3333/api"

echo "=================================="
echo "Testing Command API Endpoints"
echo "=================================="
echo

# Test 1: Parse note command
echo "1. Testing /api/command (parse note)"
curl -s -X POST $API_URL/command -H "Content-Type: application/json" -d '{"input":"note test meeting +project-x #important"}' | jq .
echo

# Test 2: Parse action command
echo "2. Testing /api/command (parse action)"
curl -s -X POST $API_URL/command -H "Content-Type: application/json" -d '{"input":"action call bob @phone due:friday"}' | jq .
echo

# Test 3: Parse show command
echo "3. Testing /api/command (parse show)"
curl -s -X POST $API_URL/command -H "Content-Type: application/json" -d '{"input":"show inbox"}' | jq .
echo

# Test 4: Execute create note command
echo "4. Testing /api/command/execute (create note)"
curl -s -X POST $API_URL/command/execute -H "Content-Type: application/json" -d '{
  "parsed": {
    "type": "create_note",
    "confidence": "high",
    "rawInput": "note API test note",
    "title": "API test note",
    "metadata": {"project": "testing", "tags": ["api"]}
  }
}' | jq .
echo

# Test 5: Execute show panel command
echo "5. Testing /api/command/execute (show panel)"
curl -s -X POST $API_URL/command/execute -H "Content-Type: application/json" -d '{
  "parsed": {
    "type": "show_panel",
    "confidence": "high",
    "rawInput": "show notes",
    "panel": "notes"
  }
}' | jq .
echo

# Test 6: Get autocomplete suggestions
echo "6. Testing /api/command/suggestions"
curl -s "$API_URL/command/suggestions?q=note+test+%2Bpro" | jq .
echo

# Test 7: Get command history (TODO)
echo "7. Testing /api/command/history"
curl -s $API_URL/command/history | jq .
echo

echo "=================================="
echo "All tests complete!"
echo "=================================="
