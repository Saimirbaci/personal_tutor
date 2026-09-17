import { useState } from 'react';
import { Code2, Eye } from 'lucide-react';
import { AiMessage, PillarId } from '@/data/types';
import { PILLARS } from '@/data/plan';
import GenUIRenderer from './genui/index';
import MarkdownContent from './MarkdownContent';

interface MessageBubbleProps {
  message: AiMessage;
  pillar: PillarId | null;
}

export default function MessageBubble({ message, pillar }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const pillarData = pillar ? PILLARS.find((p) => p.id === pillar) : null;
  // Default to rendered (preview) for assistant messages
  const [raw, setRaw] = useState(false);

  const ts = new Date(message.timestamp);
  const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] space-y-3 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>

        {/* Message bubble — suppressed for GenUI-only messages (e.g. an injected
            connection callout) so no empty bubble box renders above the card. */}
        {(message.content || isUser) && (
        <div
          className={`relative rounded-2xl px-4 py-3 text-sm leading-relaxed w-full ${
            isUser
              ? 'rounded-tr-sm text-white'
              : 'rounded-tl-sm bg-[#0f1629] border border-[#1a2540] text-[#e2e8f0]'
          }`}
          style={isUser ? { backgroundColor: pillarData?.color ?? '#2E5FA3' } : {}}
        >
          {/* Raw / Preview toggle — assistant only */}
          {!isUser && message.content && (
            <button
              onClick={() => setRaw((r) => !r)}
              title={raw ? 'Show rendered markdown' : 'Show raw text'}
              className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
            >
              {raw ? (
                <>
                  <Eye size={10} />
                  <span>preview</span>
                </>
              ) : (
                <>
                  <Code2 size={10} />
                  <span>raw</span>
                </>
              )}
            </button>
          )}

          {/* Content */}
          {message.content && (
            isUser || raw ? (
              <p className="whitespace-pre-wrap pr-14">{message.content}</p>
            ) : (
              <div className="pr-14">
                <MarkdownContent content={message.content} />
              </div>
            )
          )}
        </div>
        )}

        {/* GenUI blocks */}
        {message.genui && message.genui.length > 0 && (
          <div className="w-full space-y-3">
            {message.genui.map((block, i) => (
              <GenUIRenderer key={i} block={block} pillar={pillar} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[#4a5568] px-1">{timeStr}</span>
      </div>
    </div>
  );
}
