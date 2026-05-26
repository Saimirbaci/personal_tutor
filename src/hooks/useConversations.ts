import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore, ConversationSummary } from '@/store/appStore';
import { AiMessage, GenUIBlock, PillarId } from '@/data/types';

interface StoredMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  genui: string | null;
  created_at: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useConversations() {
  const {
    activeConversationId,
    setActiveConversation,
    setConversationList,
    upsertConversation,
    removeConversation,
  } = useAppStore();

  // ── Load the full list of conversations ───────────────────────────────────
  const loadConversationList = useCallback(async () => {
    try {
      const list = await tauriInvoke<ConversationSummary[]>('list_conversations');
      setConversationList(list);
      return list;
    } catch (err) {
      console.error('Failed to load conversations:', err);
      return [];
    }
  }, [setConversationList]);

  // ── Create a new conversation and return its id ────────────────────────────
  const createConversation = useCallback(
    async (pillar?: PillarId | null, title?: string): Promise<string> => {
      const id = await tauriInvoke<string>('new_conversation', {
        pillar: pillar ?? null,
        title: title ?? null,
      });

      const summary: ConversationSummary = {
        id,
        title: title ?? 'New conversation',
        pillar: pillar ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 0,
      };

      upsertConversation(summary);
      setActiveConversation(id);
      return id;
    },
    [upsertConversation, setActiveConversation]
  );

  // ── Load messages for a conversation, return them as AiMessage[] ──────────
  const loadConversationMessages = useCallback(
    async (conversationId: string): Promise<AiMessage[]> => {
      try {
        const stored = await tauriInvoke<StoredMessage[]>('get_conversation_messages', {
          conversationId,
        });

        return stored.map((m) => {
          let genui: GenUIBlock[] | undefined;
          if (m.genui) {
            try {
              genui = JSON.parse(m.genui) as GenUIBlock[];
            } catch {
              genui = undefined;
            }
          }
          return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            genui,
            timestamp: new Date(m.created_at),
          };
        });
      } catch (err) {
        console.error('Failed to load messages:', err);
        return [];
      }
    },
    []
  );

  // ── Persist a single message to the DB ────────────────────────────────────
  const persistMessage = useCallback(
    async (conversationId: string, message: AiMessage) => {
      try {
        await tauriInvoke('save_message', {
          conversationId,
          messageId: message.id,
          role: message.role,
          content: message.content,
          genui: message.genui ? JSON.stringify(message.genui) : null,
        });

        // Auto-title the conversation from the first user message
        if (message.role === 'user') {
          const { conversationList } = useAppStore.getState();
          const conv = conversationList.find((c) => c.id === conversationId);
          if (conv && conv.title === 'New conversation' && conv.message_count === 0) {
            const autoTitle = message.content.slice(0, 60).trim() + (message.content.length > 60 ? '…' : '');
            await tauriInvoke('rename_conversation', {
              conversationId,
              title: autoTitle,
            });
            upsertConversation({ ...conv, title: autoTitle, message_count: 1 });
          } else if (conv) {
            upsertConversation({ ...conv, message_count: conv.message_count + 1, updated_at: new Date().toISOString() });
          }
        }
      } catch (err) {
        console.error('Failed to persist message:', err);
      }
    },
    [upsertConversation]
  );

  // ── Delete a conversation ─────────────────────────────────────────────────
  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await tauriInvoke('delete_conversation', { conversationId: id });
        removeConversation(id);
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [removeConversation]
  );

  // ── Rename a conversation ─────────────────────────────────────────────────
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await tauriInvoke('rename_conversation', { conversationId: id, title });
        const { conversationList } = useAppStore.getState();
        const conv = conversationList.find((c) => c.id === id);
        if (conv) upsertConversation({ ...conv, title });
      } catch (err) {
        console.error('Failed to rename conversation:', err);
      }
    },
    [upsertConversation]
  );

  return {
    activeConversationId,
    loadConversationList,
    createConversation,
    loadConversationMessages,
    persistMessage,
    deleteConversation,
    renameConversation,
  };
}
