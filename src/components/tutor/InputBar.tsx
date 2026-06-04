import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { PillarId } from '@/data/types';
import { PILLARS } from '@/data/plan';
import { useAppStore } from '@/store/appStore';
import { useSourceImport } from '@/hooks/useSourceImport';
import { detectUrl, buildTeachPrompt } from '@/lib/sourceImport';
import VoiceButton from './VoiceButton';
import SourceImportChip from './SourceImportChip';

interface InputBarProps {
  onSend: (content: string) => void;
  disabled: boolean;
  pillar: PillarId | null;
}

export default function InputBar({ onSend, disabled, pillar }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pillarData = pillar ? PILLARS.find((p) => p.id === pillar) : null;
  const { voiceConfig } = useAppStore();
  const { importUrl, isImporting, error: importError } = useSourceImport();

  // A detected URL surfaces the "Teach from this" CTA (suppressed while busy).
  const detectedUrl = !disabled ? detectUrl(value) : null;

  // Fetch the source, then seed a pillar-aware teaching prompt through onSend.
  const handleTeachFromUrl = useCallback(async () => {
    if (!detectedUrl || disabled || isImporting) return;
    const summary = await importUrl(detectedUrl);
    if (!summary) return; // error surfaces on the chip
    const pillarName = pillar ? PILLARS.find((p) => p.id === pillar)?.name ?? null : null;
    onSend(buildTeachPrompt(summary, pillarName));
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [detectedUrl, disabled, isImporting, importUrl, pillar, onSend]);

  // When the voice button delivers a transcript, fill the textarea (and optionally auto-send)
  const handleTranscript = useCallback((text: string) => {
    if (!text) return;
    if (voiceConfig.autoSend) {
      onSend(text);
    } else {
      setValue(text);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [voiceConfig.autoSend, onSend]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="flex-shrink-0 px-3 md:px-6 py-3 md:py-4 border-t border-[#1a2540] bg-[#080d1a]">
      {detectedUrl && (
        <SourceImportChip
          url={detectedUrl}
          isImporting={isImporting}
          error={importError}
          onClick={handleTeachFromUrl}
          color={pillarData?.color}
        />
      )}
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        {/* Pillar chip */}
        {pillarData && (
          <div
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium mb-0.5"
            style={{
              backgroundColor: pillarData.color + '18',
              color: pillarData.color,
              border: `1px solid ${pillarData.color}40`,
            }}
          >
            <span>{pillarData.emoji}</span>
            <span>{pillarData.name.split(' ')[0]}</span>
          </div>
        )}

        {/* Input area */}
        <div className="flex-1 flex items-end gap-2 bg-[#0f1629] border border-[#1a2540] rounded-2xl px-4 py-3 focus-within:border-[#2E5FA3] transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? 'Thinking…'
                : `Ask the tutor… (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send)`
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none resize-none disabled:opacity-50 max-h-40 overflow-y-auto"
          />

          <div className="flex items-center gap-1.5">
            {/* Voice mic button */}
            <VoiceButton onTranscript={handleTranscript} disabled={disabled} />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-30"
              style={{ backgroundColor: disabled || !value.trim() ? '#1a2540' : (pillarData?.color ?? '#2E5FA3') }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
