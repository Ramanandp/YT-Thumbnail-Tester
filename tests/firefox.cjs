// Actual Firefox layout/event regression: no mocked hit testing or composed paths.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const fixture = `<!doctype html><style>body{margin:0;padding:100px 40px;min-height:2400px}ytd-rich-item-renderer{display:block;width:300px}ytd-thumbnail{display:block;width:100%;height:170px;background:#555;border-radius:12px}a{display:block}img{width:100%;height:170px}#sticky{position:fixed;top:0;left:0;width:100%;height:60px;z-index:100;background:black}</style><div id="sticky"></div><ytd-rich-item-renderer><ytd-thumbnail><a href="/watch?v=one"><img alt="Thumbnail"></a></ytd-thumbnail><a id="video-title" href="/watch?v=one">Original video</a></ytd-rich-item-renderer>`;
async function checkAlignment(page) {
  const initial = await page.evaluate(() => {
    const overlay = document.querySelector('[data-yt-thumbnail-preview]');
    window.coverStyles = overlay.getAttribute('style');
    window.imageStyles = overlay.shadowRoot.querySelector('img').getAttribute('style');
    window.coverMutations = 0;
    window.coverObserver = new MutationObserver(records => { window.coverMutations += records.length; });
    window.coverObserver.observe(overlay, { attributes: true });
    window.coverObserver.observe(overlay.shadowRoot.querySelector('img'), { attributes: true });
    const r = document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.panel').getBoundingClientRect();
    return { panelTop: r.top, panelRight: innerWidth - r.right };
  });
  const verify = async () => {
    const result = await page.evaluate(() => {
      const overlay = document.querySelector('[data-yt-thumbnail-preview]');
      const thumb = overlay.parentElement, image = overlay.shadowRoot.querySelector('img');
      const expected = thumb.getBoundingClientRect(), actual = image.getBoundingClientRect();
      const panel = document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.panel').getBoundingClientRect();
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
    assert.equal(result.panelTop, initial.panelTop); assert.equal(result.panelRight, initial.panelRight);
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
    page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: fixture }));
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
    });
    await page.waitForFunction(() => !document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('.preview').hidden);
    await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#select').click());
    await page.mouse.move(150, 150);
    await page.mouse.click(150, 150);
    const result = await page.evaluate(() => {
      const root = document.querySelector('#yt-thumbnail-tester').shadowRoot;
      return { status: root.querySelector('.status').textContent, enabled: !root.querySelector('#apply').disabled, navigations: window.navigations };
    });
    console.log(JSON.stringify(result));
    assert.equal(result.enabled, true, result.status);
    assert.equal(result.navigations, 0);
    await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').click());
    assert.equal(await page.$eval('#video-title', title => title.textContent), 'Test title');
    await checkAlignment(page);
    await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#restore').click());
    assert.equal(await page.$eval('#video-title', title => title.textContent), 'Original video');
    assert.equal(await page.$eval('ytd-thumbnail', thumb => thumb.hasAttribute('style')), false);
    for (const className of ['ytLockupViewModelHost', 'experimental-video-card']) {
      await page.evaluate(className => {
        const original = document.querySelector('ytd-rich-item-renderer');
        original.outerHTML = `<div class="${className}" style="width:300px"><a href="/watch?v=modern" style="width:100%;height:170px;background:#555;border-radius:14px"><img style="width:100%;height:170px"></a><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=modern">Modern video</a></h3></div>`;
        window.originalThumbnailStyle = document.querySelector(`.${className} > a`).style.cssText;
        document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#select').click();
      }, className);
      await page.mouse.move(150, 150); await page.mouse.click(150, 150);
      assert.equal(await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').disabled), false, `${className} is selectable`);
      await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#apply').click());
      assert.equal(await page.$eval('h3 a', title => title.textContent), 'Test title');
      await checkAlignment(page);
      await page.evaluate(() => document.querySelector('#yt-thumbnail-tester').shadowRoot.querySelector('#restore').click());
      assert.equal(await page.$eval('h3 a', title => title.textContent), 'Modern video');
      assert.equal(await page.$eval('h3 a', title => title.getAttribute('href')), '/watch?v=modern');
      assert.equal(await page.evaluate(className => document.querySelector(`.${className} > a`).style.cssText === window.originalThumbnailStyle, className), true);
      await page.evaluate(() => { const card = document.querySelector('.ytLockupViewModelHost, .experimental-video-card'); const replacement = document.createElement('ytd-rich-item-renderer'); card.replaceWith(replacement); });
    }
    assert.equal(page.url(), 'https://www.youtube.com/');
    assert.equal(await page.evaluate(() => window.navigations), 0);
    console.log('Firefox selection, scroll/resize alignment without JS repositioning, hover coverage, and restoration passed for all three card layouts.');
  } finally { await browser.close(); fs.rmSync(extensionDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
