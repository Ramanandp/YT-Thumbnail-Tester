# YouTube Thumbnail Tester

A Firefox extension that previews your thumbnail, title, channel name, and channel image on a real video card in the desktop YouTube home feed. No account, backend, network requests, or telemetry. The latest draft is stored locally in Firefox.

## Load in Firefox

1. Use Firefox 128 or newer.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose `extension/manifest.json` from this repository.
4. Open `https://www.youtube.com/` and click **YouTube Thumbnail Tester** in Firefox’s Extensions menu. You can pin its icon to the toolbar for easier access.

Temporary add-ons are removed when Firefox restarts. The build ZIP is unsigned and cannot be installed permanently in standard Firefox; permanent installation requires Mozilla signing.

## Use

The extension opens in **Edit Mode**, with sections for Video, Channel, and Target video. The editor scrolls, while its apply button stays visible in the footer.

1. Upload a JPEG, PNG, or WebP thumbnail (maximum 10 MB).
2. Type your title and username/channel name. The channel name defaults to **Your channel**; an empty name also uses this fallback.
3. Optionally upload a channel image (JPEG, PNG, or WebP, up to 10 MB). Without an upload, the avatar is a solid blue color with the first letter of the channel name capitalized. A leading `@` is ignored when choosing the initial. Click **Use default image** to clear an upload.
4. Click **Select video**, then click a standard video card in the home feed. A transparent selection layer catches the gesture so YouTube cannot open the video. Unsupported cards stay in selection mode with a message. Press Escape or click **Cancel selection** to cancel.
5. Click **Apply & preview**. The editor collapses into a compact **Preview Mode** bar at the top right. The thumbnail covers hover previews, and your channel name and image replace the original appearance. View counts, upload age, video destination, and channel links remain intact.
6. Use the **Preview On/Off** switch to compare with the original card. Off restores all original fields; On reapplies the last applied configuration. The selection outline stays hidden in both states.
7. Click **Edit Mode** to bring back the editor without changing whether the preview is On or Off. Edit the draft or use **Change video**, then click **Apply & preview** to show the updated preview and collapse the editor again.
8. Close either interface with **×** to restore the original card and remove the tester. Navigating also closes it; refreshing removes the preview. A removed or recycled target returns the tester to Edit Mode with an explanation, including when Preview is Off.

The last thumbnail, title, channel name, and optional channel image are remembered, but reopening always starts in Edit Mode and never applies them automatically. Uploading/editing a draft does not change an already applied preview until you apply again. The applied configuration, selected video, mode, and On/Off state are independent in each tab. The interface uses a dark appearance in either YouTube theme. A red `!` toolbar badge indicates an unsupported page or injection error; hover the icon for details.

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

`test:firefox` uses an isolated headless Firefox profile with the real extension content-script context and actual mouse hit testing against offline video-card fixtures. It requires an installed Firefox; set `FIREFOX_PATH` if it is not at the default Windows installation path. It tests Edit/Preview transitions, mouse and keyboard toggles, scroll/resize alignment without JavaScript repositioning, hover coverage, and restoration for legacy, camelCase, and renamed card layouts without accessing your existing Firefox profile. It also saves layout screenshots to `dist/`.

## Limitations and manual verification

- Supports only the desktop `www.youtube.com` homepage, standard video cards, and one preview per tab. Shorts, ads, playlists, search results, and watch-page recommendations are excluded.
- YouTube changes its markup frequently. Unsupported card layouts cannot be selected. Cards that are removed or recycled clear the preview rather than transferring it to a different video.
- If a card's channel name or avatar cannot be found, the thumbnail/title preview still works and the panel explains that channel customization was incomplete.
- The thumbnail preview is attached inside the original thumbnail container, so it scrolls and resizes with the video card. It covers hover previews and allows clicks through to the original link. The tester panel stays fixed on screen. This does not upload or publish anything and does not measure CTR.
- Signing/store submission, Android support, and multiple candidates are outside this prototype.

For a live smoke test, use a home feed with standard videos, test light/dark themes, select by clicking the title and thumbnail, hover the applied image, scroll, move the preview between two cards, restore, close/reopen the panel, refresh, navigate to a watch/search page, and open a second tab. Check that selection blocks navigation while ordinary clicks after selection still open the original video. Test corrupt images, unsupported file formats, and files larger than 10 MB. Automated fixtures cover these lifecycle and validation behaviors but do not guarantee compatibility with every live YouTube experiment.
