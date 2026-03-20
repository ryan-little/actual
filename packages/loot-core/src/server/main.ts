// @ts-strict-ignore
import './polyfills';
import * as asyncStorage from '../platform/server/asyncStorage';
import * as connection from '../platform/server/connection';
import * as fs from '../platform/server/fs';
import { logger, setVerboseMode } from '../platform/server/log';
import * as sqlite from '../platform/server/sqlite';
import { q } from '../shared/query';
import type { QueryState } from '../shared/query';
import { amountToInteger, integerToAmount } from '../shared/util';
import type { ApiHandlers } from '../types/api-handlers';
import type { Handlers } from '../types/handlers';

import { app as accountsApp } from './accounts/app';
import { app as adminApp } from './admin/app';
import { app as apiApp } from './api';
import { createApp } from './app';
import { aqlQuery } from './aql';
import { app as authApp } from './auth/app';
import { app as budgetApp } from './budget/app';
import { app as budgetFilesApp } from './budgetfiles/app';
import { app as dashboardApp } from './dashboard/app';
import * as db from './db';
import * as encryption from './encryption';
import { app as encryptionApp } from './encryption/app';
import { app as filtersApp } from './filters/app';
import { mutator } from './mutators';
import { app as notesApp } from './notes/app';
import { app as payeesApp } from './payees/app';
import { get } from './post';
import { app as preferencesApp } from './preferences/app';
import * as prefs from './prefs';
import { app as reportsApp } from './reports/app';
import { app as rulesApp } from './rules/app';
import { app as schedulesApp } from './schedules/app';
import { getServer, setServer } from './server-config';
import { app as spreadsheetApp } from './spreadsheet/app';
import { fullSync, setSyncingMode } from './sync';
import { app as syncApp } from './sync/app';
import { app as tagsApp } from './tags/app';
import { app as toolsApp } from './tools/app';
import { app as transactionsApp } from './transactions/app';
import * as rules from './transactions/transaction-rules';
import { redo, undo } from './undo';

async function makeFiltersFromConditions({
  conditions,
  applySpecialCases = undefined,
}) {
  return rules.conditionsToAQL(conditions, { applySpecialCases });
}

async function query(query) {
  if (query['table'] == null) {
    throw new Error('query has no table, did you forgot to call `.serialize`?');
  }

  return aqlQuery(query);
}

async function getServerVersion() {
  if (!getServer()) {
    return { error: 'no-server' as const };
  }

  let version;
  try {
    const res = await get(getServer().BASE_SERVER + '/info');

    const info = JSON.parse(res);
    version = info.build.version as string;
  } catch {
    return { error: 'network-failure' as const };
  }

  return { version };
}

async function getServerUrl() {
  return getServer() && getServer().BASE_SERVER;
}

async function setServerUrl({ url, validate = true }) {
  if (url == null) {
    await asyncStorage.removeItem('user-token');
  } else {
    url = url.replace(/\/+$/, '');

    if (validate) {
      // Validate the server is running
      const result = await mainApp['subscribe-needs-bootstrap']({
        url,
      });
      if ('error' in result) {
        return { error: result.error };
      }
    }
  }

  await asyncStorage.setItem('server-url', url);
  await asyncStorage.setItem('did-bootstrap', true);
  setServer(url);
  return {};
}

async function appFocused() {
  if (prefs.getPrefs() && prefs.getPrefs().id) {
    // First we sync
    void fullSync();
  }
}

export type ServerHandlers = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  'make-filters-from-conditions': (arg: {
    conditions: unknown;
    applySpecialCases?: boolean;
  }) => Promise<{ filters: unknown[] }>;

  // oxlint-disable-next-line typescript/no-explicit-any
  query: (query: QueryState) => Promise<{ data: any; dependencies: string[] }>;

  'get-server-version': () => Promise<
    { error: 'no-server' } | { error: 'network-failure' } | { version: string }
  >;

  'get-server-url': () => Promise<string | null>;

  'set-server-url': (arg: {
    url: string;
    validate?: boolean;
  }) => Promise<{ error?: string }>;

  'app-focused': () => Promise<void>;
};

const serverApp = createApp<ServerHandlers>({
  undo: mutator(undo),
  redo: mutator(redo),
  'make-filters-from-conditions': makeFiltersFromConditions,
  query,
  'get-server-version': getServerVersion,
  'get-server-url': getServerUrl,
  'set-server-url': setServerUrl,
  'app-focused': appFocused,
});

// Main app
export const mainApp = createApp<Handlers>();

mainApp.events.on('sync', event => {
  connection.send('sync-event', event);
});

mainApp.combine(
  serverApp,
  authApp,
  schedulesApp,
  budgetApp,
  dashboardApp,
  notesApp,
  preferencesApp,
  toolsApp,
  filtersApp,
  reportsApp,
  rulesApp,
  adminApp,
  transactionsApp,
  accountsApp,
  payeesApp,
  spreadsheetApp,
  syncApp,
  budgetFilesApp,
  encryptionApp,
  tagsApp,
);

export function getDefaultDocumentDir() {
  return fs.join(process.env.ACTUAL_DOCUMENT_DIR, 'Actual');
}

async function setupDocumentsDir() {
  async function ensureExists(dir) {
    // Make sure the document folder exists
    if (!(await fs.exists(dir))) {
      await fs.mkdir(dir);
    }
  }

  let documentDir = await asyncStorage.getItem('document-dir');

  // Test the existing documents directory to make sure it's a valid
  // path that exists, and if it errors fallback to the default one
  if (documentDir) {
    try {
      await ensureExists(documentDir);
    } catch {
      documentDir = null;
    }
  }

  if (!documentDir) {
    documentDir = getDefaultDocumentDir();
  }

  await ensureExists(documentDir);
  fs._setDocumentDir(documentDir);
}

export async function initApp(isDev, socketName) {
  await sqlite.init();
  await Promise.all([asyncStorage.init(), fs.init()]);
  await setupDocumentsDir();

  const keysStr = await asyncStorage.getItem('encrypt-keys');
  if (keysStr) {
    try {
      const keys = JSON.parse(keysStr);

      // Load all the keys
      await Promise.all(
        Object.keys(keys).map(fileId => {
          return encryption.loadKey(keys[fileId]);
        }),
      );
    } catch (e) {
      logger.log('Error loading key', e);
      throw new Error('load-key-error');
    }
  }

  const url = await asyncStorage.getItem('server-url');

  if (!url) {
    await asyncStorage.removeItem('user-token');
  }
  setServer(url);

  connection.init(socketName, mainApp);
}

type BaseInitConfig = {
  dataDir?: string;
  verbose?: boolean;
};

type ServerInitConfig = BaseInitConfig & {
  serverURL: string;
};

type PasswordAuthConfig = ServerInitConfig & {
  password: string;
  sessionToken?: never;
};

type SessionTokenAuthConfig = ServerInitConfig & {
  sessionToken: string;
  password?: never;
};

type NoServerConfig = BaseInitConfig & {
  serverURL?: undefined;
  password?: never;
  sessionToken?: never;
};

export type InitConfig =
  | PasswordAuthConfig
  | SessionTokenAuthConfig
  | NoServerConfig;

export async function init(config: InitConfig) {
  // Get from build

  let dataDir, serverURL;
  if (config) {
    dataDir = config.dataDir;
    serverURL = config.serverURL;

    // Set verbose mode if specified
    if (config.verbose !== undefined) {
      setVerboseMode(config.verbose);
    }
  } else {
    dataDir = process.env.ACTUAL_DATA_DIR;
    serverURL = process.env.ACTUAL_SERVER_URL;
  }

  await sqlite.init();
  await Promise.all([asyncStorage.init({ persist: false }), fs.init()]);
  fs._setDocumentDir(dataDir || process.cwd());

  if (serverURL) {
    setServer(serverURL);

    if ('sessionToken' in config && config.sessionToken) {
      // Session token authentication
      await mainApp['subscribe-set-token']({
        token: config.sessionToken,
      });
      // Validate the token
      const user = await mainApp['subscribe-get-user']();
      if (!user || user.tokenExpired === true) {
        // Clear invalid token
        await mainApp['subscribe-set-token']({ token: '' });
        throw new Error(
          'Authentication failed: invalid or expired session token',
        );
      }
      if (user.offline === true) {
        // Clear token since we can't validate
        await mainApp['subscribe-set-token']({ token: '' });
        throw new Error('Authentication failed: server offline or unreachable');
      }
    } else if ('password' in config && config.password) {
      const result = await mainApp['subscribe-sign-in']({
        password: config.password,
      });
      if (result?.error) {
        throw new Error(`Authentication failed: ${result.error}`);
      }
    }
  } else {
    // This turns off all server URLs. In this mode we don't want any
    // access to the server, we are doing things locally
    setServer(null);

    mainApp.events.on('load-budget', () => {
      setSyncingMode('offline');
    });
  }

  return lib;
}

// Export a few things required for the platform

const combinedApp = createApp<ApiHandlers & Handlers>();
combinedApp.combine(apiApp, mainApp);

export const lib = {
  getDataDir: fs.getDataDir,
  sendMessage: (msg, args) => connection.send(msg, args),
  send: async <K extends keyof Handlers>(
    name: K,
    args?: Parameters<Handlers[K]>[0],
  ): Promise<Awaited<ReturnType<Handlers[K]>>> => {
    const res = await combinedApp.runHandler(name, args);
    return res as Awaited<ReturnType<Handlers[K]>>;
  },
  on: (name, func) => combinedApp.events.on(name, func),
  q,
  db,
  amountToInteger,
  integerToAmount,
};
