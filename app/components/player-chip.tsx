import type { CSSProperties } from "react";

type PlayerChipModel = {
  name: string;
  color: string;
};

export function PlayerChip({ player }: { player: PlayerChipModel }) {
  return (
    <li
      className="inline-flex items-center gap-2 rounded-full border-2 border-[#243a84] px-2 py-1 text-[#12296c]"
      style={{ background: `linear-gradient(180deg, ${player.color}dd, ${player.color})` } as CSSProperties}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#12296c] bg-[#fff7d5] text-xs font-extrabold">
        {player.name.slice(0, 1)}
      </span>
      <span className="pr-1 text-sm font-extrabold leading-none">{player.name}</span>
    </li>
  );
}
