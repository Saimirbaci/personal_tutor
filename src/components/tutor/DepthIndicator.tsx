interface DepthIndicatorProps {
  /** 1–5 engagement-depth score. */
  score: number;
  /** Optional classifier rationale, surfaced as a tooltip. */
  rationale?: string;
  size?: 'sm';
}

/** Total bars in the indicator — one per rubric level. */
const LEVELS = 5;

const DEPTH_LABELS = ['Surface', 'Shallow', 'Moderate', 'Deep', 'Mastery'] as const;

/** Fill color graded surface (muted) → deep (accent), keyed by 1–5 score. */
function fillClass(score: number): string {
  if (score <= 1) return 'bg-[#4a5568]';
  if (score === 2) return 'bg-[#5b7a9e]';
  if (score === 3) return 'bg-[#2E5FA3]';
  if (score === 4) return 'bg-[#2f8f6b]';
  return 'bg-[#16A34A]';
}

/**
 * Compact 1–5 depth chip: five small bars filled to `score`, color-graded from
 * muted (surface-level Q&A) to green (deep, Socratic engagement). Pure
 * presentational — sized to sit beside a conversation card's 11px title.
 */
export default function DepthIndicator({ score, rationale, size = 'sm' }: DepthIndicatorProps) {
  const clamped = Math.min(LEVELS, Math.max(1, Math.round(score)));
  const label = DEPTH_LABELS[clamped - 1];
  const tooltip = rationale
    ? `Depth ${clamped}/5 · ${label} — ${rationale}`
    : `Depth ${clamped}/5 · ${label}`;
  const containerHeight = size === 'sm' ? 'h-2.5' : 'h-3';

  return (
    <div
      className={`flex items-end gap-px shrink-0 ${containerHeight}`}
      title={tooltip}
      role="img"
      aria-label={tooltip}
    >
      {Array.from({ length: LEVELS }, (_, i) => {
        const filled = i < clamped;
        // Step each bar up slightly so the chip reads as a depth ramp.
        const stepHeight = `${40 + i * 15}%`;
        return (
          <span
            key={i}
            className={`w-0.5 rounded-sm ${filled ? fillClass(clamped) : 'bg-[#1a2540]'}`}
            style={{ height: stepHeight }}
          />
        );
      })}
    </div>
  );
}
