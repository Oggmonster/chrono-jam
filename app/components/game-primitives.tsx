import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

import type { MockPlayer } from "~/lib/mock-room";

type PlayerChipProps = {
  player: MockPlayer;
};

export function PlayerChip({ player }: PlayerChipProps) {
  return (
    <li className="jam-chip" style={{ "--chip-color": player.color } as CSSProperties}>
      <span className="jam-avatar">{player.name.slice(0, 1)}</span>
      <span className="jam-chip-name">{player.name}</span>
    </li>
  );
}

type RibbonProps = {
  children: ReactNode;
  tone?: "warm" | "cool";
};

export function Ribbon({ children, tone = "warm" }: RibbonProps) {
  return <h1 className={`jam-ribbon jam-ribbon-${tone}`}>{children}</h1>;
}

type ActionLinkProps = {
  to: string;
  children: ReactNode;
  tone?: "primary" | "success" | "neutral";
};

export function ActionLink({ to, children, tone = "primary" }: ActionLinkProps) {
  const className = {
    primary: "jam-btn jam-btn-primary",
    success: "jam-btn jam-btn-success",
    neutral: "jam-btn jam-btn-neutral",
  }[tone];

  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
