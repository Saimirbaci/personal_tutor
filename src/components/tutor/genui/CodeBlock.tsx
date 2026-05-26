import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Code2 } from 'lucide-react';

interface CodeBlockProps {
  data: { language: string; code: string; filename?: string };
}

const LANG_COLORS: Record<string, string> = {
  python: '#3776AB',
  rust: '#CE422B',
  typescript: '#3178C6',
  javascript: '#F7DF1E',
  bash: '#4EAA25',
  go: '#00ADD8',
  cpp: '#00589D',
  c: '#555555',
  cuda: '#76B900',
};

export default function CodeBlock({ data }: CodeBlockProps) {
  // Defensive normalisation — the AI may produce unexpected shapes
  const language = (data?.language ?? 'text').toLowerCase();
  const code = data?.code ?? (typeof data === 'string' ? data : '');
  const filename = data?.filename;

  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string>('');
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki');
        const html = await codeToHtml(code, {
          lang: language as never,
          theme: 'github-dark-dimmed',
        });
        if (!cancelled) setHighlighted(html);
      } catch {
        if (!cancelled) setHighlighted('');
      }
    }
    if (code) highlight();
    return () => { cancelled = true; };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const langColor = LANG_COLORS[language] ?? '#4a5568';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden border border-[#1a2540]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0f1629] border-b border-[#1a2540]">
        <div className="flex items-center gap-2">
          <Code2 size={13} style={{ color: langColor }} />
          {filename && (
            <span className="text-xs font-mono text-[#4a5568]">{filename}</span>
          )}
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded font-mono uppercase"
            style={{ color: langColor, backgroundColor: langColor + '20' }}
          >
            {language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-[#4a5568] hover:text-[#e2e8f0] transition-colors px-2 py-1 rounded hover:bg-[#1a2540]"
        >
          {copied ? (
            <>
              <Check size={11} className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto bg-[#080d1a]">
        {highlighted ? (
          <div
            className="text-xs [&>pre]:p-4 [&>pre]:overflow-x-auto [&>pre]:bg-transparent! [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre
            ref={codeRef}
            className="p-4 text-xs font-mono text-[#e2e8f0] overflow-x-auto whitespace-pre"
          >
            {code}
          </pre>
        )}
      </div>
    </motion.div>
  );
}
