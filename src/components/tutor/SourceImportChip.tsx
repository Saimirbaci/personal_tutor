import { BookOpen, Loader2, AlertCircle } from 'lucide-react';

interface SourceImportChipProps {
  url: string;
  isImporting: boolean;
  error: string | null;
  onClick: () => void;
  color?: string;
}

/** Truncates a URL for compact display in the CTA chip. */
function shortUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//, '');
  return stripped.length > 48 ? `${stripped.slice(0, 48)}…` : stripped;
}

/**
 * "Teach from this" CTA shown above the input when a URL is detected. Clicking
 * fetches the source and seeds a streamed teaching response.
 */
export default function SourceImportChip({
  url,
  isImporting,
  error,
  onClick,
  color = '#2E5FA3',
}: SourceImportChipProps) {
  return (
    <div className="flex items-center gap-2 mb-2 max-w-4xl mx-auto">
      <button
        onClick={onClick}
        disabled={isImporting}
        title={`Fetch and teach from ${url}`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
        style={{
          backgroundColor: color + '18',
          color,
          border: `1px solid ${color}40`,
        }}
      >
        {isImporting ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <BookOpen size={13} />
        )}
        <span>{isImporting ? 'Reading source…' : 'Teach from this'}</span>
        <span className="opacity-60 hidden sm:inline">{shortUrl(url)}</span>
      </button>

      {error && (
        <span className="flex items-center gap-1 text-[11px] text-red-400">
          <AlertCircle size={12} />
          {error}
        </span>
      )}
    </div>
  );
}
