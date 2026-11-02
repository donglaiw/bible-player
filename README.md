# Daily Psalms

A small personal audio player with two reading parts, for a Mac library and a phone browser. No packages,
subscription, downloads, or bundled Bible recordings. Requires Python 3.9+.

## Start on the Mac

```sh
cd ~/dw-desk/bible-player
python3 server.py
```

Open <http://127.0.0.1:8765>. Keep that terminal running. Stop with Control-C.
The interface works before adding audio and shows exactly which chapters are missing.

## Add your recordings later

Use one MP3 per chapter, with this layout:

```text
audio/
  Psalms/
    001.mp3
    002.mp3
    ...
    150.mp3
  Proverbs/
    001.mp3
    ...
    031.mp3
  Genesis/
    001.mp3
    ...
    050.mp3
  ...
```

Numbers without padding and names like `Psalm 16.mp3` also work. M4A and WAV files
are also accepted. Unrecognized or
duplicate chapter names are reported; the player does not guess which recording
to use. Click **Refresh library** after adding files. MP3s are ignored by Git.
An existing library can be used with `python3 server.py --audio-dir /path/to/audio`.
Book folder names and chapter counts are listed in `books.json`. Use those exact
names, including spaces (for example `1 Samuel`). Only the books you have audio
for need folders. Standard 66-book Protestant chapter numbering is used.

## Automatic reading plan

- **Default monthly part:** all 150 Psalms and 31 Proverbs every calendar month.
  Daily portions adjust to 28, 29, 30, or 31 days (roughly five Psalms and one
  Proverb). The phone's local date selects the reading. Starting midmonth selects
  that date's portion; there is no catch-up queue.
- **Annual part:** a simple Genesis-to-Revelation plan divides all 1,189 chapters
  into 365 readings of three or four chapters. It starts on the chosen plan start
  date, which defaults to the first day you open the player. This is **not an
  official ESV reading plan**; the exact ESV plan has not yet been chosen.
  It includes Psalms and Proverbs as part of the whole Bible, in addition to
  the monthly readings. You can use your ESV MP3s with either part.
- Switch between the two parts with the buttons above the reading card. Each
  part remembers its own chapter and playback position. Finishing Psalms and
  Proverbs automatically starts the annual part when its audio is available.
  Playback stops after the annual part. If annual audio is missing, playback stops
  with a message instead of skipping chapters.
- Optional **continue** mode advances each part when its last chapter ends;
  missed dates do not skip readings. Psalms cycle after 30 readings; Proverbs
  after 31, independently. The annual part advances independently too.
- Optional **rolling calendar** mode chooses both parts by elapsed days since
  a start date, using your phone's local date. These cycles do not reset monthly.
- Repeat a chapter or the whole reading. Repeating a reading does not advance it.
- Position, speed, and plan settings are stored in this browser on this device.
  Private browsing, clearing browser data, or changing the site's address may
  lose that position. There is no cross-device progress sync in this version.
- The whole reading must be available before the main Play button is enabled.
  Individual available chapters can be played, but the player will not skip
  missing audio. Next/Previous manually move through the current reading.

## Phone connection — when you are ready

1. Install Tailscale on the phone, sign in to the same tailnet as the Mac, and connect.
2. Keep the server running on the Mac, then run on the Mac:

   ```sh
   tailscale serve --bg http://127.0.0.1:8765
   ```

3. Complete Tailscale's HTTPS setup if prompted, then open its displayed HTTPS URL
   on your phone. Tailnet access rules determine which devices may connect.

Tailscale configuration has **not** been changed by creating this app. Check any
existing Serve configuration before adding this service. This app has no separate
login; keep it bound to localhost and expose it only within your private tailnet.
The Mac must stay awake and online. No router port forwarding is required.

The phone must initiate playback with a tap. The player uses one audio element,
HTTP byte ranges for seeking, and Media Session controls where supported.
**Physical-phone checks still required:** lock the phone during playback, wait
through a chapter transition, try headset controls, and reconnect after losing
network access. Browser background behavior varies. Offline downloads and a
native phone app are not included.

## Checks

```sh
python3 -m unittest discover -s tests -v
node tests/plan.test.js
node tests/player.test.js
```
