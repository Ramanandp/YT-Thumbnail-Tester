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
    :host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}
    .panel,.preview-bar{position:absolute;right:24px;top:84px;max-width:calc(100vw - 24px);pointer-events:auto;background:#111b24;color:#f1f6fa;border:1px solid #33434f;box-shadow:0 18px 65px #0008;font:14px/1.5 system-ui,sans-serif;z-index:2}
    .panel{width:360px;max-height:calc(100vh - 100px);border-radius:18px;display:flex;flex-direction:column;overflow:hidden}
    header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #293a47;flex-shrink:0}h1{font-size:18px;letter-spacing:-.4px;margin:0}.eyebrow{color:#61e4bd;font-size:10px;letter-spacing:2px;font-weight:700;margin:0 0 4px}
    .editor-body{padding:0 20px 12px;overflow:auto;min-height:0}fieldset{border:0;border-bottom:1px solid #293a47;margin:0;padding:16px 0 20px;min-width:0}fieldset:last-child{border:0}legend{float:left;width:100%;font-size:12px;font-weight:700;letter-spacing:1px;color:#61e4bd;margin-bottom:10px}legend+*{clear:both}
    label{display:block;font-size:12px;font-weight:600;margin:12px 0 7px}input,textarea,button{font:inherit}input[type=file]{width:100%;font-size:12px;color:#aabac7}input::file-selector-button{background:#233340;color:#fff;border:0;border-radius:7px;padding:8px;cursor:pointer}input[type=text],textarea{width:100%;border:1px solid #405363;border-radius:9px;background:#0b141c;color:#fff;padding:10px}textarea{resize:vertical;min-height:70px}
    button{border:1px solid #405363;border-radius:9px;padding:9px 12px;background:#233340;color:#f1f6fa;cursor:pointer}button:hover{filter:brightness(1.15)}button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #61e4bd;outline-offset:3px}button:disabled{opacity:.4;cursor:default}.close{padding:2px 8px;font-size:20px;background:transparent;border:0}.primary{background:#61e4bd;border-color:#61e4bd;color:#08261d;font-weight:700;width:100%}
    footer{padding:14px 20px;background:#111b24;border-top:1px solid #293a47;flex-shrink:0}.preview{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#233340;margin-top:12px}.status{margin:10px 0 0;font-size:12px;color:#aabac7}.status[data-error=true]{color:#ff9c9c}.hint{font-size:11px;margin:7px 0;color:#91a5b6}.avatar-row{display:flex;align-items:center;gap:12px;margin-top:12px}#channel-preview{display:block;width:40px;height:40px;border-radius:50%;object-fit:cover}#target-status{font-size:12px;color:#aabac7;margin:0 0 10px;overflow-wrap:anywhere}
    .preview-bar{border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:max-content}.preview-bar .close{margin-left:2px}#preview-toggle{position:relative;display:flex;align-items:center;gap:8px;background:transparent;border-color:transparent;padding:8px}#preview-toggle::before{content:'';width:28px;height:16px;border-radius:20px;background:#526371}#preview-toggle::after{content:'';position:absolute;left:11px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;background:#fff}#preview-toggle[aria-checked=true]::before{background:#61e4bd}#preview-toggle[aria-checked=true]::after{left:23px;background:#08261d}#preview-state{font-weight:700;min-width:20px}#preview-warning{flex-basis:100%;max-width:260px;font-size:11px;color:#ffcc99;padding:0 6px}
    .highlight{display:none;position:fixed;border:3px solid #61e4bd;border-radius:14px;box-shadow:0 0 0 2px #08261d;pointer-events:none}
  </style>
  <section class="panel" aria-label="Edit Mode">
    <header><div><div class="eyebrow">THUMBNAIL TESTER</div><h1>Edit Mode</h1></div><button class="close" aria-label="Close tester">×</button></header>
    <div class="editor-body">
      <fieldset><legend>Video</legend><label for="image">Thumbnail</label><input id="image" type="file" accept="image/jpeg,image/png,image/webp"><div class="hint">JPEG, PNG or WebP · up to 10 MB</div><img class="preview" alt="Your thumbnail preview" hidden><label for="title">Video title</label><textarea id="title" placeholder="Write a title worth clicking…"></textarea></fieldset>
      <fieldset><legend>Channel</legend><label for="channel-name">Username / channel name</label><input id="channel-name" type="text" value="Your channel"><label for="channel-image">Channel image (optional)</label><input id="channel-image" type="file" accept="image/jpeg,image/png,image/webp"><div class="hint">JPEG, PNG or WebP · up to 10 MB</div><div class="avatar-row"><img id="channel-preview" alt="Channel image preview"><button id="default-avatar" type="button" disabled>Use default image</button></div></fieldset>
      <fieldset><legend>Target video</legend><p id="target-status" aria-live="polite">No video selected</p><button id="select">Select video</button></fieldset>
    </div>
    <footer><button id="apply" class="primary" disabled>Apply &amp; preview</button><p class="status" role="status" aria-live="polite">Upload a thumbnail and select a video to begin.</p><div class="hint">Saved on this device. Preview only.</div></footer>
  </section>
  <section class="preview-bar" aria-label="Preview Mode" hidden><button id="edit-mode">Edit Mode</button><button id="preview-toggle" role="switch" aria-label="Preview" aria-checked="false" disabled>Preview <span id="preview-state">Off</span></button><button class="close" aria-label="Close tester">×</button><span id="preview-warning" role="status" aria-live="polite" hidden></span></section>
  <div class="highlight"></div>`;
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
  const channelName = $("#channel-name"), channelFile = $("#channel-image"), channelPreview = $("#channel-preview");
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
  let channelImage = "", channelImageVersion = 0;
  let mode = "edit", previewTarget = null, lastPreview = null;
  let saveQueue = Promise.resolve();
  const status = (message, error = false) => {
    $(".status").textContent = message; $(".status").dataset.error = String(error);
    if (mode === "preview" && error) previewWarning(message);
  };
  function previewWarning(message = "") { $("#preview-warning").textContent = message; $("#preview-warning").hidden = !message; }
  function setMode(next, focus = true) {
    mode = next; cancelSelection(); highlight.style.display = "none";
    $(".panel").hidden = mode !== "edit"; $(".preview-bar").hidden = mode !== "preview";
    if (focus) (mode === "preview" ? $("#edit-mode") : $("#title")).focus({ preventScroll: true });
  }
  function defaultAvatar(name) {
    const normalized = name.trim().replace(/^@/, "").trim() || "Your channel";
    const letter = [...normalized][0].toLocaleUpperCase();
    const escaped = letter.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#5364b8"/><text x="64" y="64" dy=".35em" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" fill="white">${escaped}</text></svg>`)}`;
  }
  function updateChannelPreview() { channelPreview.src = channelImage || defaultAvatar(channelName.value); $("#default-avatar").disabled = !channelImage; }
  function channelParts(card) {
    const links = [...card.querySelectorAll("a[href]")].filter(a => {
      try { const url = new URL(a.href, location.href); return url.origin === location.origin && /^\/(?:@[^/]+|channel\/|c\/|user\/)/.test(url.pathname); } catch (_) { return false; }
    });
    const name = links.find(a => a.textContent.trim() && !a.querySelector("img"))
      || card.querySelector("ytd-channel-name #text, #channel-name #text, .yt-content-metadata-view-model__metadata-text, .ytContentMetadataViewModelMetadataText");
    const avatar = card.querySelector("#avatar img, #avatar-link img, yt-avatar-shape img, .yt-avatar-shape img, .ytAvatarShapeHost img")
      || links.map(a => a.querySelector("img")).find(Boolean);
    return { name, avatar };
  }
  const snapshotAttributes = (element, names) => Object.fromEntries(names.map(name => [name, element.getAttribute(name)]));
  function restoreAttributes(element, attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
  }
  function applyChannel(config) {
    const { name, avatar } = channelParts(applied.card);
    const username = config.channelName;
    if (name) {
      applied.channel = { element: name, nodes: [...name.childNodes], attributes: snapshotAttributes(name, ["title", "aria-label"]), text: username };
      name.textContent = username; name.setAttribute("title", username); name.setAttribute("aria-label", username);
    }
    if (avatar) {
      applied.avatar = { element: avatar, attributes: snapshotAttributes(avatar, ["src", "srcset", "sizes", "alt", "title"]), src: config.channelImage || defaultAvatar(username), styles: [], hadStyle: avatar.hasAttribute("style") };
      for (const [property, value] of [["object-fit", "cover"], ["border-radius", "50%"]]) {
        applied.avatar.styles.push({ property, value: avatar.style.getPropertyValue(property), priority: avatar.style.getPropertyPriority(property), applied: value });
        avatar.style.setProperty(property, value, "important");
      }
      avatar.removeAttribute("srcset"); avatar.removeAttribute("sizes");
      avatar.setAttribute("src", applied.avatar.src); avatar.setAttribute("alt", username); avatar.setAttribute("title", username);
    }
    return Boolean(name && avatar);
  }
  updateChannelPreview();
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
  function buttons() {
    $("#apply").disabled = !image || !title.value.trim() || !valid(selected);
    $("#preview-toggle").disabled = !lastPreview || !valid(previewTarget);
    $("#preview-toggle").setAttribute("aria-checked", String(Boolean(applied)));
    $("#preview-state").textContent = applied ? "On" : "Off";
    $("#select").textContent = selecting ? "Cancel selection" : selected ? "Change video" : "Select video";
    $("#target-status").textContent = selected ? `Selected: ${selected.label || selected.heading.textContent}` : "No video selected";
  }
  function invalidateTarget(message) {
    restore(); selected = null; previewTarget = null; lastPreview = null;
    previewWarning(); setMode("edit"); status(message, true); buttons();
  }
  function position(element, target) {
    const r = target.getBoundingClientRect();
    Object.assign(element.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
  function render() {
    if (closed) return;
    if (!home()) { close(); return; }
    if ((selected && !valid(selected)) || (previewTarget && !valid(previewTarget))) invalidateTarget("That video changed or was removed. Select another video.");
    if (applied) {
      const channelChanged = applied.channel && (!applied.card.contains(applied.channel.element) || applied.channel.element.textContent !== applied.channel.text);
      const avatarChanged = applied.avatar && (!applied.card.contains(applied.avatar.element) || applied.avatar.element.getAttribute("src") !== applied.avatar.src);
      if (!valid(applied) || applied.heading.textContent !== applied.previewTitle || coverHost.parentElement !== applied.thumb || channelChanged || avatarChanged) invalidateTarget("YouTube updated this card. Select a video again.");
    }
    const target = mode === "edit" ? (selecting ? hovered : selected?.card !== applied?.card ? selected?.card : null) : null;
    if (target?.isConnected) position(highlight, target); else highlight.style.display = "none";
    frame = requestAnimationFrame(render);
  }
  function restore() {
    coverHost.remove();
    if (applied?.avatar) {
      const avatar = applied.avatar;
      if (valid(applied) && applied.card.contains(avatar.element) && avatar.element.getAttribute("src") === avatar.src) restoreAttributes(avatar.element, avatar.attributes);
      for (const change of avatar.styles) {
        const style = avatar.element.style;
        if (style.getPropertyValue(change.property) !== change.applied || style.getPropertyPriority(change.property) !== "important") continue;
        if (change.value) style.setProperty(change.property, change.value, change.priority); else style.removeProperty(change.property);
      }
      if (!avatar.hadStyle && !avatar.element.getAttribute("style")) avatar.element.removeAttribute("style");
    }
    if (applied?.channel && valid(applied) && applied.card.contains(applied.channel.element) && applied.channel.element.textContent === applied.channel.text) {
      applied.channel.element.replaceChildren(...applied.channel.nodes);
      restoreAttributes(applied.channel.element, applied.channel.attributes);
    }
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
  function attachCover(config) {
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
    cover.src = config.image;
    thumb.append(coverHost);
  }
  function cancelSelection() { selecting = false; hovered = null; selectionLayer.style.display = "none"; $("#select").textContent = selected ? "Change video" : "Select video"; }
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
    selected = { ...p, label: p.heading.textContent }; cancelSelection(); status("Video selected. Apply your thumbnail and title."); buttons();
  }
  function onKey(event) { if (selecting && event.key === "Escape") { event.preventDefault(); cancelSelection(); status("Selection cancelled."); } }
  function save() {
    clearTimeout(saveTimer);
    const draft = { image, title: title.value, channelName: channelName.value, channelImage };
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
  root.querySelectorAll(".close").forEach(button => button.addEventListener("click", close));
  $("#edit-mode").addEventListener("click", () => { setMode("edit"); status("Edit your draft, then apply to update the preview."); buttons(); });
  $("#select").addEventListener("click", () => {
    if (mode !== "edit") return;
    if (selecting) { cancelSelection(); status("Selection cancelled."); return; }
    selecting = true; hovered = null; selectionLayer.style.display = "block";
    $("#select").textContent = "Cancel selection";
    status("Click a standard video card. Press Escape to cancel.");
  });
  function applyPreview(target, config) {
    restore();
    applied = { ...target, nodes: [...target.heading.childNodes], attributes: snapshotAttributes(target.heading, ["title", "aria-label"]), previewTitle: config.title, styleChanges: [] };
    applied.heading.textContent = applied.previewTitle;
    applied.heading.setAttribute("title", applied.previewTitle); applied.heading.setAttribute("aria-label", applied.previewTitle);
    cancelSelection(); highlight.style.display = "none";
    attachCover(config); const completeChannel = applyChannel(config); buttons();
    previewWarning(completeChannel ? "" : "This card’s channel name or image could not be found.");
    status(completeChannel ? "Preview applied, including your channel name and image." : "Preview applied. This card’s channel name or image could not be found.");
  }
  $("#preview-toggle").addEventListener("click", () => {
    if (!lastPreview || !valid(previewTarget)) { invalidateTarget("That video changed or was removed. Select another video."); return; }
    if (applied) { restore(); previewWarning(); status("Preview off. Showing the original video."); }
    else applyPreview(previewTarget, lastPreview);
    buttons();
  });
  $("#apply").addEventListener("click", () => {
    if (mode !== "edit") return;
    if (!image || !title.value.trim() || !valid(selected)) { status("Upload a thumbnail, enter a title, and select a video.", true); return; }
    previewTarget = { ...selected };
    lastPreview = Object.freeze({ image, title: title.value.trim(), channelName: channelName.value.trim() || "Your channel", channelImage });
    applyPreview(previewTarget, lastPreview); save(); setMode("preview"); buttons();
  });
  title.addEventListener("input", () => { buttons(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); });
  channelName.addEventListener("input", () => { updateChannelPreview(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); });
  $("#default-avatar").addEventListener("click", () => {
    edited = true; channelImageVersion++; channelImage = ""; channelFile.value = ""; updateChannelPreview(); save();
    status("Default channel image selected. Apply preview to update the card.");
  });
  async function readImage(upload) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(upload.type) || upload.size > MAX_BYTES || !upload.size) throw new Error("Choose a JPEG, PNG or WebP image up to 10 MB.");
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(upload); });
      await new Promise((resolve, reject) => { const decoded = new Image(); decoded.onload = () => decoded.naturalWidth ? resolve() : reject(); decoded.onerror = reject; decoded.src = data; });
      return data;
    } catch (_) { throw new Error("This file could not be decoded as an image. Choose another file."); }
  }
  channelFile.addEventListener("change", async () => {
    edited = true;
    const version = ++channelImageVersion, upload = channelFile.files[0];
    if (!upload) return;
    try {
      const data = await readImage(upload);
      if (closed || version !== channelImageVersion) return;
      channelImage = data; updateChannelPreview(); save(); status("Channel image ready. Apply preview to update the card.");
    } catch (error) { if (!closed && version === channelImageVersion) { channelFile.value = ""; status(error.message, true); } }
  });
  file.addEventListener("change", async () => {
    const version = ++imageVersion, upload = file.files[0];
    if (!upload) return;
    try {
      const data = await readImage(upload);
      if (closed || version !== imageVersion) return;
      image = data; preview.src = data; preview.hidden = false; buttons(); save(); status("Thumbnail ready. Select a video and apply your preview.");
    } catch (error) { if (!closed && version === imageVersion) { file.value = ""; status(error.message, true); } }
  });
  let edited = false;
  root.addEventListener("input", () => { edited = true; });
  file.addEventListener("change", () => { edited = true; });
  browser.storage.local.get("draft").then(({ draft }) => {
    if (closed || edited || !draft) return;
    if (typeof draft.title === "string") title.value = draft.title;
    if (typeof draft.channelName === "string") channelName.value = draft.channelName;
    if (typeof draft.channelImage === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(draft.channelImage) && draft.channelImage.length <= 14 * 1024 * 1024) channelImage = draft.channelImage;
    if (typeof draft.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(draft.image) && draft.image.length <= 14 * 1024 * 1024) { image = draft.image; preview.src = image; preview.hidden = false; }
    updateChannelPreview(); buttons();
  }).catch(() => { if (!closed) status("Couldn’t load your saved draft. You can still create a preview.", true); });
  document.addEventListener("pointermove", onPointer, true);
  window.addEventListener("click", onClick, true);
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick"]) window.addEventListener(type, blockGesture, true);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("yt-navigate-start", onNavigate);
  frame = requestAnimationFrame(render);
})();
