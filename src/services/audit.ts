// src/services/audit.ts
// Audit logging for security monitoring and compliance

import fs from 'fs';
import path from 'path';
import { Config, resolvePath } from '../config.js';

export interface AuditEvent {
  timestamp: string;
  ip: string;
  user?: string;
  action: string;  // e.g., 'auth_success', 'auth_failed', 'api_access', 'data_modified'
  resource: string; // e.g., '/api/inbox', '/api/page/123'
  result: 'success' | 'denied';
  details?: string; // Additional context
  method?: string;  // HTTP method
}

export class AuditService {
  private logPath: string;

  constructor(config: Config) {
    const dbPath = resolvePath(config, 'database');
    this.logPath = path.join(dbPath, 'audit.log');
  }

  initialize(): void {
    // Ensure audit log exists with restricted permissions
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '', 'utf-8');
      try {
        fs.chmodSync(this.logPath, 0o600); // Owner read/write only
      } catch (err) {
        // Windows doesn't support chmod, ignore errors
      }
    }
  }

  /**
   * Log an audit event
   */
  log(event: AuditEvent): void {
    const line = JSON.stringify(event) + '\n';
    try {
      fs.appendFileSync(this.logPath, line, 'utf-8');
    } catch (err) {
      console.error('[AUDIT] Failed to write audit log:', err);
    }
  }

  /**
   * Query audit events with filters
   */
  query(filters: {
    since?: Date;
    until?: Date;
    action?: string;
    result?: 'success' | 'denied';
    ip?: string;
    limit?: number;
  } = {}): AuditEvent[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    try {
      const lines = fs.readFileSync(this.logPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim());

      let events = lines.map(line => {
        try {
          return JSON.parse(line) as AuditEvent;
        } catch {
          return null;
        }
      }).filter(e => e !== null) as AuditEvent[];

      // Apply filters
      if (filters.since) {
        events = events.filter(e => new Date(e.timestamp) >= filters.since!);
      }
      if (filters.until) {
        events = events.filter(e => new Date(e.timestamp) <= filters.until!);
      }
      if (filters.action) {
        events = events.filter(e => e.action === filters.action);
      }
      if (filters.result) {
        events = events.filter(e => e.result === filters.result);
      }
      if (filters.ip) {
        events = events.filter(e => e.ip === filters.ip);
      }

      // Sort by timestamp desc (newest first)
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      if (filters.limit) {
        events = events.slice(0, filters.limit);
      }

      return events;
    } catch (err) {
      console.error('[AUDIT] Failed to read audit log:', err);
      return [];
    }
  }

  /**
   * Get failed authentication attempts within a time window
   */
  getFailedAuthAttempts(since: Date): AuditEvent[] {
    return this.query({
      since,
      action: 'auth_failed',
      result: 'denied',
    });
  }

  /**
   * Get successful API access events
   */
  getSuccessfulAccess(since: Date, limit?: number): AuditEvent[] {
    return this.query({
      since,
      result: 'success',
      limit,
    });
  }

  /**
   * Get suspicious activity summary
   */
  getSuspiciousActivity(since: Date): {
    failedAuthsByIp: Record<string, number>;
    totalFailedAuths: number;
    uniqueIps: Set<string>;
  } {
    const failed = this.getFailedAuthAttempts(since);
    const failedAuthsByIp: Record<string, number> = {};
    const uniqueIps = new Set<string>();

    for (const event of failed) {
      failedAuthsByIp[event.ip] = (failedAuthsByIp[event.ip] || 0) + 1;
      uniqueIps.add(event.ip);
    }

    return {
      failedAuthsByIp,
      totalFailedAuths: failed.length,
      uniqueIps,
    };
  }

  /**
   * Check if there's a potential brute force attack from an IP
   * Returns true if more than threshold failed attempts in the time window
   */
  isPotentialBruteForce(ip: string, windowMinutes: number = 15, threshold: number = 5): boolean {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const failed = this.query({
      since,
      action: 'auth_failed',
      ip,
    });
    return failed.length >= threshold;
  }

  /**
   * Get activity for a specific resource (e.g., a garden record)
   * Useful for displaying recent activity on project pages
   */
  getActivity(options: {
    resource?: string;
    action?: string;
    since?: Date;
    limit?: number;
  } = {}): AuditEvent[] {
    // Query with base filters
    const events = this.query({
      since: options.since,
      action: options.action,
      limit: options.limit,
    });

    // Filter by resource if provided
    if (options.resource) {
      return events.filter(e => e.resource.includes(options.resource!));
    }

    return events;
  }
}
