# Actual Budget API/CLI Usage for Agents

Quick reference for querying Ryan's local Actual Budget data via the CLI tool or Node.js API.

## CLI Tool (Preferred for Quick Queries)

The `@actual-app/cli` package (experimental) is the simplest way to query data from the terminal. It connects to Ryan's local Electron sync server.

### Setup

```bash
# Build (from repo root, one-time)
yarn build:cli

# Set connection env vars (or use .actualrc.json)
export ACTUAL_SERVER_URL=http://localhost:5007
export ACTUAL_SESSION_TOKEN=<token-from-global-store.json>
export ACTUAL_SYNC_ID=<groupId-from-getBudgets>

# Run from monorepo
node packages/cli/dist/cli.js <command>
```

- **Server port**: 5007 (Electron embedded sync server — same as the API)
- **Session token**: `~/Library/Application Support/Actual/global-store.json` → `user-token`
- **Sync ID**: run `node packages/cli/dist/cli.js budgets list` to find it (the `groupId` field)
- **Data dir**: defaults to `~/.actual-cli/data` (auto-created)

### Common Commands

```bash
CLI="node packages/cli/dist/cli.js"

# List accounts with balances
$CLI accounts list --format table

# Get a specific account balance
$CLI accounts balance <id> [--cutoff 2026-03-01]

# List transactions
$CLI transactions list --account <id> --start 2026-01-01 --end 2026-04-09

# Last N transactions (shortcut)
$CLI query run --last 20 --format table

# Query with filters (AQL)
$CLI query run --table transactions \
  --select "date,amount,payee.name,category.name" \
  --filter '{"amount":{"$lt":0}}' \
  --order-by "date:desc" --limit 10

# Aggregates via stdin
echo '{"table":"transactions","groupBy":["category.name"],"select":["category.name",{"amount":{"$sum":"$amount"}}]}' \
  | $CLI query run --file -

# Look up entity ID by name
$CLI server get-id --type accounts --name "Checking"

# Trigger bank sync
$CLI server bank-sync

# Export to CSV
$CLI transactions list --account <id> --start 2026-01-01 --end 2026-12-31 --format csv > txns.csv
```

### Output Formats

`--format json` (default), `table`, or `csv`. Amount fields are auto-formatted to dollars in `table`/`csv` output; JSON always returns integer cents.

### Available Query Tables

`transactions`, `accounts`, `categories`, `payees`, `rules`, `schedules`

Use `$CLI query tables` to list them, `$CLI query fields <table>` for field names/types.

---

## Node.js API (For Scripts & Complex Logic)

Use the API when you need programmatic control (loops, conditionals, multi-step operations). The CLI is simpler for one-off queries.

### Connection Setup

```javascript
const api = require('./packages/api');

await api.init({
  serverURL: 'http://localhost:5007',
  sessionToken: '<token-from-global-store.json>',
  dataDir: '/tmp/actual-api-temp'
});
```

- **Server port**: 5007 (Electron embedded sync server)
- **Session token**: found in `~/Library/Application Support/Actual/global-store.json` → `user-token` field
- **Data dir**: use a temp directory like `/tmp/actual-api-temp` (budget gets downloaded here)
- The temp dir must exist before calling `init()` — create it with `mkdir -p` first

### Loading a Budget

```javascript
// First time: download from server (uses sync/group ID, not file ID)
await api.downloadBudget('<groupId>');

// Load budget (uses the directory name, not the UUID)
await api.loadBudget('My-Finances-2ddd014');

// Find budget IDs
const budgets = await api.getBudgets();
// cloudFileId = file ID, groupId = sync ID
// The local directory name is in global-store.json → lastBudget
```

**Key gotcha**: `downloadBudget()` takes the `groupId` (sync ID). `loadBudget()` takes the local directory name (e.g., `My-Finances-2ddd014`), NOT a UUID. After downloading once, subsequent runs only need `loadBudget()`.

### Querying Accounts & Balances

```javascript
const accounts = await api.getAccounts();
// Returns: [{ id, name, offbudget, closed, type, sort_order }, ...]

const balance = await api.getAccountBalance(accountId);
// Returns: number in cents (divide by 100 for dollars)
// Credit cards are negative (e.g., -202912 = -$2,029.12 owed)

// Balance at a specific date
const bal = await api.getAccountBalance(accountId, new Date('2026-03-01'));
```

### Querying Transactions

```javascript
const txns = await api.getTransactions(
  accountId,
  '2026-03-01',  // startDate (YYYY-MM-DD)
  '2026-04-03'   // endDate (YYYY-MM-DD)
);
// Returns: [{ id, account, date, amount, payee, payee_name,
//             imported_payee, category, notes, cleared, reconciled,
//             imported_id, transfer_id, ... }, ...]
```

- `amount` is in cents; negative = debit/charge, positive = credit/payment
- `cleared` = bank confirmed the transaction
- `imported_payee` = original payee name from bank import
- `payee` = Actual's mapped payee ID (UUID)

### Advanced Queries (AQL)

```javascript
const { q, aqlQuery } = require('./packages/api');

const result = await aqlQuery(
  q('transactions')
    .filter({ account: accountId })
    .select(['id', 'date', 'amount', 'payee', 'notes'])
    .orderBy({ date: 'desc' })
    .limit(20)
);
// result.data = array of matching rows
```

Available tables: `transactions`, `accounts`, `categories`, `category_groups`, `payees`, `schedules`, `rules`

### Cleanup

```javascript
await api.shutdown(); // Always call when done — syncs and closes budget
```

## Useful Paths

| What | Path |
|------|------|
| Global config | `~/Library/Application Support/Actual/global-store.json` |
| Server files | `~/Library/Application Support/Actual/actual-server/server-files/` |
| Account/auth DB | `.../server-files/account.sqlite` |
| SimpleFIN secrets | `account.sqlite` → `secrets` table → `simplefin_token`, `simplefin_accessKey` |
| User budget files | `~/Library/Application Support/Actual/actual-server/user-files/` |

## Ground Truth Financial Data

**Location**: `.local-only/` (gitignored, never commit)

```
.local-only/
├── statements/
│   ├── bofa/        # 11 BofA Alaska Visa PDFs (eStmt_YYYY-MM-DD.pdf), May 2025 - Mar 2026
│   ├── amex/        # 33 Amex Gold PDFs (YYYY-MM-DD.pdf), Jul 2023 - Mar 2026
│   └── sofi/        # 34 SoFi PDFs (UUID.pdf), May 2023 - Feb 2026
│                    #   Pages 1-3: Checking, Page 4+: Savings (vaults)
├── troweprice/  # 8 T. Rowe Price 401K quarterly PDFs, Jan 2024 - Dec 2025
│                #   Portfolio value snapshots (no transaction detail)
├── fidelity/    # 39 Fidelity Brokerage monthly CSVs, Jan 2023 - Mar 2026
│                #   Holdings/value snapshots (no transaction detail)
└── parsed/
    ├── parsed_statements.json      # All Amex + SoFi checking + SoFi savings transactions
    ├── sofi_vaults.json            # SoFi savings split by vault (Cold Savings = HYSA, Roth IRA Vault = Roth IRA)
    ├── sofi_savings_fixed.json     # Full SoFi savings (all vaults combined)
    ├── parse_statements.py         # Amex + SoFi PDF parser (pdfplumber)
    ├── parse_sofi_vaults.py        # SoFi vault-level parser
    └── actual-backfill.js          # BofA Alaska Visa import script
```

**Vault mapping**: "Savings Vault" → "ColdSavings20k05202025 Vault" → "ColdSavings Vault" → "Cold Savings Vault" = SoFi HYSA. Other vaults (Investing, Fun Buys, Season Tickets, etc.) are not tracked in Actual.

### Full Example: List All Account Balances

```javascript
const api = require('./packages/api');

(async () => {
  await api.init({
    serverURL: 'http://localhost:5007',
    sessionToken: '<token>',
    dataDir: '/tmp/actual-api-temp'
  });

  await api.loadBudget('My-Finances-2ddd014');

  const accounts = await api.getAccounts();
  for (const acct of accounts) {
    const bal = await api.getAccountBalance(acct.id);
    console.log(`${acct.name}: $${(bal / 100).toFixed(2)}`);
  }

  await api.shutdown();
})();
```
