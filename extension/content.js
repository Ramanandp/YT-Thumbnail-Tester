/* global browser */
(() => {
  "use strict";
  const KEY = "__ytThumbnailTester";
  if (globalThis[KEY]) { globalThis[KEY].close(); return; }
  const MAX_BYTES = 10 * 1024 * 1024;
  const CARD = "ytd-rich-item-renderer, ytd-rich-grid-media, yt-lockup-view-model, .yt-lockup-view-model, .ytLockupViewModelHost";
  const home = () => location.origin === "https://www.youtube.com" && location.pathname === "/";
  const host = document.createElement("div");
  host.id = "yt-thumbnail-tester";
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial}*{box-sizing:border-box} .panel{position:absolute;right:24px;top:84px;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 100px);overflow:auto;pointer-events:auto;background:#111b24;color:#f1f6fa;border:1px solid #33434f;border-radius:18px;padding:22px;box-shadow:0 18px 65px #0008;font:14px/1.5 system-ui,sans-serif}
    header{display:flex;align-items:center;justify-content:space-between}h1{font-size:18px;letter-spacing:-.4px;margin:0} .eyebrow{color:#61e4bd;font-size:10px;letter-spacing:2px;font-weight:700;margin:0 0 6px}p{color:#aabac7;margin:10px 0 18px}label{display:block;font-size:12px;font-weight:600;margin:16px 0 7px}input,textarea,button{font:inherit}input[type=file]{width:100%;font-size:12px;color:#aabac7}input::file-selector-button{background:#233340;color:#fff;border:0;border-radius:7px;padding:8px;cursor:pointer}textarea{width:100%;resize:vertical;min-height:76px;border:1px solid #405363;border-radius:9px;background:#0b141c;color:#fff;padding:10px}button{border:1px solid #405363;border-radius:9px;padding:10px 12px;background:#233340;color:#f1f6fa;cursor:pointer}button:hover{filter:brightness(1.15)}button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #61e4bd;outline-offset:3px}button:disabled{opacity:.4;cursor:default}.close{padding:3px 10px;font-size:20px;background:transparent;border:0}.primary{background:#61e4bd;border-color:#61e4bd;color:#08261d;font-weight:700;width:100%;margin-top:10px}.row{display:flex;gap:8px;margin-top:16px}.row button{flex:1}.preview{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#233340;margin-top:12px}.preview[hidden]{display:none}.status{margin:14px 0 0;min-height:40px;font-size:12px}.status[data-error=true]{color:#ff9c9c}.hint{font-size:11px;margin:7px 0;color:#91a5b6}.highlight{display:none;position:fixed;border:3px solid #61e4bd;border-radius:14px;box-shadow:0 0 0 2px #08261d;pointer-events:none}
  </style><section class="panel" aria-label="Thumbnail tester"><header><div><div class="eyebrow">YOUTUBE PREVIEW</div><h1>Thumbnail tester</h1></div><button class="close" aria-label="Close tester">×</button></header><p>See your next video in the home feed.</p><label for="image">Thumbnail</label><input id="image" type="file" accept="image/jpeg,image/png,image/webp"><div class="hint">JPEG, PNG or WebP · up to 10 MB</div><img class="preview" alt="Your thumbnail preview" hidden><label for="title">Video title</label><textarea id="title" placeholder="Write a title worth clicking…"></textarea><div class="row"><button id="select">Select video</button><button id="restore" disabled>Restore original</button></div><button id="apply" class="primary" disabled>Apply preview</button><p class="status" role="status" aria-live="polite">Upload a thumbnail and select a video to begin.</p><div class="hint">Saved on this device. Preview only.</div></section><div class="highlight"></div>`;
  document.documentElement.append(host);
  const $ = (selector) => root.querySelector(selector);
  // During selection, a real hit-testing layer receives the mouse gesture instead
  // of YouTube's links. Page handlers registered before our injection never see a
  // video as the event target, including handlers that navigate on pointerdown.
  const selectionLayer = document.createElement("div");
  selectionLayer.style.cssText = "position:fixed;inset:0;pointer-events:auto;cursor:crosshair;display:none;z-index:0;";
  selectionLayer.setAttribute("aria-label", "Choose a video card; Escape cancels");
  root.prepend(selectionLayer);
  $(".panel").style.zIndex = "2";
  $(".highlight").style.zIndex = "1";
  const title = $("#title"), file = $("#image"), preview = $(".preview"), cover = document.createElement("img"), highlight = $(".highlight");
  // This overlay lives inside the video thumbnail, rather than the fixed panel.
  // Its containing block handles scrolling and resizing without JS coordinates.
  const coverHost = document.createElement("span");
  coverHost.setAttribute("data-yt-thumbnail-preview", "");
  coverHost.setAttribute("aria-hidden", "true");
  coverHost.style.cssText = "all:initial;position:absolute!important;inset:0!important;display:block!important;pointer-events:none!important;z-index:2147483646!important;overflow:hidden!important;border-radius:inherit;";
  const coverRoot = coverHost.attachShadow({ mode: "open" });
  cover.style.cssText = "all:initial;position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit;";
  coverRoot.append(cover);
  let image = "", selected = null, applied = null, selecting = false, hovered = null, closed = false, imageVersion = 0, saveTimer, frame;
  let saveQueue = Promise.resolve();
  const status = (message, error = false) => { $(".status").textContent = message; $(".status").dataset.error = String(error); };
  function videoUrl(anchor) {
    try {
      const url = new URL(anchor.href, location.href);
      return url.origin === location.origin && url.pathname === "/watch" && url.searchParams.get("v") && !url.searchParams.has("list") ? url : null;
    } catch (_) { return null; }
  }
  function parts(card) {
    const excluded = "ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer, ytd-rich-shelf-renderer, ytd-reel-item-renderer";
    if (!card || !card.isConnected || card.closest(excluded) || card.querySelector(excluded) || card.querySelector('a[href*="/shorts/"]')) return null;
    const links = [...card.querySelectorAll('a[href]')].filter(a => videoUrl(a));
    const videos = new Set(links.map(a => videoUrl(a).searchParams.get("v")));
    // Never treat a shelf or the entire feed as a single fallback card.
    if (videos.size !== 1) return null;
    const thumbnailLink = links.find(a => a.querySelector("img, yt-image, yt-thumbnail-view-model"));
    const thumb = card.querySelector("ytd-thumbnail, .yt-lockup-view-model__content-image, .ytThumbnailViewModelHost, .yt-thumbnail-view-model, yt-thumbnail-view-model")
      || thumbnailLink;
    const headingSelectors = "#video-title, .yt-lockup-metadata-view-model__title-text, .yt-lockup-metadata-view-model__title, .ytLockupMetadataViewModelTitle";
    let heading = card.querySelector(headingSelectors);
    // Keep the title's own link intact when its styled container is a heading.
    if (heading) heading = heading.querySelector("a[href]") || heading;
    if (!heading) heading = links.find(a => a !== thumbnailLink && !thumb?.contains(a) && a.textContent.trim() && !a.querySelector("img"));
    if (!heading) {
      const semanticHeading = card.querySelector("h3, h4, [role=heading]");
      if (semanticHeading?.textContent.trim()) heading = semanticHeading.querySelector("a[href]") || semanticHeading;
    }
    if (!thumb || !heading || thumb.contains(heading)) return null;
    return { card, heading, thumb, video: [...videos][0] };
  }
  const valid = (p) => { const current = p && parts(p.card); return current && current.video === p.video && current.heading === p.heading && current.thumb === p.thumb; };
  function buttons() { $("#apply").disabled = !image || !title.value.trim() || !valid(selected); $("#restore").disabled = !applied; }
  function position(element, target) {
    const r = target.getBoundingClientRect();
    Object.assign(element.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
  function render() {
    if (closed) return;
    if (!home()) { close(); return; }
    if (selected && !valid(selected)) { restore(); selected = null; status("That video changed or was removed. Select another video."); buttons(); }
    if (applied) {
      if (applied.heading.textContent !== applied.previewTitle || coverHost.parentElement !== applied.thumb) { restore(); selected = null; status("YouTube updated this card. Select a video again."); buttons(); }
    }
    const target = selecting ? hovered : selected?.card !== applied?.card ? selected?.card : null;
    if (target?.isConnected) position(highlight, target); else highlight.style.display = "none";
    frame = requestAnimationFrame(render);
  }
  function restore() {
    coverHost.remove();
    if (applied) {
      for (const change of applied.styleChanges) {
        const style = applied.thumb.style;
        // Preserve any subsequent style updates made by YouTube itself.
        if (style.getPropertyValue(change.name) !== change.applied || style.getPropertyPriority(change.name) !== "important") continue;
        if (change.value) style.setProperty(change.name, change.value, change.priority);
        else style.removeProperty(change.name);
      }
      if (!applied.hadStyleAttribute && !applied.thumb.getAttribute("style")) applied.thumb.removeAttribute("style");
    }
    if (applied && valid(applied) && applied.heading.textContent === applied.previewTitle) {
      applied.heading.replaceChildren(...applied.nodes);
      for (const [name, value] of Object.entries(applied.attributes)) {
        if (value === null) applied.heading.removeAttribute(name); else applied.heading.setAttribute(name, value);
      }
    }
    applied = null; buttons();
  }
  function attachCover() {
    const thumb = applied.thumb;
    applied.hadStyleAttribute = thumb.hasAttribute("style");
    const computed = getComputedStyle(thumb);
    for (const [name, value, needed] of [["position", "relative", !computed.position || computed.position === "static"], ["isolation", "isolate", computed.isolation !== "isolate"]]) {
      if (!needed) continue;
      applied.styleChanges.push({ name, value: thumb.style.getPropertyValue(name), priority: thumb.style.getPropertyPriority(name), applied: value });
      thumb.style.setProperty(name, value, "important");
    }
    const originalImage = thumb.querySelector("img");
    const radius = computed.borderRadius;
    coverHost.style.borderRadius = radius && radius !== "0px" ? "inherit" : originalImage ? getComputedStyle(originalImage).borderRadius || "inherit" : "inherit";
    cover.src = image;
    thumb.append(coverHost);
  }
  function cancelSelection() { selecting = false; hovered = null; selectionLayer.style.display = "none"; $("#select").textContent = "Select video"; }
  function cardAtPointer(event) {
    // Hide our host only for synchronous hit testing. This also handles browsers
    // retargeting the shadow event to the host rather than exposing the layer.
    // Restoring it before returning keeps YouTube shielded from the gesture.
    let targets = event.composedPath();
    if (targets.includes(host)) {
      const visibility = host.style.visibility;
      try { host.style.visibility = "hidden"; targets = document.elementsFromPoint(event.clientX, event.clientY); }
      finally { host.style.visibility = visibility; }
    }
    for (const target of targets) {
      if (!(target instanceof Element) || target === host) continue;
      let card = target.closest(CARD);
      while (card) {
        const p = parts(card);
        if (p) return p;
        card = card.parentElement?.closest(CARD);
      }
      // YouTube experiments can rename renderer classes. Identify a bounded
      // video card by its thumbnail, title, and a single watch-video identity.
      let ancestor = target;
      for (let depth = 0; ancestor && depth < 7; depth++, ancestor = ancestor.parentElement) {
        if (ancestor.matches("main, ytd-rich-grid-renderer, ytd-browse, body, html")) break;
        const p = parts(ancestor);
        if (p) return p;
      }
    }
    return null;
  }
  function onPointer(event) { if (selecting) hovered = cardAtPointer(event)?.card || null; }
  function blockGesture(event) {
    if (!selecting || event.composedPath().includes($(".panel"))) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function onClick(event) {
    if (!selecting || event.composedPath().includes($(".panel"))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const p = cardAtPointer(event);
    if (!p) { status("This is not a supported video card. Choose a standard home-feed video, or press Escape.", true); return; }
    selected = p; cancelSelection(); status("Video selected. Apply your thumbnail and title."); buttons();
  }
  function onKey(event) { if (selecting && event.key === "Escape") { event.preventDefault(); cancelSelection(); status("Selection cancelled."); } }
  function save() {
    clearTimeout(saveTimer);
    const draft = { image, title: title.value };
    saveQueue = saveQueue.then(() => browser.storage.local.set({ draft })).catch(() => { if (!closed) status("Couldn’t save your draft. The current preview still works.", true); });
  }
  function close() {
    if (closed) return;
    save(); restore(); closed = true; cancelAnimationFrame(frame);
    document.removeEventListener("pointermove", onPointer, true);
    window.removeEventListener("click", onClick, true);
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick"]) window.removeEventListener(type, blockGesture, true);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("yt-navigate-start", onNavigate);
    host.remove(); delete globalThis[KEY];
  }
  function onNavigate() { close(); }
  globalThis[KEY] = { close };
  $(".close").addEventListener("click", close);
  $("#select").addEventListener("click", () => {
    if (selecting) { cancelSelection(); status("Selection cancelled."); return; }
    selecting = true; hovered = null; selectionLayer.style.display = "block";
    $("#select").textContent = "Cancel selection";
    status("Click a standard video card. Press Escape to cancel.");
  });
  $("#restore").addEventListener("click", () => { restore(); status("Original thumbnail and title restored."); });
  $("#apply").addEventListener("click", () => {
    if (!image || !title.value.trim() || !valid(selected)) { status("Upload a thumbnail, enter a title, and select a video.", true); return; }
    restore();
    applied = { ...selected, nodes: [...selected.heading.childNodes], attributes: Object.fromEntries(["title", "aria-label"].map(a => [a, selected.heading.getAttribute(a)])), previewTitle: title.value.trim(), styleChanges: [] };
    applied.heading.textContent = applied.previewTitle;
    applied.heading.setAttribute("title", applied.previewTitle); applied.heading.setAttribute("aria-label", applied.previewTitle);
    cancelSelection(); highlight.style.display = "none";
    attachCover(); save(); buttons(); status("Preview applied. Your video is now in the feed.");
  });
  title.addEventListener("input", () => { buttons(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); });
  file.addEventListener("change", async () => {
    const version = ++imageVersion, upload = file.files[0];
    if (!upload) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(upload.type) || upload.size > MAX_BYTES || !upload.size) { status("Choose a JPEG, PNG or WebP image up to 10 MB.", true); file.value = ""; return; }
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(upload); });
      await new Promise((resolve, reject) => { const decoded = new Image(); decoded.onload = () => decoded.naturalWidth ? resolve() : reject(); decoded.onerror = reject; decoded.src = data; });
      if (closed || version !== imageVersion) return;
      image = data; preview.src = data; preview.hidden = false; buttons(); save(); status("Thumbnail ready. Select a video and apply your preview.");
    } catch (_) { if (!closed && version === imageVersion) status("This file could not be decoded as an image. Choose another file.", true); }
  });
  let edited = false;
  root.addEventListener("input", () => { edited = true; });
  file.addEventListener("change", () => { edited = true; });
  browser.storage.local.get("draft").then(({ draft }) => {
    if (closed || edited || !draft) return;
    if (typeof draft.title === "string") title.value = draft.title;
    if (typeof draft.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(draft.image) && draft.image.length <= 14 * 1024 * 1024) { image = draft.image; preview.src = image; preview.hidden = false; }
    buttons();
  }).catch(() => { if (!closed) status("Couldn’t load your saved draft. You can still create a preview.", true); });
  document.addEventListener("pointermove", onPointer, true);
  window.addEventListener("click", onClick, true);
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick"]) window.addEventListener(type, blockGesture, true);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("yt-navigate-start", onNavigate);
  frame = requestAnimationFrame(render);
})();
