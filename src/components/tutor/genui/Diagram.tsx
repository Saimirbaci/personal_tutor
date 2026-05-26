import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface DiagramProps {
  code: string;
  pillar?: PillarId | null;
}

let mermaidId = 0;

export default function Diagram({ code, pillar }: DiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const id = useRef(`mermaid-${++mermaidId}`).current;

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: pillar ? pillarColor(pillar) : '#2E5FA3',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#1a2540',
            lineColor: '#4a5568',
            secondaryColor: '#0f1629',
            tertiaryColor: '#0f1629',
            background: '#080d1a',
            mainBkg: '#0f1629',
            nodeBorder: pillar ? pillarColor(pillar) : '#2E5FA3',
            clusterBkg: '#0f1629',
            titleColor: '#e2e8f0',
            edgeLabelBackground: '#080d1a',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
          },
          securityLevel: 'loose',
        });

        const { svg: rendered } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code, pillar, id]);

  if (loading) {
    return (
      <div className="h-32 rounded-xl bg-[#0f1629] border border-[#1a2540] animate-pulse flex items-center justify-center">
        <span className="text-xs text-[#4a5568]">Rendering diagram…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-4">
        <p className="text-xs text-red-400 mb-2">Diagram render failed</p>
        <pre className="text-xs text-[#4a5568] font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-4 overflow-x-auto"
    >
      <div
        ref={containerRef}
        className="flex justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </motion.div>
  );
}
