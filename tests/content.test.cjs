const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('extension/content.js', 'utf8');
const thumbnail = 'data:image/png;base64,aGVsbG8=';
const fixture = `<ytd-rich-item-renderer id="one"><ytd-thumbnail><a href="/watch?v=one"><img src="original.jpg"></a></ytd-thumbnail><a id="video-title" title="Original"><span>Original title</span></a><a class="channel-name" href="/@original" title="Original channel"><span>Original channel</span></a><a id="avatar-link" href="/@original"><img src="avatar.jpg" srcset="avatar-2x.jpg 2x" sizes="36px" alt="Original channel" style="border-radius: 8px;"></a><div>10K views</div></ytd-rich-item-renderer>
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
  const select = id => { if ($('.panel').hidden) $('#edit-mode').click(); $('#select').click(); const card = w.document.getElementById(id); return card.querySelector('a').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); };
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
  c.$('#preview-toggle').click();
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
  c.$('#preview-toggle').click();
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
    assert.equal(c.$('#preview-toggle').disabled, false);
    c.$('#preview-toggle').click();
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
  assert.equal(c.$('#preview-toggle').disabled, true);
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
  assert.equal(b.$('#preview-toggle').disabled, true);
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
    c.$('#preview-toggle').click();
    assert.equal(thumb.style.cssText, before);
    assert.equal(thumb.hasAttribute('style'), initial !== null);
    assert.equal(overlay.isConnected, false);
  }
  const c = await setup(); t.after(() => c.dom.window.close());
  const thumb = c.w.document.querySelector('#one ytd-thumbnail');
  c.select('one'); c.$('#apply').click();
  thumb.style.setProperty('position', 'absolute', 'important');
  c.$('#preview-toggle').click();
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
    assert.equal(c.$('#preview-toggle').disabled, true);
    if (reason === 'title') assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Updated by YouTube');
  }
});
test('channel name and default avatar preview apply together and restore original nodes and image attributes', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const name = c.w.document.querySelector('#one .channel-name'), originalNode = name.firstChild;
  const avatar = c.w.document.querySelector('#one #avatar-link img');
  const attributes = () => Object.fromEntries([...avatar.attributes].map(a => [a.name, a.value]).sort());
  const originalAvatar = attributes();
  c.$('#channel-name').value = '  @eridium  ';
  c.$('#channel-name').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  const svg = new c.w.DOMParser().parseFromString(decodeURIComponent(c.$('#channel-preview').src.split(',')[1]), 'image/svg+xml');
  assert.equal(svg.querySelector('text').textContent, 'E');
  assert.equal(svg.querySelector('rect').getAttribute('fill'), '#5364b8');
  c.select('one'); c.$('#apply').click(); c.tick();
  assert.equal(name.textContent, '@eridium');
  assert.equal(name.getAttribute('href'), '/@original');
  assert.equal(avatar.getAttribute('src'), c.$('#channel-preview').src);
  assert.equal(avatar.hasAttribute('srcset'), false);
  assert.equal(c.$('.highlight').style.display, 'none');
  await c.flush(); assert.equal(c.saved.at(-1).draft.channelName, '  @eridium  ');
  c.$('#preview-toggle').click();
  assert.equal(name.firstChild, originalNode);
  assert.equal(name.getAttribute('title'), 'Original channel');
  assert.equal(name.hasAttribute('aria-label'), false);
  assert.deepEqual(attributes(), originalAvatar);
});
test('avatar uploads are validated, saved, and can be reset to a safe capitalized initial', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const upload = async file => {
    if (c.$('.panel').hidden) c.$('#edit-mode').click();
    Object.defineProperty(c.$('#channel-image'), 'files', { configurable: true, value: [file] });
    c.$('#channel-image').dispatchEvent(new c.w.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 30));
  };
  await upload(new c.w.File(['image'], 'avatar.webp', { type: 'image/webp' }));
  assert.match(c.$('#channel-preview').src, /^data:image\/webp;base64,/);
  const src = c.$('#channel-preview').src;
  c.select('one'); c.$('#apply').click();
  assert.equal(c.w.document.querySelector('#one #avatar-link img').src, src);
  await upload(new c.w.File(['svg'], 'bad.svg', { type: 'image/svg+xml' }));
  assert.equal(c.$('#channel-preview').src, src);
  assert.match(c.$('.status').textContent, /Choose a JPEG/);
  await upload({ type: 'image/png', size: 10 * 1024 * 1024 + 1 });
  assert.match(c.$('.status').textContent, /10 MB/);
  c.$('#channel-name').value = '<script>';
  c.$('#channel-name').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  c.$('#default-avatar').click(); await c.flush();
  assert.equal(c.saved.at(-1).draft.channelImage, '');
  const svg = new c.w.DOMParser().parseFromString(decodeURIComponent(c.$('#channel-preview').src.split(',')[1]), 'image/svg+xml');
  assert.equal(svg.querySelector('text').textContent, '<');
  assert.equal(svg.querySelector('script'), null);
  // Editing a draft alone leaves the applied image intact until Apply is clicked.
  assert.equal(c.w.document.querySelector('#one #avatar-link img').src, src);
  c.$('#apply').click();
  assert.equal(c.w.document.querySelector('#one #avatar-link img').src, c.$('#channel-preview').src);
});
test('channel drafts reopen without applying, support older drafts, and preserve YouTube updates', async t => {
  const c = await setup({ draft: { image: thumbnail, title: 'Draft', channelName: 'alice', channelImage: thumbnail } }); t.after(() => c.dom.window.close());
  assert.equal(c.$('#channel-name').value, 'alice');
  assert.equal(c.$('#channel-preview').src, thumbnail);
  const name = c.w.document.querySelector('#one .channel-name'), avatar = c.w.document.querySelector('#one #avatar-link img');
  assert.equal(name.textContent, 'Original channel');
  c.select('one'); c.$('#apply').click();
  avatar.setAttribute('src', 'updated-by-youtube.jpg'); c.tick();
  assert.equal(avatar.getAttribute('src'), 'updated-by-youtube.jpg');
  assert.equal(name.textContent, 'Original channel');
  assert.equal(c.$('#preview-toggle').disabled, true);
  const old = await setup(); t.after(() => old.dom.window.close());
  assert.equal(old.$('#channel-name').value, 'Your channel');
  assert.ok(old.$('#channel-preview').src.startsWith('data:image/svg+xml'));
  old.select('one'); old.$('#apply').click();
  old.w.document.querySelector('#one .channel-name').textContent = 'Updated channel'; old.tick();
  assert.equal(old.w.document.querySelector('#one .channel-name').textContent, 'Updated channel');
  assert.equal(old.w.document.querySelector('#one #avatar-link img').getAttribute('src'), 'avatar.jpg');
});
test('apply collapses Edit Mode and repeated toggles preserve every original field and the target', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const card = c.w.document.getElementById('one');
  const originalTitle = card.querySelector('#video-title').firstChild;
  const originalName = card.querySelector('.channel-name').firstChild;
  assert.equal(c.$('.panel').hidden, false);
  assert.equal(c.$('.preview-bar').hidden, true);
  assert.equal(c.$('#preview-toggle').getAttribute('role'), 'switch');
  assert.equal(c.$('#restore'), null);
  c.$('#channel-name').value = 'eridium';
  c.$('#channel-name').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  c.select('one'); c.$('#apply').click();
  assert.equal(c.$('.panel').hidden, true);
  assert.equal(c.$('.preview-bar').hidden, false);
  assert.equal(c.root.activeElement, c.$('#edit-mode'));
  for (let n = 0; n < 4; n++) {
    assert.equal(c.$('#preview-toggle').getAttribute('aria-checked'), 'true');
    assert.equal(c.$('#preview-state').textContent, 'On');
    assert.equal(card.querySelector('.channel-name').textContent, 'eridium');
    assert.equal(card.querySelector('#video-title').textContent, 'My new video');
    c.$('#preview-toggle').click(); c.tick();
    assert.equal(c.$('#preview-toggle').disabled, false);
    assert.equal(c.$('#preview-toggle').getAttribute('aria-checked'), 'false');
    assert.equal(c.$('#preview-state').textContent, 'Off');
    assert.equal(card.querySelector('#video-title').textContent, 'Original title');
    assert.equal(card.querySelector('.channel-name').textContent, 'Original channel');
    assert.equal(card.querySelector('#avatar-link img').getAttribute('srcset'), 'avatar-2x.jpg 2x');
    assert.equal(c.w.document.querySelector('[data-yt-thumbnail-preview]'), null);
    assert.equal(c.$('.highlight').style.display, 'none');
    c.$('#preview-toggle').click(); c.tick();
    assert.equal(c.$('.highlight').style.display, 'none');
    assert.equal(card.querySelector('#avatar-link img').getAttribute('src'), c.$('#channel-preview').src);
  }
  c.$('.preview-bar .close').click();
  assert.equal(card.querySelector('#video-title').textContent, 'Original title');
  assert.equal(card.querySelector('.channel-name').textContent, 'Original channel');
  assert.equal(card.querySelector('#avatar-link img').getAttribute('src'), 'avatar.jpg');
  assert.equal(c.w.document.querySelector('#yt-thumbnail-tester'), null);
  assert.equal(card.querySelector('#video-title').firstChild, originalTitle);
  assert.equal(card.querySelector('.channel-name').firstChild, originalName);
});
test('returning to editing preserves On/Off and draft edits do not alter the applied configuration', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  const heading = c.w.document.querySelector('#one #video-title');
  c.select('one'); c.$('#apply').click();
  c.$('#edit-mode').click();
  assert.equal(c.$('.panel').hidden, false);
  assert.equal(c.$('#preview-state').textContent, 'On');
  assert.equal(heading.textContent, 'My new video');
  c.$('#title').value = 'New draft title'; c.$('#title').dispatchEvent(new c.w.Event('input', { bubbles: true }));
  c.$('#channel-name').value = 'Different channel';
  assert.equal(heading.textContent, 'My new video');
  // Even if a draft changes, the preview switch must use the applied snapshot.
  c.$('#preview-toggle').click(); c.$('#preview-toggle').click();
  assert.equal(heading.textContent, 'My new video');
  assert.equal(c.w.document.querySelector('#one .channel-name').textContent, 'Your channel');
  c.$('#apply').click();
  assert.equal(heading.textContent, 'New draft title');
  assert.equal(c.w.document.querySelector('#one .channel-name').textContent, 'Different channel');
  c.$('#preview-toggle').click(); c.$('#edit-mode').click();
  assert.equal(c.$('#preview-state').textContent, 'Off');
  assert.equal(heading.textContent, 'Original title');
  assert.equal(c.$('#title').value, 'New draft title');
  c.$('#apply').click();
  assert.equal(c.$('.panel').hidden, true);
  assert.equal(c.$('#preview-state').textContent, 'On');
});
test('recycling the target while Preview is off returns to editing and disables the switch', async t => {
  const c = await setup(); t.after(() => c.dom.window.close());
  c.select('one'); c.$('#apply').click(); c.$('#preview-toggle').click();
  c.w.document.querySelector('#one ytd-thumbnail a').href = '/watch?v=recycled';
  c.w.document.querySelector('#one #video-title').textContent = 'Recycled video';
  c.tick();
  assert.equal(c.$('.panel').hidden, false);
  assert.equal(c.$('.preview-bar').hidden, true);
  assert.equal(c.$('#preview-toggle').disabled, true);
  assert.equal(c.$('#apply').disabled, true);
  assert.match(c.$('.status').textContent, /changed or was removed/);
  assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Recycled video');
});
test('closing or navigating while off leaves original content and reopens in editing', async t => {
  for (const action of ['close', 'navigate']) {
    const c = await setup(); t.after(() => c.dom.window.close());
    c.select('one'); c.$('#apply').click(); c.$('#preview-toggle').click();
    if (action === 'close') c.$('.preview-bar .close').click();
    else c.w.document.dispatchEvent(new c.w.Event('yt-navigate-start'));
    assert.equal(c.w.document.querySelector('#yt-thumbnail-tester'), null);
    assert.equal(c.w.document.querySelector('#one #video-title').textContent, 'Original title');
    c.w.eval(source); await c.flush();
    const root = c.w.document.querySelector('#yt-thumbnail-tester').shadowRoot;
    assert.equal(root.querySelector('.panel').hidden, false);
    assert.equal(root.querySelector('.preview-bar').hidden, true);
    assert.equal(root.querySelector('#preview-toggle').disabled, true);
  }
});
