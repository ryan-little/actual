export function defaultDateRange(
  start?: string,
  end?: string,
): { start: string; end: string } {
  const endDate = end ?? new Date().toLocaleDateString('en-CA');
  if (start) return { start, end: endDate };
  const d = new Date(endDate + 'T00:00:00');
  d.setDate(d.getDate() - 30);
  return { start: d.toLocaleDateString('en-CA'), end: endDate };
}

export class CliError extends Error {
  suggestion?: string;
  constructor(message: string, suggestion?: string) {
    super(message);
    this.suggestion = suggestion;
  }
}

export function parseBoolFlag(value: string, flagName: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new Error(
      `Invalid ${flagName}: "${value}". Expected "true" or "false".`,
    );
  }
  return value === 'true';
}

export function parseIntFlag(value: string, flagName: string): number {
  const parsed = value.trim() === '' ? NaN : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${flagName}: "${value}". Expected an integer.`);
  }
  return parsed;
}
