import { motion } from 'framer-motion';

interface MasteryRingProps {
  /** Mastery score, 0–100. */
  score: number;
  /** Pillar accent color used at high mastery. */
  color: string;
  /** Diameter in px (default 28). */
  size?: number;
}

const RADIUS = 10;
const STROKE = 3;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Color for the filled arc, bucketed by mastery confidence. */
function arcColor(score: number, pillarColor: string): string {
  if (score < 33) return '#ef4444'; // shaky — red-tinted
  if (score < 66) return '#eab308'; // developing — amber
  return pillarColor; // solid — full pillar color
}

/**
 * Small circular progress ring whose fill proportion and hue reflect a 0–100
 * mastery score: red (shaky) → amber (developing) → pillar color (solid).
 */
export default function MasteryRing({ score, color, size = 28 }: MasteryRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const stroke = arcColor(clamped, color);
  const viewBox = (RADIUS + STROKE) * 2;
  const center = RADIUS + STROKE;

  return (
    <div
      className="flex-shrink-0 relative flex items-center justify-center"
      style={{ width: size, height: size }}
      title={`Mastery: ${Math.round(clamped)}/100`}
      role="img"
      aria-label={`Mastery: ${Math.round(clamped)} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`}>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke="#1a2540"
          strokeWidth={STROKE}
        />
        {/* Fill */}
        <motion.circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${center} ${center})`}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <span
        className="absolute text-[8px] font-mono font-semibold"
        style={{ color: stroke }}
      >
        {Math.round(clamped)}
      </span>
    </div>
  );
}
