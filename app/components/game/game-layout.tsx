import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

function FloatingNote({
  className,
  delay = "0s",
  color = "rgba(226, 102, 89, 0.22)",
  size = 24,
}: {
  className?: string;
  delay?: string;
  color?: string;
  size?: number;
}) {
  return (
    <svg
      className={cn("absolute animate-float", className)}
      style={{ animationDelay: delay, color }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function DoubleNote({
  className,
  delay = "0s",
  color = "rgba(79, 174, 159, 0.22)",
  size = 28,
}: {
  className?: string;
  delay?: string;
  color?: string;
  size?: number;
}) {
  return (
    <svg
      className={cn("absolute animate-float", className)}
      style={{ animationDelay: delay, color }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 3v12.5a3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1 3.5-3.5c.54 0 1.05.12 1.5.34V5.3L9 7.47V19a3.5 3.5 0 0 1-7 0A3.5 3.5 0 0 1 5.5 15.5c.54 0 1.05.12 1.5.34V3l14-2z" />
    </svg>
  );
}

export function GameLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background px-4 py-6 md:py-10">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <FloatingNote className="top-[8%] left-[5%]" delay="0s" color="rgba(226, 102, 89, 0.28)" size={20} />
        <FloatingNote className="top-[45%] left-[3%]" delay="1.2s" color="rgba(31, 38, 64, 0.86)" size={16} />
        <FloatingNote className="bottom-[15%] right-[6%]" delay="0.8s" color="rgba(226, 102, 89, 0.24)" size={22} />

        <DoubleNote className="top-[12%] right-[8%]" delay="0.4s" color="rgba(79, 174, 159, 0.26)" size={26} />
        <FloatingNote className="bottom-[25%] left-[8%]" delay="1.5s" color="rgba(79, 174, 159, 0.24)" size={18} />
        <FloatingNote className="top-[65%] right-[4%]" delay="2s" color="rgba(79, 174, 159, 0.22)" size={14} />

        <DoubleNote className="top-[25%] left-[12%]" delay="0.7s" color="rgba(232, 193, 91, 0.34)" size={24} />
        <FloatingNote className="bottom-[8%] left-[15%]" delay="1.8s" color="rgba(232, 193, 91, 0.28)" size={20} />
        <FloatingNote className="top-[78%] right-[12%]" delay="0.3s" color="rgba(232, 193, 91, 0.26)" size={16} />

        <FloatingNote className="top-[18%] right-[20%]" delay="1s" color="rgba(180, 167, 216, 0.3)" size={18} />
        <DoubleNote className="bottom-[35%] right-[15%]" delay="0.6s" color="rgba(180, 167, 216, 0.26)" size={22} />
        <FloatingNote className="top-[55%] left-[18%]" delay="2.2s" color="rgba(180, 167, 216, 0.22)" size={14} />

        <FloatingNote className="top-[35%] right-[25%]" delay="1.4s" color="rgba(134, 200, 223, 0.34)" size={20} />
        <DoubleNote className="bottom-[45%] left-[22%]" delay="0.2s" color="rgba(134, 200, 223, 0.26)" size={18} />
        <FloatingNote className="top-[85%] left-[30%]" delay="1.7s" color="rgba(134, 200, 223, 0.24)" size={16} />

        <FloatingNote className="top-[5%] left-[40%]" delay="2.5s" color="rgba(226, 102, 89, 0.22)" size={12} />
        <FloatingNote className="top-[92%] right-[35%]" delay="0.9s" color="rgba(79, 174, 159, 0.2)" size={12} />
        <FloatingNote className="top-[50%] left-[45%]" delay="1.1s" color="rgba(232, 193, 91, 0.2)" size={10} />
        <FloatingNote className="top-[30%] right-[40%]" delay="2.3s" color="rgba(180, 167, 216, 0.22)" size={10} />
        <FloatingNote className="bottom-[30%] left-[42%]" delay="1.9s" color="rgba(134, 200, 223, 0.22)" size={11} />
        <DoubleNote className="top-[70%] right-[30%]" delay="1.3s" color="rgba(226, 102, 89, 0.2)" size={14} />
        <FloatingNote className="bottom-[4%] right-[8%]" delay="2.6s" color="rgba(79, 174, 159, 0.2)" size={13} />
        <FloatingNote className="top-[14%] left-[28%]" delay="1.6s" color="rgba(31, 38, 64, 0.88)" size={12} />
        <FloatingNote className="bottom-[12%] right-[26%]" delay="0.5s" color="rgba(31, 38, 64, 0.86)" size={11} />
        <DoubleNote className="top-[60%] left-[6%]" delay="2.1s" color="rgba(31, 38, 64, 0.84)" size={15} />
      </div>

      <div className={cn("relative z-10 mx-auto w-full", className)}>{children}</div>
    </main>
  );
}

export function GameCard({
  className,
  children,
  glow = false,
  ...props
}: ComponentProps<"section"> & { glow?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-lg shadow-foreground/5",
        glow && "animate-pulse-glow",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function GameTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h1 className={cn("text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl", className)}>
      {children}
    </h1>
  );
}

export function GameSubtitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn("text-center text-sm leading-relaxed text-muted-foreground", className)}>{children}</p>;
}

export function Equalizer({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-6 items-end gap-0.5", className)} aria-hidden="true">
      {[0, 0.15, 0.3, 0.1, 0.25].map((delay, i) => (
        <div
          key={i}
          className="h-2 w-1 animate-equalizer rounded-full bg-[hsl(var(--primary))]"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

export function TimerBar({
  progress,
  seconds,
  className,
}: {
  progress: number;
  seconds: number;
  className?: string;
}) {
  const variantClass =
    seconds <= 5 ? "bg-[hsl(var(--destructive))]" : seconds <= 10 ? "bg-[hsl(45_95%_52%)]" : "bg-[hsl(var(--accent))]";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-1000 ease-linear", variantClass)}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      <p className="text-right text-xs font-mono text-muted-foreground">{seconds}s</p>
    </div>
  );
}

export function CatMascot({
  variant = "default",
  className,
  size = "md",
}: {
  variant?: "default" | "thinking" | "celebrate" | "chill";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const imageByVariant = {
    default: "/images/cat-mascot.jpg",
    thinking: "/images/cat-thinking.jpg",
    celebrate: "/images/cat-celebrate.jpg",
    chill: "/images/cat-chill.jpg",
  };

  const sizeClass = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-32 w-32",
  };

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-[#d9ecfb]", sizeClass[size], className)}>
      <img src={imageByVariant[variant]} alt="ChronoJam cat mascot" className="h-full w-full object-cover" />
    </div>
  );
}
