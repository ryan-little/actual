import 'fake-indexeddb/auto';
import * as nodeFs from 'fs/promises';
import * as path from 'path';

import { afterEach, beforeAll, vi } from 'vitest';

import type * as BrowserFs from '@actual-app/core/platform/server/fs';

import * as api from '../index.browser';

const budgetName = 'test-budget';
const lootCoreRoot = path.join(__dirname, '..', '..', 'loot-core');

globalThis.IS_TESTING = true;

// Populate the emscripten virtual FS with migration files and default-db.sqlite
// (normally done by populateDefaultFilesystem() which is skipped in test mode).
async function populateDefaultFiles(fs: typeof BrowserFs) {
  if (!(await fs.exists('/migrations'))) {
    await fs.mkdir('/migrations');
  }

  const migrationsDir = path.join(lootCoreRoot, 'migrations');
  const migrationFiles = await nodeFs.readdir(migrationsDir);
  for (const file of migrationFiles) {
    if (file.endsWith('.sql') || file.endsWith('.js')) {
      const contents = await nodeFs.readFile(path.join(migrationsDir, file));
      await fs.writeFile(`/migrations/${file}`, new Uint8Array(contents));
    }
  }

  const defaultDb = await nodeFs.readFile(
    path.join(lootCoreRoot, 'default-db.sqlite'),
  );
  await fs.writeFile('/default-db.sqlite', new Uint8Array(defaultDb));
}

// Write the test budget template into the virtual FS.
async function writeBudgetFiles(fs: typeof BrowserFs) {
  const templatePath = path.join(
    lootCoreRoot,
    'src/mocks/files/default-budget-template',
  );
  const metadataContents = await nodeFs.readFile(
    path.join(templatePath, 'metadata.json'),
    'utf8',
  );
  const dbContents = await nodeFs.readFile(
    path.join(templatePath, 'db.sqlite'),
  );

  const budgetDir = `/documents/${budgetName}`;
  await fs.mkdir(budgetDir);
  await fs.writeFile(`${budgetDir}/metadata.json`, metadataContents);
  await fs.writeFile(`${budgetDir}/db.sqlite`, new Uint8Array(dbContents));
}

beforeAll(async () => {
  const baseURL = `${__dirname}/../../../node_modules/@jlongster/sql.js/dist/`;
  process.env.PUBLIC_URL = baseURL;

  // Patch fetch so sql.js WASM loader reads from disk instead of HTTP
  vi.spyOn(global, 'fetch').mockImplementation(async input => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith(baseURL)) {
      return new Response(new Uint8Array(await nodeFs.readFile(url)), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/wasm' },
      });
    }
    return Promise.reject(new Error(`fetch not mocked for ${url}`));
  });

  await api.init({ dataDir: '/documents' });

  const fs = await import('@actual-app/core/platform/server/fs');
  await populateDefaultFiles(fs);
  await writeBudgetFiles(fs);
});

afterEach(async () => {
  globalThis.currentMonth = null;
});

globalThis.__test_api = api;
globalThis.__test_budget_name = budgetName;
