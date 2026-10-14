# YouTube Thumbnail Tester

A Firefox extension that previews your uploaded thumbnail and title on a real video card in the desktop YouTube home feed. No account, backend, network requests, or telemetry. The latest draft is stored locally in Firefox.

## Load in Firefox

1. Use Firefox 128 or newer.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose `extension/manifest.json` from this repository.
4. Open `https://www.youtube.com/` and click **YouTube Thumbnail Tester** in Firefox’s Extensions menu. You can pin its icon to the toolbar for easier access.

Temporary add-ons are removed when Firefox restarts. The build ZIP is unsigned and cannot be installed permanently in standard Firefox; permanent installation requires Mozilla signing.

## Use

1. Upload a JPEG, PNG, or WebP image (maximum 10 MB).
2. Type your title.
3. Click **Select video**, then click a standard video card in the home feed. A transparent selection layer catches the gesture so YouTube cannot open the video. Unsupported cards stay in selection mode with a message. Press Escape or click **Cancel selection** to cancel.
4. Click **Apply preview**. The thumbnail covers hover previews, while the original channel, view count, and video destination remain intact.
5. Use **Restore original** to undo the preview, or select another card and apply to move it. Closing the panel or navigating restores the original card; refreshing removes the preview.

The last image and title are remembered, but reopening never applies them automatically. Uploading/editing a draft does not change an already applied preview until you click Apply again. The panel uses a dark appearance in either YouTube theme. A red `!` toolbar badge indicates an unsupported page or injection error; hover the icon for details.

## Development

Requires Node.js 20+ and npm.

```sh
npm ci
npm test
npm run test:firefox
npm run lint
npm run build
```

The unsigned package is written to `dist/`. Plain JavaScript is used without a runtime framework or build step. Development dependencies are for DOM tests, Firefox browser tests, and Mozilla’s `web-ext` validation/packaging only.

`test:firefox` uses an isolated headless Firefox profile with the real extension content-script context and actual mouse hit testing against offline video-card fixtures. It requires an installed Firefox; set `FIREFOX_PATH` if it is not at the default Windows installation path. It tests selection, scroll/resize alignment without JavaScript repositioning, hover coverage, and restoration for legacy, camelCase, and renamed card layouts without accessing your existing Firefox profile.

## Limitations and manual verification

- Supports only the desktop `www.youtube.com` homepage, standard video cards, and one preview per tab. Shorts, ads, playlists, search results, and watch-page recommendations are excluded.
- YouTube changes its markup frequently. Unsupported card layouts cannot be selected. Cards that are removed or recycled clear the preview rather than transferring it to a different video.
- The thumbnail preview is attached inside the original thumbnail container, so it scrolls and resizes with the video card. It covers hover previews and allows clicks through to the original link. The tester panel stays fixed on screen. This does not upload or publish anything and does not measure CTR.
- Signing/store submission, Android support, and multiple candidates are outside this prototype.

For a live smoke test, use a home feed with standard videos, test light/dark themes, select by clicking the title and thumbnail, hover the applied image, scroll, move the preview between two cards, restore, close/reopen the panel, refresh, navigate to a watch/search page, and open a second tab. Check that selection blocks navigation while ordinary clicks after selection still open the original video. Test corrupt images, unsupported file formats, and files larger than 10 MB. Automated fixtures cover these lifecycle and validation behaviors but do not guarantee compatibility with every live YouTube experiment.
