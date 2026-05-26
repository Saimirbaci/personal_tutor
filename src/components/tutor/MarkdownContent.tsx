import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

// ── Inline Shiki code block ───────────────────────────────────────────────────
function FencedCode({ language, code }: { language: string; code: string }) {
  const [highlighted, setHighlighted] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const { codeToHtml } = await import('shiki');
        const html = await codeToHtml(code, {
          lang: (language || 'text') as never,
          theme: 'github-dark-dimmed',
        });
        if (!cancelled) setHighlighted(html);
      } catch {
        if (!cancelled) setHighlighted('');
      }
    }
    if (code) run();
    return () => { cancelled = true; };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-[#1a2540] my-3 not-prose">
      {/* Mini header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f1629] border-b border-[#1a2540]">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[#4a5568]">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-[#4a5568] hover:text-[#e2e8f0] transition-colors px-1.5 py-0.5 rounded hover:bg-[#1a2540]"
        >
          {copied ? (
            <>
              <Check size={10} className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="bg-[#080d1a] overflow-x-auto">
        {highlighted ? (
          <div
            className="text-xs [&>pre]:p-3 [&>pre]:overflow-x-auto [&>pre]:bg-transparent! [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="p-3 text-xs font-mono text-[#e2e8f0] whitespace-pre overflow-x-auto">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────
interface MarkdownContentProps {
  content: string;
  /** Size variant — 'sm' (default) or 'xs' for compact views */
  size?: 'sm' | 'xs';
}

export default function MarkdownContent({ content, size = 'sm' }: MarkdownContentProps) {
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm';

  return (
    <div className={`markdown-body ${textSize} leading-relaxed`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ──────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1 className="text-[1.05rem] font-bold text-[#e2e8f0] mt-5 mb-2 pb-1 border-b border-[#1a2540] first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[0.95rem] font-semibold text-[#e2e8f0] mt-4 mb-2 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[0.875rem] font-semibold text-[#c8d8ea] mt-3 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[0.8125rem] font-medium text-[#a0b4c8] mt-2 mb-1">{children}</h4>
          ),

          // ── Paragraph ─────────────────────────────────────────────────────
          p: ({ children }) => (
            <p className={`${textSize} text-[#e2e8f0] leading-relaxed mb-2.5 last:mb-0`}>
              {children}
            </p>
          ),

          // ── Emphasis ──────────────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#b0bdd0]">{children}</em>
          ),
          del: ({ children }) => (
            <del className="line-through text-[#4a5568]">{children}</del>
          ),

          // ── Horizontal rule ───────────────────────────────────────────────
          hr: () => <hr className="border-[#1a2540] my-4" />,

          // ── Blockquote ────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#2E5FA3] pl-4 py-0.5 my-3 bg-[#2E5FA3]/5 rounded-r-lg">
              {children}
            </blockquote>
          ),

          // ── Lists ─────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 mb-3 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 mb-3 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className={`${textSize} text-[#e2e8f0] leading-relaxed`}>{children}</li>
          ),

          // ── Table ─────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-[#1a2540]">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1a2540]">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#1a2540]">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#1a2540]/40 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-[#e2e8f0] whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#b0bdd0]">{children}</td>
          ),

          // ── Code ──────────────────────────────────────────────────────────
          // Unwrap <pre> so FencedCode handles its own wrapper
          pre: ({ children }) => <>{children}</>,

          code: ({ className, children }) => {
            const lang = (className ?? '').replace('language-', '');
            const codeStr = String(children).replace(/\n$/, '');
            const isBlock = codeStr.includes('\n') || !!lang;

            if (isBlock) {
              return <FencedCode language={lang} code={codeStr} />;
            }

            // Inline code
            return (
              <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-[#1a2540] text-[#a8d8ea]">
                {codeStr}
              </code>
            );
          },

          // ── Link ──────────────────────────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2E5FA3] hover:text-[#5b8ed4] underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
