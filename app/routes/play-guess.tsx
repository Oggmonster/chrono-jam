import type { Route } from "./+types/play-guess";
import { Link } from "react-router";

import { ActionLink, Ribbon } from "~/components/game-primitives";
import { leaderboard, mockPlayers } from "~/lib/mock-room";

const waveform = [
  16, 28, 22, 40, 18, 34, 30, 12, 26, 36, 20, 31, 24, 42, 15, 27, 19,
];

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Guess The Song" }];
}

export default function PlayGuess({ params }: Route.ComponentProps) {
  return (
    <main className="jam-page">
      <section className="jam-stage jam-stage-wide">
        <Ribbon tone="cool">Guess The Song!</Ribbon>

        <div className="jam-top-strip">
          <p className="jam-round-label">Room {params.roomId} · Round 1/10</p>
          <span className="jam-timer" aria-label="Round timer">
            18s
          </span>
        </div>

        <div className="jam-layout-grid">
          <article className="jam-panel-card">
            <h2>Audio Clip</h2>
            <div className="jam-wave" aria-hidden>
              {waveform.map((height, index) => (
                <span key={index} style={{ height }} />
              ))}
            </div>
            <div className="jam-progress-track">
              <div className="jam-progress-fill" />
            </div>

            <label className="jam-field">
              Song title
              <input value="Blinding Lights" readOnly aria-label="Song title answer" />
            </label>

            <label className="jam-field">
              Artist
              <input value="The Weeknd" readOnly aria-label="Artist answer" />
            </label>

            <div className="jam-actions">
              <ActionLink to={`/play/timeline/${params.roomId}`}>Submit Guess</ActionLink>
            </div>
          </article>

          <aside className="jam-panel-card">
            <h2>Live Leaderboard</h2>
            <ol className="jam-score-list">
              {leaderboard.slice(0, 3).map((entry) => {
                const player = mockPlayers.find(({ id }) => id === entry.playerId)!;
                return (
                  <li key={entry.playerId} className="jam-score-row">
                    <span className="jam-score-player">{player.name}</span>
                    <strong>{entry.points}</strong>
                  </li>
                );
              })}
            </ol>
            <p className="jam-note">Step 1 uses mocked values. Autocomplete and scoring logic land in Steps 3 and 4.</p>
          </aside>
        </div>

        <div className="jam-inline-links">
          <Link to={`/host/lobby/${params.roomId}`}>Host Lobby</Link>
          <Link to={`/results/${params.roomId}`}>Result Preview</Link>
        </div>
      </section>
    </main>
  );
}
