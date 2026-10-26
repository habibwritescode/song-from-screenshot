# song-from-screenshot

Send it a screenshot of a music player's Now Playing screen and get back direct links to the song on Apple Music, Spotify, Deezer, YouTube and YouTube Music. It reads Spotify's and Apple Music's players, including screenshots re-shared in a post on X or an Instagram story.

It's a small API you deploy to your own Cloudflare account with your own keys. Nobody else's server sees your screenshots, and nobody else pays for your lookups.

```sh
curl -H "Authorization: Bearer $TOKEN" -F image=@screenshot.png https://song-resolver.<you>.workers.dev/api/resolve
```

```json
{
  "status": "matched",
  "track": {
    "title": "EGO",
    "artist": "Naarly",
    "album": "EGO - Single",
    "artworkUrl": "https://…/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
    "spotify": "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
    "deezer": "https://www.deezer.com/track/4287819182",
    "youtube": "https://www.youtube.com/watch?v=MXNiK_WAeJk",
    "youtubeMusic": "https://music.youtube.com/watch?v=MXNiK_WAeJk"
  },
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/EGO%20naarly",
    "youtube": "https://www.youtube.com/results?search_query=EGO%20naarly"
  }
}
```

A [Chrome extension](#chrome-extension) calls it from X, Instagram or any page. Your Worker also serves a [phone app](#use-it-on-your-phone). On Android you share a screenshot to it, and on iPhone a Shortcut sends it.

## How it works

1. Claude reads the song title and artist from the player in the screenshot, ignoring tweet text, playlist names, device names and badges. It uses Claude Haiku 5.5, and retries once with Claude Sonnet 5.5 when Haiku's reading doesn't match any real song.
2. The Worker searches Apple Music (iTunes Search), Deezer, Spotify and YouTube in parallel.
3. The Worker returns a link only when that platform's result has the same title and artist. It rejects remixes, covers, live versions and fan uploads, so you get no link rather than a wrong one. Whenever Claude reads a title and artist, Spotify and YouTube search links come back too, as a fallback.
4. The Worker caches results in Workers KV, so the same screenshot or song comes back in milliseconds without calling Claude or the platforms.

A new screenshot costs about $0.0004 of Claude usage, or about 1¢ when the Sonnet retry runs. Cloudflare Workers' free plan, Spotify's API and the YouTube API's free quota (about 100 new songs a day) cost nothing.

## Set up your own

You need:

- A Cloudflare account (free): <https://dash.cloudflare.com/sign-up>
- A Claude API key. Create one at <https://platform.claude.com> under **API keys**, and add a little credit.
- A Spotify developer app (free), recommended for direct Spotify links. See [Spotify keys](#spotify-keys).
- A YouTube Data API key (free), optional, for direct YouTube links. See [YouTube key](#youtube-key).

### Option A: Deploy button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/habibwritescode/song-from-screenshot/tree/main/packages/song-resolver)

Cloudflare copies the Worker into a new repo on your GitHub account and redeploys it on every push to that repo. The repo holds only code, never your keys, and you can make it private. On the form:

- **KV namespace** (`CACHE`): choose **Create new**. Don't reuse another Worker's namespace, or the two will share cached results.
- **`ACCESS_TOKEN`**: paste a long random string (`openssl rand -base64 32` makes one) and keep it, because your apps send it with every request.
- The form asks only for the required keys. To add Spotify or YouTube keys afterwards, open the Worker in the Cloudflare dashboard (**Workers & Pages**) and go to **Settings**. Under the runtime **Variables and secrets** (not the build ones), click **Add**, choose type **Secret**, and use the names `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, or `YOUTUBE_API_KEY`. [Spotify keys](#spotify-keys) and [YouTube key](#youtube-key) explain how to get them.

### Option B: Setup script

Needs Node.js 22 or newer.

```sh
git clone https://github.com/habibwritescode/song-from-screenshot.git
cd song-from-screenshot
npm ci
npm run setup -w song-resolver
```

The script logs you in to Cloudflare (a browser window opens), deploys the Worker, asks for your keys (input is hidden), and prints your Worker's URL and a new access token. It shows the token only once, so save it in a password manager.

Running it again is safe. It asks before replacing any key that's already set, so it's also how you add a Spotify or YouTube key later. To deploy under another name, add `-- --name my-worker`.

### Try it

```sh
cd packages/song-resolver
curl -H "Authorization: Bearer <your token>" -F image=@fixtures/spotify-x-feed.png https://song-resolver.<you>.workers.dev/api/resolve
```

## Chrome extension

Find the song in a screenshot without leaving the page. On X and Instagram, hover over an image and click **♪ Find song**. On any site, right-click an image and choose **Find song**. A card next to the image shows the song with a link for each platform, your preferred one first. The toolbar button lists your last 10 songs.

It uses your own Worker, so set that up first.

### Install

1. Download `song-from-screenshot-extension-<version>.zip` from the [latest release](https://github.com/habibwritescode/song-from-screenshot/releases/latest).
2. Unzip it somewhere you'll keep it. Chrome loads the extension from that folder.
3. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the unzipped folder.
4. The settings page opens. Enter your Worker's URL (`https://song-resolver.<you>.workers.dev`) and your access token, click **Test connection**, then **Save**.

To update, download the new zip, replace the folder's contents, and click the reload button on the extension's card in `chrome://extensions`. Tabs that were already open need a reload too; until then the card says so.

### Permissions

| Permission                                           | Why                                                                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage                                              | Your Worker URL, token, settings and last 10 songs, on this computer only. Web pages can't read them.                                                                                  |
| Context menus                                        | The right-click **Find song** item.                                                                                                                                                    |
| Active tab, scripting                                | Only after you right-click. It shows the card on sites other than X and Instagram, and crops the image from a screenshot of the tab when the site won't let the extension download it. |
| `pbs.twimg.com`, `*.cdninstagram.com`, `*.fbcdn.net` | To download the full-size image from X's and Instagram's image servers.                                                                                                                |
| Runs on `x.com`, `twitter.com`, `www.instagram.com`  | The hover button.                                                                                                                                                                      |

Screenshots go only to your Worker. Album covers load from the platforms' image servers (Apple Music, Spotify, Deezer). There's no analytics.

## Use it on your phone

Your Worker also serves a small web app at its address, `https://song-resolver.<you>.workers.dev`. It shows the song with a link for each platform, your preferred one first, and keeps your last 10 songs on the phone. Screenshots go only to your Worker.

**Set it up once.** Open your Worker's address on the phone and paste your access token. Or open the one-tap link the setup script prints, `https://<worker>/#token=<token>`. The link saves the token and removes it from the address bar. If you deployed with the button, build that link yourself; if your token has `+`, `/` or `=` in it, write them as `%2B`, `%2F` and `%3D`.

**Android.** In Chrome, open the ⋮ menu and choose **Install app** (or **Add to Home screen**). Then, from your gallery or a screenshot's preview, tap **Share** and choose **Find Song**.

**iPhone.** iOS doesn't let web apps receive shares, so a Shortcut does it. The Shortcut converts the screenshot to JPEG (iPhone photos are HEIC), sends it to your Worker, and opens the results in Safari. [Add the Find Song Shortcut](https://www.icloud.com/shortcuts/02ffb86220034599b476fdafd7e493fc); it asks for your Worker URL and access token once. Then tap **Share** on a screenshot and choose **Find Song**. To see what it does, or build it yourself, follow [the steps](packages/song-resolver/shortcut/README.md).

**Any device.** Open your Worker's address and choose or paste a screenshot.

In **Settings** you can pick your preferred platform and turn on **Open my app directly**, which skips the results page and opens that platform's link when the song is found.

## Spotify keys

1. Go to <https://developer.spotify.com/dashboard>, log in, and click **Create app**.
2. Give it any name and description. For **Redirect URI** enter `http://127.0.0.1:8787/callback` (it's never used, but the form requires one). Tick **Web API** and save.
3. Open the app's **Settings** and copy the **Client ID** and **Client secret**.

Without them, responses still include a Spotify search link.

## YouTube key

1. Go to <https://console.cloud.google.com> and create a project.
2. In **APIs & Services → Library**, search for **YouTube Data API v3** and click **Enable**.
3. In **APIs & Services → Credentials**, choose **Create credentials → API key** and copy the key.
4. Edit the key. Under **API restrictions**, choose **Restrict key** and tick only **YouTube Data API v3**.

The free quota is 10,000 units a day and each search costs 100, so about 100 new songs a day. Cached songs don't count. When the quota runs out, the Worker leaves out YouTube links (the search link stays) until the quota resets.

## API

### `POST /api/resolve`

`multipart/form-data` with one field, `image`: PNG, JPEG or WebP, up to 5 MB. Header `Authorization: Bearer <ACCESS_TOKEN>`. The Worker doesn't accept HEIC, so convert it to JPEG first. The iPhone Shortcut does this for you.

| Field         | Meaning                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`      | `matched`: links are verified. `uncertain`: a song was read but no platform result matched; `track` is the best guess and `links` is empty. `not_found`: no song in the image. |
| `links`       | Only verified platforms. Keys: `appleMusic`, `spotify`, `deezer`, `youtube`, `youtubeMusic`. Clients should show unknown keys generically.                                     |
| `searchLinks` | Spotify and YouTube search URLs for the title and artist that were read.                                                                                                       |
| `extracted`   | What Claude read: `title`, `artist`, `player` (`spotify`, `apple_music` or `unknown`) and `confidence` (0 to 1).                                                               |
| `track`       | Title, artist, album and artwork URL from the matched platform.                                                                                                                |
| `partial`     | `true` if a platform failed or timed out; the others' links are still there.                                                                                                   |
| `cached`      | `true` if the answer came from the cache.                                                                                                                                      |

Errors are `{ "error": { "code", "message" } }`: `400 missing_image`, `401 unauthorized`, `413 image_too_large`, `415 unsupported_type`, `502 upstream_error` (Claude or every music platform failed), `500 internal_error`.

### `GET /api/health`

`{ "ok": true, "version": "0.1.0" }`. No token needed.

## Configuration

Set in `packages/song-resolver/wrangler.jsonc` (`vars`), or as secrets by the setup script or in the Cloudflare dashboard (the Worker's **Settings**, runtime **Variables and secrets**).

| Name                                          | Kind   | Default             | What it does                                                                                      |
| --------------------------------------------- | ------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                           | secret | required            | Reads the screenshot.                                                                             |
| `ACCESS_TOKEN`                                | secret | required            | Shared secret your apps send. The Worker rejects requests without it before anything costs money. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | secret | none                | Direct Spotify links.                                                                             |
| `YOUTUBE_API_KEY`                             | secret | none                | Direct YouTube and YouTube Music links.                                                           |
| `MODEL`                                       | var    | `claude-haiku-5-5`  | Model for the first read.                                                                         |
| `FALLBACK_MODEL`                              | var    | `claude-sonnet-5-5` | Model for one retry when the first read doesn't match. Empty turns the retry off.                 |
| `COUNTRY`                                     | var    | `US`                | Apple Music storefront, Spotify market and YouTube region.                                        |

Change a var, then redeploy with `npm run deploy -w song-resolver`.

## Troubleshooting

- **`401 unauthorized` right after setup:** new secrets take about 15 seconds to go live. Otherwise, check the token; if it's lost, re-run setup and answer **n** to "Keep it?" to get a new one.
- **`partial: true`:** a platform was slow (over 4 seconds) or refused the request. iTunes sometimes rate-limits Cloudflare's shared addresses. The other links are still valid, and the Worker caches partial results for a day only.
- **`uncertain` with no links:** Claude read the title or artist differently from how the platforms list it, even after the retry. Use the search links. Very small or heavily cropped screenshots are the usual cause.
- **No Spotify or YouTube links:** the key isn't set, or (YouTube) today's quota is used up. Add the key in the dashboard (see [Option A](#option-a-deploy-button)) or re-run setup.
- **Watching logs:** `cd packages/song-resolver && npx wrangler tail`. The Worker never logs screenshots, tokens or keys.

## Development

The repo uses npm workspaces. Run these commands from the repo root.

```sh
npm ci
cp packages/song-resolver/.dev.vars.example packages/song-resolver/.dev.vars   # fill it in; uncomment the optional keys you use
npm run dev -w song-resolver          # http://localhost:8787
npm test -w song-resolver             # mocked tests in the Workers runtime
npm run test:live -w song-resolver    # real Claude and platform calls on the fixtures; costs a few cents
npm run lint
npm run typecheck -w song-resolver
```

The phone web app (in `packages/song-resolver/pwa`, built automatically by `wrangler dev` and `wrangler deploy`):

```sh
npm run build:pwa -w song-resolver    # → packages/song-resolver/pwa/dist
npm run test:pwa -w song-resolver     # unit tests
```

The Chrome extension:

```sh
npm run dev -w chrome-extension       # builds packages/chrome-extension/dist on every change; load it unpacked
npm test -w chrome-extension          # unit tests
npx playwright install chromium       # once, for the end-to-end tests
npm run test:e2e -w chrome-extension  # builds, then runs the extension in headless Chromium
npm run zip -w chrome-extension       # the release zip (macOS and Linux: uses the zip command)
```

To release the extension, run `npx npm@11 version 0.2.0 -w chrome-extension --no-git-tag-version` (it updates `package.json` and the lockfile; npm 10 also rewrites unrelated lockfile entries), set the same version in `packages/chrome-extension/manifest.json` (the build refuses to run if they differ), commit, and push a tag like `v0.2.0`. The release workflow checks the tag matches, runs the typecheck and all tests, and attaches the zip to a GitHub release.

Use `npm ci`, not `npm install`, because npm 10's `npm install` crashes on this workspace without the lockfile. To add a dependency, use `npx npm@11 install <pkg> -w song-resolver`.

## License

[MIT](LICENSE)
