import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

export const STATUS_STYLES = {
  ready: { dot: "bg-emerald-400", label: "Ready", text: "text-emerald-400" },
  "in-progress": {
    dot: "bg-amber-400",
    label: "In Progress",
    text: "text-amber-400",
  },
  empty: { dot: "bg-zinc-600", label: "Empty", text: "text-zinc-500" },
} as const

type Status = keyof typeof STATUS_STYLES

type StatusBadgeProps = {
  status: Status
  className?: string
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status]

  return (
    <Badge
      variant="ghost"
      className={cn("flex items-center gap-1.5 font-mono text-xs", className)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      <span className={style.text}>{style.label}</span>
    </Badge>
  )
}

export { StatusBadge }
