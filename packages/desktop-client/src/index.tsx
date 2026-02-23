// This file will initialize the app if we are in a real browser
// environment (not electron)
import './browser-preload';
import './fonts.scss';
import './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import type { NavigateFunction } from 'react-router';

import { bindActionCreators } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';
import type { Theme } from 'loot-core/types/prefs';

import * as accountsSlice from './accounts/accountsSlice';
import * as appSlice from './app/appSlice';
import { AuthProvider } from './auth/AuthProvider';
import * as budgetfilesSlice from './budgetfiles/budgetfilesSlice';
import { App } from './components/App';
import { ServerProvider } from './components/ServerContext';
import * as modalsSlice from './modals/modalsSlice';
import * as notificationsSlice from './notifications/notificationsSlice';
import { prefQueries } from './prefs';
import * as prefsSlice from './prefs/prefsSlice';
import { aqlQuery } from './queries/aqlQuery';
import { configureAppStore } from './redux/store';
import * as transactionsSlice from './transactions/transactionsSlice';
import { redo, undo } from './undo';
import * as usersSlice from './users/usersSlice';

const queryClient = new QueryClient();
window.__TANSTACK_QUERY_CLIENT__ = queryClient;

const store = configureAppStore({ queryClient });

const boundActions = bindActionCreators(
  {
    ...accountsSlice.actions,
    ...appSlice.actions,
    ...budgetfilesSlice.actions,
    ...modalsSlice.actions,
    ...notificationsSlice.actions,
    ...prefsSlice.actions,
    ...transactionsSlice.actions,
    ...usersSlice.actions,
  },
  store.dispatch,
);

async function appFocused() {
  await send('app-focused');
}

async function uploadFile(filename: string, contents: ArrayBuffer) {
  await send('upload-file-web', {
    filename,
    contents,
  });
}

function inputFocused(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  return (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable === true
  );
}

async function setTheme(theme: Theme) {
  // TODO: Tests and `toMatchThemeScreenshots` needs to be updated
  // to change the theme via UI navigation instead of going through
  // this method because this feels a bit hacky.
  await send('save-global-prefs', { theme });
  void queryClient.invalidateQueries({
    queryKey: prefQueries.listGlobal().queryKey,
  });
}

// Expose this to the main process to menu items can access it
window.__actionsForMenu = {
  ...boundActions,
  undo,
  redo,
  appFocused,
  uploadFile,
  setTheme,
};

// Expose send for fun!
window.$send = send;
window.$query = aqlQuery;
window.$q = q;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}
const root = createRoot(container);
root.render(
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <ServerProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ServerProvider>
    </Provider>
  </QueryClientProvider>,
);

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    __navigate?: NavigateFunction;
    __actionsForMenu: typeof boundActions & {
      undo: typeof undo;
      redo: typeof redo;
      appFocused: typeof appFocused;
      uploadFile: typeof uploadFile;
      setTheme: typeof setTheme;
    };

    $send: typeof send;
    $query: typeof aqlQuery;
    $q: typeof q;

    __TANSTACK_QUERY_CLIENT__: QueryClient;
  }
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) {
    // Cmd/Ctrl+o
    if (e.key === 'o') {
      e.preventDefault();
      window.__actionsForMenu.closeBudget();
    }
    // Cmd/Ctrl+z
    else if (e.key.toLowerCase() === 'z') {
      if (inputFocused(e)) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        // Redo
        window.__actionsForMenu.redo();
      } else {
        // Undo
        window.__actionsForMenu.undo();
      }
    }
  }
});
