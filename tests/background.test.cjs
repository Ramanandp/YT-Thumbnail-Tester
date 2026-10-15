const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(options = {}) {
  let clicked, timeout, targetClosed = false;
  const calls = [], updated = new Set(), removed = new Set();
  const target = options.target || { id: 5, windowId: 1, url: 'https://www.youtube.com/', status: 'complete' };
  const browser = {
    action: { onClicked: { addListener: fn => { clicked = fn; } } },
    tabs: {
      query: async value => { calls.push(['query', value]); if (options.queryError) throw Error('Cannot open YouTube'); return options.existing || []; },
      create: async value => { calls.push(['create', value]); return target; },
      update: async (id, value) => { calls.push(['activate', { id, ...value }]); return options.existing.find(tab => tab.id === id); },
      get: async id => { calls.push(['get', id]); if (targetClosed && id === target.id) throw Error('Tab closed'); return (options.existing || []).find(tab => tab.id === id) || target; },
      onUpdated: { addListener: fn => updated.add(fn), removeListener: fn => updated.delete(fn) },
      onRemoved: { addListener: fn => removed.add(fn), removeListener: fn => removed.delete(fn) }
    },
    windows: { update: async (id, value) => calls.push(['focus', { id, ...value }]) },
    scripting: { executeScript: async value => {
      calls.push([value.files ? 'inject' : 'probe', value]);
      if (options.injectionError) throw Error('Injection failed');
      return [{ result: Boolean(options.alreadyOpen) }];
    } }
  };
  for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle', 'setPopup', 'openPopup']) browser.action[method] = async value => calls.push([method, value]);
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), { browser, URL, setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {} });
  const source = { id: 1, windowId: 1, url: 'https://example.com/', status: 'complete' };
  return { click: (tab = source) => clicked(tab), calls, target, updated, removed, expire: () => timeout(), closeTarget: () => { targetClosed = true; for (const fn of [...removed]) fn(target.id); }, flush: () => new Promise(resolve => setImmediate(resolve)) };
}
test('toolbar uses the current homepage and preserves normal toggle injection', async () => {
  const h = harness();
  await h.click({ id: 5, windowId: 1, url: 'https://www.youtube.com/?themeRefresh=1#home', status: 'complete' });
  assert.equal(h.calls.filter(([type]) => type === 'inject').length, 1);
  assert.equal(h.calls.some(([type]) => type === 'query' || type === 'create' || type === 'probe'), false);
  assert.equal(h.updated.size, 0); assert.equal(h.removed.size, 0);
});
test('unsupported pages open YouTube in a new tab and inject without changing the source', async () => {
  for (const url of ['https://example.com/', 'https://www.youtube.com/watch?v=1', 'https://www.youtube.com/results?search_query=x', 'about:newtab']) {
    const h = harness(); await h.click({ id: 1, windowId: 1, url });
    assert.equal(h.calls.filter(([type]) => type === 'create').length, 1);
    assert.equal(h.calls.find(([type]) => type === 'create')[1].url, 'https://www.youtube.com/');
    assert.equal(h.calls.find(([type]) => type === 'inject')[1].target.tabId, 5);
    assert.equal(h.calls.some(([type]) => type === 'activate'), false);
    assert.equal(h.calls.some(([type, value]) => type === 'setBadgeText' && value.text === '!'), false);
  }
});
test('reuse prefers the current window and focuses another window when needed', async () => {
  const other = { id: 3, windowId: 2, url: 'https://www.youtube.com/', status: 'complete' };
  const local = { id: 4, windowId: 1, url: 'https://www.youtube.com/?x=1', status: 'complete' };
  for (const existing of [[other, local], [other]]) {
    const h = harness({ existing }); await h.click();
    assert.equal(h.calls.some(([type]) => type === 'create'), false);
    assert.equal(h.calls.find(([type]) => type === 'activate')[1].id, existing.length === 2 ? 4 : 3);
    assert.equal(h.calls.some(([type]) => type === 'focus'), existing.length === 1);
  }
  const h = harness({ existing: [local], alreadyOpen: true }); await h.click();
  assert.equal(h.calls.some(([type]) => type === 'inject'), false, 'an existing tester must not be toggled closed');
});
test('waits for loading, ignores unrelated events, and suppresses duplicate toolbar clicks', async () => {
  const h = harness({ target: { id: 5, windowId: 1, url: 'https://www.youtube.com/', status: 'loading' } });
  const pending = h.click(); await h.flush(); await h.click();
  assert.equal(h.calls.filter(([type]) => type === 'create').length, 1);
  for (const fn of h.updated) fn(99, { status: 'complete' }, { url: 'https://example.com/', status: 'complete' });
  assert.equal(h.calls.some(([type]) => type === 'inject'), false);
  for (const fn of [...h.updated]) fn(5, { status: 'complete' }, { ...h.target, status: 'complete' });
  await pending;
  assert.equal(h.calls.filter(([type]) => type === 'inject').length, 1);
  assert.equal(h.updated.size, 0); assert.equal(h.removed.size, 0);
});
test('load timeout, closed tab, redirect, lookup failure, and injection errors give feedback', async () => {
  for (const failure of ['timeout', 'closed', 'redirect', 'query', 'injection']) {
    const h = harness({ target: { id: 5, windowId: 1, url: 'https://www.youtube.com/', status: failure === 'injection' ? 'complete' : 'loading' }, queryError: failure === 'query', injectionError: failure === 'injection' });
    const pending = h.click(); await h.flush();
    if (failure === 'timeout') h.expire();
    if (failure === 'closed') h.closeTarget();
    if (failure === 'redirect') for (const fn of [...h.updated]) fn(5, { status: 'complete' }, { url: 'https://example.com/', status: 'complete' });
    await pending;
    assert.ok(h.calls.some(([type, value]) => type === 'setBadgeText' && value.text === '!'), failure);
    if (failure === 'closed') assert.equal(h.calls.find(([type, value]) => type === 'setBadgeText' && value.text === '!')[1].tabId, 1);
    assert.equal(h.updated.size, 0); assert.equal(h.removed.size, 0);
  }
});
