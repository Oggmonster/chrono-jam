import type { CSSProperties } from "react";

type PlayerChipModel = {
  name: string;
  color: string;
};

export function PlayerChip({ player }: { player: PlayerChipModel }) {
  return (
    <li
      className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-[hsl(var(--foreground))]"
      style={{ boxShadow: `inset 0 0 0 1px ${player.color}44` } as CSSProperties}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold text-white"
        style={{ backgroundColor: player.color } as CSSProperties}
      >
        {player.name.slice(0, 1)}
      </span>
      <span className="pr-1 text-sm font-bold leading-none">{player.name}</span>
    </li>
  );
}
