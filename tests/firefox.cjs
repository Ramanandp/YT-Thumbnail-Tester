// Actual Firefox layout/event regression: no mocked hit testing or composed paths.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const channelFixture = '<a class="channel-avatar" href="/@original"><img src="original-avatar.jpg" srcset="original-avatar-2x.jpg 2x" alt="Original channel" style="width:36px;height:36px;border-radius:50%"></a><a class="channel-name" href="/@original">Original channel</a>';
const fixture = `<!doctype html><style>body{margin:0;padding:100px 40px;min-height:2400px}ytd-rich-item-renderer{display:block;width:300px}ytd-thumbnail{display:block;width:100%;height:170px;background:#555;border-radius:12px}a{display:block}img{width:100%;height:170px}#sticky{position:fixed;top:0;left:0;width:100%;height:60px;z-index:100;background:black}</style><div id="sticky"></div><ytd-rich-item-renderer><ytd-thumbnail><a href="/watch?v=one"><img alt="Thumbnail"></a></ytd-thumbnail><a id="video-title" href="/watch?v=one">Original video</a></ytd-rich-item-renderer>`;
async function clickControl(page, selector) {
  const box = await page.evaluate(selector => {
    const control = document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector(selector);
    control.scrollIntoView({ block: 'nearest' });
    const r = control.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
  }, selector);
  assert.ok(box.width > 0 && box.height > 0, `${selector} must be visible and clickable`);
  await page.mouse.click(box.x, box.y);
}
async function checkModes(page) {
  const inspect = () => page.evaluate(() => {
    const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
    const bar = root.querySelector('.preview-bar').getBoundingClientRect();
    return { editHidden: root.querySelector('.panel').hidden, barHidden: root.querySelector('.preview-bar').hidden, on: root.querySelector('#preview-toggle').getAttribute('aria-checked'), width: bar.width, height: bar.height, right: innerWidth - bar.right, top: bar.top, outline: root.querySelector('.highlight').style.display };
  });
  let state = await inspect();
  assert.equal(state.editHidden, true); assert.equal(state.barHidden, false); assert.equal(state.on, 'true');
  assert.ok(state.height < 80 && state.width < 520, 'Preview Mode uses a compact bar');
  assert.ok(Math.abs(state.right - 24) < 0.5); assert.equal(state.top, 84);
  await clickControl(page, '#preview-toggle');
  state = await inspect(); assert.equal(state.on, 'false'); assert.equal(state.outline, 'none');
  assert.equal(await page.$eval('#video-title', title => title.textContent), 'Original video');
  await checkChannelRestored(page);
  await clickControl(page, '#edit-mode');
  state = await inspect(); assert.equal(state.editHidden, false); assert.equal(state.barHidden, true); assert.equal(state.on, 'false');
  assert.equal(await page.$eval('#video-title', title => title.textContent), 'Original video');
  await clickControl(page, '#apply');
  state = await inspect(); assert.equal(state.on, 'true'); assert.equal(state.editHidden, true);
  // Native button keyboard behavior must toggle the accessible switch too.
  await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#preview-toggle').focus());
  await page.keyboard.press(' '); assert.equal((await inspect()).on, 'false');
  await page.keyboard.press(' '); assert.equal((await inspect()).on, 'true');
  await clickControl(page, '#edit-mode');
  state = await inspect(); assert.equal(state.editHidden, false); assert.equal(state.on, 'true');
  assert.equal(await page.$eval('#video-title', title => title.textContent), 'Test title');
  await clickControl(page, '#apply');
}
async function checkAlignment(page) {
  const initial = await page.evaluate(() => {
    const overlay = document.querySelector('[data-yt-thumbnail-preview]');
    window.coverStyles = overlay.getAttribute('style');
    window.imageStyles = overlay.shadowRoot.querySelector('img').getAttribute('style');
    window.coverMutations = 0;
    window.coverObserver = new MutationObserver(records => { window.coverMutations += records.length; });
    window.coverObserver.observe(overlay, { attributes: true });
    window.coverObserver.observe(overlay.shadowRoot.querySelector('img'), { attributes: true });
    const r = document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.preview-bar').getBoundingClientRect();
    return { panelTop: r.top, panelRight: innerWidth - r.right };
  });
  const verify = async () => {
    const result = await page.evaluate(() => {
      const overlay = document.querySelector('[data-yt-thumbnail-preview]');
      const thumb = overlay.parentElement, image = overlay.shadowRoot.querySelector('img');
      const expected = thumb.getBoundingClientRect(), actual = image.getBoundingClientRect();
      const panel = document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.preview-bar').getBoundingClientRect();
      return {
        errors: ['left', 'top', 'width', 'height'].map(key => Math.abs(expected[key] - actual[key])),
        absolute: getComputedStyle(overlay).position === 'absolute', pointerEvents: getComputedStyle(overlay).pointerEvents,
        radius: getComputedStyle(overlay).borderRadius, thumbRadius: getComputedStyle(thumb).borderRadius,
        unchanged: overlay.getAttribute('style') === window.coverStyles && image.getAttribute('style') === window.imageStyles && window.coverMutations === 0,
        panelTop: panel.top, panelRight: innerWidth - panel.right,
        outline: document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.highlight').style.display
      };
    });
    assert.ok(result.errors.every(error => error < 0.5), `Preview must match thumbnail: ${JSON.stringify(result.errors)}`);
    assert.equal(result.absolute, true); assert.equal(result.pointerEvents, 'none');
    assert.equal(result.radius, result.thumbRadius); assert.equal(result.unchanged, true, 'scroll/resize must not reposition the overlay through JavaScript');
    assert.ok(Math.abs(result.panelTop - initial.panelTop) < 0.5); assert.ok(Math.abs(result.panelRight - initial.panelRight) < 0.5);
    assert.equal(result.outline, 'none');
  };
  await verify();
  for (const y of [30, 95, 350, 900, 0]) { await page.evaluate(y => scrollTo(0, y), y); await verify(); }
  await page.evaluate(() => {
    const thumb = document.querySelector('[data-yt-thumbnail-preview]').parentElement;
    const video = thumb.closest('ytd-rich-item-renderer, .ytLockupViewModelHost, .experimental-video-card');
    video.style.width = '240px';
  });
  await page.setViewport({ width: 960, height: 700 }); await verify();
  // A high-z-index hover player cannot cover the preview inside the local stack.
  await page.evaluate(() => {
    const thumb = document.querySelector('[data-yt-thumbnail-preview]').parentElement;
    const hover = document.createElement('div'); hover.dataset.hoverFixture = '';
    hover.style.cssText = 'position:absolute;inset:0;z-index:999;background:magenta;pointer-events:none'; thumb.append(hover);
  });
  const stacking = await page.evaluate(() => {
    const overlay = document.querySelector('[data-yt-thumbnail-preview]');
    const thumb = overlay.parentElement, hover = thumb.querySelector('[data-hover-fixture]');
    const r = thumb.getBoundingClientRect();
    overlay.style.pointerEvents = 'auto'; hover.style.pointerEvents = 'auto';
    const top = document.elementFromPoint(r.left + 20, r.top + 20);
    overlay.style.pointerEvents = 'none'; hover.remove();
    // Reset style changes made solely for this probe.
    overlay.setAttribute('style', window.coverStyles); window.coverObserver.disconnect();
    return { covered: top === overlay, isolated: getComputedStyle(thumb).isolation === 'isolate' };
  });
  assert.equal(stacking.covered, true); assert.equal(stacking.isolated, true);
  await page.setViewport({ width: 1280, height: 800 });
}
(async () => {
  const extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnail-tester-'));
  fs.cpSync('extension', extensionDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json')));
  // Inject the unchanged production content script automatically in this isolated
  // test profile so it runs in Firefox's actual extension world, not page.evaluate.
  manifest.content_scripts = [{ matches: ['https://www.youtube.com/*'], js: ['content.js'], run_at: 'document_idle' }];
  manifest.host_permissions = ['https://www.youtube.com/*'];
  fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest));
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: process.env.FIREFOX_PATH || 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', headless: true });
  try {
    await browser.installExtension(extensionDir);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setRequestInterception(true);
    page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: fixture.replace('</ytd-rich-item-renderer>', `${channelFixture}</ytd-rich-item-renderer>`) }));
    await page.goto('https://www.youtube.com/');
    await page.evaluate(() => {
      window.navigations = 0;
      for (const type of ['pointerdown', 'click']) window.addEventListener(type, e => { if (e.target.closest?.('a[href*="watch"]')) window.navigations++; }, true);
    });
    await page.waitForSelector('#yt-thumbnail-tester');
    await page.evaluate(async () => {
      const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 9;
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'thumbnail.png', { type: 'image/png' }));
      const input = root.querySelector('#image'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
      root.querySelector('#title').value = 'Test title'; root.querySelector('#title').dispatchEvent(new Event('input'));
      root.querySelector('#channel-name').value = 'eridium'; root.querySelector('#channel-name').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => !document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.preview').hidden);
    fs.mkdirSync('dist', { recursive: true });
    await page.screenshot({ path: 'dist/edit-mode.png' });
    await clickControl(page, '#select');
    await page.mouse.move(150, 150);
    await page.mouse.click(150, 150);
    const result = await page.evaluate(() => {
      const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
      return { status: root.querySelector('.status').textContent, enabled: !root.querySelector('#apply').disabled, navigations: window.navigations };
    });
    console.log(JSON.stringify(result));
    assert.equal(result.enabled, true, result.status);
    assert.equal(result.navigations, 0);
    assert.equal(await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.panel').hidden), true, 'selecting immediately applies');
    await checkModes(page);
    await page.screenshot({ path: 'dist/preview-mode.png' });
    assert.equal(await page.$eval('#video-title', title => title.textContent), 'Test title');
    await checkChannel(page, false);
    await checkAlignment(page);
    await clickControl(page, '#preview-toggle');
    assert.equal(await page.$eval('#video-title', title => title.textContent), 'Original video');
    await checkChannelRestored(page);
    assert.equal(await page.$eval('ytd-thumbnail', thumb => thumb.hasAttribute('style')), false);
    for (const className of ['ytLockupViewModelHost', 'experimental-video-card']) {
      await page.evaluate(({ className, channelFixture }) => {
        const original = document.querySelector('ytd-rich-item-renderer');
        original.outerHTML = `<div class="${className}" style="width:300px"><a href="/watch?v=modern" style="width:100%;height:170px;background:#555;border-radius:14px"><img style="width:100%;height:170px"></a><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=modern">Modern video</a></h3></div>`;
        document.querySelector(`.${className}`).insertAdjacentHTML('beforeend', channelFixture);
        window.originalThumbnailStyle = document.querySelector(`.${className} > a`).style.cssText;
      }, { className, channelFixture });
      await page.waitForFunction(() => {
        const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
        return !root.querySelector('.panel').hidden && root.querySelector('#preview-toggle').disabled;
      });
      await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#select').click());
      await page.mouse.move(150, 150); await page.mouse.click(150, 150);
      assert.equal(await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').disabled), false, `${className} is selectable`);
      await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').click());
      assert.equal(await page.$eval('h3 a', title => title.textContent), 'Test title');
      await checkChannel(page, className === 'experimental-video-card');
      await checkAlignment(page);
      await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#preview-toggle').click());
      assert.equal(await page.$eval('h3 a', title => title.textContent), 'Modern video');
      assert.equal(await page.$eval('h3 a', title => title.getAttribute('href')), '/watch?v=modern');
      await checkChannelRestored(page);
      assert.equal(await page.evaluate(className => document.querySelector(`.${className} > a`).style.cssText === window.originalThumbnailStyle, className), true);
      await page.evaluate(() => { const card = document.querySelector('.ytLockupViewModelHost, .experimental-video-card'); const replacement = document.createElement('ytd-rich-item-renderer'); card.replaceWith(replacement); });
    }
    assert.equal(page.url(), 'https://www.youtube.com/');
    assert.equal(await page.evaluate(() => window.navigations), 0);
    await checkRandomPlacement(browser);
    console.log('Firefox selection, scroll/resize alignment, channel names, default/custom avatars, hover coverage, and restoration passed for all three card layouts.');
  } finally { await browser.close(); fs.rmSync(extensionDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
async function checkChannel(page, custom) {
  assert.equal(await page.$eval('.channel-name', name => name.textContent), 'eridium');
  assert.equal(await page.$eval('.channel-name', name => name.getAttribute('href')), '/@original');
  await page.waitForFunction(() => document.querySelector('.channel-avatar img').naturalWidth > 0);
  const svg = await page.$eval('.channel-avatar img', avatar => {
    const doc = new DOMParser().parseFromString(decodeURIComponent(avatar.getAttribute('src').split(',')[1]), 'image/svg+xml');
    return { letter: doc.querySelector('text').textContent, color: doc.querySelector('rect').getAttribute('fill'), srcset: avatar.hasAttribute('srcset') };
  });
  assert.equal(svg.letter, 'E'); assert.equal(svg.color, '#5364b8'); assert.equal(svg.srcset, false);
  if (custom) {
    await page.evaluate(async () => {
      const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
      root.querySelector('#edit-mode').click();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'avatar.png', { type: 'image/png' }));
      const input = root.querySelector('#channel-image'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => !document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#default-avatar').disabled);
    await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').click());
    assert.ok((await page.$eval('.channel-avatar img', avatar => avatar.src)).startsWith('data:image/png;base64,'));
    await page.evaluate(() => { const root = document.querySelector('#yt-thumbnail-tester').shadowRoot; root.querySelector('#edit-mode').click(); root.querySelector('#default-avatar').click(); root.querySelector('#apply').click(); });
    assert.ok((await page.$eval('.channel-avatar img', avatar => avatar.src)).startsWith('data:image/svg+xml;'));
  }
}
async function checkChannelRestored(page) {
  assert.equal(await page.$eval('.channel-name', name => name.textContent), 'Original channel');
  const avatar = await page.$eval('.channel-avatar img', img => ({ src: img.getAttribute('src'), srcset: img.getAttribute('srcset'), alt: img.alt, style: img.style.cssText }));
  assert.equal(avatar.src, 'original-avatar.jpg'); assert.equal(avatar.srcset, 'original-avatar-2x.jpg 2x');
  assert.equal(avatar.alt, 'Original channel'); assert.equal(avatar.style, 'width: 36px; height: 36px; border-radius: 50%;');
}
async function checkRandomPlacement(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const card = (id, left, top, ad = false) => `<ytd-rich-item-renderer id="${id}" style="position:absolute;left:${left}px;top:${top}px;width:280px">${ad ? '<ytd-ad-slot-renderer></ytd-ad-slot-renderer>' : ''}<ytd-thumbnail style="display:block;width:100%;height:170px;background:#555;border-radius:12px"><a href="/watch?v=${id}"><img style="width:100%;height:170px" alt="Thumbnail"></a></ytd-thumbnail><a id="video-title" href="/watch?v=${id}">${id} original</a>${channelFixture}</ytd-rich-item-renderer>`;
  const html = `<!doctype html><style>body{margin:0;min-height:2200px}a{display:block}#sticky{position:fixed;top:0;left:0;width:100%;height:72px;background:black;z-index:100}</style><div id="sticky"></div>${card('first', 24, 120)}${card('second', 330, 120)}${card('under-controls', 930, 0)}${card('under-header', 650, -20)}${card('advert', 650, 400, true)}${card('below-fold', 24, 1200)}`;
  await page.setRequestInterception(true);
  page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('https://www.youtube.com/');
  await page.waitForSelector('#yt-thumbnail-tester');
  await page.evaluate(async () => {
    const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 9;
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const files = new DataTransfer(); files.items.add(new File([blob], 'thumbnail.png', { type: 'image/png' }));
    root.querySelector('#image').files = files.files; root.querySelector('#image').dispatchEvent(new Event('change'));
    root.querySelector('#title').value = 'Random preview'; root.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector('#channel-name').value = 'Random channel';
  });
  await page.waitForFunction(() => !document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').disabled);
  const active = () => page.evaluate(() => document.querySelector('[data-yt-thumbnail-preview]')?.closest('ytd-rich-item-renderer').id || null);
  await clickControl(page, '#apply');
  const first = await active(); assert.ok(['first', 'second'].includes(first));
  const second = first === 'first' ? 'second' : 'first';
  await clickControl(page, '#randomize'); assert.equal(await active(), second);
  assert.equal(await page.$eval(`#${first} #video-title`, el => el.textContent), `${first} original`);
  assert.equal(await page.$eval(`#${second} .channel-name`, el => el.textContent), 'Random channel');
  assert.equal(await page.evaluate(() => scrollY), 0);
  await clickControl(page, '#preview-toggle'); await clickControl(page, '#randomize');
  assert.equal(await active(), null);
  assert.equal(await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#preview-state').textContent), 'Off');
  await clickControl(page, '#preview-toggle'); assert.equal(await active(), first);
  // Only the other unobstructed video can be chosen; ads and covered cards do
  // not enter the pool. Accept either initial random choice without mocking it.
  await clickControl(page, '#randomize'); assert.equal(await active(), second);
  await page.evaluate(() => scrollTo(0, 1100));
  await clickControl(page, '#randomize'); assert.equal(await active(), 'below-fold');
  assert.equal(await page.$eval(`#${second} #video-title`, el => el.textContent), `${second} original`);
  assert.equal(await page.evaluate(() => scrollY), 1100);
  await clickControl(page, '#randomize'); assert.equal(await active(), 'below-fold');
  assert.match(await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#preview-warning').textContent), /No other eligible videos/);
  await clickControl(page, '.preview-bar .close');
  assert.equal(await page.$eval('#below-fold #video-title', el => el.textContent), 'below-fold original');
  await page.close();
}
