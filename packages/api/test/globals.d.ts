import type * as BrowserApi from '../index.browser';

declare global {
  // oxlint-disable-next-line no-var
  var __test_api: typeof BrowserApi;
  // oxlint-disable-next-line no-var
  var __test_budget_name: string;
  // oxlint-disable-next-line no-var
  var IS_TESTING: boolean;
  // oxlint-disable-next-line no-var
  var currentMonth: string | null;
}
