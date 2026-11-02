# Firefox and Chrome extension smoke test

Use this checklist after `npm run build --workspace @multicam/extension` has
produced and verified both unpacked artifacts.

## Prepare extension authentication

Firefox derives `browser.identity.getRedirectURL()` from the stable Gecko ID in
the generated manifest. The backend must allow both browser callback origins.

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or newer.
2. Select **Load Temporary Add-on** and choose
   `apps/extension/.output/firefox-mv2/manifest.json`.
3. Select **Inspect** for Twitch Multicam and evaluate
   `browser.identity.getRedirectURL()` in the background-page console.
4. Copy only the returned URL's origin. Add it beside the Chrome identity
   origin in the API's comma-separated `EXTENSION_REDIRECT_ORIGINS` setting.
5. Restart the API after changing its environment.

Do not add a broad wildcard origin. The API deliberately accepts only exact
identity callback origins.

## Firefox viewer path

1. Open a Twitch channel that has a current public Multicam session.
2. Confirm the initial view crops to the published main camera rather than
   showing the full 2×2 composite.
3. Open the Multicam camera control and choose every published camera. Confirm
   the video changes quadrant while Twitch playback, volume, quality, and
   fullscreen controls remain their normal size.
4. Choose **Show Grid** and confirm the full composite is restored.
5. Switch between normal, theater, and fullscreen layouts. Confirm the current
   choice remains correctly cropped.
6. Navigate to a different or inactive channel. Confirm the previous crop and
   Multicam control disappear.

This path verifies the unauthenticated public configuration lookup as well as
the extension-owned control and Shadow DOM styles.

## Firefox advertisement path

When Twitch serves an advertisement during the smoke session:

1. Select a camera before the advertisement begins.
2. Confirm ad playback removes the crop and hides the Multicam control.
3. Confirm Twitch displays the advertisement normally.
4. When the advertisement ends, confirm the prior camera returns if it is
   still active. If the public session changed or expired, confirm Twitch stays
   uncropped instead.

Record “not available” when Twitch does not serve an advertisement; do not
simulate an ad and report it as a live verification.

## Firefox popup authentication

1. Open the extension popup and select **Sign in with Twitch**.
2. Complete Twitch authentication and confirm the popup returns signed in.
3. On the authenticated broadcaster's own channel, confirm camera preferences
   and the appropriate Enable, Update, or Disable control appear.
4. Change a camera label, close the popup immediately, and reopen it. Confirm
   the saved value remains.
5. Visit another active Multicam channel and confirm the popup shows viewer
   information. Visit an inactive channel and confirm it shows the inactive
   state.
6. Open the full dashboard link and confirm it opens in a new tab.

## Chrome regression

1. Open `chrome://extensions`, enable Developer mode, and select **Load
   unpacked**.
2. Load `apps/extension/.output/chrome-mv3`.
3. Repeat the viewer path and popup authentication checks above.
4. If an advertisement is available, repeat the advertisement path.

## Record the result

Record the browser versions, test channel, date, and pass/fail result for each
path. Do not record access tokens, refresh tokens, identity callback URLs, or
other credentials.

| Browser | Viewer/public config | Ad suspension | Popup auth | Notes |
| --- | --- | --- | --- | --- |
| Firefox |  |  |  |  |
| Chrome |  |  |  |  |
