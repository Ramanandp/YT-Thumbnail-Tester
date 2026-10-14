const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('extension/content.js', 'utf8');
const thumbnail = 'data:image/png;base64,aGVsbG8=';
const fixture = `<ytd-rich-item-renderer id="one"><ytd-thumbnail><a href="/watch?v=one"><img src="original.jpg"></a></ytd-thumbnail><a id="video-title" title="Original"><span>Original title</span></a><div>Channel · 10K views</div></ytd-rich-item-renderer>
<yt-lockup-view-model id="two"><a class="yt-lockup-view-model__content-image" href="/watch?v=two"><img src="second.jpg"></a><h3 class="yt-lockup-metadata-view-model__title"><a href="/watch?v=two">Second title</a></h3></yt-lockup-view-model>
<ytd-rich-item-renderer id="playlist"><ytd-thumbnail><a href="/watch?v=three&list=PL1">Playlist</a></ytd-thumbnail><a id="video-title">Playlist</a></ytd-rich-item-renderer>
<ytd-rich-item-renderer id="short"><ytd-thumbnail><a href="/shorts/123">Short</a></ytd-thumbnail><a id="video-title">Short</a></ytd-rich-item-renderer>
<ytd-rich-item-renderer id="ad"><ytd-ad-slot-renderer></ytd-ad-slot-renderer><ytd-thumbnail><a href="/watch?v=ad">Sponsored</a></ytd-thumbnail><a id="video-title">Ad</a></ytd-rich-item-renderer>`;
async function setup(options = {}) {
  const dom = new JSDOM(fixture, { url: 'https://www.youtube.com/', runScripts: 'outside-only' });
  const w = dom.window;
  const saved = [];
  let nextFrame;
  w.requestAnimationFrame = cb => { nextFrame = cb; return 1; };
  w.cancelAnimationFrame = () => { nextFrame = null; };
  w.browser = { storage: { local: {
    get: async () => { if (options.readError) throw Error(); return { draft: options.draft ?? { image: thumbnail, title: 'My new video' } }; },
    set: async value => { if (options.saveError) throw Error(); saved.push(value); }
  } } };
  w.Image = class { set src(value) { this.naturalWidth = options.decodeError ? 0 : 1280; queueMicrotask(() => options.decodeError ? this.onerror() : this.onload()); } };
  w.eval(source);
  await new Promise(resolve => setImmediate(resolve));
  const root = w.document.getElementById('yt-thumbnail-tester').shadowRoot;
  const $ = selector => root.querySelector(selector);
  const select = id => { $('#select').click(); const card = w.document.getElementById(id); return card.querySelector('a').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); };
  const tick = () => { const cb = nextFrame; nextFrame = null; cb?.(); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { dom, w, root, $, select, tick, flush, saved };
}
test('loads a draft without applying it, selects without navigation, restores actual original nodes', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  assert.equal(c.$('#title').value, 'My new video');
  const heading = c.w.document.querySelector('#one #video-title'), original = heading.firstChild;
  assert.equal(heading.textContent, 'Original title');
  assert.equal(c.select('one'), false);
  c.tick();
  assert.equal(c.$('.highlight').style.display, 'block');
  assert.equal(c.$('#apply').disabled, false);
  c.$('#apply').click();
  assert.equal(c.$('.highlight').style.display, 'none');
  c.tick();
  assert.equal(c.$('.highlight').style.display, 'none');
  assert.equal(heading.textContent, 'My new video');
  assert.ok(c.w.document.querySelector('#one ytd-thumbnail > [data-yt-thumbnail-preview]'));
  assert.equal(c.w.document.querySelector('#one ytd-thumbnail a').getAttribute('href'), '/watch?v=one');
  c.$('#restore').click();
  assert.equal(heading.firstChild, original);
  assert.equal(heading.getAttribute('title'), 'Original');
  assert.equal(heading.hasAttribute('aria-label'), false);
  assert.equal(c.w.document.querySelector('[data-yt-thumbnail-preview]'), null);
});
test('applying to a modern second card restores the first, closing restores the second', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  c.select('one'); c.$('#apply').click();
  c.select('two'); c.$('#apply').click();
  assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Original title');
  assert.equal(c.w.document.querySelector('#two h3').textContent, 'My new video');
  c.$('.close').click();
  assert.equal(c.w.document.querySelector('#two h3').textContent, 'Second title');
  assert.equal(c.w.document.querySelector('#yt-thumbnail-tester'), null);
});
test('Escape cancels selection and ineligible cards are not intercepted', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  c.$('#select').click();
  c.w.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  assert.equal(c.$('#select').textContent, 'Select video');
  for (const id of ['playlist', 'short', 'ad']) {
    c.$('#select').click();
    assert.equal(c.w.document.querySelector(`#${id} a`).dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, cancelable: true })), false);
    assert.match(c.$('.status').textContent, /not a supported video card/);
    assert.equal(c.$('#apply').disabled, true);
    c.w.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape' }));
  }
});
test('selection layer prevents early YouTube handlers from receiving a video gesture', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const layer = c.root.firstChild;
  const link = c.w.document.querySelector('#one ytd-thumbnail a');
  let navigations = 0;
  // Emulate handlers registered by YouTube before the extension is injected.
  c.w.__ytThumbnailTester.close();
  for (const type of ['pointerdown', 'mousedown', 'click']) {
    c.w.addEventListener(type, event => { if (event.target.closest?.('a[href*="/watch"]')) navigations++; }, true);
  }
  c.w.eval(source); await c.flush();
  const root = c.w.document.querySelector('#yt-thumbnail-tester').shadowRoot;
  const shield = root.firstChild;
  c.w.document.elementsFromPoint = () => [c.w.document.querySelector('#yt-thumbnail-tester'), link, link.parentElement];
  root.querySelector('#select').click();
  assert.equal(shield.style.display, 'block');
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    assert.equal(shield.dispatchEvent(new c.w.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: 50, clientY: 50 })), false);
  }
  assert.equal(navigations, 0);
  assert.equal(shield.style.display, 'none');
  assert.equal(root.querySelector('#apply').disabled, false);
  link.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(navigations, 1, 'ordinary video gestures resume after selection');
  assert.equal(layer.isConnected, false);
});
test('modern class-based cards are selected through the shield and retain their title link', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const card = c.w.document.createElement('div');
  card.className = 'yt-lockup-view-model';
  card.innerHTML = '<a class="ytThumbnailViewModelHost" href="/watch?v=modern"><img></a><h3 class="yt-lockup-metadata-view-model__title"><a href="/watch?v=modern">Modern video</a></h3>';
  c.w.document.body.append(card);
  c.w.document.elementsFromPoint = () => [c.w.document.querySelector('#yt-thumbnail-tester'), card.querySelector('img'), card];
  c.$('#select').click();
  const shield = c.root.firstChild;
  shield.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  assert.equal(c.$('#apply').disabled, false);
  c.$('#apply').click();
  assert.equal(card.querySelector('h3 a').textContent, 'My new video');
  assert.equal(card.querySelector('h3 a').getAttribute('href'), '/watch?v=modern');
  c.$('#restore').click();
  assert.equal(card.querySelector('h3 a').textContent, 'Modern video');
});
test('renamed renderers use the watch link, thumbnail and title instead of fixed class names', async t => {
  for (const camelCase of [true, false]) {
    const c = await setup(); t.after(() => c.dom.window.close());
    const card = c.w.document.createElement('div');
    card.className = camelCase ? 'ytLockupViewModelHost' : 'experimental-video-card';
    card.innerHTML = `<a class="experimental-thumbnail" href="/watch?v=renamed"><img></a><h3><a class="${camelCase ? 'ytLockupMetadataViewModelTitle' : 'experimental-title'}" href="/watch?v=renamed">Renamed title</a></h3>`;
    c.w.document.body.append(card);
    const host = c.w.document.querySelector('#yt-thumbnail-tester');
    c.w.document.elementsFromPoint = () => {
      assert.equal(host.style.visibility, 'hidden', 'hide overlay during hit testing');
      return [card.querySelector('img'), card];
    };
    c.$('#select').click();
    // Firefox can retarget a shadow event to the host, omitting the inner layer.
    host.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    assert.equal(host.style.visibility, '');
    assert.equal(c.$('#apply').disabled, false);
    c.$('#apply').click(); c.tick();
    assert.equal(card.querySelector('h3 a').textContent, 'My new video');
    assert.equal(c.$('#restore').disabled, false);
    c.$('#restore').click();
    assert.equal(card.querySelector('h3 a').textContent, 'Renamed title');
  }
});
test('semantic fallback does not select a shelf with multiple video identities', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const shelf = c.w.document.createElement('section');
  shelf.innerHTML = '<a href="/watch?v=first"><img></a><h3><a href="/watch?v=second">Other video</a></h3>';
  c.w.document.body.append(shelf);
  c.w.document.elementsFromPoint = () => [shelf.querySelector('img'), shelf];
  c.$('#select').click();
  c.root.firstChild.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  assert.equal(c.$('#apply').disabled, true);
});
test('cancel and close remove the shield and gesture blocking; unsupported hits stay in selection', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const shield = c.root.firstChild;
  c.w.document.elementsFromPoint = () => [c.w.document.querySelector('#yt-thumbnail-tester'), c.w.document.querySelector('#short a')];
  c.$('#select').click();
  shield.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  assert.equal(shield.style.display, 'block');
  c.w.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shield.style.display, 'none');
  c.$('#select').click();
  c.$('#select').click();
  assert.equal(shield.style.display, 'none');
  c.$('#select').click();
  c.$('.close').click();
  assert.equal(shield.isConnected, false);
  assert.equal(c.w.document.querySelector('#one a').dispatchEvent(new c.w.MouseEvent('pointerdown', { bubbles: true, cancelable: true })), true);
});
test('removed and recycled cards clear preview without overwriting YouTube updates', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  c.select('one'); c.$('#apply').click();
  const card = c.w.document.getElementById('one');
  card.querySelector('a').href = '/watch?v=recycled';
  card.querySelector('#video-title').textContent = 'Recycled title';
  c.tick();
  assert.equal(card.querySelector('#video-title').textContent, 'Recycled title');
  assert.equal(c.$('#apply').disabled, true);
  assert.equal(c.w.document.querySelector('[data-yt-thumbnail-preview]'), null);
  c.select('two'); c.$('#apply').click(); c.w.document.getElementById('two').remove(); c.tick();
  assert.equal(c.$('#restore').disabled, true);
});
test('navigation and toolbar toggling clean up and reopening creates only one panel', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  c.select('one'); c.$('#apply').click(); c.w.eval(source);
  assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Original title');
  assert.equal(c.w.document.querySelector('#yt-thumbnail-tester'), null);
  c.w.eval(source);
  assert.equal(c.w.document.querySelectorAll('#yt-thumbnail-tester').length, 1);
  c.w.document.dispatchEvent(new c.w.Event('yt-navigate-start'));
  assert.equal(c.w.document.querySelector('#yt-thumbnail-tester'), null);
});
test('valid uploads decode and save; invalid type, oversize and decode failures preserve the previous draft', async t => {
  for (const options of [{}, { decodeError: true }]) {
    const c = await setup(options); t.after(() => c.dom.window.close());
    const upload = async (blob) => {
      Object.defineProperty(c.$('#image'), 'files', { configurable: true, value: [blob] });
      c.$('#image').dispatchEvent(new c.w.Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 25));
    };
    await upload(new c.w.File(['text'], 'bad.svg', { type: 'image/svg+xml' }));
    assert.match(c.$('.status').textContent, /Choose a JPEG/);
    await upload({ size: 10 * 1024 * 1024 + 1, type: 'image/png' });
    assert.match(c.$('.status').textContent, /10 MB/);
    await upload(new c.w.File(['image bytes'], 'good.png', { type: 'image/png' }));
    if (options.decodeError) { assert.match(c.$('.status').textContent, /could not be decoded/); assert.equal(c.$('.preview').src, thumbnail); }
    else { assert.match(c.$('.status').textContent, /Thumbnail ready/); assert.ok(c.saved.length); assert.notEqual(c.saved.at(-1).draft.image, thumbnail); }
  }
});
test('storage errors are visible and do not prevent previews', async t => {
  const c = await setup({ saveError: true }); t.after(() => c.dom.window.close());
  c.select('one'); c.$('#apply').click(); await c.flush();
  assert.match(c.$('.status').textContent, /Couldn’t save/);
  assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'My new video');
  const d = await setup({ readError: true }); t.after(() => d.dom.window.close());
  assert.match(d.$('.status').textContent, /Couldn’t load/);
});
test('different tabs keep independent selection and preview state', async t => {
  const a = await setup(), b = await setup(); t.after(() => { a.dom.window.close(); b.dom.window.close(); });
  a.select('one'); a.$('#apply').click();
  assert.equal(b.w.document.querySelector('#one #video-title').textContent, 'Original title');
  assert.equal(b.$('#restore').disabled, true);
});
test('attached cover restores original positioning and isolation, preserving later page styles', async t => {
  for (const initial of [null, 'color: red; position: static !important; isolation: auto !important;', 'position: relative; isolation: isolate;']) {
    const c = await setup(); t.after(() => c.dom.window.close());
    const thumb = c.w.document.querySelector('#one ytd-thumbnail');
    if (initial !== null) thumb.setAttribute('style', initial);
    const before = thumb.style.cssText;
    c.select('one'); c.$('#apply').click();
    const overlay = thumb.querySelector('[data-yt-thumbnail-preview]');
    assert.equal(overlay.style.position, 'absolute');
    assert.equal(overlay.style.inset, '0');
    assert.equal(overlay.shadowRoot.querySelector('img').style.pointerEvents, 'none');
    thumb.getBoundingClientRect = () => { throw Error('Preview positioning must not read viewport coordinates'); };
    c.tick();
    c.$('#restore').click();
    assert.equal(thumb.style.cssText, before);
    assert.equal(thumb.hasAttribute('style'), initial !== null);
    assert.equal(overlay.isConnected, false);
  }
  const c = await setup(); t.after(() => c.dom.window.close());
  const thumb = c.w.document.querySelector('#one ytd-thumbnail');
  c.select('one'); c.$('#apply').click();
  thumb.style.setProperty('position', 'absolute', 'important');
  c.$('#restore').click();
  assert.equal(thumb.style.position, 'absolute');
  assert.equal(thumb.style.getPropertyPriority('position'), 'important');
});
test('YouTube title changes and removed overlays clean up the attached preview and styles', async t => {
  for (const reason of ['title', 'overlay']) {
    const c = await setup(); t.after(() => c.dom.window.close());
    const thumb = c.w.document.querySelector('#one ytd-thumbnail');
    c.select('one'); c.$('#apply').click();
    if (reason === 'title') c.w.document.querySelector('#one #video-title').textContent = 'Updated by YouTube';
    else thumb.querySelector('[data-yt-thumbnail-preview]').remove();
    c.tick();
    assert.equal(c.w.document.querySelector('[data-yt-thumbnail-preview]'), null);
    assert.equal(thumb.hasAttribute('style'), false);
    assert.equal(c.$('#apply').disabled, true);
    assert.equal(c.$('#restore').disabled, true);
    if (reason === 'title') assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Updated by YouTube');
  }
});
