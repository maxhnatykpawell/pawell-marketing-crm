/**
 * РЎС‚Р°РЅ С‡Р°С‚Сѓ С‚Р° Р¶РёРІРµ Р·'С”РґРЅР°РЅРЅСЏ Р· СЃРµСЂРІРµСЂРѕРј.
 *
 * РћРґРёРЅ С…СѓРє РЅР° РІРµСЃСЊ Р·Р°СЃС‚РѕСЃСѓРЅРѕРє: РІС–РЅ С‚СЂРёРјР°С” СЃРїРёСЃРѕРє СЂРѕР·РјРѕРІ, Р»С–С‡РёР»СЊРЅРёРєРё
 * РЅРµРїСЂРѕС‡РёС‚Р°РЅРѕРіРѕ С– РІС–РґРєСЂРёС‚Рµ SSE-Р·'С”РґРЅР°РЅРЅСЏ. РЎС‚СЂС–С‡РєР° РєРѕРЅРєСЂРµС‚РЅРѕС— СЂРѕР·РјРѕРІРё
 * РїС–РґРІР°РЅС‚Р°Р¶СѓС”С‚СЊСЃСЏ РѕРєСЂРµРјРѕ вЂ” С‚СЂРёРјР°С‚Рё РІ РїР°Рј'СЏС‚С– С–СЃС‚РѕСЂС–СЋ РІСЃС–С… РєР°РЅР°Р»С–РІ РЅРµРјР°С” СЃРµРЅСЃСѓ.
 *
 * Р—'С”РґРЅР°РЅРЅСЏ Р¶РёРІРµ, РїРѕРєРё Р»СЋРґРёРЅР° РІ СЃРёСЃС‚РµРјС–, Р° РЅРµ РїРѕРєРё РІС–РґРєСЂРёС‚Рѕ РІРєР»Р°РґРєСѓ С‡Р°С‚Сѓ:
 * С–РЅР°РєС€Рµ Р·РЅР°С‡РѕРє В«С” РЅРѕРІС– РїРѕРІС–РґРѕРјР»РµРЅРЅСЏВ» Р·'СЏРІР»СЏРІСЃСЏ Р± Р»РёС€Рµ С‚РѕРјСѓ, С…С‚Рѕ РІР¶Рµ Р№ С‚Р°Рє Сѓ
 * С‡Р°С‚С–, С‚РѕР±С‚Рѕ РЅРµ РїСЂР°С†СЋРІР°РІ Р±Рё Р·РѕРІСЃС–Рј.
 *
 * РўРµР»РµС„РѕРЅ: РєРѕР»Рё Р·Р°СЃС‚РѕСЃСѓРЅРѕРє Р·РіРѕСЂС‚Р°СЋС‚СЊ, СЃРёСЃС‚РµРјР° Р·Р°РјРѕСЂРѕР¶СѓС” Р·'С”РґРЅР°РЅРЅСЏ С– РЅРµ Р·Р°РІР¶РґРё
 * РїРѕРІС–РґРѕРјР»СЏС” РїСЂРѕ С†Рµ. РўРѕРјСѓ РїСЂРё РїРѕРІРµСЂРЅРµРЅРЅС– РЅР° РµРєСЂР°РЅ РјРё СЃР°РјС– РїС–РґС‚СЏРіСѓС”РјРѕ РїСЂРѕРїСѓС‰РµРЅРµ,
 * Р° РЅРµ С‡РµРєР°С”РјРѕ, РїРѕРєРё РїРѕС‚С–Рє РїРѕРјС–С‚РёС‚СЊ РѕР±СЂРёРІ.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getChatConversations, getChatMessages, sendChatMessage, markChatRead,
  getChatStreamTicket, createChatChannel, openChatDm,
  editChatMessage, deleteChatMessage, toggleChatReaction, setChatNotify,
  updateChatChannel, addChatMembers, removeChatMember, archiveChatChannel,
} from '../api';
import { ChatAttachment, ChatConversationView, ChatMessage, ChatNotifyLevel } from '../types';
import { mergeMessage, sortConversations, previewOf, badgeCount, toggleReaction } from '../lib/chat';

export type ChatConnection = 'connecting' | 'online' | 'offline';

export interface SendExtra {
  replyToId?: string;
  attachments?: ChatAttachment[];
}

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
  closeConversation: () => void;
  loadOlder: () => Promise<void>;
  send: (text: string, extra?: SendExtra) => Promise<void>;
  edit: (id: string, text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  react: (id: string, emoji: string) => Promise<void>;
  setNotify: (conversationId: string, level: ChatNotifyLevel) => Promise<void>;
  createChannel: (title: string, memberIds?: string[] | null) => Promise<string>;
  openDm: (peerId: string) => Promise<string>;
  updateChannel: (id: string, patch: { title?: string; topic?: string }) => Promise<void>;
  addMembers: (id: string, userIds: string[]) => Promise<void>;
  removeMember: (id: string, userId: string) => Promise<void>;
  archiveChannel: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'PAWELL';

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function useChat(currentUserId: string | null): UseChat {
  const [conversations, setConversations] = useState<ChatConversationView[]>([]);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // РџРѕС‚С–Рє РїСЂРёС…РѕРґРёС‚СЊ Сѓ Р·Р°РјРёРєР°РЅРЅСЏ, СЃС‚РІРѕСЂРµРЅРµ РѕРґРёРЅ СЂР°Р·, вЂ” Р°РєС‚СѓР°Р»СЊРЅС– Р·РЅР°С‡РµРЅРЅСЏ
  // С‡РёС‚Р°С”РјРѕ С‡РµСЂРµР· ref, С–РЅР°РєС€Рµ РїРѕРґС–СЏ РѕР±СЂРѕР±Р»СЏР»Р°СЃСЊ Р±Рё Р·С– СЃС‚Р°СЂРёРј activeId
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const conversationsRef = useRef<ChatConversationView[]>([]);
  conversationsRef.current = conversations;

  const reload = useCallback(async () => {
    try {
      const list = await getChatConversations();
      setConversations(list);
      setError(null);
      // Р РѕР·РјРѕРІСѓ, СЏРєСѓ Р·Р°Р°СЂС…С–РІСѓРІР°Р»Рё С‡Рё Р· СЏРєРѕС— РЅР°СЃ РїСЂРёР±СЂР°Р»Рё, РЅРµ Р»РёС€Р°С”РјРѕ РІС–РґРєСЂРёС‚РѕСЋ
      const active = activeIdRef.current;
      if (active && !list.some(c => c.id === active)) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e: any) {
      setError(e.message || 'Р§Р°С‚ РЅРµРґРѕСЃС‚СѓРїРЅРёР№');
    }
  }, []);

  /** Р”РѕС‚СЏРіРЅСѓС‚Рё РїСЂРѕРїСѓС‰РµРЅРµ РІ Р°РєС‚РёРІРЅС–Р№ СЂРѕР·РјРѕРІС– (РїС–СЃР»СЏ СЃРЅСѓ С‚РµР»РµС„РѕРЅР° С‡Рё РѕР±СЂРёРІСѓ Р·РІ'СЏР·РєСѓ) */
  const refreshActive = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    try {
      const { messages: latest } = await getChatMessages(id);
      if (activeIdRef.current !== id) return;
      setMessages(prev => latest.reduce((acc, m) => mergeMessage(acc, m), prev));
      markChatRead(id, latest[latest.length - 1]?.createdAt);
      setConversations(prev => prev.map(c => (c.id === id ? { ...c, unread: 0, mentionUnread: 0 } : c)));
    } catch { /* Р·РІ'СЏР·РєСѓ РЅРµРјР° вЂ” СЃРїСЂРѕР±СѓС”РјРѕ РїСЂРё РЅР°СЃС‚СѓРїРЅС–Р№ РїРѕРґС–С— */ }
  }, []);

  // в”Ђв”Ђ Р–РёРІРµ Р·'С”РґРЅР°РЅРЅСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  useEffect(() => {
    if (!currentUserId) return;

    let source: EventSource | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const scheduleRetry = () => {
      if (stopped) return;
      // РќР°СЂРѕСЃС‚Р°СЋС‡Р° РїР°СѓР·Р°: СЏРєС‰Рѕ СЃРµСЂРІРµСЂ РїРµСЂРµР·Р°РїСѓСЃРєР°С”С‚СЊСЃСЏ, РґРµСЃСЏС‚РѕРє РІРєР»Р°РґРѕРє РЅРµ
      // РјР°С” РґРѕР±РёРІР°С‚Рё Р№РѕРіРѕ С‰РѕСЃРµРєСѓРЅРґРЅРёРјРё СЃРїСЂРѕР±Р°РјРё
      retry = Math.min(retry + 1, 6);
      retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry, 30_000));
    };

    const connect = async () => {
      if (stopped) return;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      source?.close();
      source = null;
      try {
        const ticket = await getChatStreamTicket();
        if (stopped) return;

        source = new EventSource(`/api/chat/stream?ticket=${encodeURIComponent(ticket)}`);

        source.addEventListener('ready', () => {
          retry = 0;
          setConnection('online');
          // РњРѕРіР»Рё С‰РѕСЃСЊ РїСЂРѕРїСѓСЃС‚РёС‚Рё, РїРѕРєРё Р·'С”РґРЅР°РЅРЅСЏ Р»РµР¶Р°Р»Рѕ
          reload();
          refreshActive();
        });

        source.addEventListener('message', (e: MessageEvent) => {
          applyIncoming(JSON.parse(e.data) as ChatMessage);
        });

        // Р РµР°РєС†С–СЏ вЂ” РЅРµ РЅРѕРІРµ РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ: Р»РёС€Рµ РѕРЅРѕРІР»СЋС”РјРѕ РІР¶Рµ РїРѕРєР°Р·Р°РЅРµ
        source.addEventListener('reaction', (e: MessageEvent) => {
          const msg = JSON.parse(e.data) as ChatMessage;
          if (activeIdRef.current === msg.conversationId) {
            setMessages(prev => (prev.some(m => m.id === msg.id) ? mergeMessage(prev, msg) : prev));
          }
        });

        source.addEventListener('conversation', () => {
          reload();
        });

        source.onerror = () => {
          setConnection('offline');
          source?.close();
          source = null;
          scheduleRetry();
        };
      } catch {
        if (stopped) return;
        setConnection('offline');
        scheduleRetry();
      }
    };

    const applyIncoming = (msg: ChatMessage) => {
      const isActive = activeIdRef.current === msg.conversationId;
      const reading = isActive && isVisible();
      if (isActive) {
        setMessages(prev => mergeMessage(prev, msg));
        if (reading) markChatRead(msg.conversationId, msg.createdAt);
      }

      // РџРѕРІС–РґРѕРјР»РµРЅРЅСЏ Р· СЂРѕР·РјРѕРІРё, СЏРєРѕС— РјРё С‰Рµ РЅРµ Р·РЅР°С”РјРѕ (С‰РѕР№РЅРѕ СЃС‚РІРѕСЂРёР»Рё РєР°РЅР°Р») вЂ”
      // С‚СЏРіРЅРµРјРѕ СЃРїРёСЃРѕРє РїРѕРІРЅС–СЃС‚СЋ, Р° РЅРµ РІРіР°РґСѓС”РјРѕ РїРѕР»СЏ
      if (!conversationsRef.current.some(c => c.id === msg.conversationId)) {
        reload();
        return;
      }

      const isMine = msg.authorId === currentUserId;
      const isNew = !msg.editedAt && !msg.deletedAt;
      setConversations(prev => sortConversations(prev.map(c => {
        if (c.id !== msg.conversationId) return c;
        const mentionsMe = (msg.mentions ?? []).includes(currentUserId);
        return {
          ...c,
          lastMessageAt: isNew ? msg.createdAt : c.lastMessageAt,
          lastMessagePreview: msg.deletedAt
            ? 'РџРѕРІС–РґРѕРјР»РµРЅРЅСЏ РІРёРґР°Р»РµРЅРѕ'
            : previewOf(msg.text || (msg.attachments?.length ? `рџ“Ћ ${msg.attachments[0].name}` : '')),
          lastMessageAuthorId: isNew ? msg.authorId : c.lastMessageAuthorId,
          // Р’С–РґРєСЂРёС‚Сѓ СЂРѕР·РјРѕРІСѓ Р»СЋРґРёРЅР° Р±Р°С‡РёС‚СЊ РїСЂРѕСЃС‚Рѕ Р·Р°СЂР°Р· вЂ” РІРѕРЅР° РїСЂРѕС‡РёС‚Р°РЅР°
          unread: reading || isMine ? 0 : c.unread + (isNew ? 1 : 0),
          mentionUnread: reading || isMine ? 0 : c.mentionUnread + (isNew && mentionsMe ? 1 : 0),
        };
      })));
    };

    // РџРѕРІРµСЂРЅСѓР»РёСЃСЊ РЅР° РµРєСЂР°РЅ: С‚РµР»РµС„РѕРЅ РјС–Рі В«Р·Р°РјРѕСЂРѕР·РёС‚РёВ» РїРѕС‚С–Рє. РЎРїРµСЂС€Сѓ РґРѕРіРѕРЅСЏС”РјРѕ
    // РїСЂРѕРїСѓС‰РµРЅРµ, Р° СЏРєС‰Рѕ РїРѕС‚С–Рє РјРµСЂС‚РІРёР№ вЂ” РїРµСЂРµРїС–РґРєР»СЋС‡Р°С”РјРѕСЃСЊ РѕРґСЂР°Р·Сѓ, РЅРµ С‡РµРєР°СЋС‡Рё РїР°СѓР·Рё.
    const onVisible = () => {
      if (!isVisible()) return;
      reload();
      refreshActive();
      const id = activeIdRef.current;
      if (id) {
        markChatRead(id);
        setConversations(prev => prev.map(c => (c.id === id ? { ...c, unread: 0, mentionUnread: 0 } : c)));
      }
      if (!source || source.readyState === EventSource.CLOSED) {
        retry = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    setConnection('connecting');
    connect();
    reload();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [currentUserId, reload, refreshActive]);

  const totalUnread = conversations.reduce((sum, c) => sum + badgeCount(c), 0);

  // Р§РёСЃР»Рѕ РЅРµРїСЂРѕС‡РёС‚Р°РЅРѕРіРѕ вЂ” Сѓ РЅР°Р·РІС– РІРєР»Р°РґРєРё: РІРёРґРЅРѕ, РЅР°РІС–С‚СЊ РєРѕР»Рё С‡Р°С‚ Сѓ С„РѕРЅС–
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [totalUnread]);

  // в”Ђв”Ђ РЎС‚СЂС–С‡РєР° Р°РєС‚РёРІРЅРѕС— СЂРѕР·РјРѕРІРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const openConversation = useCallback((id: string) => {
    setActiveId(id);
    setMessages([]);
    setHasMore(false);
    setLoadingMessages(true);

    getChatMessages(id)
      .then(({ messages: list, hasMore: more }) => {
        // РџРѕРєР° РІР°РЅС‚Р°Р¶РёР»РѕСЃСЊ, Р»СЋРґРёРЅР° РјРѕРіР»Р° РІС–РґРєСЂРёС‚Рё С–РЅС€Сѓ СЂРѕР·РјРѕРІСѓ
        if (activeIdRef.current !== id) return;
        setMessages(list);
        setHasMore(more);
        const last = list[list.length - 1];
        markChatRead(id, last?.createdAt);
        setConversations(prev => prev.map(c => (c.id === id ? { ...c, unread: 0, mentionUnread: 0 } : c)));
      })
      .catch((e: any) => setError(e.message || 'РќРµ РІРґР°Р»РѕСЃСЊ РІС–РґРєСЂРёС‚Рё СЂРѕР·РјРѕРІСѓ'))
      .finally(() => { if (activeIdRef.current === id) setLoadingMessages(false); });
  }, []);

  const closeConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
  }, []);

  const loadOlder = useCallback(async () => {
    const id = activeIdRef.current;
    const oldest = messagesRef.current[0];
    if (!id || !oldest || loadingMessages) return;
    setLoadingMessages(true);
    try {
      const { messages: older, hasMore: more } = await getChatMessages(id, oldest.createdAt);
      setMessages(prev => [...older, ...prev]);
      setHasMore(more);
    } catch (e: any) {
      setError(e.message || 'РќРµ РІРґР°Р»РѕСЃСЊ РґРѕРІР°РЅС‚Р°Р¶РёС‚Рё С–СЃС‚РѕСЂС–СЋ');
    } finally {
      setLoadingMessages(false);
    }
  }, [loadingMessages]);

  const send = useCallback(async (text: string, extra: SendExtra = {}) => {
    const id = activeIdRef.current;
    const body = text.trim();
    if (!id || (!body && !extra.attachments?.length)) return;
    // Р’С–РґРїРѕРІС–РґСЊ СЃРµСЂРІРµСЂР° С– РїРѕРґС–СЏ Р· РїРѕС‚РѕРєСѓ Р·С–Р№РґСѓС‚СЊСЃСЏ Р·Р° id вЂ” mergeMessage РЅРµ РґР°СЃС‚СЊ РґСѓР±Р»СЏ
    const msg = await sendChatMessage(id, body, extra);
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
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: '', attachments: undefined, reactions: undefined, deletedAt: new Date().toISOString() } : m)));
  }, []);

  /** Р РµР°РєС†С–СЏ РїРѕРєР°Р·СѓС”С‚СЊСЃСЏ РѕРґСЂР°Р·Сѓ, РЅРµ С‡РµРєР°СЋС‡Рё СЃРµСЂРІРµСЂР°; РїСЂРё РїРѕРјРёР»С†С– РїРѕРІРµСЂС‚Р°С”РјРѕ СЏРє Р±СѓР»Рѕ */
  const react = useCallback(async (id: string, emoji: string) => {
    const convId = activeIdRef.current;
    if (!convId || !currentUserId) return;
    const before = messagesRef.current.find(m => m.id === id);
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, reactions: toggleReaction(m.reactions, emoji, currentUserId) } : m)));
    try {
      const msg = await toggleChatReaction(convId, id, emoji);
      setMessages(prev => mergeMessage(prev, msg));
    } catch (e: any) {
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, reactions: before?.reactions } : m)));
      setError(e.message || 'РќРµ РІРґР°Р»РѕСЃСЊ РїРѕСЃС‚Р°РІРёС‚Рё СЂРµР°РєС†С–СЋ');
    }
  }, [currentUserId]);

  const setNotify = useCallback(async (conversationId: string, level: ChatNotifyLevel) => {
    const prevLevel = conversationsRef.current.find(c => c.id === conversationId)?.notify ?? 'all';
    setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, notify: level } : c)));
    try {
      await setChatNotify(conversationId, level);
    } catch (e: any) {
      setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, notify: prevLevel } : c)));
      throw e;
    }
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

  const updateChannel = useCallback(async (id: string, patch: { title?: string; topic?: string }) => {
    const conv = await updateChatChannel(id, patch);
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, ...conv } : c)));
  }, []);

  const addMembers = useCallback(async (id: string, userIds: string[]) => {
    const conv = await addChatMembers(id, userIds);
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, ...conv } : c)));
  }, []);

  const removeMember = useCallback(async (id: string, userId: string) => {
    await removeChatMember(id, userId);
    // РЇРєС‰Рѕ РІРёР№С€Р»Рё РјРё СЃР°РјС– вЂ” СЂРѕР·РјРѕРІР° Р·РЅРёРєРЅРµ Р·С– СЃРїРёСЃРєСѓ РїС–СЃР»СЏ РїРµСЂРµР·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ
    await reload();
  }, [reload]);

  const archiveChannel = useCallback(async (id: string) => {
    await archiveChatChannel(id);
    await reload();
  }, [reload]);

  return {
    conversations,
    totalUnread,
    connection,
    activeId,
    messages,
    loadingMessages,
    hasMore,
    error,
    openConversation,
    closeConversation,
    loadOlder,
    send,
    edit,
    remove,
    react,
    setNotify,
    createChannel,
    openDm,
    updateChannel,
    addMembers,
    removeMember,
    archiveChannel,
    reload,
  };
}
