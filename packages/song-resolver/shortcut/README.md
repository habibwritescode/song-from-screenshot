# iPhone Shortcut: Find Song

Share a screenshot to this Shortcut and Safari opens your Worker's results page with links to the song. The Shortcut sends the screenshot to your own Worker and hands the answer to the web app, which shows it and keeps it in Recent.

Most people should add the published copy (link in the main README) and answer its two questions: your Worker URL and your access token. These steps are for building it yourself, or checking what the published one does. Action names can differ slightly between iOS versions; each step says what it's for.

## Build it

Open **Shortcuts**, tap **+**, and name the shortcut **Find Song**.

1. **Accept screenshots from the share sheet.** Tap the shortcut's **ⓘ** (Details), turn on **Show in Share Sheet**, and set the accepted types to **Images** only. The first action becomes "Receive **Images** from **Share Sheet**". Set "If there's no input" to **Stop and Respond**.
2. **Your Worker URL.**
   1. Tap the search field at the bottom (**Search for apps and actions**), type `URL`, and tap the plain **URL** action (chain-link icon). Use **URL**, not **Text**: a Text action can keep an invisible space or line break, and Cloudflare then rejects the request with "400 Bad Request" before it reaches your Worker.
   2. Tap inside it and type your Worker's address with no slash at the end, e.g. `https://song-resolver.you.workers.dev`. Don't press Return afterwards.
   3. Search for `Set Variable` and add it. It reads **Set variable Variable Name to URL**. Tap **Variable Name** and type `Worker`. If "to" is empty, tap it and choose **URL**.
3. **Your token.** A **Text** action with your access token (again, nothing after it), then **Set Variable** named `Token`.

   To use these later, tap the field you're filling in and pick **Worker** or **Token** from the strip above the keyboard (or from **Variables**), then type the rest straight after it.

4. **Make it a JPEG.** Add **Convert Image**: convert **Shortcut Input** to **JPEG**, quality around 0.9, **Preserve Metadata** off. This is what makes iPhone's HEIC screenshots readable by the Worker.
5. **Ask your Worker.** Add **Get Contents of URL**:
   - URL: the **Worker** variable, then type `/api/resolve` right after it
   - Method: **POST**
   - Headers: tap **Add new header**; key `Authorization`, value `Bearer ` (with one space) followed by the **Token** variable
   - Request Body: **Form**, one field of type **File**, key `image`, value **Converted Image**
6. **Turn the answer into text.** Add **Get Text from Input**, taking **Contents of URL** (the whole answer, errors included; the web app tells them apart).
7. **Encode it.** Add **Base64 Encode**, set to **Encode**, taking that **Text**; if it has a **Line Breaks** option, choose **None**. Not URL Encode: that leaves `(`, `!` and `'` as they are, and iOS's link detection in Open URLs stops at `(`, so a title like "SLICK Remix (feat. …)" arrives cut short.
8. **Build the address.** Add a **URL** action (not Text): the **Worker** variable, then type `/#result=`, then the **Base64 Encoded** variable. Insert both variables from the strip above the keyboard.
9. **Open it.** Add **Open URLs** and give it only the **URL** from step 8.

   Why a URL action: Open URLs looks for a link inside Text, and iOS's link detection gives up partway through a long answer, so Safari got only `…/#result` with no data. A URL action is used as the address as it is.

## Share it without your token

Before publishing an iCloud link, make the two Text actions questions, so the link never carries your URL or token:

1. In the shortcut's **ⓘ** → **Setup** (called "Import Questions" in some iOS versions), tap **Add Question**.
2. Pick the **URL** action (the Worker address): question "Your song-resolver Worker URL", default empty.
3. Add another question for the **Text** action (the token): "Your access token", default empty.
4. **Share** → **Copy iCloud Link**. Anyone who adds it answers both questions on their own phone.

Check before sharing: open the URL and Text actions and make sure they're empty or show the question placeholder, not your real values.

## Why it hands off to the web app

- The results page is the same one Android and desktop use, so it's tested once, in CI.
- The answer travels after the `#` in the address. Browsers never send that part to any server, and the page removes it from the address bar and history as soon as it has read it.
- The page checks every field it reads, so a crafted `#result=` link can't make it show anything but web links.

## If something goes wrong

- **"The request timed out", or "400 Bad Request" from Cloudflare.** The Worker address has something invisible in it. Use a **URL** action for it (step 2), and make sure nothing follows the address.
- **"Couldn't convert from rich text to URL" at Open URLs.** The answer isn't being encoded: check **Base64 Encode** is set to **Encode** and takes the **Text** from **Get Text from Input**.
- **"Your Worker answered with something unexpected" every time.** The address ends at `#result=` with nothing after it: re-insert **Base64 Encoded** in step 8, picking it fresh from the strip. If Safari's address ends at `#result`, step 8 is a Text action instead of a URL action. If it only fails for some songs, step 7 is probably still URL Encode instead of Base64 Encode.
- **"Your token was rejected."** The token in step 3 doesn't match the Worker's `ACCESS_TOKEN`.
- **The Shortcut stops with a network error.** Your Worker URL is wrong, or there's no connection. Check step 2 opens `…/api/health` in Safari.
- **Results show but Recent is empty in the home-screen app.** iPhone keeps Safari and a home-screen web app's data apart. The Shortcut opens Safari, so Recent and settings like **Open my app directly** live there.
