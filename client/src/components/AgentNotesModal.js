import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Trash2, ChevronLeft, ChevronRight, Pencil, Plus, Check } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const toLocalDateStr = (d) => {
  const dd = new Date(d);
  return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
};

const displayDate = (dateStr) => {
  const today = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const AgentNotesPad = ({ show, onClose, initialPos = { x: 600, y: 80 } }) => {
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos]             = useState(initialPos);
  const dragging   = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Data
  const [notesByDate, setNotesByDate] = useState({});
  const [loading, setLoading]         = useState(false);

  // Date nav
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));

  // Editor state â€” null = composing new note, object = editing existing note
  const [editingNote, setEditingNote] = useState(null);
  const [draftTitle,  setDraftTitle]  = useState('');
  const [draftText,   setDraftText]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [deletingId,  setDeletingId]  = useState(null);

  // view: 'list' | 'editor'
  const [view, setView] = useState('list');

  // â”€â”€ Drag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDragStart = (e) => {
    if (e.target.closest('button,textarea,input,a')) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPos({ x: Math.max(0, e.clientX - dragOffset.current.x), y: Math.max(0, e.clientY - dragOffset.current.y) });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/notes');
      if (res.data.success) {
        const grouped = {};
        (res.data.data || []).forEach((note) => {
          const key = note.noteDate || toLocalDateStr(note.createdAt);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(note);
        });
        setNotesByDate(grouped);
      }
    } catch (err) {
      console.error('fetch notes error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (show) fetchNotes(); }, [show, fetchNotes]);

  // â”€â”€ Open editor for NEW note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openNew = () => {
    setEditingNote(null);
    setDraftTitle('');
    setDraftText('');
    setView('editor');
  };

  // â”€â”€ Open editor to EDIT existing note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openEdit = (note) => {
    setEditingNote(note);
    setDraftTitle(note.title);
    setDraftText(note.content);
    setView('editor');
  };

  // â”€â”€ Save (create or update) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSave = async () => {
    if (!draftText.trim()) { toast.error('Write something first'); return; }
    setSaving(true);
    try {
      if (editingNote) {
        // UPDATE
        const res = await axios.put(`/api/notes/${editingNote._id}`, {
          title: draftTitle.trim() || `Note â€“ ${displayDate(selectedDate)}`,
          content: draftText.trim(),
        });
        if (res.data.success) {
          toast.success('Note updated!');
          await fetchNotes();
          setView('list');
        }
      } else {
        // CREATE
        const res = await axios.post('/api/notes', {
          title: draftTitle.trim() || `Note â€“ ${displayDate(selectedDate)}`,
          content: draftText.trim(),
          noteDate: selectedDate,
        });
        if (res.data.success) {
          toast.success('Note saved!');
          await fetchNotes();
          setView('list');
        }
      }
    } catch (err) {
      console.error('save note error', err);
      toast.error(err.response?.data?.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDelete = async (noteId, e) => {
    e && e.stopPropagation();
    setDeletingId(noteId);
    try {
      const res = await axios.delete(`/api/notes/${noteId}`);
      if (res.data.success) {
        toast.success('Note deleted');
        // If currently editing this note, go back to list
        if (editingNote?._id === noteId) setView('list');
        await fetchNotes();
      }
    } catch (err) {
      toast.error('Failed to delete note');
    } finally {
      setDeletingId(null);
    }
  };

  // â”€â”€ Date nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const changeDate = (offset) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(toLocalDateStr(d));
    setView('list');
  };

  if (!show) return null;

  const notesForDate = notesByDate[selectedDate] || [];
  const isToday  = selectedDate === toLocalDateStr(new Date());
  const isFuture = selectedDate > toLocalDateStr(new Date());

  // Sorted dates that have notes (for quick-jump dots)
  const datesWithNotes = Object.keys(notesByDate).sort().reverse();

  return (
    <div
      className="fixed z-[9998] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-indigo-300"
      style={{ left: pos.x, top: pos.y, width: 400, height: minimized ? 'auto' : 580 }}
    >
      {/* â”€â”€ Title bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between px-3 py-2 text-white text-sm font-bold select-none cursor-move flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          My Notepad
          <span className="text-[10px] font-normal opacity-75">(drag to move)</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(p => !p)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title={minimized ? 'Expand' : 'Minimise'}>
            {minimized
              ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16"/></svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/></svg>
            }
          </button>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="flex flex-col flex-1 bg-indigo-50 overflow-hidden">

          {/* â”€â”€ Date bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="flex items-center justify-between px-3 py-2 bg-indigo-100 border-b border-indigo-200 flex-shrink-0">
            <button onClick={() => changeDate(-1)} className="p-1 rounded hover:bg-indigo-200 transition-colors" title="Previous day">
              <ChevronLeft className="w-4 h-4 text-indigo-800" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-indigo-900 leading-tight">{displayDate(selectedDate)}</span>
              {!isToday && (
                <button onClick={() => { setSelectedDate(toLocalDateStr(new Date())); setView('list'); }} className="text-[10px] text-indigo-500 underline hover:text-indigo-900 leading-tight">
                  Back to today
                </button>
              )}
            </div>
            <button onClick={() => changeDate(1)} disabled={isFuture} className="p-1 rounded hover:bg-indigo-200 transition-colors disabled:opacity-30" title="Next day">
              <ChevronRight className="w-4 h-4 text-indigo-800" />
            </button>
          </div>

          {/* â”€â”€ View: LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {view === 'list' && (
            <div className="flex flex-col flex-1 overflow-hidden">

              {/* Notes list */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {loading ? (
                  <p className="text-xs text-indigo-500 text-center py-6">Loadingâ€¦</p>
                ) : notesForDate.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-indigo-500 gap-2">
                    <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm italic">No notes for {displayDate(selectedDate)}</p>
                    <p className="text-xs opacity-70">Click "+ New Note" to write one</p>
                  </div>
                ) : (
                  notesForDate.map((note) => (
                    <div
                      key={note._id}
                      onClick={() => openEdit(note)}
                      className="bg-white border border-indigo-200 rounded-lg p-3 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-indigo-800 truncate">{note.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">{note.content}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="w-3 h-3 text-indigo-500" />
                          </span>
                          <button
                            onClick={(e) => handleDelete(note._id, e)}
                            disabled={deletingId === note._id}
                            className="text-red-300 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition-colors"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        {new Date(note.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Past dates with notes */}
              {datesWithNotes.filter(d => d !== selectedDate).length > 0 && (
                <div className="px-3 py-1.5 border-t border-indigo-200 bg-indigo-100 flex-shrink-0">
                  <p className="text-[10px] text-indigo-700 font-semibold mb-1">OTHER DAYS WITH NOTES</p>
                  <div className="flex flex-wrap gap-1">
                    {datesWithNotes.filter(d => d !== selectedDate).slice(0, 6).map(d => (
                      <button
                        key={d}
                        onClick={() => { setSelectedDate(d); setView('list'); }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-200 transition-colors"
                      >
                        {displayDate(d)} ({notesByDate[d]?.length})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* New note button */}
              {!isFuture && (
                <div className="px-3 py-2.5 border-t border-indigo-200 flex-shrink-0">
                  <button
                    onClick={openNew}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Note
                  </button>
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ View: EDITOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {view === 'editor' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Editor header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-indigo-200 flex-shrink-0">
                <button
                  onClick={() => setView('list')}
                  className="flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
                <span className="text-xs text-gray-400">|</span>
                <span className="text-xs font-semibold text-indigo-800">
                  {editingNote ? 'Edit Note' : `New Note â€” ${displayDate(selectedDate)}`}
                </span>
              </div>

              {/* Title input */}
              <div className="px-3 pt-3 pb-1 flex-shrink-0">
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-indigo-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none font-semibold"
                  autoFocus
                />
              </div>

              {/* Content textarea â€” takes remaining space */}
              <div className="px-3 py-1 flex-1 flex flex-col overflow-hidden">
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Write your note hereâ€¦&#10;(callbacks, phone numbers, reminders, anything)"
                  className="flex-1 w-full text-sm px-3 py-2 border border-indigo-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none resize-none font-mono leading-relaxed"
                  onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') handleSave(); }}
                />
              </div>

              {/* Action buttons */}
              <div className="px-3 py-2.5 border-t border-indigo-200 flex items-center justify-between flex-shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  {editingNote && (
                    <button
                      onClick={(e) => handleDelete(editingNote._id, e)}
                      disabled={deletingId === editingNote._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => setView('list')}
                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !draftText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {saving ? (
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  ) : editingNote ? (
                    <><Check className="w-3 h-3" /> Update</>
                  ) : (
                    <><Save className="w-3 h-3" /> Save</>
                  )}
                </button>
              </div>
              <p className="text-center text-[10px] text-indigo-500 pb-1.5 bg-white">Ctrl + Enter to save quickly</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentNotesPad;

