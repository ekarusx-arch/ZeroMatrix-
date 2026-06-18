/* eslint-disable react-hooks/refs -- @hello-pangea/dnd exposes render-prop refs that React 19 lint treats as ref reads. */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ArrowLeft, GripVertical, X, Clock, Tag, FileText, Plus, LogOut, Activity, AlertCircle, Download } from 'lucide-react';
import Auth from './components/Auth';
import { supabase } from './lib/supabaseClient';

const QUADRANTS = [
  { id: 'q1', title: '중요하고 긴급함 (Do First)', mobileTitle: '중요+긴급', color: 'var(--danger-color)' },
  { id: 'q2', title: '중요하지만 긴급하지 않음 (Schedule)', mobileTitle: '중요', color: 'var(--success-color)' },
  { id: 'q3', title: '중요하지 않지만 긴급함 (Delegate)', mobileTitle: '긴급', color: 'var(--accent-color)' },
  { id: 'q4', title: '중요하지도 긴급하지도 않음 (Eliminate)', mobileTitle: '제거', color: 'var(--text-secondary)' },
];

const MATRIX_SECTIONS = [
  { id: 'sidebar', title: '브레인 덤프', mobileTitle: '덤프', color: 'var(--accent-color)' },
  ...QUADRANTS,
];

const ZERO_SLATE_URL = 'https://zeroslate.kr';
const MAX_SLATE_TASKS = 3;

function getSafeReturnUrl(rawUrl) {
  if (!rawUrl) return ZERO_SLATE_URL;

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const isAllowedProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    const isAllowedHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('zeroslate.kr');

    if (isAllowedProtocol && isAllowedHost) return parsed.toString();
  } catch (error) {
    console.warn('ZeroSlate return URL parsing failed:', error);
  }

  return ZERO_SLATE_URL;
}

function getInitialReturnUrl() {
  if (typeof window === 'undefined') return ZERO_SLATE_URL;
  const params = new URLSearchParams(window.location.search);
  return getSafeReturnUrl(params.get('returnUrl') || params.get('return'));
}

function getLocalDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getInitialSuiteDate() {
  if (typeof window === 'undefined') return getLocalDateKey();
  const date = new URLSearchParams(window.location.search).get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : getLocalDateKey();
}

function normalizeTaskContent(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function SuiteBackButton({ href }) {
  return (
    <a
      href={href}
      className="suite-back-button"
      aria-label="ZeroSlate로 돌아가기"
    >
      <ArrowLeft size={15} />
      ZeroSlate
    </a>
  );
}

function parseTaskInput(rawInput) {
  let content = rawInput;
  let timeEstimate = 0;
  const tags = [];

  const timeRegex = /\[(\d+[hm](?:\s*\d+[hm])?)\]/i;
  const timeMatch = content.match(timeRegex);
  if (timeMatch) {
    const timeStr = timeMatch[1].toLowerCase();
    const hours = timeStr.match(/(\d+)h/);
    const minutes = timeStr.match(/(\d+)m/);
    if (hours) timeEstimate += parseInt(hours[1], 10) * 60;
    if (minutes) timeEstimate += parseInt(minutes[1], 10);
    content = content.replace(timeRegex, '').trim();
  }

  const tagRegex = /#([\p{L}\p{N}_-]+)/gu;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }
  content = content.replace(tagRegex, '').trim();

  return { content, timeEstimate, tags };
}

function formatTime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function TaskCard({ task, provided, snapshot, isClone, removeTask, updateTaskNote, activeTag, isCrushed, openZenMode }) {
  const isDragging = isClone || snapshot.isDragging;
  const [isFlipped, setIsFlipped] = useState(false);
  const [note, setNote] = useState(task.notes || '');

  const isFilteredOut = activeTag && !(task.tags || []).includes(activeTag);
  const opacity = (isFilteredOut && !isDragging) ? 0.3 : 1;

  const handleDoubleClick = () => {
    if (!isDragging && !isClone) {
      setIsFlipped(true);
    }
  };

  const handleSaveNote = (e) => {
    if (e) e.stopPropagation();
    updateTaskNote(task.id, note);
    setIsFlipped(false);
  };

  if (isFlipped) {
    return (
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        {...provided.dragHandleProps}
        className="glass-button matrix-task-card matrix-task-card-note"
        style={{
          ...provided.draggableProps.style,
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'var(--card-bg, var(--glass-bg))',
          border: '1px solid var(--accent-color)',
          color: 'var(--text-color)',
          textAlign: 'left',
          margin: 0,
          transition: [provided.draggableProps.style?.transition, 'opacity 0.2s', 'background 0.2s', 'box-shadow 0.2s'].filter(Boolean).join(', ')
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileText size={12} /> Notes for: {task.content.substring(0, 15)}{task.content.length > 15 ? '...' : ''}
          </span>
          <button onClick={() => setIsFlipped(false)} style={{background:'transparent', border:'none', cursor:'pointer', padding: 0}}>
            <X size={14} color="var(--text-secondary)" />
          </button>
        </div>
        <textarea
          autoFocus
          className="glass-input"
          style={{ width: '100%', minHeight: '60px', fontSize: '0.85rem', resize: 'vertical' }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="여기에 세부 사항이나 메모를 적어주세요..."
        />
        <button 
          onClick={handleSaveNote}
          style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
        >
          저장 (Save)
        </button>
      </div>
    );
  }

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      onDoubleClick={handleDoubleClick}
      className={`glass-button matrix-task-card ${isCrushed ? 'crush-animate' : ''}`}
      style={{
        ...provided.draggableProps.style,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        cursor: isDragging ? 'grabbing' : 'pointer',
        background: isDragging ? 'var(--bg-color)' : 'var(--card-bg)',
        boxShadow: isDragging ? 'var(--shadow-md)' : 'none',
        border: '1px solid var(--border-color)',
        color: 'var(--text-color)',
        textAlign: 'left',
        margin: '0 0 8px 0',
        opacity: opacity,
        borderRadius: '8px',
        transition: [provided.draggableProps.style?.transition, 'opacity 0.2s', 'background 0.2s', 'box-shadow 0.2s'].filter(Boolean).join(', ')
      }}
    >
      <div className="matrix-task-grip" {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', color: 'var(--border-color)', cursor: isDragging ? 'grabbing' : 'grab' }}>
        <GripVertical size={16} />
      </div>

      <div className="matrix-task-body" style={{display: 'flex', flexDirection: 'column', gap: '4px', flex: 1}}>
        <div className="matrix-task-title-row" style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
          <span className="matrix-task-title" style={{wordBreak: 'break-all', fontSize: '0.9rem', fontWeight: 500}}>{task.content}</span>
          {task.notes && <FileText size={12} color="var(--accent-color)" />}
        </div>
        {(task.timeEstimate > 0 || (task.tags && task.tags.length > 0)) && (
          <div className="matrix-task-meta" style={{display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap'}}>
            {task.timeEstimate > 0 && (
              <span className="matrix-task-chip" style={{fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-color)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px'}}>
                <Clock size={10} /> {formatTime(task.timeEstimate)}
              </span>
            )}
            {task.tags?.map(tag => (
              <span className="matrix-task-chip is-tag" key={tag} style={{fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px'}}>
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="matrix-task-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {openZenMode && (
          <button onClick={() => openZenMode(task.content)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '4px' }} title="이 태스크에 몰입하기 (Zen Mode)">
            <Activity size={14} />
          </button>
        )}
        <button onClick={() => removeTask(task.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.5, padding: '4px' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [draggingSourceId, setDraggingSourceId] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('zeromatrix-theme') || 'light';
  });
  const [activeTag, setActiveTag] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [crushedTaskId, setCrushedTaskId] = useState(null);

  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  
  const [isZenMode, setIsZenMode] = useState(false);
  const [zenTask, setZenTask] = useState(null);
  const [returnUrl] = useState(getInitialReturnUrl);
  const [selectedDate] = useState(getInitialSuiteDate);
  const [mobileSectionId, setMobileSectionId] = useState('sidebar');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isImportingBrainDump, setIsImportingBrainDump] = useState(false);
  const [importNotice, setImportNotice] = useState(null);
  const importNoticeTimerRef = useRef(null);

  const openZenMode = (taskContent = null) => {
    setZenTask(taskContent);
    setIsZenMode(true);
  };

  const buildSlateImportUrl = (selectedTasks) => {
    const target = new URL(returnUrl);
    target.searchParams.set('from', 'matrix');
    target.searchParams.set('matrixVersion', '1');
    target.searchParams.set('matrixTasks', JSON.stringify(selectedTasks));
    return target.toString();
  };

  const buildNoiseUrl = (taskContent = null) => {
    const baseUrl = import.meta.env.VITE_ZERONOISE_URL || 'https://noise.zeroslate.kr';

    try {
      const target = new URL(baseUrl);
      target.searchParams.set('from', 'matrix');
      target.searchParams.set('returnUrl', window.location.href);
      if (taskContent) target.searchParams.set('task', taskContent);
      return target.toString();
    } catch {
      const params = new URLSearchParams({ from: 'matrix', returnUrl: window.location.href });
      if (taskContent) params.set('task', taskContent);
      return `${baseUrl}?${params.toString()}`;
    }
  };

  const allTags = Array.from(new Set(tasks.flatMap(t => t.tags || [])));
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const mobileSection = MATRIX_SECTIONS.find(section => section.id === mobileSectionId) || MATRIX_SECTIONS[0];
  const mobileTasks = tasks.filter(t => t.quadrant === mobileSection.id && (!activeTag || (t.tags || []).includes(activeTag)));
  const dumpCount = tasks.filter(t => t.quadrant === 'sidebar').length;
  const slateCandidateCount = tasks.filter(t => t.quadrant === 'q1').length;
  const slateReadyCount = Math.min(slateCandidateCount, MAX_SLATE_TASKS);
  const nudgeMessage = useMemo(() => {
    const quadrantCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    tasks.forEach(t => {
      if (t.quadrant?.startsWith('q')) {
        quadrantCounts[t.quadrant]++;
      }
    });

    return Object.values(quadrantCounts).some(count => count >= 5)
      ? '생각이 너무 복잡해요! 🧠 조금 미뤄보는 건 어떨까요?'
      : null;
  }, [tasks]);

  const clearImportNotice = useCallback(() => {
    if (importNoticeTimerRef.current) {
      window.clearTimeout(importNoticeTimerRef.current);
      importNoticeTimerRef.current = null;
    }
    setImportNotice(null);
  }, []);

  const showImportNotice = useCallback((notice) => {
    if (importNoticeTimerRef.current) {
      window.clearTimeout(importNoticeTimerRef.current);
    }

    setImportNotice(notice);
    importNoticeTimerRef.current = window.setTimeout(() => {
      setImportNotice(null);
      importNoticeTimerRef.current = null;
    }, notice.type === 'success' ? 3800 : 4800);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchTasks = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('matrix_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching tasks', error);
      showImportNotice({ type: 'error', message: 'Matrix 작업을 불러오지 못했습니다.' });
    } else {
      const formatted = (data || []).map(t => ({
        ...t,
        timeEstimate: t.time_estimate
      }));
      setTasks(formatted);
    }
  }, [showImportNotice]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchTasks(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchTasks(session.user.id);
      } else {
        setTasks([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchTasks]);

  useEffect(() => {
    return () => {
      if (importNoticeTimerRef.current) {
        window.clearTimeout(importNoticeTimerRef.current);
      }
    };
  }, []);

  const onDragStart = (result) => {
    setDraggingSourceId(result.source.droppableId);
  };

  const onDragEnd = (result) => {
    setDraggingSourceId(null);
    if (!result.destination) return;

    const { source, destination } = result;

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const previousTasks = tasks;
    const newTasks = Array.from(tasks);
    const globalIndex = newTasks.findIndex(t => t.id === result.draggableId);
    
    const draggedTask = { ...newTasks.splice(globalIndex, 1)[0] };
    draggedTask.quadrant = destination.droppableId;

    let insertIndex = newTasks.length;
    let localIndexCount = 0;
    
    for (let i = 0; i < newTasks.length; i++) {
      if (newTasks[i].quadrant === destination.droppableId) {
        if (localIndexCount === destination.index) {
          insertIndex = i;
          break;
        }
        localIndexCount++;
      }
    }
    
    if (insertIndex === newTasks.length && localIndexCount === destination.index) {
      let lastIndex = -1;
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].quadrant === destination.droppableId) lastIndex = i;
      }
      if (lastIndex !== -1) insertIndex = lastIndex + 1;
    }

    newTasks.splice(insertIndex, 0, draggedTask);
    setTasks(newTasks);

    // Update in Supabase
    supabase.from('matrix_tasks').update({ quadrant: destination.droppableId }).eq('id', draggedTask.id).then(({error}) => {
      if (error) {
        console.error('Error updating quadrant', error);
        setTasks(previousTasks);
        showImportNotice({ type: 'error', message: '이동 내용을 저장하지 못해 이전 상태로 되돌렸습니다.' });
      }
    });

    if (destination.droppableId === 'q4' && source.droppableId !== 'q4') {
      setCrushedTaskId(result.draggableId);
      setTimeout(() => setCrushedTaskId(null), 700);
    }
  };

  const toggleTagSelection = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim() || !session) return;
    
    let content = newTask.trim();
    if (selectedTime) content += ` [${selectedTime}]`;
    if (selectedTags.length > 0) {
      content += ' ' + selectedTags.map(t => `#${t}`).join(' ');
    }

    const parsed = parseTaskInput(content);

    const newTaskObj = {
      user_id: session.user.id,
      content: parsed.content,
      quadrant: 'sidebar',
      time_estimate: parsed.timeEstimate,
      tags: parsed.tags,
      notes: ''
    };

    const { data, error } = await supabase.from('matrix_tasks').insert(newTaskObj).select().single();
    
    if (!error && data) {
      setTasks(currentTasks => [...currentTasks, { ...data, timeEstimate: data.time_estimate }]);
      setNewTask('');
      setSelectedTime(null);
      setSelectedTags([]);
    } else {
      console.error('Error adding task', error);
      showImportNotice({ type: 'error', message: '새 작업을 저장하지 못했습니다.' });
    }
  };

  const removeTask = async (id) => {
    const previousTasks = tasks;
    setSelectedTaskId(current => current === id ? null : current);
    setTasks(tasks.filter(t => t.id !== id));
    const { error } = await supabase.from('matrix_tasks').delete().eq('id', id);
    if (error) {
      console.error('Error deleting task', error);
      setTasks(previousTasks);
      showImportNotice({ type: 'error', message: '작업을 삭제하지 못해 복구했습니다.' });
    }
  };

  const updateTaskNote = async (id, newNote) => {
    const previousTasks = tasks;
    setTasks(tasks.map(t => t.id === id ? { ...t, notes: newNote } : t));
    const { error } = await supabase.from('matrix_tasks').update({ notes: newNote }).eq('id', id);
    if (error) {
      console.error('Error updating note', error);
      setTasks(previousTasks);
      showImportNotice({ type: 'error', message: '메모를 저장하지 못해 이전 내용으로 되돌렸습니다.' });
    }
  };

  const handleImportBrainDump = async () => {
    if (!session?.user?.id || isImportingBrainDump) return;

    setIsImportingBrainDump(true);
    clearImportNotice();

    const { data, error } = await supabase
      .from('brain_dumps')
      .select('id,content,is_completed,created_at,order_index,date')
      .eq('user_id', session.user.id)
      .eq('date', selectedDate)
      .eq('is_completed', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('ZeroSlate brain dump import failed:', error);
      showImportNotice({ type: 'error', message: 'ZeroSlate 브레인 덤프를 불러오지 못했습니다.' });
      setIsImportingBrainDump(false);
      return;
    }

    const existingContents = new Set(tasks.map(t => normalizeTaskContent(t.content)));
    const rows = [...(data || [])].sort((a, b) => {
      const aOrder = typeof a.order_index === 'number' ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order_index === 'number' ? b.order_index : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    const inserts = [];
    rows.forEach(row => {
      const parsed = parseTaskInput(row.content || '');
      const key = normalizeTaskContent(parsed.content);
      if (!key || existingContents.has(key)) return;
      existingContents.add(key);
      inserts.push({
        user_id: session.user.id,
        content: parsed.content,
        quadrant: 'sidebar',
        time_estimate: parsed.timeEstimate,
        tags: parsed.tags,
        notes: ''
      });
    });

    if (inserts.length === 0) {
      showImportNotice({ type: 'info', message: '가져올 새 브레인 덤프가 없습니다.' });
      setIsImportingBrainDump(false);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('matrix_tasks')
      .insert(inserts)
      .select();

    if (insertError) {
      console.error('Matrix task import insert failed:', insertError);
      showImportNotice({ type: 'error', message: 'Matrix 덤프 섹션에 추가하지 못했습니다.' });
      setIsImportingBrainDump(false);
      return;
    }

    const formatted = (inserted || []).map(t => ({ ...t, timeEstimate: t.time_estimate }));
    setTasks(currentTasks => [...currentTasks, ...formatted]);
    setMobileSectionId('sidebar');
    showImportNotice({ type: 'success', message: `ZeroSlate 브레인 덤프 ${formatted.length}개를 가져왔습니다.` });
    setIsImportingBrainDump(false);
  };

  const moveTaskToSection = async (taskId, targetSectionId) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask || targetTask.quadrant === targetSectionId) return;

    const previousSectionId = targetTask.quadrant;
    setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? { ...t, quadrant: targetSectionId } : t));
    setSelectedTaskId(taskId);
    setMobileSectionId(targetSectionId);

    const { error } = await supabase
      .from('matrix_tasks')
      .update({ quadrant: targetSectionId })
      .eq('id', taskId);

    if (error) {
      console.error('Error updating quadrant', error);
      setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? { ...t, quadrant: previousSectionId } : t));
      setMobileSectionId(previousSectionId);
      showImportNotice({ type: 'error', message: '이동 내용을 저장하지 못해 이전 섹션으로 되돌렸습니다.' });
      return;
    }

    if (targetSectionId === 'q4' && previousSectionId !== 'q4') {
      setCrushedTaskId(taskId);
      setTimeout(() => setCrushedTaskId(null), 700);
    }
  };

  const handleSendToSlate = () => {
    const slateCandidates = tasks.filter(t => t.quadrant === 'q1');
    const todayTasks = slateCandidates
      .slice(0, MAX_SLATE_TASKS)
      .map(t => ({
        id: t.id,
        content: t.content,
        quadrant: t.quadrant,
        timeEstimate: t.timeEstimate || t.time_estimate || 0,
        tags: t.tags || [],
        notes: t.notes || ''
      }));

    if (slateCandidates.length === 0) {
      alert('오늘 할 일(중요+긴급)이 없습니다!');
      return;
    }

    setIsSending(true);
    if (slateCandidates.length > MAX_SLATE_TASKS) {
      showImportNotice({
        type: 'info',
        message: `ZeroSlate Top 3 제한으로 상위 ${MAX_SLATE_TASKS}개만 보냅니다.`
      });
    }

    const textToCopy = todayTasks.map(t => `- [ ] ${t.content}`).join('\n');
    localStorage.setItem('zeroslate_shared_tasks', JSON.stringify(todayTasks));
    
    setTimeout(() => {
      navigator.clipboard?.writeText(textToCopy).catch(() => {});
      window.location.assign(buildSlateImportUrl(todayTasks));
    }, slateCandidates.length > MAX_SLATE_TASKS ? 1200 : 800);
  };

  if (!session) {
    return (
      <>
        <SuiteBackButton href={returnUrl} />
        <Auth />
      </>
    );
  }

  return (
    <>
      <SuiteBackButton href={returnUrl} />
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="matrix-shell" style={{ background: 'var(--bg-color)', display: 'flex', justifyContent: 'center', height: '100vh' }}>
          <div className="matrix-workspace" style={{ display: 'flex', width: '100%', maxWidth: '1400px', padding: '24px', gap: '24px' }}>
          {/* Sidebar - Brain Dump */}
          <div className="matrix-sidebar" style={{ display: 'flex', flexDirection: 'column', width: '380px', flexShrink: 0 }}>
          {/* Header */}
          <div className="matrix-app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <span style={{ fontSize: '14px' }}>Z</span>
              </div>
              ZeroMatrix
            </h1>
            <div className="matrix-header-actions matrix-mobile-tools" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleImportBrainDump}
                disabled={isImportingBrainDump}
                className="glass-button matrix-import-button"
                title={`${selectedDate} ZeroSlate 브레인 덤프 가져오기`}
              >
                <Download size={14} /> {isImportingBrainDump ? '가져오는 중' : 'Slate'}
              </button>
              <button 
                onClick={() => openZenMode()}
                className="glass-button"
                style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                title="전역 젠 모드 켜기"
              >
                <Activity size={14} /> 젠 모드
              </button>
              <select 
                value={theme}
                onChange={(e) => {setTheme(e.target.value); localStorage.setItem('zeromatrix-theme', e.target.value); document.documentElement.setAttribute('data-theme', e.target.value);}}
                className="theme-select"
                style={{ width: 'auto' }}
              >
                <option value="light">☀️ Light</option>
                <option value="midnight">🌙 Midnight</option>
                <option value="ocean">🌊 Ocean</option>
                <option value="sunset">🌇 Sunset</option>
                <option value="forest">🌲 Forest</option>
                <option value="lavender">💜 Lavender</option>
                <option value="rose">🌹 Rose</option>
                <option value="coffee">☕ Coffee</option>
              </select>
            </div>
          </div>

          {/* Input Panel */}
          <div className="glass-panel matrix-input-panel" style={{ padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-color)' }}>
              <span style={{ color: 'var(--accent-color)' }}>⚡️</span> Brain Dump
            </h2>
            
            <form className="matrix-task-form" onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input 
                type="text" 
                className="glass-input" 
                placeholder="할 일 적기..." 
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem', outline: 'none' }}
              />
              <button type="submit" style={{ padding: '0 16px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={18} />
              </button>
            </form>
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <Clock size={12} color="var(--text-secondary)" />
                {['15m', '30m', '1h', '2h'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTime(selectedTime === t ? null : t)}
                    style={{
                      fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', cursor: 'pointer',
                      border: selectedTime === t ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                      background: selectedTime === t ? 'var(--accent-light)' : 'transparent',
                      color: selectedTime === t ? 'var(--accent-color)' : 'var(--text-secondary)',
                      fontWeight: selectedTime === t ? 600 : 500,
                      transition: 'all 0.2s'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {allTags.length > 0 && <div style={{ width: '1px', height: '12px', background: 'var(--border-color)', margin: '0 4px' }} />}

              {allTags.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag size={12} color="var(--text-secondary)" />
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagSelection(tag)}
                      style={{
                        fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', cursor: 'pointer',
                        border: selectedTags.includes(tag) ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                        background: selectedTags.includes(tag) ? 'var(--accent-light)' : 'transparent',
                        color: selectedTags.includes(tag) ? 'var(--accent-color)' : 'var(--text-secondary)',
                        fontWeight: selectedTags.includes(tag) ? 600 : 500,
                        transition: 'all 0.2s'
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {importNotice && (
              <div className={`matrix-import-notice is-${importNotice.type}`}>
                {importNotice.message}
              </div>
            )}
          </div>

          {/* Tags Filter Row */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setActiveTag(null)}
                style={{
                  fontSize: '0.8rem', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', border: '1px solid var(--border-color)',
                  background: activeTag === null ? 'var(--text-color)' : 'transparent',
                  color: activeTag === null ? 'var(--bg-color)' : 'var(--text-secondary)',
                  fontWeight: activeTag === null ? 600 : 400,
                  transition: 'all 0.2s'
                }}
              >
                All
              </button>
              {allTags.map(tag => (
                <button 
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  style={{
                    fontSize: '0.8rem', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', border: activeTag === tag ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                    background: activeTag === tag ? 'var(--accent-color)' : 'transparent',
                    color: activeTag === tag ? '#fff' : 'var(--text-secondary)',
                    fontWeight: activeTag === tag ? 600 : 400,
                    transition: 'all 0.2s'
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="mobile-matrix-flow">
            <div className="mobile-section-tabs" role="tablist" aria-label="ZeroMatrix sections">
              {MATRIX_SECTIONS.map(section => {
                const count = tasks.filter(t => t.quadrant === section.id).length;
                const isActive = mobileSection.id === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`mobile-section-tab ${isActive ? 'is-active' : ''}`}
                    style={{ '--section-color': section.color }}
                    onClick={() => setMobileSectionId(section.id)}
                  >
                    <span>{section.mobileTitle}</span>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </div>

            {selectedTask && (
              <div className="mobile-selected-panel">
                <div className="mobile-selected-copy">
                  <span>선택됨</span>
                  <strong>{selectedTask.content}</strong>
                </div>
                <div className="mobile-target-grid">
                  {MATRIX_SECTIONS.map(section => (
                    <button
                      key={section.id}
                      type="button"
                      className="mobile-target-button"
                      style={{ '--section-color': section.color }}
                      disabled={selectedTask.quadrant === section.id}
                      onClick={() => moveTaskToSection(selectedTask.id, section.id)}
                    >
                      {section.mobileTitle}
                    </button>
                  ))}
                </div>
                <button type="button" className="mobile-clear-selection" onClick={() => setSelectedTaskId(null)}>
                  선택 해제
                </button>
              </div>
            )}

            <section className="mobile-section-panel" style={{ '--section-color': mobileSection.color }}>
              <div className="mobile-section-heading">
                <div>
                  <p>{mobileSection.mobileTitle}</p>
                  <h2>{mobileSection.title}</h2>
                </div>
                <span>{mobileTasks.length}</span>
              </div>

              <div className="mobile-task-list">
                {mobileTasks.length === 0 ? (
                  <div className="mobile-empty-state">비어 있음</div>
                ) : (
                  mobileTasks.map(task => {
                    const isSelected = selectedTaskId === task.id;
                    const taskMinutes = task.timeEstimate || task.time_estimate || 0;

                    return (
                      <div key={task.id} className={`mobile-task-card ${isSelected ? 'is-selected' : ''} ${crushedTaskId === task.id ? 'crush-animate' : ''}`}>
                        <button
                          type="button"
                          className="mobile-task-select"
                          onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                        >
                          <span className="mobile-task-title">
                            {task.content}
                            {task.notes && <FileText size={12} />}
                          </span>
                          {(taskMinutes > 0 || (task.tags && task.tags.length > 0)) && (
                            <span className="mobile-task-meta">
                              {taskMinutes > 0 && <span><Clock size={10} /> {formatTime(taskMinutes)}</span>}
                              {task.tags?.map(tag => <span key={tag}><Tag size={10} /> {tag}</span>)}
                            </span>
                          )}
                        </button>
                        <div className="mobile-task-actions">
                          <button type="button" onClick={() => openZenMode(task.content)}>
                            <Activity size={13} /> 몰입
                          </button>
                          <button type="button" onClick={() => removeTask(task.id)}>
                            <X size={13} /> 삭제
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* Droppable Sidebar List */}
          <div className="glass-panel matrix-sidebar-list" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            <Droppable 
              droppableId="sidebar"
              renderClone={(provided, snapshot, rubric) => {
                const task = tasks.find(t => t.id === rubric.draggableId);
                if (!task) return <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} />;
                return <TaskCard task={task} provided={provided} snapshot={snapshot} isClone={true} removeTask={removeTask} updateTaskNote={updateTaskNote} activeTag={activeTag} openZenMode={openZenMode} />;
              }}
            >
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  {tasks.filter(t => t.quadrant === 'sidebar').map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => <TaskCard task={task} provided={provided} snapshot={snapshot} removeTask={removeTask} updateTaskNote={updateTaskNote} activeTag={activeTag} isCrushed={crushedTaskId === task.id} openZenMode={openZenMode} />}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>

        {/* Main Content - Matrix */}
        <div className="matrix-main" style={{ flex: 1, padding: '0', display: 'flex', flexDirection: 'column' }}>
          {/* Header CTA */}
          <div className="matrix-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', height: '28px' }}>
            <p className="matrix-toolbar-summary" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <span>우선순위 정리</span>
              <strong>덤프 {dumpCount} · 전송 {slateReadyCount}</strong>
            </p>
            <div className="matrix-toolbar-cluster" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div className="matrix-account-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="matrix-account-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)' }} />
                <span className="matrix-account-email" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.user.email}</span>
                <button 
                  className="matrix-logout-button"
                  onClick={() => supabase.auth.signOut()}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', marginLeft: '4px', opacity: 0.7 }}
                  title="로그아웃"
                >
                  <LogOut size={14} />
                </button>
              </div>
              <div className="matrix-toolbar-tools">
                <button
                  type="button"
                  onClick={handleImportBrainDump}
                  disabled={isImportingBrainDump}
                  className="glass-button matrix-import-button"
                  title={`${selectedDate} ZeroSlate 브레인 덤프 가져오기`}
                >
                  <Download size={14} />
                  <span>{isImportingBrainDump ? '가져오는 중' : 'Slate 덤프'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openZenMode()}
                  className="glass-button matrix-zen-button"
                  title="전역 젠 모드 켜기"
                >
                  <Activity size={14} />
                  <span>젠 모드</span>
                </button>
                <select
                  value={theme}
                  onChange={(e) => {
                    setTheme(e.target.value);
                    localStorage.setItem('zeromatrix-theme', e.target.value);
                    document.documentElement.setAttribute('data-theme', e.target.value);
                  }}
                  className="theme-select matrix-theme-select"
                  title="배경 테마"
                >
                  <option value="light">Light</option>
                  <option value="midnight">Midnight</option>
                  <option value="ocean">Ocean</option>
                  <option value="sunset">Sunset</option>
                  <option value="forest">Forest</option>
                  <option value="lavender">Lavender</option>
                  <option value="rose">Rose</option>
                  <option value="coffee">Coffee</option>
                </select>
              </div>
              <button type="button" className="matrix-send-button" onClick={handleSendToSlate}>
                <span className={isSending ? 'rocket-animate' : ''} style={{ display: 'flex' }}>🚀</span>
                <span>{isSending ? '전송중...' : '제로슬레이트로 보내기'}</span>
              </button>
            </div>
          </div>

          {/* Matrix Grid */}
          <div className="glass-panel matrix-board" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <div className="matrix-quadrants" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
              {QUADRANTS.map((q, idx) => {
                const qTasks = tasks.filter(t => t.quadrant === q.id);
                const totalMinutes = qTasks.reduce((sum, t) => sum + (t.timeEstimate || 0), 0);
                const isOverloadedTime = q.id === 'q1' && totalMinutes > 240;
                const isRight = idx % 2 === 1;
                const isBottom = idx >= 2;

                return (
                  <div key={q.id} className="matrix-quadrant" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: draggingSourceId === q.id ? 100 : 1 }}>
                    <div className="matrix-quadrant-inner" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', borderRight: isRight ? 'none' : '1px solid var(--border-color)', borderBottom: isBottom ? 'none' : '1px solid var(--border-color)' }}>
                      <h3 className="matrix-quadrant-title" style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: q.color }} />
                        {q.title}
                        {totalMinutes > 0 && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '12px', background: isOverloadedTime ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-color)', color: isOverloadedTime ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                            {formatTime(totalMinutes)}
                          </span>
                        )}
                      </h3>
                      <Droppable 
                        droppableId={q.id}
                        renderClone={(provided, snapshot, rubric) => {
                          const task = tasks.find(t => t.id === rubric.draggableId);
                          if (!task) return <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} />;
                          return <TaskCard task={task} provided={provided} snapshot={snapshot} isClone={true} removeTask={removeTask} updateTaskNote={updateTaskNote} activeTag={activeTag} openZenMode={openZenMode} />;
                        }}
                      >
                        {(provided, snapshot) => (
                          <div 
                            {...provided.droppableProps} 
                            ref={provided.innerRef}
                            style={{ 
                              flex: 1, 
                              overflowY: 'auto', 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '8px',
                              background: snapshot.isDraggingOver ? 'var(--bg-color)' : 'transparent',
                              borderRadius: '8px',
                              transition: 'all 0.2s',
                              padding: '4px'
                            }}
                          >
                            {tasks.filter(t => t.quadrant === q.id).map((task, index) => (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => <TaskCard task={task} provided={provided} snapshot={snapshot} removeTask={removeTask} updateTaskNote={updateTaskNote} activeTag={activeTag} isCrushed={crushedTaskId === task.id} openZenMode={openZenMode} />}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
        </div>
      </DragDropContext>

      {nudgeMessage && (
        <div 
          className="glass-panel" 
          style={{ 
            position: 'fixed', 
            bottom: '2rem', 
            right: '2rem', 
            padding: '1rem 1.5rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            animation: 'slideUp 0.3s ease-out',
            borderLeft: '4px solid var(--danger-color)',
            zIndex: 1000
          }}
        >
          <AlertCircle color="var(--danger-color)" />
          <p style={{ fontWeight: 500 }}>{nudgeMessage}</p>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Zen Mode Iframe Overlay */}
      {isZenMode && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: 9999,
          background: '#000',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            position: 'absolute', top: '16px', right: '24px', zIndex: 10000
          }}>
            <button 
              onClick={() => setIsZenMode(false)}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                backdropFilter: 'blur(10px)', fontSize: '0.9rem', fontWeight: 600
              }}
            >
              <X size={16} /> 나가기 (Exit Zen Mode)
            </button>
          </div>
          <iframe 
            src={buildNoiseUrl(zenTask)}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="ZeroNoise Zen Mode"
          />
        </div>
      )}
    </>
  );
}

export default App;
