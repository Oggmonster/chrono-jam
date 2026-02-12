Below is a **tech spec (v0.1)** you can paste into a repo as `SPEC.md`. It’s written for **React Router “Framework mode”** (routes in `app/routes.ts`, route modules, etc.) ([React Router][1]) and **shadcn/ui** components (Tailwind-based, “build your own component library” model). ([Shadcn UI][2])

---

# 1. Product overview

## 1.1 Summary

A multiplayer music timeline party game (Hitster-inspired + Kahoot pacing). Host selects one or more Spotify playlists. Each round, players:

1. listen to a clip,
2. race to correctly identify **song** and **artist** (via offline autocomplete pick-list),
3. place the song into a **timeline** (by year),
4. score is based on **speed + correctness**.

## 1.2 Goals

* **Zero-lag gameplay**: no network calls for autocomplete during rounds.
* **Room-based multiplayer**: host screen + player devices.
* **Preload everything possible**: game pack + indices + (optional) audio buffers before the game starts.
* **Board-game playful UI**: colorful, chunky, friendly.

## 1.3 Non-goals (v1)

* Perfect anti-cheat (party game level is fine).
* Full music streaming for everyone (depends on Spotify playback constraints).

---

# 2. Tech stack

## 2.1 Frontend

* **React Router – Framework mode** (route modules + `app/routes.ts`). ([React Router][1])
* **TypeScript**
* **shadcn/ui** + TailwindCSS for UI primitives. ([Shadcn UI][2])
* State: Zustand or React context (keep simple), plus route loader data for initial fetches.
* Local storage: **IndexedDB** (via `idb` or Dexie) for autocomplete datasets and game pack caching.

## 2.2 Backend

* Node.js (Fastify or Express) + WebSocket server
* Redis (optional) for room state + pub/sub if scaling horizontally
* Spotify Web API integration (playlist ingestion)

## 2.3 Realtime

* WebSockets for:

  * phase changes
  * answer submissions
  * scoring updates
  * latency pings

---

# 3. Game modes and rules

## 3.1 Room roles

* **Host**: creates room, selects playlist(s), starts game, sees scoreboard.
* **Player**: joins via code, answers + timeline placement.
* **Server**: authoritative timing + scoring.

## 3.2 Round phases (server-driven)

1. `LOADING` (clients ensure preloads complete)
2. `LISTEN` (audio starts, timer begins)
3. `GUESS` (song/artist answers accepted)
4. `TIMELINE` (timeline placement accepted)
5. `REVEAL` (show answer + points)
6. `INTERMISSION` (short break)

## 3.3 Scoring (proposal)

* Song correct: `maxSongPts * decay(t)`
* Artist correct: `maxArtistPts * decay(t)`
* Timeline correct: `maxTimelinePts * decay(t)`
* `decay(t)`: linear or exponential from phase open → phase close, based on server timestamp.
* Ties resolved by earlier server-received timestamp.

---

# 4. Spotify data model & ingestion

## 4.1 Ingestion flow

1. Host authenticates (Spotify OAuth).
2. Host chooses playlist(s).
3. Server fetches playlist items from Spotify (one-time per room).
4. Server builds a **GamePack**:

   * curated list of rounds (track + year + playback info)
   * merged autocomplete datasets (base battery ∪ game items)
5. Clients download GamePack once during lobby and cache to IndexedDB.

## 4.2 Playback strategy (choose one)

* **Preview URL mode**: use Spotify track `preview_url` when available (common MVP approach; not guaranteed for all tracks).
* **Premium host playback**: Spotify Web Playback SDK requires Premium. ([React Router][3])
* Hybrid: preview_url else fallback (skip track / hint mode / host playback).

*(Spec should include your chosen mode explicitly to avoid surprises.)*

---

# 5. Offline autocomplete spec (no network calls during gameplay)

## 5.1 Key requirement

Autocomplete options must be generated from **local data only** (in-memory after preload). No Spotify search calls during rounds.

## 5.2 Datasets

* **Base battery** (static, shipped via CDN or app asset):

  * common tracks + artists (large enough to hide answers)
  * versioned: `baseBatteryVersion`
* **Game list** (from selected playlists):

  * tracks/artists used in this room

## 5.3 Merge behavior

* `mergedTracks = dedupe(baseTracks ∪ gameTracks)`
* `mergedArtists = dedupe(baseArtists ∪ gameArtists)`
* Do not bias rankings toward game items (prevents “giveaway”).

## 5.4 Client-side autocomplete algorithm (fast + simple)

* Normalize text: lowercase, remove punctuation, strip diacritics.
* Build prefix buckets: first 2–3 chars → list of candidate IDs.
* Match ranking (in order):

  1. exact prefix match
  2. token-start match
  3. token-contains match
* Return top N (e.g., 8–12 options).
* Input UI forces selection from list (no free typing submission).

## 5.5 UX rules

* Require at least 2 characters before showing suggestions.
* Display: `Track Title — Artist` for track search, and artist name alone for artist.
* When the player picks an option, submit the **ID** (not raw text).

---

# 6. Preloading and performance

## 6.1 Lobby preload checklist

Client must confirm:

* GamePack downloaded and validated (hash)
* Autocomplete indices loaded into memory
* Audio readiness:

  * preload next 2–3 clips (or just ensure first clip buffers)
* Clock sync: RTT ping and server offset stored

Host sees readiness statuses per player; cannot start until threshold met (e.g., 80% ready or manual override).

## 6.2 Caching

* Cache GamePack in IndexedDB by `{roomId, gamePackHash}`
* Cache base battery by `{baseBatteryVersion}`
* Use service worker (optional) to improve offline / flaky networks.

---

# 7. System architecture

## 7.1 High-level components

**Client**

* Host UI (large display)
* Player UI (mobile-friendly)
* Shared game engine client (phase handling, timers, state transitions)
* Autocomplete engine (offline)
* Timeline engine (insert/verify)

**Server**

* Room manager (create/join/leave)
* Game orchestrator (phases, timers)
* Scoring engine (authoritative)
* Spotify ingestion worker (build packs)

## 7.2 Room state (server-authoritative)

* `roomId`, `hostId`
* `players[]` (id, name, connected, latency)
* `gamePackHash`
* `roundIndex`
* `phase`, `phaseEndsAt`
* `scores{playerId: number}`
* Per-round:

  * who got song correct + timestamp
  * who got artist correct + timestamp
  * who placed timeline correct + timestamp

---

# 8. API and realtime protocol

## 8.1 REST endpoints

* `POST /api/rooms` → create room
* `POST /api/rooms/:roomId/join` → join room
* `POST /api/rooms/:roomId/gamepack` → host triggers pack build
* `GET /api/rooms/:roomId/gamepack` → clients download pack (CDN-friendly; ETag)
* `POST /api/rooms/:roomId/start` → start game

## 8.2 WebSocket messages (example)

Server → Client:

* `ROOM_STATE`
* `PHASE_CHANGE`
* `ROUND_START`
* `SCORE_UPDATE`
* `REVEAL`
* `ERROR`

Client → Server:

* `PING`
* `SUBMIT_SONG` `{roundId, trackId}`
* `SUBMIT_ARTIST` `{roundId, artistId}`
* `SUBMIT_TIMELINE` `{roundId, insertIndex}`
* `READY_STATUS`

---

# 9. UI/UX spec (shadcn/ui + colorful boardgame style)

## 9.1 Visual language

* Big rounded cards, playful shadows
* Bright palette + gradients, but keep text contrast AA+
* “Board tokens” for players (avatars as chips)
* Animations: confetti burst, card flip reveal, timeline snap

## 9.2 Core screens (routes)

Using React Router framework routing (`app/routes.ts`, route modules). ([React Router][1])

**Routes**

* `/` Landing (Start / Join)
* `/host` Host setup (auth + playlist pick)
* `/host/lobby/:roomId`
* `/host/game/:roomId`
* `/play/join/:roomId`
* `/play/lobby/:roomId`
* `/play/game/:roomId`
* `/results/:roomId`

## 9.3 Component inventory (shadcn)

* `Card`, `Button`, `Dialog`, `Sheet`, `Tabs`, `Progress`, `Badge`, `Toast`
* Custom:

  * `AutocompleteSelect`
  * `TimelineBoard`
  * `PlayerChips`
  * `RoundTimer`
  * `RevealCard`

(shadcn is code-copied components, so you’ll tailor styling per theme.) ([Shadcn UI][2])

---

# 10. Data schemas

## 10.1 GamePack

* `meta`: version, createdAt, playlistIds, seed
* `rounds[]`: `{roundId, trackId, trackName, artistId, artistName, year, previewUrl?, spotifyUri?, coverUrl?}`
* `autocomplete`:

  * `tracks.items[]`: `{id, display, norm}`
  * `tracks.prefixIndex`: `{[prefix]: number[]}`
  * `artists.items[]`: `{id, display, norm}`
  * `artists.prefixIndex`: `{[prefix]: number[]}`

## 10.2 Submission

* `playerId`, `roundId`, `type`, `choiceId`, `clientTime`, `serverReceivedTime`

---

# 11. Security & abuse considerations

* Room codes: short, human-friendly; rotate on new game.
* Rate limit submissions per player per phase (spam protection).
* Don’t trust client scoring; server calculates everything.
* Accept that audio URLs / identifiers can be inspected; party-grade security.

---

# 12. Testing & quality

* Unit tests:

  * autocomplete ranking
  * timeline correctness
  * scoring decay math
* Integration:

  * room join/leave
  * phase transitions under latency
* Load test:

  * 1 room × 30 players
  * 20 rooms concurrent (if you plan to scale)

---

# 13. Milestones (practical)

**MVP**

1. Room + lobby + WS phases
2. GamePack ingestion from Spotify playlists
3. Offline autocomplete selection
4. Timeline placement + scoring
5. Host display scoreboard + reveal

**V1**

* Base battery versioning + CDN delivery
* Better fallback for missing audio previews
* Theming polish (boardgame profile)
* Spectator mode

---

If you want, I can also:

* propose a **folder structure** for React Router framework mode (`app/routes.ts`, `app/routes/**`, `app/components/**`, etc.),
* define a **complete WebSocket message schema** (with TS types),
* and sketch a **design token set** (colors/typography/shadows) that fits “colorful board game” but stays readable.

[1]: https://reactrouter.com/start/framework/routing?utm_source=chatgpt.com "Routing"
[2]: https://ui.shadcn.com/docs?utm_source=chatgpt.com "Introduction - Shadcn UI"
[3]: https://reactrouter.com/?utm_source=chatgpt.com "React Router Official Documentation"
