import type { Route } from "./+types/results";
import { Link } from "react-router";

import { ActionLink, Ribbon } from "~/components/game-primitives";
import { leaderboard, mockPlayers, roundAnswer } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Round Results" }];
}

export default function Results({ params }: Route.ComponentProps) {
  return (
    <main className="jam-page">
      <section className="jam-stage jam-stage-wide">
        <Ribbon>Round Results</Ribbon>

        <p className="jam-subtitle">
          {roundAnswer.title} by {roundAnswer.artist} ({roundAnswer.year})
        </p>

        <article className="jam-panel-card">
          <ol className="jam-score-list" aria-label="Round points">
            {leaderboard.map((entry) => {
              const player = mockPlayers.find(({ id }) => id === entry.playerId)!;
              return (
                <li key={entry.playerId} className="jam-score-row jam-score-row-highlight">
                  <span className="jam-score-player">
                    {entry.place} {player.name}
                  </span>
                  <strong>+{entry.points}</strong>
                </li>
              );
            })}
          </ol>
        </article>

        <div className="jam-actions">
          <ActionLink to={`/play/game/${params.roomId}`} tone="success">
            Next Round
          </ActionLink>
          <ActionLink to={`/host/lobby/${params.roomId}`} tone="neutral">
            Back to Lobby
          </ActionLink>
        </div>

        <div className="jam-inline-links">
          <Link to="/">Landing Screen</Link>
          <Link to={`/play/timeline/${params.roomId}`}>Timeline Preview</Link>
        </div>
      </section>
    </main>
  );
}
