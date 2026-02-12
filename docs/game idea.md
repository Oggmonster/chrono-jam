Here’s a concrete plan for a **Hitster × Kahoot** web app built around **Spotify playlists**, with **local (no-network) autocomplete**, **fastest-correct scoring**, and **preloading** to keep gameplay snappy.

---

## 1) Core game loop (what players do each round)

**Round phases**

1. **Listen**: play a short audio clip (10–20s).
2. **Answer race** (Kahoot style):

   * Players submit **Song Title** (track) and **Artist** (primary artist) as *separate* answers (can be two inputs or a 2-step flow).
   * Each input uses **autocomplete from a local list** (no network calls during the round).
3. **Timeline**:

   * Once a player has the track correct, they must place it in their personal (or shared) timeline by year.
4. **Reveal**: show correct track/artist + year + who scored.
5. Next round.

**Scoring (suggested)**

* **Song correct**: 1000 pts max, decays with time (e.g., −20 pts/sec after reveal-start).
* **Artist correct**: 600 pts max, decays similarly.
* **Timeline placement correct**: 800 pts max, decays after timeline phase begins.
* **Streak bonus**: +10% per consecutive fully-correct rounds (caps at e.g. 50%).
* If multiple players are correct, points are strictly by **submission timestamp** (server time).

This matches your “fastest to get it right” + timeline skill.

---

## 2) Key design constraint: audio playback choice

You have three practical options:

### Option A — Use Spotify Web Playback SDK (full songs)

* Pro: best experience.
* Con: requires **Spotify Premium** for playback in the browser. ([developer.spotify.com][1])
* Also note Spotify’s SDK/policy constraints (commercial usage caveats, etc.). ([developer.spotify.com][2])

### Option B — Use Spotify `preview_url` (30s previews)

* Pro: no Premium requirement; easy.
* Con: many tracks have `preview_url = null`. ([GitHub][3])
  (This is the biggest real-world headache.)

### Option C — “No audio streaming” mode

* You don’t play audio; instead show a “sound-alike hint” (lyrics-free), or show gradually revealing metadata.
* Pro: avoids licensing/SDK issues.
* Con: less fun; not Hitster-like.

**Most teams do**: start with **preview_url** for MVP, while building a fallback strategy:

* If preview missing → pick another track OR use Spotify SDK if host has Premium, OR use hint mode.

---

## 3) Spotify data ingestion (before the game starts)

You’ll want a **Game Host** who selects 1+ Spotify playlists.

**Server does the playlist fetch and builds the “game pack”**

* Use Spotify Web API to retrieve playlist items. ([developer.spotify.com][4])
* Use **Authorization Code with PKCE** if you’re doing this from a SPA; it’s the recommended approach for SPAs/mobile where you can’t store a client secret. ([developer.spotify.com][5])
* Spotify has rolling-window rate limiting; avoid doing this from every client. ([developer.spotify.com][6])

**For each track you’ll store (server-side)**

* `track_id`
* `track_name`
* `artist_id` + `artist_name` (primary artist + optionally featured)
* `album_name`
* `release_date` (often includes year-month-day; your timeline can use just year)
* `preview_url` (if using preview mode)
* optionally: `popularity`, `duration_ms`, `is_playable`, cover image url

Then you generate a compact **GamePack JSON** the clients download once.

---

## 4) The “base battery” + merging strategy for autocomplete (no giveaway)

You want autocomplete that:

* prevents spelling errors,
* doesn’t make the “correct” options obviously small,
* works offline during rounds.

### Build two local indices on each client

1. **Track index**: list of track display strings + normalized tokens
2. **Artist index**: list of artist names + normalized tokens

### Merge approach (your idea is right)

* **Base battery**: a big, common-catalog list (tracks + artists)
* **Game list**: the selected playlist tracks/artists
* **Merged**: `merged = base ∪ game` (dedupe by id/name)

**Important:** the base must be *large enough* that autocomplete is not an answer leak.

* Rule of thumb: if the game has 200 tracks, base should be **10k–100k** tracks (or more), otherwise “type 2 letters → only 3 options” gives it away.

### Preventing “playlist giveaway”

Even with a huge base, you can still leak if you weight game items too strongly.

* Do **not** rank game items to the top.
* Rank by generic scoring (prefix match + token match), not by “isGameItem”.
* You *can* slightly boost *popular* items globally, but not “in this playlist”.

### Data structure for fast offline autocomplete

* Keep it simple at first:

  * Normalize strings (lowercase, remove punctuation/diacritics).
  * Use **prefix index**: map first 2–3 characters → candidate IDs.
  * Then run a lightweight match (token contains) on the candidate pool.
* Store in IndexedDB + load into memory at game start.

---

## 5) Preloading strategy (no load during the game)

### What to preload

* The full **GamePack** (all rounds metadata, years, ids).
* The **merged autocomplete indices** (track + artist).
* Audio:

  * If preview_url mode: preload the next N previews per client using `<audio>` buffering (careful: memory + mobile data).
  * Alternative: preload only the next **2–3** previews; keep a small rolling buffer.

### What NOT to do

* Don’t call Spotify Search API during gameplay for autocomplete; it’ll trigger rate limits and latency. ([developer.spotify.com][6])
* Don’t have each player fetch playlist tracks themselves (duplicated calls + slower).

### “Ready check” before starting

Have a lobby screen that shows per-player:

* “Game pack downloaded”
* “Autocomplete loaded”
* “Audio buffer ok”
  Only let host start when everyone is ready (or after a timeout, drop late joiners).

---

## 6) Multiplayer architecture (Kahoot-like)

### Roles

* **Host**: creates room, chooses playlist(s), starts game.
* **Players**: join with room code.
* **Server**: authoritative time + scoring.

### Real-time tech

* WebSockets (or WebRTC datachannel, but WS is simpler).
* Server sends:

  * round start timestamp
  * track to play (id + preview_url or SDK track uri)
  * phase transitions (answer open/close, timeline open/close)
* Client sends:

  * answer submissions (selected option id)
  * timeline placement index

### Anti-cheat basics

You can’t fully stop cheating in a browser, but you can raise effort:

* Don’t send the correct answer in plaintext until reveal.
* If using preview_url, the client necessarily has the URL—someone could inspect it.

  * Mitigation: accept that casual party games don’t need perfect security.
  * If you want more: proxy audio through your server (but that introduces cost and legal complexity).

---

## 7) Timeline mechanic details

Two variants:

### Personal timelines (Hitster-like)

* Each player places the new card in *their own* timeline.
* Pros: independent skill; fun.
* Cons: more UI.

### Shared timeline (party mode)

* Everyone votes on placement; fastest correct gets points.
* Pros: simpler UI.
* Cons: less personal.

**Implementation tip**

* Represent a timeline as ordered track IDs.
* Placement is an integer insert position.
* Correctness: compare to sorted-by-year order of that player’s timeline + new card.

---

## 8) MVP scope you can build quickly

**MVP (2–4 weeks)**

* preview_url playback
* 1 playlist → 30 rounds max
* merged autocomplete with base list (static file)
* 2 answer fields: track + artist
* personal timeline placement
* scoreboard

**V2**

* multiple playlists + categories (decades, genres)
* host Premium mode (Web Playback SDK) for full songs ([developer.spotify.com][1])
* better autocomplete (fuzzy match, typos)
* team mode, power-ups, difficulty modes

---

## 9) Suggested data formats (so everything is cacheable)

**GamePack.json**

```json
{
  "roomVersion": 1,
  "rounds": [
    {
      "roundId": "r01",
      "trackId": "…",
      "trackName": "…",
      "artistId": "…",
      "artistName": "…",
      "year": 1998,
      "previewUrl": "…"
    }
  ],
  "autocomplete": {
    "tracks": { "prefixIndex": { "th": [1,2,3] }, "items": [{"id":"…","t":"the sign — ace of base"}] },
    "artists": { "prefixIndex": { "ac": [5,9] }, "items": [{"id":"…","t":"ace of base"}] }
  }
}
```

Clients can load this once and do everything offline during play.

---

## 10) Next step (actionable build plan)

1. Decide playback mode (preview_url vs SDK vs hybrid).
2. Build **server “playlist → GamePack” pipeline** (one request per room).
3. Create **static base battery dataset** (start with 20k artists + 50k tracks).
4. Implement client:

   * Lobby preload
   * Round UI with local autocomplete
   * Timeline UI
5. Add real-time scoring and phase timing.

If you tell me which playback route you prefer (preview-only vs Premium SDK vs hybrid), I’ll sketch the exact room protocol (WebSocket message types) and a concrete frontend component breakdown.

[1]: https://developer.spotify.com/documentation/web-playback-sdk?utm_source=chatgpt.com "Web Playback SDK"
[2]: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started?utm_source=chatgpt.com "Getting Started with Web Playback SDK - Spotify for Developers"
[3]: https://github.com/spotify/web-api/issues/148?utm_source=chatgpt.com "Preview URL Field is null · Issue #148 · spotify/web-api"
[4]: https://developer.spotify.com/documentation/web-api/concepts/playlists?utm_source=chatgpt.com "Playlists - Spotify for Developers"
[5]: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow?utm_source=chatgpt.com "Authorization Code with PKCE Flow"
[6]: https://developer.spotify.com/documentation/web-api/concepts/rate-limits?utm_source=chatgpt.com "Spotify's rate limit"
