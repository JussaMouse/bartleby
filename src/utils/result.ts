/**
 * Result Type for User-Facing Tools
 *
 * Provides structured error handling for tools that interact directly with users.
 * Services can continue using throw/catch internally, but tools should return Result
 * for better error messages and structured responses.
 *
 * Usage:
 *   return Ok(value);           // Success
 *   return Err(new Error());    // Failure
 *
 * Checking results:
 *   if (result.ok) {
 *     console.log(result.value);
 *   } else {
 *     console.error(result.error);
 *   }
 */

/**
 * Result type representing either success (Ok) or failure (Err)
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a successful Result
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failed Result
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Check if a Result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Check if a Result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

/**
 * Unwrap a Result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a Result, returning a default value if it's an error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map a Result's success value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return Ok(fn(result.value));
  }
  return result;
}

/**
 * Map a Result's error value
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {
    return result;
  }
  return Err(fn(result.error));
}

/**
 * Chain Results (flatMap)
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Convert a throwing function to a Result-returning function
 */
export function tryCatch<T, E = Error>(
  fn: () => T,
  errorHandler?: (error: unknown) => E
): Result<T, E> {
  try {
    return Ok(fn());
  } catch (error) {
    const handledError = errorHandler ? errorHandler(error) : (error as E);
    return Err(handledError);
  }
}

/**
 * Convert an async throwing function to a Result-returning function
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  errorHandler?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (error) {
    const handledError = errorHandler ? errorHandler(error) : (error as E);
    return Err(handledError);
  }
}
