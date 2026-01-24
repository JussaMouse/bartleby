# Bartleby Security Analysis

Analysis of data protection, network exposure, and privacy considerations.

## Executive Summary

Bartleby stores sensitive personal data (tasks, notes, contacts, calendar, financial data). This document identifies risks and mitigations.

**Key Findings:**
- ✅ Local-first architecture (data stays on your machine)
- ✅ LLM inference runs locally (no data sent to cloud AI)
- ⚠️ Dashboard can be exposed to network if misconfigured
- ⚠️ Some endpoints lack authentication
- ⚠️ Data at rest is unencrypted
- ⚠️ Logs may contain sensitive content

---

## 1. Network Exposure

### Dashboard Server

| Setting | Risk Level | Description |
|---------|------------|-------------|
| `DASHBOARD_HOST=localhost` | ✅ Low | Only accessible from server |
| `DASHBOARD_HOST=<tailscale-ip>` | ✅ Low | Only accessible via VPN |
| `DASHBOARD_HOST=0.0.0.0` | ⚠️ High | Accessible from ALL networks |

**Risk:** With `0.0.0.0`, anyone on your local network can access the dashboard.

**Mitigation:**
```env
# GOOD: Bind to Tailscale only
DASHBOARD_HOST=100.x.x.x

# BAD: Exposes to all networks
DASHBOARD_HOST=0.0.0.0
```

### Authenticated vs Unauthenticated Endpoints

**Requires `BARTLEBY_API_TOKEN`:**
- `POST /api/chat` - Execute commands
- `POST /api/capture` - Add to inbox

**No Authentication (read/modify your data):**
- `GET /api/inbox` - View inbox
- `GET /api/next-actions` - View actions
- `GET /api/today` - View schedule
- `GET /api/calendar` - View calendar
- `GET /api/page/:id` - Read any page
- `PUT /api/page/:id` - Edit any page
- `DELETE /api/page/:id` - Delete any page
- `POST /api/note` - Create notes
- `POST /api/action` - Create actions
- `PATCH /api/note/:id` - Edit notes
- `PATCH /api/action/:id` - Edit actions
- WebSocket connections - Real-time updates

**Risk:** If dashboard is network-exposed, anyone can read/modify/delete your data without a token.

**Recommendation:** Either:
1. Keep `DASHBOARD_HOST=localhost` or Tailscale IP
2. Or add authentication to all endpoints (future enhancement)

---

## 2. Data Sent to External Services

### Local LLM Models (Router, Fast, Thinking)

**What's sent:** User input, conversation context, tool results

**Risk:** Low if using local models. Data stays on your network.

**Verify your setup:**
```bash
# Check LLM URLs - should be localhost or local IP
echo $FAST_URL
echo $THINKING_URL
echo $ROUTER_URL
```

If these point to cloud APIs (OpenAI, Anthropic, etc.), your data IS sent externally.

### Embeddings Model

**What's sent:** Text content for vectorization (notes, tasks, documents)

**Risk:** Same as LLM - low if local, higher if cloud.

### OCR Model

**What's sent:** Images for text extraction

**Risk:** Low if local (mlx-box). Images may contain sensitive info.

### Weather API (OpenWeatherMap)

**What's sent:** City name only

**Risk:** Minimal - just reveals your general location.

### Signal Notifications

**What's sent:** Reminder text to your phone number

**Risk:** Signal is E2E encrypted. Phone numbers stored in `.env`.

---

## 3. Data Storage

### Locations

| Path | Contents | Format |
|------|----------|--------|
| `garden/` | Notes, tasks, contacts | Markdown files |
| `garden/archive.log` | Deleted/completed items | Plain text log |
| `database/garden.sqlite3` | Garden index | SQLite |
| `database/memory.sqlite3` | Context/facts | SQLite |
| `shed/` | Ingested documents | Chunks + embeddings |
| `logs/` | Application logs | Text files |

### Encryption at Rest

**Current state:** None. All data is plaintext.

**Risk:** Anyone with filesystem access can read everything.

**Mitigations:**
- Use full-disk encryption (FileVault on macOS, LUKS on Linux)
- Restrict file permissions
- Physical security of the server

### File Permissions

**Current state:** No explicit permission setting. Uses umask defaults.

**Recommendation:**
```bash
# Restrict to owner only
chmod 700 garden database shed logs
chmod 600 .env
```

---

## 4. Data Deletion

### What Happens When You Delete

1. Record is appended to `archive.log` with:
   - Date/time
   - Action (DONE or DELETED)
   - Type (action, note, etc.)
   - Title
   - Context/project

2. Markdown file is deleted from `garden/`

3. Database record is deleted

**Risk:** `archive.log` retains titles of deleted items forever.

**To truly delete:**
```bash
# Remove from archive log manually
vim garden/archive.log

# Or delete entire archive
rm garden/archive.log
```

### No "Soft Delete"

Items are permanently removed from the database. The archive log is the only record.

---

## 5. Logging

### What Gets Logged

**Debug level (LOG_LEVEL=debug):**
- Task/note titles on creation
- Page titles on edit/delete
- LLM prompts (with `LOG_LLM_VERBOSE=true`)
- API request metadata

**Info level:**
- Service initialization
- File sync counts
- Client connections

### Log File Location

Default: `./logs/bartleby.log`

**Risk:** Logs may contain sensitive titles/content at debug level.

**Mitigations:**
```env
# Production: Use info level
LOG_LEVEL=info

# Never in production
LOG_LLM_VERBOSE=false
```

**Secure logs:**
```bash
chmod 600 logs/bartleby.log
```

---

## 6. Sensitive Data in Configuration

### `.env` File Contains:

- `BARTLEBY_API_TOKEN` - API authentication
- `SIGNAL_NUMBER` - Your phone number
- `SIGNAL_RECIPIENT` - Recipient phone number
- `OPENWEATHERMAP_API_KEY` - Weather API key

**Mitigations:**
```bash
# Restrict permissions
chmod 600 .env

# Don't commit to git
echo ".env" >> .gitignore
```

---

## 7. Backup Considerations

### What to Protect

| Data | Sensitivity | Backup Priority |
|------|-------------|-----------------|
| `garden/` | High | Critical |
| `database/` | High | Important |
| `.env` | High | Critical |
| `shed/` | Medium | Important |
| `logs/` | Low-Medium | Optional |

### Backup Recommendations

1. **Encrypt backups:**
   ```bash
   tar -cz garden database .env | gpg -c > bartleby-backup.tar.gz.gpg
   ```

2. **Secure transfer:**
   ```bash
   rsync -avz -e "ssh -i key" garden/ user@backup:~/bartleby/
   ```

3. **Don't backup to unencrypted cloud storage** without encryption.

---

## 8. Recommendations Summary

### Immediate Actions

1. **Verify DASHBOARD_HOST:**
   ```bash
   grep DASHBOARD_HOST .env
   # Should be localhost or Tailscale IP, NOT 0.0.0.0
   ```

2. **Set file permissions:**
   ```bash
   chmod 600 .env
   chmod 700 garden database shed logs
   ```

3. **Enable disk encryption** if not already (FileVault/LUKS)

4. **Review LOG_LEVEL:**
   ```bash
   grep LOG_LEVEL .env
   # Use 'info' in production, not 'debug'
   ```

### Future Enhancements (TODO)

- [ ] Add authentication to all dashboard endpoints
- [ ] Encrypt SQLite databases at rest
- [ ] Add audit logging for data access
- [ ] Implement data export with encryption
- [ ] Add "purge" command to fully delete (including archive)
- [ ] Rate limiting on API endpoints
- [ ] Session management for dashboard

---

## 9. Threat Model

### In Scope

| Threat | Mitigation |
|--------|------------|
| Network snooping | Use HTTPS/VPN, bind to localhost |
| Unauthorized dashboard access | Restrict DASHBOARD_HOST, use Tailscale |
| Data theft via filesystem | Full-disk encryption, permissions |
| Accidental data exposure in logs | Set LOG_LEVEL=info |
| Cloud LLM data leakage | Use local models only |

### Out of Scope

| Threat | Why |
|--------|-----|
| Malware on server | Assumes trusted environment |
| Physical theft | Assumes physical security |
| State-level adversary | Use specialized tools |
| Supply chain attacks | Standard npm/pnpm risks |

---

## 10. Checklist

Run through this checklist for your deployment:

- [ ] `DASHBOARD_HOST` is `localhost` or Tailscale IP
- [ ] `BARTLEBY_API_TOKEN` is set for remote access
- [ ] `.env` has permissions `600`
- [ ] Data directories have permissions `700`
- [ ] Full-disk encryption is enabled
- [ ] `LOG_LEVEL` is `info` (not `debug`)
- [ ] `LOG_LLM_VERBOSE` is `false`
- [ ] LLM URLs point to local endpoints
- [ ] Backups are encrypted
- [ ] `archive.log` is reviewed periodically

---

*Last updated: January 2026*
