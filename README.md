# Daily Bible

One local Git repository, two players on two branches:

| Branch | Player |
| --- | --- |
| `mac-streaming` | Original dependency-free Mac server and reading player; phone streaming can use private Tailscale Serve. |
| `offline-phone` | Installable browser app; imports recordings into phone storage and plays offline. This README describes this branch. |

The original `~/dw-desk/bible-player` has been left intact. No remote,
public hosting, or Tailscale configuration was created. Audio is never committed.
Switch versions with `git switch mac-streaming` or `git switch offline-phone`.

## Run locally

There are no runtime packages or build step. Python 3.9+ is enough:

```sh
cd ~/dw-os/coding/bible-player
python3 -m http.server 8766 --bind 127.0.0.1 --directory web
```

Open http://127.0.0.1:8766 in a browser. Stop the server with Control-C.
`npm start` runs the same command. The original `server.py` is retained for
compatibility, but the offline player never calls its audio/library API.

## Install on an iPhone

This is an **installed offline web app**, not an HTML attachment opened in Files.
It needs a stable HTTPS address for the initial installation (localhost is an
exception for testing on the Mac). The phone cannot use the Mac's localhost URL.

A private Tailscale HTTPS address is one possible installation route. The phone
and Mac would join the same tailnet. Inspect `tailscale serve status` first to
avoid replacing another service. When separately authorized, serving this app
would use `tailscale serve --bg http://127.0.0.1:8766`; no Serve configuration has
been changed by this work. Another HTTPS static host would also work.

1. Open the HTTPS app URL in Safari while the server is running. Wait for
   **App saved for offline use**.
2. Use Safari's Share menu → **Add to Home Screen** → open the new icon.
3. **Import recordings in that Home Screen app**, even if you previously imported
   them into a browser tab. Installed-app storage behavior can differ.
4. Select your already-downloaded MP3s in Files, or use the folder picker if your
   iOS version supports it. Import makes local copies: budget extra phone storage.
   Selecting an iCloud-only file may first download it using Wi-Fi or mobile data.
5. Keep the app open until importing finishes. Then play the reading. After the
   app shell and recordings are saved, the server, Tailscale, and internet are not
   needed for those recordings. Closing and reopening the app is supported.
6. Before relying on it, perform the physical-phone checks below.

Use a normal browser profile, not private browsing. Do not change the URL/origin
if you want to retain the same library. No App Store account, subscription, or
native signing is used. You initiate playback with a tap; it does not wake the
phone or start itself at a scheduled time.

## Recordings and storage

Imports stay on the device. The app sends no audio to a server. The service
worker caches the app's HTML, scripts, styles, and default config; IndexedDB
stores chapter blobs, imported config, and playback progress. Only the current
and following chapter are kept as playback URLs. Original files remain intact.

Supported automatic names:

- `B08___01_2CorinthiansENGESVN1DA.mp3`: Faith Comes By Hearing A/OT and B/NT
  book numbers, using the standard 66-book Protestant order.
- `Psalms/001.mp3`: select the folder to retain its relative path.
- `2 Corinthians 1.mp3`: useful when selecting individual files.

MP3, M4A, WAV, AAC, and OGG are accepted; actual playback depends on the browser's
codec support. Unknown names are reported, never guessed. Multiple selected
recordings for one chapter are excluded from that import. Existing saved chapters
are skipped, so retrying an interrupted import preserves previous work. Filename
mappings can handle other layouts. There is no edition mixing/replacement UI;
use one edition per app library. Changing a config does not replace saved audio.

**Keep your source recordings.** Storage persistence is requested but not
promised; the browser/OS manages quotas. Clearing website data removes saved
recordings, config, and progress. An interrupted import preserves completed
chapters; select the files again to resume. Playback positions are saved about
every two seconds and on pause/backgrounding, so an abrupt process kill may lose
the last few seconds. Progress does not sync between devices or browser profiles.

## Config

Edit `web/config.json` before a fresh installation, or use **Reading schedules &
config → Export config / Import config** on the device. Once installed, import
config changes explicitly; changing a file on the Mac does not overwrite the
phone's imported config. Config imports validate before saving, preserve audio,
and reset reading positions after confirmation.

`startDate` is a local calendar date (`YYYY-MM-DD`), or `null` for first use.
`edition` is a display label for **your** recordings, not a bundled translation.
`recordings` maps relative filenames to chapters, not arbitrary filesystem paths
or network URLs. The user must select the files before the browser can read them.
If selecting files individually, map their basenames; folder selection also
supports suffixes such as `New Testament/special.mp3`.

Example (also see `examples/corinthians-config.json`):

```json
{
  "version": 1,
  "title": "Daily Bible",
  "edition": "ESV",
  "startDate": null,
  "defaultTrack": "corinthians",
  "autoAdvanceTracks": false,
  "tracks": [{
    "id": "corinthians",
    "label": "2 Corinthians",
    "type": "sequential",
    "books": ["2 Corinthians"],
    "days": 13,
    "advance": "completion"
  }],
  "recordings": [{
    "book": "2 Corinthians",
    "chapter": 1,
    "filename": "my-chapter-one.mp3"
  }]
}
```

Schedule types:

| Type | Fields and behavior |
| --- | --- |
| `monthly` | `books`: evenly distributes all their chapters over the current calendar month, including February. Calendar only. |
| `sequential` | `books`, `days`: splits the concatenated books into that many nonempty daily readings and repeats after that many days. |
| `cycle` | `books`, `chaptersPerBook`: this many chapters from each book per reading; each book wraps independently. Use separate tracks for different chapter counts. |
| `custom` | `readings`: an array of daily arrays of `{ "book": "John", "chapter": 1 }`; repeats after the last reading. |

For non-monthly tracks, `advance: "calendar"` (default) follows elapsed local dates
from `startDate`; `advance: "completion"` advances only when a whole reading ends.
Each track keeps its own chapter and position. `autoAdvanceTracks: true` continues
into the next configured track after a reading, then stops after the final track.
A missing recording stops playback rather than silently skipping it. Repeat can
hold one chapter or a whole reading. Speed and supported lock-screen controls
are included.

The default config contains monthly Psalms & Proverbs plus a simple
Genesis-to-Revelation 365-reading plan, including Psalms and Proverbs again.
**It is not an official ESV reading plan.** Calendar schedules have no catch-up
queue; tomorrow selects tomorrow's portion. Completion schedules retain your place.

## Development and checks

Node is needed only for tests; the sole test dependency is `fake-indexeddb`.

```sh
npm ci --ignore-scripts
npm test
python3 -m unittest discover -s tests -v
```

Automated checks exercise imported chapter blobs and progress across database
reopening, duplicate-safe retries, config/filename validation, monthly/leap-year
and full-Bible schedule coverage, repeat, independent track progress, date rollover,
chapter transitions, missing-audio stops, and shell caching with the network absent.
These use a simulated player/IndexedDB for repeatable checks, not an actual iPhone.

Desktop Chrome check on 2026-11-02: imported the included custom config and two
actual downloaded ESV MP3s through the native file picker. Playback used a `blob:`
URL. After stopping the local HTTP server, reloaded the app, recovered chapter
one's saved position (~33.68 seconds), and played chapter two from stored audio.
The server was stopped after this check. This establishes desktop browser behavior.

**Physical iPhone checks still required:** reopen from the Home Screen in airplane
mode; play and seek; lock the phone through a chapter boundary; test headset
play/pause/skip; switch schedules; reopen the following day; and check a large
import against real storage limits. Browser/OS background behavior can interrupt
automatic transitions. No claim of phone acceptance is made yet.

When changing app-shell assets, bump the cache version in `web/sw.js`. Close old
app tabs and reopen while online to activate the new worker. Audio and settings
are stored separately and are not removed by shell-cache updates.
