import type { Route } from "./+types/play-timeline";
import { Link } from "react-router";

import { ActionLink, PlayerChip, Ribbon } from "~/components/game-primitives";
import { mockPlayers, roundAnswer } from "~/lib/mock-room";

const timelineYears = [1995, 2004, null, 2022];

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Timeline" }];
}

export default function PlayTimeline({ params }: Route.ComponentProps) {
  return (
    <main className="jam-page">
      <section className="jam-stage jam-stage-wide">
        <Ribbon tone="cool">Place In The Timeline!</Ribbon>

        <ul className="jam-chip-row" aria-label="Players in timeline phase">
          {mockPlayers.map((player) => (
            <PlayerChip key={player.id} player={player} />
          ))}
        </ul>

        <article className="jam-panel-card">
          <h2>Pick The Spot</h2>
          <div className="jam-timeline" role="list" aria-label="Timeline slots">
            {timelineYears.map((year, index) => (
              <div key={index} role="listitem" className={`jam-year-card ${year ? "" : "jam-year-card-empty"}`.trim()}>
                {year ?? "Pick"}
              </div>
            ))}
            <div className="jam-track-card" role="listitem">
              <span>{roundAnswer.title}</span>
              <small>Unknown year</small>
            </div>
          </div>

          <div className="jam-actions">
            <ActionLink to={`/results/${params.roomId}`} tone="success">
              Lock In Placement
            </ActionLink>
          </div>
        </article>

        <div className="jam-inline-links">
          <Link to={`/play/game/${params.roomId}`}>Back To Guess</Link>
          <Link to={`/results/${params.roomId}`}>Round Results</Link>
        </div>
      </section>
    </main>
  );
}
