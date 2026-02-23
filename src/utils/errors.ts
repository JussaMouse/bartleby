/**
 * Bartleby Error Classes
 *
 * Structured error types for user-facing operations. These provide consistent
 * error codes and details that can be formatted into helpful error messages.
 *
 * Usage:
 *   throw new ValidationError('Invalid input', { field: 'email' });
 *   throw new NotFoundError('Record not found', { id: '123' });
 *   throw new DuplicateError('File already imported', { hash: 'abc...' });
 */

/**
 * Base error class for all Bartleby errors
 */
export class BartlebyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a formatted string for user display
   */
  toUserString(): string {
    let output = `${this.message}`;

    if (this.details && Object.keys(this.details).length > 0) {
      output += '\n\nDetails:\n';
      for (const [key, value] of Object.entries(this.details)) {
        output += `  ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return output;
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      name: this.name,
    };
  }
}

/**
 * Validation error - invalid input from user
 */
export class ValidationError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

/**
 * Not found error - requested resource doesn't exist
 */
export class NotFoundError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
  }
}

/**
 * Duplicate error - resource already exists
 */
export class DuplicateError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DUPLICATE', details);
  }
}

/**
 * Import error - failed to import file or content
 */
export class ImportError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'IMPORT_ERROR', details);
  }
}

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details);
  }
}

/**
 * File system error - file operations failed
 */
export class FileSystemError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'FILESYSTEM_ERROR', details);
  }
}

/**
 * Database error - database operations failed
 */
export class DatabaseError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', details);
  }
}

/**
 * Permission error - user lacks permission for operation
 */
export class PermissionError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PERMISSION_ERROR', details);
  }
}

/**
 * Network error - network request failed
 */
export class NetworkError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', details);
  }
}

/**
 * Service error - internal service failure
 */
export class ServiceError extends BartlebyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SERVICE_ERROR', details);
  }
}

/**
 * Check if an error is a BartlebyError
 */
export function isBartlebyError(error: unknown): error is BartlebyError {
  return error instanceof BartlebyError;
}

/**
 * Convert any error to a BartlebyError
 */
export function toBartlebyError(error: unknown): BartlebyError {
  if (isBartlebyError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ServiceError(error.message, { originalError: error.name });
  }

  return new ServiceError(String(error));
}

/**
 * Format an error for user display
 */
export function formatError(error: unknown): string {
  if (isBartlebyError(error)) {
    return error.toUserString();
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Unknown error: ${String(error)}`;
}
