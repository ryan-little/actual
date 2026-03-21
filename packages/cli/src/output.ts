import Table from 'cli-table3';

export type OutputFormat = 'json' | 'table' | 'csv';

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatOutput(
  data: unknown,
  format: OutputFormat = 'json',
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'table':
      return formatTable(data);
    case 'csv':
      return formatCsv(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}

function formatTable(data: unknown): string {
  if (!Array.isArray(data)) {
    if (data && typeof data === 'object') {
      const table = new Table();
      for (const [key, value] of Object.entries(data)) {
        table.push({ [key]: flattenValue(value) });
      }
      return table.toString();
    }
    return String(data);
  }

  if (data.length === 0) {
    return '(no results)';
  }

  const keys = Object.keys(data[0] as Record<string, unknown>);
  const table = new Table({ head: keys });

  for (const row of data) {
    const r = row as Record<string, unknown>;
    table.push(keys.map(k => flattenValue(r[k])));
  }

  return table.toString();
}

function formatCsv(data: unknown): string {
  if (!Array.isArray(data)) {
    if (data && typeof data === 'object') {
      const entries = Object.entries(data);
      const header = entries.map(([k]) => escapeCsv(k)).join(',');
      const values = entries
        .map(([, v]) => escapeCsv(flattenValue(v)))
        .join(',');
      return header + '\n' + values;
    }
    return String(data);
  }

  if (data.length === 0) {
    return '';
  }

  const keys = Object.keys(data[0] as Record<string, unknown>);
  const header = keys.map(k => escapeCsv(k)).join(',');
  const rows = data.map(row => {
    const r = row as Record<string, unknown>;
    return keys.map(k => escapeCsv(flattenValue(r[k]))).join(',');
  });

  return [header, ...rows].join('\n');
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function printOutput(data: unknown, format: OutputFormat = 'json') {
  process.stdout.write(formatOutput(data, format) + '\n');
}
