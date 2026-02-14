"use client"

import { cn } from "@/lib/utils"

function FloatingNote({
  className,
  delay = "0s",
  color = "text-primary/25",
  size = 24,
}: {
  className?: string
  delay?: string
  color?: string
  size?: number
}) {
  return (
    <svg
      className={cn("absolute animate-float", color, className)}
      style={{ animationDelay: delay }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  )
}

function DoubleNote({
  className,
  delay = "0s",
  color = "text-accent/20",
  size = 28,
}: {
  className?: string
  delay?: string
  color?: string
  size?: number
}) {
  return (
    <svg
      className={cn("absolute animate-float", color, className)}
      style={{ animationDelay: delay }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M21 3v12.5a3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1 3.5-3.5c.54 0 1.05.12 1.5.34V5.3L9 7.47V19a3.5 3.5 0 0 1-7 0A3.5 3.5 0 0 1 5.5 15.5c.54 0 1.05.12 1.5.34V3l14-2z" />
    </svg>
  )
}

export function GameLayout({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background flex items-center justify-center p-4">
      {/* Scattered music notes in different colors and sizes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Coral / primary notes */}
        <FloatingNote className="top-[8%] left-[5%]" delay="0s" color="text-primary/20" size={20} />
        <FloatingNote className="top-[45%] left-[3%]" delay="1.2s" color="text-primary/15" size={16} />
        <FloatingNote className="bottom-[15%] right-[6%]" delay="0.8s" color="text-primary/20" size={22} />

        {/* Teal / accent notes */}
        <DoubleNote className="top-[12%] right-[8%]" delay="0.4s" color="text-accent/20" size={26} />
        <FloatingNote className="bottom-[25%] left-[8%]" delay="1.5s" color="text-accent/18" size={18} />
        <FloatingNote className="top-[65%] right-[4%]" delay="2s" color="text-accent/15" size={14} />

        {/* Amber / warm notes */}
        <DoubleNote className="top-[25%] left-[12%]" delay="0.7s" color="text-[hsl(45_90%_55%)]/20" size={24} />
        <FloatingNote className="bottom-[8%] left-[15%]" delay="1.8s" color="text-[hsl(45_90%_55%)]/18" size={20} />
        <FloatingNote className="top-[78%] right-[12%]" delay="0.3s" color="text-[hsl(45_90%_55%)]/15" size={16} />

        {/* Soft purple notes */}
        <FloatingNote className="top-[18%] right-[20%]" delay="1s" color="text-[hsl(262_50%_58%)]/18" size={18} />
        <DoubleNote className="bottom-[35%] right-[15%]" delay="0.6s" color="text-[hsl(262_50%_58%)]/15" size={22} />
        <FloatingNote className="top-[55%] left-[18%]" delay="2.2s" color="text-[hsl(262_50%_58%)]/12" size={14} />

        {/* Blue notes */}
        <FloatingNote className="top-[35%] right-[25%]" delay="1.4s" color="text-[hsl(200_70%_52%)]/18" size={20} />
        <DoubleNote className="bottom-[45%] left-[22%]" delay="0.2s" color="text-[hsl(200_70%_52%)]/15" size={18} />
        <FloatingNote className="top-[85%] left-[30%]" delay="1.7s" color="text-[hsl(200_70%_52%)]/12" size={16} />

        {/* Extra scattered small notes for density */}
        <FloatingNote className="top-[5%] left-[40%]" delay="2.5s" color="text-primary/10" size={12} />
        <FloatingNote className="top-[92%] right-[35%]" delay="0.9s" color="text-accent/10" size={12} />
        <FloatingNote className="top-[50%] left-[45%]" delay="1.1s" color="text-[hsl(45_90%_55%)]/10" size={10} />
        <FloatingNote className="top-[30%] right-[40%]" delay="2.3s" color="text-[hsl(262_50%_58%)]/10" size={10} />
      </div>

      <div className={cn("relative z-10 w-full", className)}>
        {children}
      </div>
    </div>
  )
}

export function GameCard({
  children,
  className,
  glow = false,
}: {
  children: React.ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground rounded-2xl border border-border shadow-lg shadow-foreground/5",
        glow && "animate-pulse-glow",
        className
      )}
    >
      {children}
    </div>
  )
}

export function GameBadge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "danger" | "info" | "listening"
  className?: string
}) {
  const variants = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-[hsl(155_65%_40%)] text-white",
    warning: "bg-[hsl(45_95%_52%)] text-[hsl(230_25%_18%)]",
    danger: "bg-destructive text-destructive-foreground",
    info: "bg-accent text-accent-foreground",
    listening: "bg-[hsl(200_75%_50%)] text-white",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export function GameTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h1
      className={cn(
        "text-3xl md:text-4xl font-bold tracking-tight text-foreground text-center text-balance",
        className
      )}
    >
      {children}
    </h1>
  )
}

export function GameSubtitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("text-muted-foreground text-sm text-center leading-relaxed", className)}>
      {children}
    </p>
  )
}

export function Equalizer({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-0.5 h-6", className)}>
      {[0, 0.15, 0.3, 0.1, 0.25].map((delay, i) => (
        <div
          key={i}
          className="w-1 bg-primary rounded-full animate-equalizer"
          style={{
            animationDelay: `${delay}s`,
            height: "8px",
          }}
        />
      ))}
    </div>
  )
}

export function TimerBar({
  progress,
  seconds,
  variant = "default",
  className,
}: {
  progress: number
  seconds: number
  variant?: "default" | "warning" | "danger"
  className?: string
}) {
  const barColor =
    variant === "danger"
      ? "bg-destructive"
      : variant === "warning"
        ? "bg-[hsl(45_95%_52%)]"
        : "bg-accent"

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000 ease-linear",
            barColor
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-end">
        <span className="text-xs font-mono text-muted-foreground">{seconds}s</span>
      </div>
    </div>
  )
}

export function PlayerAvatar({
  name,
  score,
  rank,
  className,
  highlight = false,
}: {
  name: string
  score?: number
  rank?: number
  className?: string
  highlight?: boolean
}) {
  const colors = [
    "bg-primary text-primary-foreground",
    "bg-accent text-accent-foreground",
    "bg-[hsl(45_95%_52%)] text-foreground",
    "bg-[hsl(200_75%_50%)] text-white",
    "bg-[hsl(262_50%_58%)] text-white",
  ]
  const colorIndex = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
        highlight
          ? "bg-primary/8 border border-primary/25"
          : "bg-muted/60 border border-transparent",
        className
      )}
    >
      {rank !== undefined && (
        <span className="text-lg font-bold text-muted-foreground min-w-[1.5rem]">
          #{rank}
        </span>
      )}
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          colors[colorIndex]
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <span className="font-semibold text-card-foreground flex-1">{name}</span>
      {score !== undefined && (
        <span className="text-lg font-bold font-mono text-primary">{score.toLocaleString()}</span>
      )}
    </div>
  )
}

export function CatMascot({
  variant = "default",
  className,
  size = "md",
}: {
  variant?: "default" | "thinking" | "celebrate" | "chill"
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const images = {
    default: "/images/cat-mascot.jpg",
    thinking: "/images/cat-thinking.jpg",
    celebrate: "/images/cat-celebrate.jpg",
    chill: "/images/cat-chill.jpg",
  }

  const sizes = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  }

  return (
    <div className={cn("relative", sizes[size], className)}>
      <img
        src={images[variant]}
        alt="ChronoJam cat mascot"
        className="w-full h-full object-cover rounded-2xl"
      />
    </div>
  )
}
