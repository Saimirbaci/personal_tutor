import { useCallback, useState } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { SourceSummary } from '@/data/types';

/**
 * Fetches a URL (article / paper / blog post) through the Rust
 * `fetch_and_summarize_url` command and returns cleaned, readable text the
 * tutor can teach from. The current provider config is threaded through so the
 * backend can optionally draft a teaching brief.
 */
export function useSourceImport() {
  const providerConfig = useAppStore((s) => s.providerConfig);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importUrl = useCallback(
    async (url: string, generateBrief = false): Promise<SourceSummary | null> => {
      setIsImporting(true);
      setError(null);
      try {
        const summary = await tauriInvoke<SourceSummary>('fetch_and_summarize_url', {
          request: {
            url,
            generateBrief,
            config: {
              provider: providerConfig.provider,
              api_key: providerConfig.apiKey,
              model: providerConfig.model,
              base_url: providerConfig.baseUrl,
            },
          },
        });
        return summary;
      } catch (err) {
        const message =
          typeof err === 'string' ? err : 'Failed to import that source. Check the link and try again.';
        setError(message);
        return null;
      } finally {
        setIsImporting(false);
      }
    },
    [providerConfig]
  );

  return { importUrl, isImporting, error };
}
