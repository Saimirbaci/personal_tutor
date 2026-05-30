import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConversationSummary, GenUIBlock, PillarId, SessionSummaryData } from '@/data/types';
import { useAppStore } from '@/store/appStore';
import SummaryCard from '@/components/SummaryCard';
import Diagram from './Diagram';
import Flashcard from './Flashcard';
import Quiz from './Quiz';
import CodeBlock from './CodeBlock';
import ConceptMap from './ConceptMap';
import Timeline from './Timeline';
import KeyInsight from './KeyInsight';

/** Adapts an inline session-summary block into a SummaryCard for the active conversation. */
function SessionSummaryRenderer({ data, pillar }: { data: SessionSummaryData; pillar?: PillarId | null }) {
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const now = new Date().toISOString();
  const summary: ConversationSummary = {
    conversationId: activeConversationId ?? '',
    takeaways: data.takeaways ?? [],
    reflection: data.reflection ?? '',
    flaggedItems: (data.flaggedItems ?? []).map((it) => ({
      type: it.type,
      pillar: it.pillar ?? null,
      question: it.question,
      reviewItemId: it.reviewItemId ?? '',
    })),
    createdAt: now,
    updatedAt: now,
    conversationPillar: pillar ?? null,
  };
  return <SummaryCard summary={summary} defaultOpen />;
}

// ── Per-block error boundary ───────────────────────────────────────────────
interface BoundaryState { error: Error | null }

class GenUIErrorBoundary extends Component<{ type: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-800/30 text-xs text-red-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">GenUI render error</span> ({this.props.type})
            {' — '}{this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Renderer ───────────────────────────────────────────────────────────────
interface GenUIRendererProps {
  block: GenUIBlock;
  pillar?: PillarId | null;
}

function BlockContent({ block, pillar }: GenUIRendererProps) {
  switch (block.type) {
    case 'diagram':
      return <Diagram code={block.data as string} pillar={pillar} />;

    case 'flashcard':
      return (
        <Flashcard
          data={block.data as { question: string; answer: string }}
          pillar={pillar}
        />
      );

    case 'quiz':
      return (
        <Quiz
          data={
            block.data as {
              question: string;
              options: string[];
              correct: number;
              explanation?: string;
            }
          }
          pillar={pillar}
        />
      );

    case 'code':
      return (
        <CodeBlock
          data={block.data as { language: string; code: string; filename?: string }}
        />
      );

    case 'concept-map':
      return (
        <ConceptMap
          data={
            block.data as {
              nodes: { id: string; label: string; color?: string }[];
              edges: { from: string; to: string; label?: string }[];
            }
          }
          pillar={pillar}
        />
      );

    case 'timeline':
      return (
        <Timeline
          data={block.data as { events: { label: string; description: string; done: boolean }[] }}
          pillar={pillar}
        />
      );

    case 'key-insight':
      return <KeyInsight text={block.data as string} pillar={pillar} />;

    case 'session-summary':
      return <SessionSummaryRenderer data={block.data as SessionSummaryData} pillar={pillar} />;

    default:
      return null;
  }
}

export default function GenUIRenderer({ block, pillar }: GenUIRendererProps) {
  return (
    <GenUIErrorBoundary type={block.type}>
      <BlockContent block={block} pillar={pillar} />
    </GenUIErrorBoundary>
  );
}
