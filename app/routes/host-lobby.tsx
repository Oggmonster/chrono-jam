import type { Route } from "./+types/host-lobby";
import { Link } from "react-router";

import { ActionLink, PlayerChip, Ribbon } from "~/components/game-primitives";
import { mockPlayers, preloadChecks } from "~/lib/mock-room";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ChronoJam | Host Lobby" }];
}

export default function HostLobby({ params }: Route.ComponentProps) {
  return (
    <main className="jam-page">
      <section className="jam-stage jam-stage-wide">
        <Ribbon>Host Lobby</Ribbon>

        <p className="jam-subtitle">Room Code: <strong>{params.roomId}</strong></p>

        <div className="jam-layout-grid">
          <article className="jam-panel-card">
            <h2>Players Ready</h2>
            <ul className="jam-chip-row" aria-label="Ready players">
              {mockPlayers.map((player) => (
                <PlayerChip key={player.id} player={player} />
              ))}
            </ul>
          </article>

          <article className="jam-panel-card">
            <h2>Preload Status</h2>
            <ul className="jam-check-list" aria-label="Preload checklist">
              {preloadChecks.map((check) => (
                <li key={check} className="jam-check-item">
                  <span aria-hidden>OK</span> {check}
                </li>
              ))}
            </ul>
            <p className="jam-note">All players synced. Ready to start.</p>
          </article>
        </div>

        <div className="jam-actions">
          <ActionLink to={`/play/game/${params.roomId}`} tone="success">
            Start Round 1
          </ActionLink>
          <ActionLink to="/" tone="neutral">
            Back to Landing
          </ActionLink>
        </div>

        <div className="jam-inline-links">
          <Link to={`/play/timeline/${params.roomId}`}>Timeline Screen</Link>
          <Link to={`/results/${params.roomId}`}>Results Screen</Link>
        </div>
      </section>
    </main>
  );
}
