import { clsx, type ClassValue } from 'clsx';
import { PILLARS } from '@/data/plan';
import { GenUIBlock, Pillar, PillarId } from '@/data/types';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Sentinel key for the no-pillar (general) tutor context. Not a valid PillarId,
 *  so it never collides with a real pillar in the per-pillar Socratic map. */
export const SOCRATIC_GLOBAL_KEY = '__global__';

/** Resolves the per-pillar key used to store/look up Socratic Mode state.
 *  Single source of truth shared by useAI and the TutorChat header toggle so
 *  the UI state and prompt behavior never key off different values. */
export function socraticKey(pillar: PillarId | null): string {
  return pillar ?? SOCRATIC_GLOBAL_KEY;
}

export function getPillarById(id: PillarId): Pillar {
  const pillar = PILLARS.find((p) => p.id === id);
  if (!pillar) throw new Error(`Unknown pillar: ${id}`);
  return pillar;
}

export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getWeekNumber(from: Date = new Date()): number {
  const sprintStart = new Date('2026-06-01');
  if (from < sprintStart) return 1;
  const daysDiff = Math.floor((from.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(Math.floor(daysDiff / 7) + 1, 12);
}

/**
 * Tries to parse the inner content of a <genui type="code"> block.
 * Handles three shapes the AI might produce:
 *   1. Valid JSON:  {"language":"python","code":"..."}
 *   2. Markdown fence: ```python\ncode here\n```
 *   3. Plain text fallback: treated as plain-text code with lang "text"
 */
function parseCodeBlockData(raw: string): { language: string; code: string; filename?: string } {
  // 1. Try JSON first
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('code' in parsed || 'language' in parsed)) {
      return {
        language: String(parsed.language ?? 'text'),
        code: String(parsed.code ?? raw),
        filename: parsed.filename ? String(parsed.filename) : undefined,
      };
    }
  } catch { /* fall through */ }

  // 2. Try markdown fenced code block: ```lang\ncode\n```
  const fenceMatch = raw.match(/^```(\w*)\n?([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    return {
      language: fenceMatch[1] || 'text',
      code: fenceMatch[2],
    };
  }

  // 3. Plain text fallback
  return { language: 'text', code: raw };
}

export function parseGenUIBlocks(content: string): { text: string; blocks: GenUIBlock[] } {
  const blocks: GenUIBlock[] = [];
  const genUIRegex = /<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g;

  let match;
  let cleanText = content;
  const matches: Array<{ full: string; type: string; data: string }> = [];

  while ((match = genUIRegex.exec(content)) !== null) {
    matches.push({ full: match[0], type: match[1], data: match[2].trim() });
  }

  for (const m of matches) {
    cleanText = cleanText.replace(m.full, '');
    let parsedData: unknown = m.data;

    try {
      if (m.type === 'code') {
        parsedData = parseCodeBlockData(m.data);
      } else if (m.type !== 'diagram' && m.type !== 'key-insight') {
        parsedData = JSON.parse(m.data);
      }
    } catch {
      // Last-resort: keep raw string for diagram/key-insight; safe empty for others
      if (m.type === 'code') {
        parsedData = { language: 'text', code: m.data };
      } else {
        parsedData = m.data;
      }
    }

    blocks.push({
      type: m.type as GenUIBlock['type'],
      data: parsedData,
    });
  }

  return { text: cleanText.trim(), blocks };
}

export function pillarColor(id: PillarId | string): string {
  const colors: Record<string, string> = {
    llm: '#2E5FA3',
    hardware: '#0E7C86',
    sales: '#C9762A',
    communication: '#7B3F8E',
    voice: '#B54A00',
    fundraising: '#16A34A',
    roadmap: '#7C3AED',
    security: '#DC2626',
    hiring: '#0891B2',
    mlops: '#EA580C',
    ip: '#CA8A04',
    finance: '#BE185D',
  };
  return colors[id] ?? '#4a5568';
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function toISODateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
