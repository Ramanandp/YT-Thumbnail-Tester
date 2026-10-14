const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('toolbar injects only on the YouTube homepage and reports failures', async () => {
  let clicked;
  const calls = [];
  const browser = { action: { onClicked: { addListener: fn => { clicked = fn; } } }, scripting: { executeScript: async value => calls.push(['inject', value]) } };
  for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle', 'setPopup', 'openPopup']) browser.action[method] = async value => calls.push([method, value]);
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), { browser });
  await clicked({ id: 1, url: 'https://www.youtube.com/?themeRefresh=1' });
  assert.equal(calls.filter(([type]) => type === 'inject').length, 1);
  for (const url of ['https://www.youtube.com/watch?v=1', 'https://www.youtube.com/results?search_query=x', 'https://example.com/']) await clicked({ id: 2, url });
  assert.equal(calls.filter(([type]) => type === 'inject').length, 1);
  assert.ok(calls.some(([type, value]) => type === 'setBadgeText' && value.text === '!'));
  browser.scripting.executeScript = async () => { throw Error('Injection failed'); };
  await clicked({ id: 1, url: 'https://www.youtube.com/' });
  assert.ok(calls.some(([type, value]) => type === 'setTitle' && value.title === 'Injection failed'));
});
