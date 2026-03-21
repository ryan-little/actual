import * as api from '@actual-app/api';
import type { Command } from 'commander';

import { withConnection } from '../connection';
import { readJsonInput } from '../input';
import { printOutput } from '../output';
import { CliError, parseIntFlag } from '../utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse order-by strings like "date:desc,amount:asc,id" into
 * AQL orderBy format: [{ date: 'desc' }, { amount: 'asc' }, 'id']
 */
export function parseOrderBy(
  input: string,
): Array<string | Record<string, string>> {
  return input.split(',').map(part => {
    const trimmed = part.trim();
    if (!trimmed) {
      throw new Error('--order-by contains an empty field');
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      return trimmed;
    }
    const field = trimmed.slice(0, colonIndex).trim();
    if (!field) {
      throw new Error(
        `Invalid order field in "${trimmed}". Field name cannot be empty.`,
      );
    }
    const direction = trimmed.slice(colonIndex + 1);
    if (direction !== 'asc' && direction !== 'desc') {
      throw new Error(
        `Invalid order direction "${direction}" for field "${field}". Expected "asc" or "desc".`,
      );
    }
    return { [field]: direction };
  });
}

// TODO: Import schema from API once it exposes table/field metadata
type FieldInfo = { type: string; ref?: string; description?: string };

const TABLE_SCHEMA: Record<string, Record<string, FieldInfo>> = {
  transactions: {
    id: { type: 'id', description: 'Unique transaction identifier' },
    account: { type: 'id', ref: 'accounts', description: 'Account ID' },
    date: { type: 'date', description: 'Transaction date (YYYY-MM-DD)' },
    amount: {
      type: 'integer',
      description:
        'Amount in cents (e.g. 1000 = $10.00). Negative = expense, positive = income',
    },
    payee: { type: 'id', ref: 'payees', description: 'Payee ID' },
    category: { type: 'id', ref: 'categories', description: 'Category ID' },
    notes: { type: 'string', description: 'Transaction notes/memo' },
    imported_id: {
      type: 'string',
      description: 'External ID from bank import',
    },
    transfer_id: {
      type: 'id',
      description:
        'Linked transaction ID for transfers. Non-null means this is a transfer between own accounts',
    },
    cleared: { type: 'boolean', description: 'Whether transaction is cleared' },
    reconciled: {
      type: 'boolean',
      description: 'Whether transaction is reconciled',
    },
    starting_balance_flag: {
      type: 'boolean',
      description: 'True for the starting balance transaction',
    },
    imported_payee: {
      type: 'string',
      description: 'Original payee name from bank import',
    },
    is_parent: {
      type: 'boolean',
      description: 'True if this is a split parent transaction',
    },
    is_child: {
      type: 'boolean',
      description: 'True if this is a split child transaction',
    },
    parent_id: {
      type: 'id',
      description: 'Parent transaction ID for split children',
    },
    sort_order: { type: 'float', description: 'Sort order within a day' },
    schedule: {
      type: 'id',
      ref: 'schedules',
      description: 'Linked schedule ID',
    },
    'account.name': {
      type: 'string',
      ref: 'accounts',
      description: 'Resolved account name',
    },
    'payee.name': {
      type: 'string',
      ref: 'payees',
      description: 'Resolved payee name',
    },
    'category.name': {
      type: 'string',
      ref: 'categories',
      description: 'Resolved category name',
    },
    'category.group.name': {
      type: 'string',
      ref: 'category_groups',
      description: 'Resolved category group name',
    },
  },
  accounts: {
    id: { type: 'id', description: 'Unique account identifier' },
    name: { type: 'string', description: 'Account name' },
    offbudget: {
      type: 'boolean',
      description: 'True if account is off-budget (tracking)',
    },
    closed: { type: 'boolean', description: 'True if account is closed' },
    sort_order: { type: 'float', description: 'Display sort order' },
  },
  categories: {
    id: { type: 'id', description: 'Unique category identifier' },
    name: { type: 'string', description: 'Category name' },
    is_income: { type: 'boolean', description: 'True for income categories' },
    group_id: {
      type: 'id',
      ref: 'category_groups',
      description: 'Category group ID',
    },
    sort_order: { type: 'float', description: 'Display sort order' },
    hidden: { type: 'boolean', description: 'True if category is hidden' },
    'group.name': {
      type: 'string',
      ref: 'category_groups',
      description: 'Resolved category group name',
    },
  },
  payees: {
    id: { type: 'id', description: 'Unique payee identifier' },
    name: { type: 'string', description: 'Payee name' },
    transfer_acct: {
      type: 'id',
      ref: 'accounts',
      description:
        'Linked account ID for transfer payees. Non-null means this payee represents a transfer to/from this account',
    },
  },
  rules: {
    id: { type: 'id', description: 'Unique rule identifier' },
    stage: { type: 'string', description: 'Rule stage (pre, post, null)' },
    conditions_op: {
      type: 'string',
      description: 'How conditions combine: "and" or "or"',
    },
    conditions: { type: 'json', description: 'Rule conditions as JSON array' },
    actions: { type: 'json', description: 'Rule actions as JSON array' },
  },
  schedules: {
    id: { type: 'id', description: 'Unique schedule identifier' },
    name: { type: 'string', description: 'Schedule name' },
    rule: {
      type: 'id',
      ref: 'rules',
      description: 'Associated rule ID',
    },
    next_date: {
      type: 'date',
      description: 'Next occurrence date (YYYY-MM-DD)',
    },
    completed: {
      type: 'boolean',
      description: 'True if schedule is completed',
    },
  },
};

const FIELD_ALIASES: Record<string, Record<string, string>> = {
  transactions: {
    payee: 'payee.name',
    category: 'category.name',
    account: 'account.name',
    group: 'category.group.name',
  },
  categories: {
    group: 'group.name',
  },
};

export function expandSelectAliases(table: string, fields: string[]): string[] {
  const aliases = FIELD_ALIASES[table];
  if (!aliases) return fields;
  return fields.map(f => aliases[f.trim()] ?? f);
}

const AVAILABLE_TABLES = Object.keys(TABLE_SCHEMA).join(', ');

const LAST_DEFAULT_SELECT = [
  'date',
  'account.name',
  'payee.name',
  'category.name',
  'amount',
  'notes',
];

function buildQueryFromFile(
  parsed: Record<string, unknown>,
  fallbackTable: string | undefined,
) {
  const table = typeof parsed.table === 'string' ? parsed.table : fallbackTable;
  if (!table) {
    throw new Error(
      '--table is required when the input file lacks a "table" field',
    );
  }
  let queryObj = api.q(table);
  if (Array.isArray(parsed.select)) queryObj = queryObj.select(parsed.select);
  if (isRecord(parsed.filter)) queryObj = queryObj.filter(parsed.filter);
  if (Array.isArray(parsed.orderBy)) {
    queryObj = queryObj.orderBy(parsed.orderBy);
  }
  if (typeof parsed.limit === 'number') queryObj = queryObj.limit(parsed.limit);
  if (typeof parsed.offset === 'number') {
    queryObj = queryObj.offset(parsed.offset);
  }
  if (Array.isArray(parsed.groupBy)) {
    queryObj = queryObj.groupBy(parsed.groupBy);
  }
  return queryObj;
}

function buildQueryFromFlags(cmdOpts: Record<string, string | undefined>) {
  const last = cmdOpts.last ? parseIntFlag(cmdOpts.last, '--last') : undefined;

  if (last !== undefined) {
    if (cmdOpts.table && cmdOpts.table !== 'transactions') {
      throw new Error(
        '--last implies --table transactions. Cannot use with --table ' +
          cmdOpts.table,
      );
    }
    if (cmdOpts.limit) {
      throw new Error('--last and --limit are mutually exclusive');
    }
  }

  const table =
    cmdOpts.table ?? (last !== undefined ? 'transactions' : undefined);
  if (!table) {
    throw new CliError(
      '--table is required (or use --file or --last)',
      'Run "actual query tables" to see available tables, or use --last <n> for recent transactions.',
    );
  }

  if (!(table in TABLE_SCHEMA)) {
    throw new Error(
      `Unknown table "${table}". Available tables: ${AVAILABLE_TABLES}`,
    );
  }

  if (cmdOpts.where && cmdOpts.filter) {
    throw new Error('--where and --filter are mutually exclusive');
  }

  if (cmdOpts.count && cmdOpts.select) {
    throw new Error('--count and --select are mutually exclusive');
  }

  if (cmdOpts.excludeTransfers && table !== 'transactions') {
    throw new Error(
      '--exclude-transfers can only be used with --table transactions',
    );
  }

  let queryObj = api.q(table);

  if (cmdOpts.count) {
    queryObj = queryObj.calculate({ $count: '*' });
  } else if (cmdOpts.select) {
    queryObj = queryObj.select(
      expandSelectAliases(table, cmdOpts.select.split(',')),
    );
  } else if (last !== undefined) {
    queryObj = queryObj.select(LAST_DEFAULT_SELECT);
  }

  const filterStr = cmdOpts.filter ?? cmdOpts.where;
  if (filterStr) {
    try {
      queryObj = queryObj.filter(JSON.parse(filterStr));
    } catch {
      throw new CliError(
        'Invalid JSON in --filter.',
        `Ensure valid JSON. Example: --filter '{"amount":{"$lt":0}}'`,
      );
    }
  }

  if (cmdOpts.excludeTransfers) {
    queryObj = queryObj.filter({ transfer_id: { $eq: null } });
  }

  const orderByStr =
    cmdOpts.orderBy ??
    (last !== undefined && !cmdOpts.count ? 'date:desc' : undefined);
  if (orderByStr) {
    queryObj = queryObj.orderBy(parseOrderBy(orderByStr));
  }

  const limitVal =
    last ??
    (cmdOpts.limit ? parseIntFlag(cmdOpts.limit, '--limit') : undefined);
  if (limitVal !== undefined) {
    queryObj = queryObj.limit(limitVal);
  }

  if (cmdOpts.offset) {
    queryObj = queryObj.offset(parseIntFlag(cmdOpts.offset, '--offset'));
  }

  if (cmdOpts.groupBy) {
    queryObj = queryObj.groupBy(cmdOpts.groupBy.split(','));
  }

  return queryObj;
}

const RUN_EXAMPLES = `
Examples:
  # Show last 5 transactions (shortcut)
  actual query run --last 5

  # Transactions ordered by date descending
  actual query run --table transactions --select "date,amount,payee.name" --order-by "date:desc" --limit 10

  # Filter with JSON (negative amounts = expenses)
  actual query run --table transactions --filter '{"amount":{"$lt":0}}' --limit 5

  # Count transactions
  actual query run --table transactions --count

  # Group by category (use --file for aggregate expressions)
  echo '{"table":"transactions","groupBy":["category.name"],"select":["category.name",{"amount":{"$sum":"$amount"}}]}' | actual query run --file -

  # Pagination
  actual query run --table transactions --order-by "date:desc" --limit 10 --offset 20

  # Use --where (alias for --filter)
  actual query run --table transactions --where '{"payee.name":"Grocery Store"}' --limit 5

  # Read query from a JSON file
  actual query run --file query.json

  # Pipe query from stdin
  echo '{"table":"transactions","limit":5}' | actual query run --file -

  # Exclude transfers from results
  actual query run --table transactions --exclude-transfers --last 10

  # Use shorthand aliases (payee = payee.name, category = category.name)
  actual query run --table transactions --select "date,payee,category,amount" --last 10

Available tables: ${AVAILABLE_TABLES}
Use "actual query tables" and "actual query fields <table>" for schema info.
Use "actual query describe" for full schema with all tables, fields, and descriptions.

Common filter operators: $eq, $ne, $lt, $lte, $gt, $gte, $like, $and, $or
See ActualQL docs for full reference: https://actualbudget.org/docs/api/actual-ql/`;

export function registerQueryCommand(program: Command) {
  const query = program
    .command('query')
    .description('Run AQL (Actual Query Language) queries');

  query
    .command('run')
    .description('Execute an AQL query')
    .option(
      '--table <table>',
      'Table to query (use "actual query tables" to list available tables)',
    )
    .option('--select <fields>', 'Comma-separated fields to select')
    .option('--filter <json>', 'Filter as JSON (e.g. \'{"amount":{"$lt":0}}\')')
    .option(
      '--where <json>',
      'Alias for --filter (cannot be used together with --filter)',
    )
    .option(
      '--order-by <fields>',
      'Fields with optional direction: field1:desc,field2 (default: asc)',
    )
    .option('--limit <n>', 'Limit number of results')
    .option('--offset <n>', 'Skip first N results (for pagination)')
    .option(
      '--last <n>',
      'Show last N transactions (implies --table transactions, --order-by date:desc)',
    )
    .option('--count', 'Count matching rows instead of returning them')
    .option(
      '--group-by <fields>',
      'Comma-separated fields to group by (use with aggregate selects)',
    )
    .option(
      '--file <path>',
      'Read full query object from JSON file (use - for stdin)',
    )
    .option(
      '--exclude-transfers',
      'Exclude transfer transactions (only for --table transactions)',
      false,
    )
    .addHelpText('after', RUN_EXAMPLES)
    .action(async cmdOpts => {
      const opts = program.opts();
      await withConnection(opts, async () => {
        const parsed = cmdOpts.file ? readJsonInput(cmdOpts) : undefined;
        if (parsed !== undefined && !isRecord(parsed)) {
          throw new Error('Query file must contain a JSON object');
        }
        const queryObj = parsed
          ? buildQueryFromFile(parsed, cmdOpts.table)
          : buildQueryFromFlags(cmdOpts);

        const result = await api.aqlQuery(queryObj);

        if (cmdOpts.count) {
          printOutput({ count: result.data }, opts.format);
        } else {
          printOutput(result, opts.format);
        }
      });
    });

  query
    .command('tables')
    .description('List available tables for querying')
    .action(() => {
      const opts = program.opts();
      const tables = Object.keys(TABLE_SCHEMA).map(name => ({ name }));
      printOutput(tables, opts.format);
    });

  query
    .command('fields <table>')
    .description('List fields for a given table')
    .action((table: string) => {
      const opts = program.opts();
      const schema = TABLE_SCHEMA[table];
      if (!schema) {
        throw new Error(
          `Unknown table "${table}". Available tables: ${Object.keys(TABLE_SCHEMA).join(', ')}`,
        );
      }
      const fields = Object.entries(schema).map(([name, info]) => ({
        name,
        type: info.type,
        ...(info.ref ? { ref: info.ref } : {}),
        ...(info.description ? { description: info.description } : {}),
      }));
      printOutput(fields, opts.format);
    });

  query
    .command('describe')
    .description(
      'Output full schema for all tables (fields, types, relationships, descriptions)',
    )
    .action(() => {
      const opts = program.opts();
      const schema: Record<string, unknown[]> = {};
      for (const [table, fields] of Object.entries(TABLE_SCHEMA)) {
        schema[table] = Object.entries(fields).map(([name, info]) => ({
          name,
          type: info.type,
          ...(info.ref ? { ref: info.ref } : {}),
          ...(info.description ? { description: info.description } : {}),
        }));
      }
      printOutput(schema, opts.format);
    });
}
