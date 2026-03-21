import * as fs from 'fs/promises';
import * as path from 'path';

import { afterEach, beforeEach, vi } from 'vitest';

import * as api from '../index';

// In tests we run from source; loot-core's API fs uses __dirname (for the built dist/).
// Mock the fs so path constants point at loot-core package root where migrations live.
vi.mock(
  '../../loot-core/src/platform/server/fs/index.api',
  async importOriginal => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    const pathMod = await import('path');
    const lootCoreRoot = pathMod.join(__dirname, '..', '..', 'loot-core');
    return {
      ...actual,
      migrationsPath: pathMod.join(lootCoreRoot, 'migrations'),
      bundledDatabasePath: pathMod.join(lootCoreRoot, 'default-db.sqlite'),
      demoBudgetPath: pathMod.join(lootCoreRoot, 'demo-budget'),
    };
  },
);

const budgetName = 'test-budget';

globalThis.IS_TESTING = true;

async function createTestBudget(templateName: string, name: string) {
  const templatePath = path.join(
    __dirname,
    '/../../loot-core/src/mocks/files',
    templateName,
  );
  const budgetPath = path.join(__dirname, '/../mocks/budgets/', name);

  await fs.mkdir(budgetPath);
  await fs.copyFile(
    path.join(templatePath, 'metadata.json'),
    path.join(budgetPath, 'metadata.json'),
  );
  await fs.copyFile(
    path.join(templatePath, 'db.sqlite'),
    path.join(budgetPath, 'db.sqlite'),
  );
}

beforeEach(async () => {
  const budgetPath = path.join(__dirname, '/../mocks/budgets/', budgetName);
  await fs.rm(budgetPath, { force: true, recursive: true });

  await createTestBudget('default-budget-template', budgetName);
  await api.init({
    dataDir: path.join(__dirname, '/../mocks/budgets/'),
  });
});

afterEach(async () => {
  globalThis.currentMonth = null;
  await api.shutdown();
});

globalThis.__test_api = api;
globalThis.__test_budget_name = budgetName;
