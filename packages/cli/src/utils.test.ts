import {
  CliError,
  defaultDateRange,
  parseBoolFlag,
  parseIntFlag,
} from './utils';

describe('CliError', () => {
  it('stores message and suggestion', () => {
    const err = new CliError('something failed', 'try this instead');
    expect(err.message).toBe('something failed');
    expect(err.suggestion).toBe('try this instead');
    expect(err).toBeInstanceOf(Error);
  });

  it('works without suggestion', () => {
    const err = new CliError('something failed');
    expect(err.message).toBe('something failed');
    expect(err.suggestion).toBeUndefined();
  });
});

describe('defaultDateRange', () => {
  it('returns both dates when both provided', () => {
    expect(defaultDateRange('2025-01-01', '2025-01-31')).toEqual({
      start: '2025-01-01',
      end: '2025-01-31',
    });
  });

  it('defaults start to 30 days before end', () => {
    expect(defaultDateRange(undefined, '2025-02-28')).toEqual({
      start: '2025-01-29',
      end: '2025-02-28',
    });
  });

  it('defaults end to today when only start provided', () => {
    const result = defaultDateRange('2025-01-01');
    expect(result.start).toBe('2025-01-01');
    expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults both to last 30 days when neither provided', () => {
    const result = defaultDateRange();
    expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const startDate = new Date(result.start);
    const endDate = new Date(result.end);
    const diffDays = (endDate.getTime() - startDate.getTime()) / 86400000;
    expect(diffDays).toBe(30);
  });
});

describe('parseBoolFlag', () => {
  it('parses "true"', () => {
    expect(parseBoolFlag('true', '--flag')).toBe(true);
  });

  it('parses "false"', () => {
    expect(parseBoolFlag('false', '--flag')).toBe(false);
  });

  it('rejects other strings', () => {
    expect(() => parseBoolFlag('yes', '--flag')).toThrow(
      'Invalid --flag: "yes". Expected "true" or "false".',
    );
  });

  it('includes the flag name in the error message', () => {
    expect(() => parseBoolFlag('1', '--offbudget')).toThrow(
      'Invalid --offbudget',
    );
  });
});

describe('parseIntFlag', () => {
  it('parses a valid integer string', () => {
    expect(parseIntFlag('42', '--balance')).toBe(42);
  });

  it('parses zero', () => {
    expect(parseIntFlag('0', '--balance')).toBe(0);
  });

  it('parses negative integers', () => {
    expect(parseIntFlag('-10', '--balance')).toBe(-10);
  });

  it('rejects decimal values', () => {
    expect(() => parseIntFlag('3.5', '--balance')).toThrow(
      'Invalid --balance: "3.5". Expected an integer.',
    );
  });

  it('rejects non-numeric strings', () => {
    expect(() => parseIntFlag('abc', '--balance')).toThrow(
      'Invalid --balance: "abc". Expected an integer.',
    );
  });

  it('rejects partially numeric strings', () => {
    expect(() => parseIntFlag('3abc', '--balance')).toThrow(
      'Invalid --balance: "3abc". Expected an integer.',
    );
  });

  it('rejects empty string', () => {
    expect(() => parseIntFlag('', '--balance')).toThrow(
      'Invalid --balance: "". Expected an integer.',
    );
  });

  it('includes the flag name in the error message', () => {
    expect(() => parseIntFlag('x', '--amount')).toThrow('Invalid --amount');
  });
});
