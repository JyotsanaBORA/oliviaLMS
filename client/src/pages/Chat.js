import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  MessageSquare, Send, Users, AlertCircle, Plus, Search, X,
  Pin, MessageCircle, Paperclip, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const CHAT_URL = process.env.REACT_APP_CHAT_URL || 'http://localhost:5002';
const LMS_API  = process.env.REACT_APP_API_URL  || '';
const TYPING_DEBOUNCE_MS = 1500;

// ── Token refresh ─────────────────────────────────────────────────────────
async function refreshChatToken() {
  const token = localStorage.getItem('token'); // LMS JWT
  if (!token) return null;
  try {
    const res = await fetch(`${LMS_API}/api/auth/chat-token`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.chatToken) {
      localStorage.setItem('chatToken', data.chatToken);
      return data.chatToken;
    }
  } catch { /* network error - silent */ }
  return null;
}

async function chatFetch(path, options = {}, _retry = true) {
  const token = localStorage.getItem('chatToken');
  const res = await fetch(`${CHAT_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && _retry) {
    const newToken = await refreshChatToken();
    if (newToken) return chatFetch(path, options, false);
  }
  return res;
}

// ── Decode chatToken to get globalUserId ──────────────────────────────────
function getMyChatGlobalId() {
  try {
    const token = localStorage.getItem('chatToken');
    if (!token) return '';
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.globalUserId || '';
  } catch { return ''; }
}

// ── REST helpers ──────────────────────────────────────────────────────────
function getParticipantName(conv, myGlobalId) {
  if (conv.type === 'group') return conv.groupName || 'Group';
  const other = conv.participants?.find(p => p._id?.toString() !== myGlobalId);
  return other?.name || 'Direct Message';
}

function getConvLabel(conv, myGlobalId) {
  return conv.type === 'group'
    ? (conv.groupName || 'Group')
    : getParticipantName(conv, myGlobalId);
}

// ── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ name, online, size = 36 }) {
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.36),
        flexShrink: 0,
      }}>{initials}</div>
      {online && (
        <span style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 9, height: 9, borderRadius: '50%',
          background: '#22c55e', border: '2px solid #1e293b',
        }} />
      )}
    </div>
  );
}

// ── Date-separator render items ───────────────────────────────────────────
function buildRenderItems(messages) {
  const items = [];
  let lastDate = null;
  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (dateStr !== lastDate) {
      items.push({ type: 'separator', label: dateStr, key: `sep-${dateStr}` });
      lastDate = dateStr;
    }
    items.push({ type: 'message', msg, key: msg._id });
  }
  return items;
}

// ── NewPrivateModal ───────────────────────────────────────────────────────
function NewPrivateModal({ onClose, onCreated }) {
  const [query, setQuery]     = useState('');
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      chatFetch(`/api/users?search=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : { users: [] })
        .then(data => setUsers(data.users || []))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleCreate(userId) {
    setCreating(userId);
    try {
      const res = await chatFetch('/api/conversations/private', {
        method: 'POST',
        body: JSON.stringify({ recipientGlobalUserId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.conversation);
      }
    } finally {
      setCreating(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-lg">New Message</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full bg-slate-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Search users…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {loading && (
            <p className="text-slate-400 text-sm text-center py-4">Searching…</p>
          )}
          {!loading && query && users.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">No users found</p>
          )}
          {users.map(u => {
            const uid = u.globalUserId || u._id;
            return (
              <button
                key={uid}
                onClick={() => handleCreate(uid)}
                disabled={creating === uid}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 text-left disabled:opacity-50"
              >
                <Avatar name={u.displayName || u.username} size={32} />
                <div>
                  <p className="text-white text-sm font-medium">{u.name}</p>
                  <p className="text-slate-400 text-xs">{u.email || ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── NewGroupModal ─────────────────────────────────────────────────────────
function NewGroupModal({ onClose, onCreated }) {
  const [name, setName]         = useState('');
  const [query, setQuery]       = useState('');
  const [users, setUsers]       = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      chatFetch(`/api/users?search=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : { users: [] })
        .then(data => setUsers(data.users || []))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function toggleUser(u) {
    const id = u._id?.toString();
    setSelected(prev =>
      prev.find(s => s._id?.toString() === id)
        ? prev.filter(s => s._id?.toString() !== id)
        : [...prev, u]
    );
  }

  async function handleCreate() {
    if (!name.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const res = await chatFetch('/api/conversations/group', {
        method: 'POST',
        body: JSON.stringify({
          groupName: name.trim(),
          participantIds: selected.map(u => u._id?.toString()),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.conversation);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-lg">New Group</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <input
          className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          placeholder="Group name…"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full bg-slate-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Add members…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selected.map(u => (
              <span
                key={u._id?.toString()}
                className="flex items-center gap-1 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full"
              >
                {u.name}
                <button onClick={() => toggleUser(u)}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
          {loading && <p className="text-slate-400 text-sm text-center py-2">Searching…</p>}
          {users.map(u => {
            const id = u._id?.toString();
            const isSel = selected.some(s => s._id?.toString() === id);
            return (
              <button
                key={id}
                onClick={() => toggleUser(u)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${isSel ? 'bg-indigo-700' : 'hover:bg-slate-700'}`}
              >
                <Avatar name={u.name} size={28} />
                <span className="text-white text-sm">{u.name}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || selected.length === 0 || creating}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition"
        >
          {creating ? 'Creating…' : `Create Group (${selected.length} member${selected.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat — main component
// ═══════════════════════════════════════════════════════════════════════════
export default function Chat() {
  useAuth(); // keep context subscription
  // Derive myGlobalId from the chat JWT payload (not from LMS user._id)
  const [myGlobalId] = useState(() => getMyChatGlobalId());

  // ── State ─────────────────────────────────────────────────────────────────
  const [hasChatToken, setHasChatToken]       = useState(Boolean(localStorage.getItem('chatToken')));
  const [socketStatus, setSocketStatus]       = useState('disconnected');
  const [convs, setConvs]                     = useState([]);
  const [activeConv, setActiveConv]           = useState(null);
  const [messages, setMessages]               = useState([]);
  const [input, setInput]                     = useState('');
  const [pinned, setPinned]                   = useState([]);
  const [pinnedOpen, setPinnedOpen]           = useState(false);
  const [thread, setThread]                   = useState(null);
  const [imagePreview, setImagePreview]       = useState(null);
  const [uploadPct, setUploadPct]             = useState(null);
  const [onlineUsers, setOnlineUsers]         = useState([]);
  const [typingSignals, setTypingSignals]     = useState({});
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [newPrivateOpen, setNewPrivateOpen]   = useState(false);
  const [newGroupOpen, setNewGroupOpen]       = useState(false);
  const [convSearch, setConvSearch]           = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const socketRef      = useRef(null);
  const selectedRef    = useRef(null);
  const convsRef       = useRef([]);   // mirror of convs state for socket callbacks
  const msgEndRef      = useRef(null);
  const fileRef        = useRef(null);
  const typingTimerRef = useRef(null);
  const cleaningUpRef  = useRef(false);

  // Sync active conversation into a ref so socket callbacks can read without stale closures
  const setSelectedState = useCallback((conv) => {
    selectedRef.current = conv;
    setActiveConv(conv);
  }, []);

  // Wrapper to keep convsRef in sync with convs state
  const setConvsAndRef = useCallback((updater) => {
    setConvs(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      convsRef.current = next;
      return next;
    });
  }, []);

  // ── Token refresh + Socket (mount once) ───────────────────────────────────
  useEffect(() => {
    cleaningUpRef.current = false;

    // Refresh chat token on mount so socket auth callback has a valid token
    refreshChatToken().then(tok => {
      if (tok || localStorage.getItem('chatToken')) setHasChatToken(true);
    });

    const socket = io(CHAT_URL, {
      // Callback form: reads the freshest token on every reconnect attempt
      auth: (cb) => cb({ token: localStorage.getItem('chatToken') || '' }),
      transports: ['polling', 'websocket'],
      reconnectionDelay: 1500,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (cleaningUpRef.current) return;
      setSocketStatus('connected');
      // Re-join all known conversation rooms after any reconnect
      const allConvIds = convsRef.current.map(c => c._id).filter(Boolean);
      allConvIds.forEach(id => socket.emit('join_conversation', { conversationId: id }));
      // Also ensure active conversation is joined
      if (selectedRef.current?._id && !allConvIds.includes(selectedRef.current._id)) {
        socket.emit('join_conversation', { conversationId: selectedRef.current._id });
      }
    });

    socket.on('disconnect', () => {
      if (!cleaningUpRef.current) setSocketStatus('disconnected');
    });

    socket.on('connect_error', () => {
      if (!cleaningUpRef.current) setSocketStatus('disconnected');
    });

    socket.on('receive_message', ({ message: msg }) => {
      if (cleaningUpRef.current) return;
      const convId = msg.conversationId?.toString();
      const activeId = selectedRef.current?._id?.toString();
      const isActive = convId === activeId;
      setConvsAndRef(prev => prev.map(c =>
        c._id?.toString() === convId
          ? {
              ...c,
              lastMessage: { text: msg.text || '', senderId: msg.senderId?._id, timestamp: msg.createdAt },
              unreadCount: isActive ? 0 : (c.unreadCount || 0) + 1,
            }
          : c
      ));
      if (isActive) {
        setMessages(prev =>
          prev.some(m => m._id === msg._id) ? prev : [...prev, msg]
        );
      }
    });

    socket.on('user_typing', ({ userId, conversationId, isTyping }) => {
      if (cleaningUpRef.current) return;
      if (conversationId?.toString() !== selectedRef.current?._id?.toString()) return;
      if (isTyping) {
        setTypingSignals(prev => ({ ...prev, [userId]: Date.now() }));
      } else {
        setTypingSignals(prev => { const n = { ...prev }; delete n[userId]; return n; });
      }
    });

    socket.on('message_pinned', ({ message, conversationId, isPinned }) => {
      if (cleaningUpRef.current) return;
      if (conversationId?.toString() !== selectedRef.current?._id?.toString()) return;
      if (isPinned) {
        setPinned(prev => prev.some(p => p._id === message._id) ? prev : [...prev, message]);
      } else {
        setPinned(prev => prev.filter(p => p._id !== message._id));
      }
    });

    return () => {
      cleaningUpRef.current = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // intentionally empty — auth callback handles token refresh on reconnect

  // ── Online presence polling ────────────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const res = await chatFetch('/api/users/online');
        if (res.ok) {
          const data = await res.json();
          setOnlineUsers(data.onlineUserIds || []);
        }
      } catch { /* silent */ }
    }
    poll();
    const iv = setInterval(poll, 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch conversations ────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasChatToken) return;
    chatFetch('/api/conversations')
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then(data => {
        const list = data.conversations || [];
        setConvsAndRef(list);
        // Join all conversation rooms so we receive messages even when sidebar is closed
        if (socketRef.current?.connected) {
          list.forEach(c => socketRef.current.emit('join_conversation', { conversationId: c._id }));
        }
      })
      .catch(() => {});
  }, [hasChatToken, setConvsAndRef]);

  // ── Load messages + pinned when active conversation changes ───────────────
  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      setPinned([]);
      setThread(null);
      return;
    }
    setMessages([]);
    setPinned([]);
    setThread(null);

    chatFetch(`/api/messages/conversations/${activeConv._id}/messages?limit=50`)
      .then(r => r.ok ? r.json() : { messages: [] })
      .then(data => setMessages(data.messages || []))
      .catch(() => {});

    chatFetch(`/api/conversations/${activeConv._id}/pinned`)
      .then(r => r.ok ? r.json() : { pinnedMessages: [] })
      .then(data => setPinned(data.pinnedMessages || []))
      .catch(() => {});

    if (socketRef.current) {
      socketRef.current.emit('join_conversation', { conversationId: activeConv._id });
    }
    setConvsAndRef(prev => prev.map(c => c._id === activeConv._id ? { ...c, unreadCount: 0 } : c));
  }, [activeConv?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelect = useCallback((conv) => {
    setSidebarOpen(false);
    setSelectedState(conv);
  }, [setSelectedState]);

  const handleConversationCreated = useCallback((conv) => {
    setNewPrivateOpen(false);
    setNewGroupOpen(false);
    setConvsAndRef(prev => {
      const updated = prev.some(c => c._id === conv._id) ? prev : [conv, ...prev];
      // Join the new conversation room
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_conversation', { conversationId: conv._id });
      }
      return updated;
    });
    setSelectedState(conv);
  }, [setConvsAndRef, setSelectedState]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !activeConv || !socketRef.current) return;
    setInput('');
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    socketRef.current.emit('typing', { conversationId: activeConv._id, isTyping: false });
    socketRef.current.emit('send_message', {
      conversationId: activeConv._id,
      type: 'text',
      text,
    });
  }, [input, activeConv]);

  const handleFileSend = useCallback(async (file) => {
    if (!file || !activeConv) return;
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('chatToken');
    setUploadPct(0);
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener('load', () => {
        setUploadPct(null);
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.url && socketRef.current) {
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(data.url);
            socketRef.current.emit('send_message', {
              conversationId: activeConv._id,
              type: isImage ? 'image' : 'file',
              mediaUrl: data.url,
            });
          }
        } catch { /* silent */ }
        resolve();
      });
      xhr.addEventListener('error', () => { setUploadPct(null); resolve(); });
      xhr.open('POST', `${CHAT_URL}/api/media/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  }, [activeConv]);

  const handleTypingSignal = useCallback(() => {
    if (!activeConv || !socketRef.current) return;
    socketRef.current.emit('typing', { conversationId: activeConv._id, isTyping: true });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', { conversationId: activeConv._id, isTyping: false });
    }, TYPING_DEBOUNCE_MS);
  }, [activeConv]);

  const handleTextChange = useCallback((e) => {
    setInput(e.target.value);
    handleTypingSignal();
  }, [handleTypingSignal]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handlePin = useCallback((msg) => {
    if (!activeConv || !socketRef.current) return;
    socketRef.current.emit('pin_message', {
      messageId: msg._id,
      conversationId: activeConv._id,
    });
  }, [activeConv]);

  const handleOpenThread = useCallback(async (msg) => {
    if (!activeConv) return;
    try {
      const res = await chatFetch(`/api/messages/conversations/${activeConv._id}/threads/${msg._id}`);
      const data = res.ok ? await res.json() : { replies: [] };
      setThread({ msg, replies: data.replies || [] });
    } catch {
      setThread({ msg, replies: [] });
    }
  }, [activeConv]);

  const handleThreadReply = useCallback((text) => {
    if (!thread || !text.trim() || !activeConv || !socketRef.current) return;
    socketRef.current.emit('thread_reply', {
      parentMessageId: thread.msg._id,
      conversationId: activeConv._id,
      type: 'text',
      text: text.trim(),
    });
  }, [thread, activeConv]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!hasChatToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <AlertCircle size={48} className="text-amber-400 mx-auto mb-4" />
          <p className="text-white text-lg font-semibold mb-2">Chat session expired</p>
          <p className="text-slate-400 text-sm">
            Please log out and back in to refresh your access.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredConvs = convSearch.trim()
    ? convs.filter(c => getConvLabel(c, myGlobalId).toLowerCase().includes(convSearch.toLowerCase()))
    : convs;

  const typingUsers = Object.entries(typingSignals)
    .filter(([, ts]) => Date.now() - ts < 4000)
    .map(([id]) => id);

  const renderItems      = buildRenderItems(messages);
  const activeConvLabel  = activeConv ? getConvLabel(activeConv, myGlobalId) : '';
  const memberCount      = activeConv?.participants?.length || 0;
  const totalUnread      = convs.reduce((s, c) => s + (c.unreadCount || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">

      {/* ── Sidebar ── */}
      <div
        className={`
          flex flex-col bg-slate-800 border-r border-slate-700 flex-shrink-0 transition-all duration-200
          ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
          md:w-72 md:overflow-visible
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-indigo-400" />
            <span className="font-semibold text-sm">Messages</span>
            {totalUnread > 0 && (
              <span className="bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {totalUnread}
              </span>
            )}
            <span
              className={`w-2 h-2 rounded-full ${socketStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}
              title={socketStatus}
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setNewPrivateOpen(true)}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
              title="New message"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setNewGroupOpen(true)}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
              title="New group"
            >
              <Users size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-700/50">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full bg-slate-700/50 text-sm text-white rounded-lg pl-8 pr-7 py-1.5 outline-none focus:bg-slate-700"
              placeholder="Search conversations…"
              value={convSearch}
              onChange={e => setConvSearch(e.target.value)}
            />
            {convSearch && (
              <button
                onClick={() => setConvSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{convSearch ? 'No matches' : 'No conversations yet'}</p>
            </div>
          )}
          {filteredConvs.map(conv => {
            const label   = getConvLabel(conv, myGlobalId);
            const isActive = conv._id === activeConv?._id;
            const unread  = conv.unreadCount || 0;
            const lastMsg = conv.lastMessage;
            const isOnline = conv.type === 'private' && conv.participants?.some(p =>
              p._id?.toString() !== myGlobalId && onlineUsers.includes(p._id?.toString())
            );
            const lastTs = lastMsg?.timestamp;
            const isMine = lastMsg?.senderId?.toString() === myGlobalId;
            const lastText = lastMsg?.text
              ? (isMine ? `You: ${lastMsg.text}` : lastMsg.text)
              : '';

            return (
              <button
                key={conv._id}
                onClick={() => handleSelect(conv)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/50 transition-colors ${isActive ? 'bg-slate-700' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={label} size={40} online={isOnline} />
                  {conv.type === 'group' && (
                    <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {conv.participants?.length || 0}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium truncate ${unread ? 'text-white' : 'text-slate-300'}`}>
                      {label}
                    </span>
                    {lastTs && (
                      <span className="text-slate-500 text-xs flex-shrink-0 ml-1">
                        {new Date(lastTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-400 text-xs truncate">{lastText}</span>
                    {unread > 0 && (
                      <span className="bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5 flex-shrink-0 leading-none">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageSquare size={56} className="mb-4 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm mt-1">or start a new one with the + button</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-800 flex-shrink-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1.5 rounded hover:bg-slate-700 text-slate-400"
              >
                <ChevronLeft size={18} />
              </button>
              <Avatar name={activeConvLabel} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{activeConvLabel}</p>
                <p className="text-slate-400 text-xs">
                  {activeConv.type === 'group'
                    ? `${memberCount} member${memberCount !== 1 ? 's' : ''}`
                    : (socketStatus === 'connected' ? '🟢 Online' : '⚫ Offline')}
                </p>
              </div>
              {pinned.length > 0 && (
                <button
                  onClick={() => setPinnedOpen(v => !v)}
                  className={`p-1.5 rounded hover:bg-slate-700 flex items-center gap-1 transition-colors ${pinnedOpen ? 'text-amber-400' : 'text-slate-400 hover:text-amber-400'}`}
                  title="Pinned messages"
                >
                  <Pin size={16} />
                  <span className="text-xs">{pinned.length}</span>
                </button>
              )}
            </div>

            {/* Pinned panel */}
            {pinnedOpen && pinned.length > 0 && (
              <div className="bg-slate-800/80 border-b border-slate-700 px-4 py-2 flex-shrink-0">
                <p className="text-xs text-amber-400 font-semibold mb-1">📌 Pinned Messages</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {pinned.map(msg => (
                    <div key={msg._id} className="text-xs text-slate-300 truncate">
                      {msg.text || '📎 Media'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {renderItems.map(item => {
                if (item.type === 'separator') {
                  return (
                    <div key={item.key} className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-slate-700" />
                      <span className="text-slate-500 text-xs px-2">{item.label}</span>
                      <div className="flex-1 h-px bg-slate-700" />
                    </div>
                  );
                }
                const { msg } = item;
                const isMe       = msg.senderId?._id?.toString() === myGlobalId;
                const isCrossApp = msg.text?.startsWith('Cross-app:');
                const wasPinned  = pinned.some(p => p._id === msg._id);
                const senderName = msg.senderId?.name || '?';

                return (
                  <div
                    key={item.key}
                    className={`flex items-end gap-2 group ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {!isMe && (
                      <Avatar name={senderName} size={28} />
                    )}
                    <div className={`max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && (
                        <span className="text-xs text-slate-400 mb-1 px-1">
                          {senderName}
                        </span>
                      )}
                      <div className={`
                        px-3 py-2 rounded-2xl text-sm
                        ${isCrossApp
                          ? 'bg-indigo-900/60 border border-indigo-500/40 text-indigo-200'
                          : isMe
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-slate-700 text-slate-100 rounded-bl-sm'}
                        ${wasPinned ? 'ring-1 ring-amber-400/40' : ''}
                      `}>
                        {msg.mediaUrl && (
                          /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.mediaUrl) ? (
                            <img
                              src={msg.mediaUrl}
                              alt="media"
                              className="rounded-lg max-w-xs max-h-64 object-contain cursor-pointer mb-1"
                              onClick={() => setImagePreview(msg.mediaUrl)}
                            />
                          ) : (
                            <a
                              href={msg.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-indigo-300 underline text-xs mb-1"
                            >
                              <Paperclip size={12} />
                              {msg.mediaUrl.split('/').pop()}
                            </a>
                          )
                        )}
                        {msg.text && (
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        )}
                      </div>
                      {/* Hover actions */}
                      <div className={`flex items-center gap-2 mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'flex-row-reverse' : ''}`}>
                        <button
                          onClick={() => handlePin(msg)}
                          className="text-slate-500 hover:text-amber-400"
                          title={wasPinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin size={12} />
                        </button>
                        <button
                          onClick={() => handleOpenThread(msg)}
                          className="text-slate-500 hover:text-indigo-400"
                          title="Reply in thread"
                        >
                          <MessageCircle size={12} />
                        </button>
                        <span className="text-slate-600 text-xs">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span
                        key={d}
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-slate-400 text-xs">typing…</span>
                </div>
              )}

              {/* Upload progress */}
              {uploadPct !== null && (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                  <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                  <span>{uploadPct}%</span>
                </div>
              )}

              <div ref={msgEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-slate-700 bg-slate-800 flex-shrink-0">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex-shrink-0"
                  title="Attach file"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.[0]) handleFileSend(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <textarea
                  className="flex-1 bg-slate-700 text-white text-sm rounded-xl px-4 py-2.5 outline-none resize-none focus:ring-2 focus:ring-indigo-500 max-h-32"
                  placeholder="Message…"
                  rows={1}
                  value={input}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  style={{ minHeight: '40px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex-shrink-0 transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Thread panel ── */}
      {thread && (
        <ThreadPanel
          thread={thread}
          myGlobalId={myGlobalId}
          onClose={() => setThread(null)}
          onReply={handleThreadReply}
        />
      )}

      {/* ── Image lightbox ── */}
      {imagePreview && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setImagePreview(null)}
        >
          <img
            src={imagePreview}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 text-white hover:text-slate-300"
            onClick={() => setImagePreview(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {newPrivateOpen && (
        <NewPrivateModal onClose={() => setNewPrivateOpen(false)} onCreated={handleConversationCreated} />
      )}
      {newGroupOpen && (
        <NewGroupModal onClose={() => setNewGroupOpen(false)} onCreated={handleConversationCreated} />
      )}
    </div>
  );
}

// ── ThreadPanel ────────────────────────────────────────────────────────────
function ThreadPanel({ thread, myGlobalId, onClose, onReply }) {
  const [replyText, setReplyText] = useState('');

  function handleSend() {
    if (!replyText.trim()) return;
    onReply(replyText.trim());
    setReplyText('');
  }

  return (
    <div className="w-80 flex flex-col bg-slate-800 border-l border-slate-700 flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <span className="font-semibold text-sm">Thread</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Root message */}
      <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700">
        <p className="text-xs text-slate-400 mb-1">
          {thread.msg.sender?.displayName || thread.msg.sender?.username}
        </p>
        <p className="text-sm text-slate-200">{thread.msg.text || '📎 Media'}</p>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {thread.replies.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">No replies yet</p>
        )}
        {thread.replies.map(r => {
          const isMe = r.sender?.globalUserId === myGlobalId;
          return (
            <div key={r._id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <Avatar name={r.sender?.displayName || '?'} size={24} />
              <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                {r.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply input */}
      <div className="px-3 py-2 border-t border-slate-700 flex gap-2">
        <input
          className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Reply…"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
        />
        <button
          onClick={handleSend}
          disabled={!replyText.trim()}
          className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

