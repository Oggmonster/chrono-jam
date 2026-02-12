import type { Route } from "./+types/home";
import { Link } from "react-router";

import { ActionLink, PlayerChip, Ribbon } from "~/components/game-primitives";
import { mockPlayers, preloadChecks } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ChronoJam" },
    {
      name: "description",
      content: "ChronoJam lobby and round preview.",
    },
  ];
}

export default function Home() {
  return (
    <main className="jam-page">
      <section className="jam-stage">
        <Ribbon>Welcome to ChronoJam!</Ribbon>

        <p className="jam-subtitle">Room Code: <strong>8372</strong></p>
        <p className="jam-waiting">Waiting for players...</p>

        <ul className="jam-chip-row" aria-label="Players in room">
          {mockPlayers.map((player) => (
            <PlayerChip key={player.id} player={player} />
          ))}
        </ul>

        <article className="jam-status-card" aria-label="Lobby readiness">
          {preloadChecks.map((check) => (
            <p key={check} className="jam-check-item">
              <span aria-hidden>OK</span> {check}
            </p>
          ))}
        </article>

        <div className="jam-actions">
          <ActionLink to="/host/lobby/8372" tone="success">
            Open Host Lobby
          </ActionLink>
          <ActionLink to="/play/game/8372">Open Player Round</ActionLink>
        </div>

        <div className="jam-inline-links">
          <Link to="/play/timeline/8372">Timeline Preview</Link>
          <Link to="/results/8372">Results Preview</Link>
        </div>
      </section>
    </main>
  );
}
