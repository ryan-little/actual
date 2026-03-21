// oxlint-disable no-var
// Use the browser module type as the base — it's a subset of the node module,
// and both export the same methods the tests use.
import type * as BrowserApi from '../index.browser';

declare global {
  var __test_api: typeof BrowserApi;
  var __test_budget_name: string;
  var IS_TESTING: boolean;
  var currentMonth: string | null;
}
