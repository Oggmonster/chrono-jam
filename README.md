# ChronoJam

ChronoJam is a multiplayer music party game. One player hosts the room, everyone else joins with a code, and players race to guess song title, artist, and release year.

## How It Works

1. The host opens the Host Lobby and creates a game room.
2. Players join from their phones using the room code.
3. Each round plays a track clip and players submit guesses.
4. The game scores answers and reveals results across rounds.

Host flow uses Spotify playback and playlist data. Players interact in real time through the web app.

## Live App

https://chrono-jam.onrender.com/

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Local URL: `http://localhost:5173`

## Scripts

- `npm run dev` - Start local dev server
- `npm run build` - Build production bundle
- `npm run start` - Run production server from `build/`
- `npm run typecheck` - Generate route types and run TypeScript checks
- `npm run test` - Run tests
