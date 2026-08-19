/**
 * Стан чату та живе з'єднання з сервером.
 *
 * Один хук на весь застосунок: він тримає список розмов, лічильники
 * непрочитаного і відкрите SSE-з'єднання. Стрічка конкретної розмови
 * підвантажується окремо — тримати в пам'яті історію всіх каналів немає сенсу.
 *
 * З'єднання живе, поки людина в системі, а не поки відкрито вкладку чату:
 * інакше значок «є нові повідомлення» з'являвся б лише тому, хто вже й так у
 * чаті, тобто не працював би зовсім.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getChatConversations, getChatMessages, sendChatMessage, markChatRead,
  getChatStreamTicket, createChatChannel, openChatDm,
  editChatMessage, deleteChatMessage,
} from '../api';
import { ChatConversationView, ChatMessage } from '../types';
import { mergeMessage, sortConversations, previewOf } from '../lib/chat';

export type ChatConnection = 'connecting' | 'online' | 'offline';

export interface UseChat {
  conversations: ChatConversationView[];
  totalUnread: number;
  connection: ChatConnection;
  activeId: string | null;
  messages: ChatMessage[];
  loadingMessages: boolean;
  hasMore: boolean;
  error: string | null;
  openConversation: (id: string) => void;
  loadOlder: () => Promise<void>;
  send: (text: string) => Promise<void>;
  edit: (id: string, text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  createChannel: (title: string, memberIds?: string[] | null) => Promise<string>;
  openDm: (peerId: string) => Promise<string>;
  reload: () => Promise<void>;
}

export function useChat(currentUserId: string | null): UseChat {
  const [conversations, setConversations] = useState<ChatConversationView[]>([]);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Потік приходить у замикання, створене один раз, — актуальні значення
  // читаємо через ref, інакше подія оброблялась би зі старим activeId
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const reload = useCallback(async () => {
    try {
      setConversations(await getChatConversations());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Чат недоступний');
    }
  }, []);

  // ── Живе з'єднання ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;

    let source: EventSource | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = async () => {
      if (stopped) return;
      try {
        const ticket = await getChatStreamTicket();
        if (stopped) return;

        source = new EventSource(`/api/chat/stream?ticket=${encodeURIComponent(ticket)}`);

        source.addEventListener('ready', () => {
          retry = 0;
          setConnection('online');
          // Могли щось пропустити, поки з'єднання лежало
          reload();
        });

        source.addEventListener('message', (e: MessageEvent) => {
          const msg = JSON.parse(e.data) as ChatMessage;
          applyIncoming(msg);
        });

        source.addEventListener('conversation', () => {
          reload();
        });

        source.onerror = () => {
          setConnection('offline');
          source?.close();
          source = null;
          if (stopped) return;
          // Наростаюча пауза: якщо сервер перезапускається, десяток вкладок не
          // має добивати його щосекундними спробами
          retry = Math.min(retry + 1, 6);
          retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry, 30_000));
        };
      } catch {
        if (stopped) return;
        setConnection('offline');
        retry = Math.min(retry + 1, 6);
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry, 30_000));
      }
    };

    const applyIncoming = (msg: ChatMessage) => {
      const isActive = activeIdRef.current === msg.conversationId;
      if (isActive) {
        setMessages(prev => mergeMessage(prev, msg));
        markChatRead(msg.conversationId, msg.createdAt);
      }

      setConversations(prev => sortConversations(prev.map(c => {
        if (c.id !== msg.conversationId) return c;
        const isMine = msg.authorId === currentUserId;
        return {
          ...c,
          lastMessageAt: msg.createdAt,
          lastMessagePreview: msg.deletedAt ? 'Повідомлення видалено' : previewOf(msg.text),
          lastMessageAuthorId: msg.authorId,
          // Відкриту розмову людина бачить просто зараз — вона прочитана
          unread: isActive || isMine ? 0 : c.unread + (msg.editedAt || msg.deletedAt ? 0 : 1),
        };
      })));
    };

    setConnection('connecting');
    connect();
    reload();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [currentUserId, reload]);

  // ── Стрічка активної розмови ────────────────────────────────────────────────
  const openConversation = useCallback((id: string) => {
    setActiveId(id);
    setMessages([]);
    setHasMore(false);
    setLoadingMessages(true);

    getChatMessages(id)
      .then(({ messages: list, hasMore: more }) => {
        setMessages(list);
        setHasMore(more);
        const last = list[list.length - 1];
        markChatRead(id, last?.createdAt);
        setConversations(prev => prev.map(c => (c.id === id ? { ...c, unread: 0 } : c)));
      })
      .catch((e: any) => setError(e.message || 'Не вдалось відкрити розмову'))
      .finally(() => setLoadingMessages(false));
  }, []);

  const loadOlder = useCallback(async () => {
    const id = activeIdRef.current;
    const oldest = messages[0];
    if (!id || !oldest || loadingMessages) return;
    setLoadingMessages(true);
    try {
      const { messages: older, hasMore: more } = await getChatMessages(id, oldest.createdAt);
      setMessages(prev => [...older, ...prev]);
      setHasMore(more);
    } catch (e: any) {
      setError(e.message || 'Не вдалось довантажити історію');
    } finally {
      setLoadingMessages(false);
    }
  }, [messages, loadingMessages]);

  const send = useCallback(async (text: string) => {
    const id = activeIdRef.current;
    if (!id || !text.trim()) return;
    // Відповідь сервера і подія з потоку зійдуться за id — mergeMessage не дасть дубля
    const msg = await sendChatMessage(id, text.trim());
    setMessages(prev => mergeMessage(prev, msg));
  }, []);

  const edit = useCallback(async (id: string, text: string) => {
    const convId = activeIdRef.current;
    if (!convId) return;
    const msg = await editChatMessage(convId, id, text);
    setMessages(prev => mergeMessage(prev, msg));
  }, []);

  const remove = useCallback(async (id: string) => {
    const convId = activeIdRef.current;
    if (!convId) return;
    await deleteChatMessage(convId, id);
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: '', deletedAt: new Date().toISOString() } : m)));
  }, []);

  const createChannel = useCallback(async (title: string, memberIds?: string[] | null) => {
    const conv = await createChatChannel(title, memberIds);
    await reload();
    return conv.id;
  }, [reload]);

  const openDm = useCallback(async (peerId: string) => {
    const conv = await openChatDm(peerId);
    await reload();
    return conv.id;
  }, [reload]);

  return {
    conversations,
    totalUnread: conversations.reduce((sum, c) => sum + (c.unread || 0), 0),
    connection,
    activeId,
    messages,
    loadingMessages,
    hasMore,
    error,
    openConversation,
    loadOlder,
    send,
    edit,
    remove,
    createChannel,
    openDm,
    reload,
  };
}
