/**
 * Logs an error with context to console.error.
 * Use this in catch blocks instead of silently swallowing errors.
 */
export function logError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorDetails =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: error };

  console.error(`[ERROR] ${message}`, {
    ...errorDetails,
    ...(context ? { context } : {}),
    timestamp: new Date().toISOString(),
  });
}
