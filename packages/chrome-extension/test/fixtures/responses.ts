// Responses from song-resolver for its fixtures (recorded 2026-10-21 via wrangler dev).
// Deezer timed out from the recording network, so the Deezer links and partial: false
// on the matched ones come from the deployed Worker's responses the same day;
// igStoryPartial is kept as recorded. uncertainMisread reproduces Haiku's real
// "Naarlly" misread of spotify-x-feed.
import type { ResolveResponse } from "song-resolver/src/types";

export const xFeed = {
  "status": "matched",
  "track": {
    "title": "EGO",
    "artist": "Naarly",
    "album": "EGO - Single",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/b0/84/4bb08451-f153-7a79-0e23-ff6ac776fff5/881453945106_cover.jpg/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
    "spotify": "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
    "deezer": "https://www.deezer.com/track/4287819182",
    "youtube": "https://www.youtube.com/watch?v=MXNiK_WAeJk",
    "youtubeMusic": "https://music.youtube.com/watch?v=MXNiK_WAeJk"
  },
  "partial": false,
  "cached": true,
  "extracted": {
    "title": "EGO",
    "artist": "Naarly",
    "player": "spotify",
    "confidence": 0.85
  },
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/EGO%20naarly",
    "youtube": "https://www.youtube.com/results?search_query=EGO%20naarly"
  }
} satisfies ResolveResponse;

export const xLightbox = {
  "status": "matched",
  "track": {
    "title": "EGO",
    "artist": "Naarly",
    "album": "EGO - Single",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/b0/84/4bb08451-f153-7a79-0e23-ff6ac776fff5/881453945106_cover.jpg/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
    "spotify": "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
    "deezer": "https://www.deezer.com/track/4287819182",
    "youtube": "https://www.youtube.com/watch?v=MXNiK_WAeJk",
    "youtubeMusic": "https://music.youtube.com/watch?v=MXNiK_WAeJk"
  },
  "partial": false,
  "cached": true,
  "extracted": {
    "title": "EGO",
    "artist": "Naarly",
    "player": "spotify",
    "confidence": 0.9
  },
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/EGO%20naarly",
    "youtube": "https://www.youtube.com/results?search_query=EGO%20naarly"
  }
} satisfies ResolveResponse;

export const igStoryPartial = {
  "status": "matched",
  "track": {
    "title": "EGO",
    "artist": "Naarly",
    "album": "EGO - Single",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/b0/84/4bb08451-f153-7a79-0e23-ff6ac776fff5/881453945106_cover.jpg/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
    "spotify": "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
    "youtube": "https://www.youtube.com/watch?v=MXNiK_WAeJk",
    "youtubeMusic": "https://music.youtube.com/watch?v=MXNiK_WAeJk"
  },
  "partial": true,
  "cached": false,
  "extracted": {
    "title": "EGO",
    "artist": "Naarly",
    "player": "spotify",
    "confidence": 0.9
  },
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/EGO%20naarly",
    "youtube": "https://www.youtube.com/results?search_query=EGO%20naarly"
  }
} satisfies ResolveResponse;

export const fein = {
  "status": "matched",
  "track": {
    "title": "FE!N (feat. Playboi Carti)",
    "artist": "Travis Scott",
    "album": "UTOPIA",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/7d/4f/94/7d4f9468-56e1-3a2d-7186-c8088170ef58/196871341899.jpg/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/fe-n-feat-playboi-carti/1708274558?i=1708274783",
    "spotify": "https://open.spotify.com/track/42VsgItocQwOQC3XWZ8JNA",
    "deezer": "https://www.deezer.com/track/2386586085",
    "youtube": "https://www.youtube.com/watch?v=P_X6JCMVMQ8",
    "youtubeMusic": "https://music.youtube.com/watch?v=P_X6JCMVMQ8"
  },
  "partial": false,
  "cached": false,
  "extracted": {
    "title": "FE!N (feat. Playboi Carti)",
    "artist": "Travis Scott",
    "player": "apple_music",
    "confidence": 0.95
  },
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/FE!N%20travis%20scott",
    "youtube": "https://www.youtube.com/results?search_query=FE!N%20travis%20scott"
  }
} satisfies ResolveResponse;

export const slideTackle = {
  "status": "matched",
  "track": {
    "title": "Slide Tackle",
    "artist": "Japanese Breakfast",
    "album": "Jubilee",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/93/8b/8b/938b8b5d-1022-414f-995e-a25608fc68c3/17251.jpg/600x600bb.jpg"
  },
  "links": {
    "appleMusic": "https://music.apple.com/us/album/slide-tackle/1553364590?i=1553364595",
    "spotify": "https://open.spotify.com/track/5ksM8r8u4AjMwvtqUif9W1",
    "deezer": "https://www.deezer.com/track/1257797172",
    "youtube": "https://www.youtube.com/watch?v=0-EMiEpXLJg",
    "youtubeMusic": "https://music.youtube.com/watch?v=0-EMiEpXLJg"
  },
  "partial": false,
  "cached": false,
  "extracted": {
    "title": "Slide Tackle",
    "artist": "Japanese Breakfast",
    "player": "apple_music",
    "confidence": 0.95
  },
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/Slide%20Tackle%20japanese%20breakfast",
    "youtube": "https://www.youtube.com/results?search_query=Slide%20Tackle%20japanese%20breakfast"
  }
} satisfies ResolveResponse;

export const noPlayer = {
  "status": "not_found",
  "partial": false,
  "cached": false,
  "extracted": null,
  "track": null,
  "links": {},
  "songLink": null,
  "searchLinks": null
} satisfies ResolveResponse;

export const uncertainMisread = {
  "status": "uncertain",
  "partial": false,
  "cached": false,
  "extracted": {
    "title": "EGO",
    "artist": "Naarlly",
    "player": "spotify",
    "confidence": 0.85
  },
  "track": {
    "title": "EGO",
    "artist": "Naarly",
    "album": "EGO - Single",
    "artworkUrl": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/b0/84/4bb08451-f153-7a79-0e23-ff6ac776fff5/881453945106_cover.jpg/600x600bb.jpg"
  },
  "links": {},
  "songLink": null,
  "searchLinks": {
    "spotify": "https://open.spotify.com/search/EGO%20naarlly",
    "youtube": "https://www.youtube.com/results?search_query=EGO%20naarlly"
  }
} satisfies ResolveResponse;
