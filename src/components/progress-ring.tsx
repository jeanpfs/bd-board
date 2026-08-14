interface ProgressRingProps {
  value: number | null
  size?: number
  stroke?: number
}

export function ProgressRing({
  value,
  size = 52,
  stroke = 4,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value))
  const offset = circumference * (1 - pct / 100)

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        value === null ? 'No completion data' : `${Math.round(pct)}% complete`
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/8"
        />
        {value !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="stroke-status-closed transition-[stroke-dashoffset] duration-700 ease-out"
          />
        ) : null}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-xs font-[550] tabular-nums text-foreground"
        aria-hidden="true"
      >
        {value === null ? '—' : `${Math.round(pct)}%`}
      </span>
    </div>
  )
}
