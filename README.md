# song-from-screenshot

Send it a screenshot of a music player's Now Playing screen — Spotify or Apple Music, including ones re-shared in a tweet or an Instagram story — and get back direct links to the song on Apple Music, Spotify, Deezer, YouTube and YouTube Music.

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

A Chrome extension and a phone share-sheet shortcut that call this API are planned.

## How it works

1. Claude reads the song title and artist from the player in the screenshot, ignoring tweet text, playlist names, device names and badges. It uses Claude Haiku 5.5, and retries once with Claude Sonnet 5.5 when Haiku's reading doesn't match any real song.
2. Apple Music (iTunes Search), Deezer, Spotify and YouTube are searched in parallel.
3. A link is only returned when that platform's result has the same title and artist. Remixes, covers, live versions and fan uploads are rejected, so you get no link rather than a wrong one. Spotify and YouTube search links are always included as a fallback.
4. Results are cached in Workers KV, so the same screenshot or the same song again is answered in milliseconds without calling Claude or the platforms.

**Cost:** about $0.0004 of Claude usage per new screenshot (about 1¢ when the Sonnet retry runs). Cloudflare Workers' free plan, Spotify's API and the YouTube API's free quota (about 100 new songs a day) cost nothing.

## Set up your own

You need:

- A **Cloudflare** account (free): <https://dash.cloudflare.com/sign-up>
- A **Claude API key**: create one at <https://platform.claude.com> → **API keys**. You'll need to add a little credit.
- Recommended, for direct Spotify links: a **Spotify developer app** (free). See [Spotify keys](#spotify-keys).
- Optional, for direct YouTube links: a **YouTube Data API key** (free). See [YouTube key](#youtube-key).

### Option A: Deploy button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/habibwritescode/song-from-screenshot/tree/main/packages/song-resolver)

Cloudflare copies the Worker into a new repo on your GitHub account, creates the cache, and asks for each key. For `ACCESS_TOKEN`, paste a long random string (`openssl rand -base64 32` makes one) and keep it: your apps send it with every request. Leave optional keys empty to skip them.

### Option B: Setup script

Needs Node.js 22 or newer.

```sh
git clone https://github.com/habibwritescode/song-from-screenshot.git
cd song-from-screenshot
npm ci
npm run setup -w song-resolver
```

The script logs you in to Cloudflare (a browser window opens), deploys the Worker, asks for your keys (input is hidden), and prints your Worker's URL and a new access token. **The token is shown once**; save it in a password manager.

Running it again is safe: it asks before replacing any key that's already set, so it's also how you add a Spotify or YouTube key later. To deploy under another name, add `-- --name my-worker`.

### Try it

```sh
cd packages/song-resolver
curl -H "Authorization: Bearer <your token>" -F image=@fixtures/spotify-x-feed.png https://song-resolver.<you>.workers.dev/api/resolve
```

## Spotify keys

1. Go to <https://developer.spotify.com/dashboard>, log in, and click **Create app**.
2. Give it any name and description. For **Redirect URI** enter `http://127.0.0.1:8787/callback` (it's never used, but the form requires one). Tick **Web API** and save.
3. Open the app's **Settings** and copy the **Client ID** and **Client secret**.

Without them, responses still include a Spotify search link.

## YouTube key

1. Go to <https://console.cloud.google.com> and create a project.
2. **APIs & Services → Library**: search for **YouTube Data API v3** and click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Copy it.
4. Edit the key: under **API restrictions**, choose **Restrict key** and tick only **YouTube Data API v3**.

The free quota is 10,000 units a day and each search costs 100, so about 100 new songs a day. Cached songs don't count. When the quota runs out, YouTube links are left out (the search link stays) until it resets.

## API

### `POST /api/resolve`

`multipart/form-data` with one field, `image`: PNG, JPEG or WebP, up to 5 MB. Header `Authorization: Bearer <ACCESS_TOKEN>`. HEIC isn't supported; convert to JPEG first (the planned iPhone share shortcut will do this).

| Field         | Meaning                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`      | `matched`: links are verified. `uncertain`: a song was read but no platform result matched; `track` is the best guess and `links` is empty. `not_found`: no song in the image. |
| `links`       | Only verified platforms. Keys: `appleMusic`, `spotify`, `deezer`, `youtube`, `youtubeMusic`. Clients should show unknown keys generically.                                     |
| `searchLinks` | Spotify and YouTube search URLs for the title and artist that were read.                                                                                                       |
| `extracted`   | What Claude read: `title`, `artist`, `player` (`spotify`, `apple_music` or `unknown`) and `confidence` (0–1).                                                                  |
| `track`       | Title, artist, album and artwork URL from the matched platform.                                                                                                                |
| `partial`     | `true` if a platform failed or timed out; the others' links are still there.                                                                                                   |
| `cached`      | `true` if the answer came from the cache.                                                                                                                                      |

Errors are `{ "error": { "code", "message" } }`: `400 missing_image`, `401 unauthorized`, `413 image_too_large`, `415 unsupported_type`, `502 upstream_error` (Claude or every music platform failed), `500 internal_error`.

### `GET /api/health`

`{ "ok": true, "version": "0.1.0" }`. No token needed.

## Configuration

Set in `packages/song-resolver/wrangler.jsonc` (`vars`) or as secrets by the setup script.

| Name                                          | Kind   | Default             | What it does                                                                                |
| --------------------------------------------- | ------ | ------------------- | ------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                           | secret | required            | Reads the screenshot.                                                                       |
| `ACCESS_TOKEN`                                | secret | required            | Shared secret your apps send. Requests without it are rejected before anything costs money. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | secret | none                | Direct Spotify links.                                                                       |
| `YOUTUBE_API_KEY`                             | secret | none                | Direct YouTube and YouTube Music links.                                                     |
| `MODEL`                                       | var    | `claude-haiku-5-5`  | Model for the first read.                                                                   |
| `FALLBACK_MODEL`                              | var    | `claude-sonnet-5-5` | Model for one retry when the first read doesn't match. Empty turns the retry off.           |
| `COUNTRY`                                     | var    | `US`                | Apple Music storefront, Spotify market and YouTube region.                                  |

Change a var, then redeploy with `npm run deploy -w song-resolver`.

## Troubleshooting

- **`401 unauthorized` right after setup:** new secrets take about 15 seconds to go live. Otherwise, check the token; if it's lost, re-run setup and answer **n** to "Keep it?" to get a new one.
- **`partial: true`:** a platform was slow (over 4 seconds) or refused the request. iTunes sometimes rate-limits Cloudflare's shared addresses. The other links are still valid, and partial results are only cached for a day.
- **`uncertain` with no links:** the title or artist was read differently from how the platforms list it, even after the retry. Use the search links. Very small or heavily cropped screenshots are the usual cause.
- **No Spotify or YouTube links:** the key isn't set, or (YouTube) today's quota is used up. Re-run setup to add a key.
- **Watching logs:** `cd packages/song-resolver && npx wrangler tail`. Screenshots, tokens and keys are never logged.

## Development

npm workspaces; run from the repo root.

```sh
npm ci
cp packages/song-resolver/.dev.vars.example packages/song-resolver/.dev.vars   # then fill it in
npm run dev -w song-resolver          # http://localhost:8787
npm test -w song-resolver             # mocked tests in the Workers runtime
npm run test:live -w song-resolver    # real Claude and platform calls on the fixtures; costs a few cents
npm run lint
npm run typecheck -w song-resolver
```

Use `npm ci`, not `npm install`: npm 10's `npm install` crashes on this workspace without the lockfile. To add a dependency, use `npx npm@11 install <pkg> -w song-resolver`.

## License

[MIT](LICENSE)
