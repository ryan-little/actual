import * as api from '@actual-app/api';
import { Command } from 'commander';

import { printOutput } from '../output';

import { registerTransactionsCommand } from './transactions';

vi.mock('@actual-app/api', () => {
  const queryObj = {
    select: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    calculate: vi.fn().mockReturnThis(),
  };
  return {
    q: vi.fn().mockReturnValue(queryObj),
    aqlQuery: vi.fn().mockResolvedValue({ data: [] }),
    addTransactions: vi.fn().mockResolvedValue([]),
    importTransactions: vi.fn().mockResolvedValue({ added: [], updated: [] }),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../connection', () => ({
  withConnection: vi.fn((_opts, fn) => fn()),
}));

vi.mock('../output', () => ({
  printOutput: vi.fn(),
}));

function createProgram(): Command {
  const program = new Command();
  program.option('--format <format>');
  program.option('--server-url <url>');
  program.option('--password <pw>');
  program.option('--session-token <token>');
  program.option('--sync-id <id>');
  program.option('--data-dir <dir>');
  program.option('--verbose');
  program.exitOverride();
  registerTransactionsCommand(program);
  return program;
}

async function run(args: string[]) {
  const program = createProgram();
  await program.parseAsync(['node', 'test', ...args]);
}

function getQueryObj() {
  return vi.mocked(api.q).mock.results[0]?.value;
}

describe('transactions list', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('uses AQL query with resolved field names', async () => {
    await run([
      'transactions',
      'list',
      '--account',
      'acc-1',
      '--start',
      '2025-01-01',
      '--end',
      '2025-01-31',
    ]);

    expect(api.q).toHaveBeenCalledWith('transactions');
    const qObj = getQueryObj();
    expect(qObj.select).toHaveBeenCalledWith([
      '*',
      'account.name',
      'payee.name',
      'category.name',
    ]);
    expect(qObj.filter).toHaveBeenCalledWith({
      account: 'acc-1',
      date: { $gte: '2025-01-01', $lte: '2025-01-31' },
    });
    expect(qObj.orderBy).toHaveBeenCalledWith([{ date: 'desc' }]);
  });

  it('defaults --start to 30 days before --end', async () => {
    await run([
      'transactions',
      'list',
      '--account',
      'acc-1',
      '--end',
      '2025-02-28',
    ]);

    const qObj = getQueryObj();
    expect(qObj.filter).toHaveBeenCalledWith({
      account: 'acc-1',
      date: { $gte: '2025-01-29', $lte: '2025-02-28' },
    });
  });

  it('defaults both --start and --end when omitted', async () => {
    await run(['transactions', 'list', '--account', 'acc-1']);

    const qObj = getQueryObj();
    const filterCall = qObj.filter.mock.calls[0][0];
    expect(filterCall.account).toBe('acc-1');
    expect(filterCall.date.$gte).toBeDefined();
    expect(filterCall.date.$lte).toBeDefined();
  });

  it('excludes transfers when --exclude-transfers is set', async () => {
    await run([
      'transactions',
      'list',
      '--account',
      'acc-1',
      '--start',
      '2025-01-01',
      '--end',
      '2025-01-31',
      '--exclude-transfers',
    ]);

    const qObj = getQueryObj();
    expect(qObj.filter).toHaveBeenCalledWith({
      account: 'acc-1',
      date: { $gte: '2025-01-01', $lte: '2025-01-31' },
      transfer_id: { $eq: null },
    });
  });

  it('outputs result.data from AQL query', async () => {
    const mockData = [{ id: 't1', amount: -500 }];
    vi.mocked(api.aqlQuery).mockResolvedValueOnce({ data: mockData });

    await run([
      'transactions',
      'list',
      '--account',
      'acc-1',
      '--start',
      '2025-01-01',
      '--end',
      '2025-01-31',
    ]);

    expect(printOutput).toHaveBeenCalledWith(mockData, undefined);
  });
});
