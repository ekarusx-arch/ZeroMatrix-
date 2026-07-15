/* eslint-disable react-hooks/refs -- @hello-pangea/dnd exposes render-prop refs that React 19 lint treats as ref reads. */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ArrowLeft, GripVertical, X, Clock, FileText, Plus, LogOut, AlertCircle, Download, HelpCircle, Tag as TagIcon } from 'lucide-react';
import Auth from './components/Auth';
import { TagFilterBar, TagSelectionRow } from './components/TagControls';
import TimeBudget from './components/TimeBudget';
import { supabase } from './lib/supabaseClient';
import { isMatrixPreview, previewSession, previewTagPalette, previewTasks } from './lib/devPreview';
import { getTagColor, mergeTagPalette, normalizeTagPalette, toSlateTagPalette } from './lib/tagPalette';
import { getNextTimeEstimate } from './lib/timeBudget';

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

function getMatrixSection(sectionId) {
  return MATRIX_SECTIONS.find((section) => section.id === sectionId) || MATRIX_SECTIONS[0];
}

const ZERO_SLATE_URL = 'https://zeroslate.kr';
const SUITE_AUTH_EXCHANGE_URL = 'https://zeroslate.kr/api/auth/suite/exchange';
const MAX_SLATE_TASKS = 3;

function getSuiteToken() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('suiteToken');
}

function clearSuiteToken() {
  const url = new URL(window.location.href);
  url.searchParams.delete('suiteToken');
  window.history.replaceState({}, document.title, url.toString());
}

async function connectSuiteSession() {
  const token = getSuiteToken();
  if (!token) return false;

  try {
    const response = await fetch(SUITE_AUTH_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token || !data.refresh_token) {
      throw new Error(data.error || 'suite_auth_exchange_failed');
    }

    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('ZeroSlate 세션 연결 실패:', error);
    return false;
  } finally {
    clearSuiteToken();
  }
}

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

function getAccountDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const name = metadata.full_name || metadata.name || metadata.preferred_username;
  if (name) return String(name).trim();
  return user?.email?.split('@')[0] || '계정';
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

function MatrixGuideModal({ onClose }) {
  return (
    <div className="matrix-guide-backdrop" onClick={onClose} role="presentation">
      <section
        className="matrix-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matrix-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="matrix-guide-header">
          <div>
            <p>ZeroMatrix Guide</p>
            <h2 id="matrix-guide-title">사용법</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="사용법 닫기">
            <X size={17} />
          </button>
        </div>
        <ol className="matrix-guide-steps">
          <li>
            <strong>브레인 덤프</strong>
            <span>떠오른 일을 먼저 적습니다. 입력 전에 시간과 태그를 선택하거나, 문장에 #태그와 [30m]를 함께 적어도 됩니다.</span>
          </li>
          <li>
            <strong>4칸 분류</strong>
            <span>목록을 드래그해서 중요+긴급, 중요, 긴급, 제거로 나눕니다. 모바일에서는 항목을 선택한 뒤 보낼 섹션을 누릅니다.</span>
          </li>
          <li>
            <strong>태그와 시간 정리</strong>
            <span>목록의 색점은 태그를 빠르게 바꿉니다. 시간 버튼은 미정, 15m, 30m, 1h, 2h 순서로 바뀝니다.</span>
          </li>
          <li>
            <strong>ZeroSlate로 보내기</strong>
            <span>보낼 목록을 고른 뒤 Slate로 보냅니다. ZeroSlate Top 3가 비어 있을 때만 가져갈 수 있습니다.</span>
          </li>
        </ol>
        <div className="matrix-guide-note">
          Slate 덤프 버튼은 ZeroSlate 브레인 덤프를 Matrix로 가져올 때 사용합니다.
        </div>
      </section>
    </div>
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

function TaskCard({ task, provided, snapshot, isClone, removeTask, updateTaskContent, updateTaskNote, updateTaskTime, activeTag, isCrushed, tagColor, onTaskTagCycle, tagOptionCount }) {
  const isDragging = isClone || snapshot.isDragging;
  const [isFlipped, setIsFlipped] = useState(false);
  const [note, setNote] = useState(task.notes || '');
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(task.content || '');
  const sectionColor = getMatrixSection(task.quadrant).color;
  const primaryTag = task.tags?.[0] || null;
  const primaryTagColor = primaryTag ? tagColor(primaryTag) : sectionColor;
  const canCycleTaskTag = Boolean(!isClone && (primaryTag ? tagOptionCount > 1 : tagOptionCount > 0));
  const taskMinutes = task.timeEstimate || task.time_estimate || 0;

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

  const startContentEdit = (event) => {
    event.stopPropagation();
    if (isDragging || isClone) return;
    setContentDraft(task.content || '');
    setIsEditingContent(true);
  };

  const saveContentEdit = async () => {
    const nextContent = contentDraft.trim().replace(/\s+/g, ' ');
    if (!nextContent) {
      setContentDraft(task.content || '');
      setIsEditingContent(false);
      return;
    }

    setIsEditingContent(false);
    if (nextContent !== task.content) {
      await updateTaskContent(task.id, nextContent);
    }
  };

  const handleContentKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveContentEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setContentDraft(task.content || '');
      setIsEditingContent(false);
    }
  };

  const handleTaskTagCycle = (event) => {
    event.stopPropagation();
    if (!canCycleTaskTag || isDragging) return;
    onTaskTagCycle(task.id);
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
          '--section-color': sectionColor,
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
        '--section-color': sectionColor,
        transition: [provided.draggableProps.style?.transition, 'opacity 0.2s', 'background 0.2s', 'box-shadow 0.2s'].filter(Boolean).join(', ')
      }}
    >
      <div className="matrix-task-grip" {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', color: 'var(--border-color)', cursor: isDragging ? 'grabbing' : 'grab' }}>
        <GripVertical size={16} />
      </div>
      {canCycleTaskTag ? (
        <button
          type="button"
          className="matrix-task-color-dot is-clickable"
          style={{ '--tag-color': primaryTagColor }}
          onClick={handleTaskTagCycle}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={primaryTag ? `#${primaryTag} 태그 변경` : '태그 적용'}
          title={primaryTag ? `#${primaryTag} 태그 변경` : '태그 적용'}
        />
      ) : (
        <span className="matrix-task-color-dot" style={{ '--tag-color': primaryTagColor }} aria-hidden="true" />
      )}

      <div className="matrix-task-body" style={{display: 'flex', flexDirection: 'column', gap: '4px', flex: 1}}>
        {isEditingContent ? (
          <input
            autoFocus
            className="matrix-task-edit-input"
            value={contentDraft}
            onBlur={saveContentEdit}
            onChange={(event) => setContentDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={handleContentKeyDown}
          />
        ) : (
          <button
            type="button"
            className="matrix-task-title-button"
            onClick={startContentEdit}
            onDoubleClick={(event) => event.stopPropagation()}
            title="클릭해서 내용 수정"
          >
            <span className="matrix-task-title" style={{wordBreak: 'break-all', fontSize: '0.9rem', fontWeight: 500}}>{task.content}</span>
            {task.tags?.map(tag => (
              <span className="matrix-task-inline-tag" key={tag} style={{ '--tag-color': tagColor(tag) }}>
                #{tag}
              </span>
            ))}
            {task.notes && <FileText size={12} color="var(--accent-color)" />}
          </button>
        )}
      </div>

      <div className="matrix-task-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          className="matrix-task-time-action"
          onClick={(event) => {
            event.stopPropagation();
            updateTaskTime(task.id);
          }}
          title="예상 시간 변경"
          aria-label={`${task.content} 예상 시간 변경`}
        >
          <Clock size={14} />
          <span>{formatTime(taskMinutes) || '시간'}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            removeTask(task.id);
          }}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.5, padding: '4px' }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => isMatrixPreview ? previewSession : null);
  const [authReady, setAuthReady] = useState(isMatrixPreview);
  const [tasks, setTasks] = useState(() => isMatrixPreview ? previewTasks : []);
  const [newTask, setNewTask] = useState('');
  const [draggingSourceId, setDraggingSourceId] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('zeromatrix-theme') || 'light';
  });
  const [activeTag, setActiveTag] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [crushedTaskId, setCrushedTaskId] = useState(null);
  const [slateSourceId, setSlateSourceId] = useState('q1');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagPalette, setTagPalette] = useState(() => isMatrixPreview ? previewTagPalette : []);
  const tagPaletteRef = useRef(tagPalette);
  const syncedTagPaletteRef = useRef(tagPalette);
  const tagSyncQueueRef = useRef(Promise.resolve());
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState(() => {
    if (typeof window === 'undefined') return 480;
    const saved = Number(localStorage.getItem('zeromatrix-daily-capacity'));
    return [240, 360, 480].includes(saved) ? saved : 480;
  });
  const [returnUrl] = useState(getInitialReturnUrl);
  const [selectedDate] = useState(getInitialSuiteDate);
  const [mobileSectionId, setMobileSectionId] = useState('sidebar');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isImportingBrainDump, setIsImportingBrainDump] = useState(false);
  const [importNotice, setImportNotice] = useState(null);
  const importNoticeTimerRef = useRef(null);

  const buildSlateImportUrl = (selectedTasks) => {
    const target = new URL(returnUrl);
    const usedTags = new Set(selectedTasks.flatMap((task) => task.tags || []));
    const sharedPalette = tagPalette.filter((item) => usedTags.has(item.tag));
    target.searchParams.set('from', 'matrix');
    target.searchParams.set('matrixVersion', '2');
    target.searchParams.set('date', selectedDate);
    target.searchParams.set('matrixTasks', JSON.stringify(selectedTasks));
    target.searchParams.set('matrixTags', JSON.stringify(toSlateTagPalette(sharedPalette)));
    return target.toString();
  };

  const allTags = useMemo(() => Array.from(new Set([
    ...tagPalette.map((item) => item.tag),
    ...tasks.flatMap((task) => task.tags || []),
  ])), [tagPalette, tasks]);
  const tagColor = useCallback((tag) => getTagColor(tagPalette, tag), [tagPalette]);
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const mobileSection = MATRIX_SECTIONS.find(section => section.id === mobileSectionId) || MATRIX_SECTIONS[0];
  const mobileTasks = tasks.filter(t => t.quadrant === mobileSection.id && (!activeTag || (t.tags || []).includes(activeTag)));
  const dumpCount = tasks.filter(t => t.quadrant === 'sidebar').length;
  const slateSource = getMatrixSection(slateSourceId);
  const slateCandidateCount = tasks.filter(t => t.quadrant === slateSourceId).length;
  const slateReadyCount = Math.min(slateCandidateCount, MAX_SLATE_TASKS);
  const accountLabel = session ? getAccountDisplayName(session.user) : '계정';
  const quadrantMinutes = useMemo(() => QUADRANTS.reduce((totals, quadrant) => ({
    ...totals,
    [quadrant.id]: tasks
      .filter((task) => task.quadrant === quadrant.id)
      .reduce((sum, task) => sum + (task.timeEstimate || task.time_estimate || 0), 0),
  }), { q1: 0, q2: 0, q3: 0, q4: 0 }), [tasks]);
  const unestimatedExecutionCount = tasks.filter((task) => (
    (task.quadrant === 'q1' || task.quadrant === 'q2')
    && !(task.timeEstimate || task.time_estimate)
  )).length;
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

  useEffect(() => {
    if (!isGuideOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsGuideOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isGuideOpen]);

  useEffect(() => {
    tagPaletteRef.current = tagPalette;
  }, [tagPalette]);

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

  const fetchTagPalette = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('custom_tags')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('ZeroSlate tag palette fetch failed', error);
      return;
    }

    const nextPalette = normalizeTagPalette(data?.custom_tags);
    tagPaletteRef.current = nextPalette;
    syncedTagPaletteRef.current = nextPalette;
    setTagPalette(nextPalette);
  }, []);

  useEffect(() => {
    if (isMatrixPreview) return undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchTasks(session.user.id);
        fetchTagPalette(session.user.id);
      } else {
        setTasks([]);
        setTagPalette([]);
      }
    });

    let mounted = true;
    const initializeAuth = async () => {
      await connectSuiteSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      if (session) {
        fetchTasks(session.user.id);
        fetchTagPalette(session.user.id);
      }
      setAuthReady(true);
    };
    void initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchTagPalette, fetchTasks]);

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

  const persistTagPalette = async (nextPalette) => {
    if (!session?.user?.id) return false;
    const normalized = normalizeTagPalette(nextPalette);
    tagPaletteRef.current = normalized;
    setTagPalette(normalized);

    if (isMatrixPreview) return true;

    const syncOperation = tagSyncQueueRef.current.then(() => (
      supabase.from('user_settings').upsert({
        user_id: session.user.id,
        custom_tags: toSlateTagPalette(normalized),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    ));
    tagSyncQueueRef.current = syncOperation.catch(() => {});
    let error;
    try {
      ({ error } = await syncOperation);
    } catch (syncError) {
      error = syncError;
    }

    if (error) {
      console.error('ZeroSlate tag palette sync failed', error);
      if (tagPaletteRef.current === normalized) {
        tagPaletteRef.current = syncedTagPaletteRef.current;
        setTagPalette(syncedTagPaletteRef.current);
      }
      showImportNotice({ type: 'error', message: '태그 색상을 ZeroSlate와 동기화하지 못했습니다.' });
      return false;
    }
    syncedTagPaletteRef.current = normalized;
    return true;
  };

  const ensureTagsInPalette = async (tags) => {
    const currentPalette = tagPaletteRef.current;
    const nextPalette = mergeTagPalette(currentPalette, tags);
    if (nextPalette.length === currentPalette.length) return;
    await persistTagPalette(nextPalette);
  };

  const handleTagColorChange = async (tag, color) => {
    const nextPalette = mergeTagPalette(tagPaletteRef.current, [tag]).map((item) => (
      item.tag === tag ? { ...item, color } : item
    ));
    const synced = await persistTagPalette(nextPalette);
    if (synced) showImportNotice({ type: 'success', message: `#${tag} 색상을 ZeroSlate와 맞췄습니다.` });
  };

  const handleTaskTagCycle = async (id) => {
    const target = tasks.find((task) => task.id === id);
    const tagOptions = allTags.filter(Boolean);
    if (!target || tagOptions.length === 0) return;

    const currentTags = target.tags || [];
    const currentPrimaryTag = currentTags[0] || null;
    const currentIndex = tagOptions.indexOf(currentPrimaryTag);
    if (currentPrimaryTag && tagOptions.length < 2) return;

    const nextPrimaryTag = tagOptions[(currentIndex + 1 + tagOptions.length) % tagOptions.length];
    const nextTags = [
      nextPrimaryTag,
      ...currentTags.slice(1).filter((tag) => tag !== nextPrimaryTag),
    ];
    const previousTasks = tasks;

    setTasks((currentTasks) => currentTasks.map((task) => (
      task.id === id ? { ...task, tags: nextTags } : task
    )));

    if (isMatrixPreview) return;

    const { error } = await supabase.from('matrix_tasks').update({ tags: nextTags }).eq('id', id);
    if (error) {
      console.error('Error updating task tags', error);
      setTasks(previousTasks);
      showImportNotice({ type: 'error', message: '태그 변경을 저장하지 못해 이전 상태로 되돌렸습니다.' });
    }
  };

  const handleCapacityChange = (minutes) => {
    setDailyCapacityMinutes(minutes);
    localStorage.setItem('zeromatrix-daily-capacity', String(minutes));
  };

  const updateTaskTime = async (id) => {
    const target = tasks.find((task) => task.id === id);
    if (!target) return;
    const current = target.timeEstimate || target.time_estimate || 0;
    const next = getNextTimeEstimate(current);
    const previousTasks = tasks;

    setTasks((currentTasks) => currentTasks.map((task) => (
      task.id === id ? { ...task, timeEstimate: next, time_estimate: next } : task
    )));

    if (isMatrixPreview) return;

    const { error } = await supabase.from('matrix_tasks').update({ time_estimate: next }).eq('id', id);
    if (error) {
      console.error('Error updating time estimate', error);
      setTasks(previousTasks);
      showImportNotice({ type: 'error', message: '예상 시간을 저장하지 못했습니다.' });
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
      await ensureTagsInPalette(parsed.tags);
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

  const updateTaskContent = async (id, newContent) => {
    const previousTasks = tasks;
    setTasks(tasks.map(t => t.id === id ? { ...t, content: newContent } : t));

    if (isMatrixPreview) return;

    const { error } = await supabase.from('matrix_tasks').update({ content: newContent }).eq('id', id);
    if (error) {
      console.error('Error updating content', error);
      setTasks(previousTasks);
      showImportNotice({ type: 'error', message: '작업 내용을 저장하지 못해 이전 내용으로 되돌렸습니다.' });
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
    await ensureTagsInPalette(formatted.flatMap((task) => task.tags || []));
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

  const handleSendToSlate = async () => {
    if (isSending) return;
    const slateCandidates = tasks.filter(t => t.quadrant === slateSourceId);
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
      alert(`${slateSource.title}에 보낼 일이 없습니다!`);
      return;
    }

    setIsSending(true);

    if (!isMatrixPreview && session?.user?.id) {
      const { count, error } = await supabase
        .from('top_three')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('date', selectedDate);

      if (error) {
        console.error('ZeroSlate Top 3 check failed:', error);
        showImportNotice({ type: 'error', message: 'ZeroSlate Top 3 상태를 확인하지 못했습니다.' });
        setIsSending(false);
        return;
      }

      if ((count || 0) > 0) {
        showImportNotice({ type: 'error', message: 'ZeroSlate Top 3에 기존 항목이 있어 보내기를 중단했습니다.' });
        setIsSending(false);
        return;
      }
    }

    if (slateCandidates.length > MAX_SLATE_TASKS) {
      showImportNotice({
        type: 'success',
        message: `${slateSource.mobileTitle}에서 ZeroSlate Top 3 제한으로 상위 ${MAX_SLATE_TASKS}개만 보냅니다.`
      });
    }

    const textToCopy = todayTasks.map((task) => {
      const duration = formatTime(task.timeEstimate);
      const tags = task.tags.map((tag) => `#${tag}`).join(' ');
      return `- [ ] ${[task.content, duration ? `[${duration}]` : '', tags].filter(Boolean).join(' ')}`;
    }).join('\n');
    localStorage.setItem('zeroslate_shared_tasks', JSON.stringify({
      tasks: todayTasks,
      tags: toSlateTagPalette(tagPalette),
      version: 2,
    }));

    setTimeout(() => {
      navigator.clipboard?.writeText(textToCopy).catch(() => {});
      window.location.assign(buildSlateImportUrl(todayTasks));
    }, slateCandidates.length > MAX_SLATE_TASKS ? 1200 : 800);
  };

  if (!authReady) {
    return (
      <div className="matrix-auth-loading" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--bg-color)', color: 'var(--text-color)' }}>
        <div className="glass-panel" style={{ padding: '28px', textAlign: 'center' }}>
          <div className="matrix-auth-spinner" />
          ZeroSlate 세션 연결 중...
        </div>
      </div>
    );
  }

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
          <div className="matrix-workspace" style={{ display: 'flex', width: '100%', maxWidth: '1760px', padding: '24px', gap: '24px' }}>
          {/* Sidebar - Brain Dump */}
          <div className="matrix-sidebar" style={{ display: 'flex', flexDirection: 'column', width: 'clamp(660px, 47vw, 820px)', flex: '0 1 clamp(660px, 47vw, 820px)', minWidth: '660px' }}>
          {/* Header */}
          <div className="matrix-app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <span style={{ fontSize: '14px' }}>Z</span>
              </div>
              ZeroMatrix
              <button
                type="button"
                className="matrix-guide-trigger"
                onClick={() => setIsGuideOpen(true)}
                aria-haspopup="dialog"
              >
                <HelpCircle size={14} />
                <span>사용법</span>
              </button>
            </h1>
            <div className="matrix-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="matrix-account-pill matrix-header-account" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="matrix-account-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)' }} />
                <span className="matrix-account-email" title={session.user.email} style={{ fontSize: '0.85rem', fontWeight: 560, color: 'var(--text-color)' }}>{accountLabel}</span>
                <button
                  className="matrix-logout-button"
                  onClick={() => supabase.auth.signOut()}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', marginLeft: '4px', opacity: 0.7 }}
                  title="로그아웃"
                >
                  <LogOut size={14} />
                </button>
              </div>
              <select
                value={theme}
                onChange={(e) => {setTheme(e.target.value); localStorage.setItem('zeromatrix-theme', e.target.value); document.documentElement.setAttribute('data-theme', e.target.value);}}
                className="theme-select matrix-theme-select matrix-header-theme-select"
                title="배경 테마"
                style={{ width: 'auto' }}
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
          </div>

          <div className="matrix-dump-layout">
            <div className="matrix-dump-controls">
              {/* Input Panel */}
              <div className="glass-panel matrix-input-panel" style={{ padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 650, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-color)' }}>
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

                <div className="matrix-entry-options">
                  <div className="matrix-time-preset" aria-label="새 작업 예상 시간">
                    <Clock size={12} color="var(--text-secondary)" />
                    {['15m', '30m', '1h', '2h'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTime(selectedTime === t ? null : t)}
                        className={selectedTime === t ? 'is-active' : ''}
                        aria-pressed={selectedTime === t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <TagSelectionRow
                    tags={allTags}
                    selectedTags={selectedTags}
                    getColor={tagColor}
                    onToggle={toggleTagSelection}
                  />
                </div>

                <TimeBudget
                  capacity={dailyCapacityMinutes}
                  onCapacityChange={handleCapacityChange}
                  quadrantMinutes={quadrantMinutes}
                  unestimatedCount={unestimatedExecutionCount}
                />

                {importNotice && (
                  <div className={`matrix-import-notice is-${importNotice.type}`}>
                    {importNotice.message}
                  </div>
                )}
              </div>

              <TagFilterBar
                tags={allTags}
                activeTag={activeTag}
                getColor={tagColor}
                onFilter={setActiveTag}
                onColorChange={handleTagColorChange}
              />
            </div>

            {/* Droppable Sidebar List */}
            <div className="glass-panel matrix-sidebar-list" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <div className="matrix-list-heading">
                <div className="matrix-list-heading-main">
                  <span className="matrix-list-icon" aria-hidden="true">⚡</span>
                  <strong>Brain Dump</strong>
                  <span>{dumpCount}개</span>
                </div>
                <span className="matrix-list-filter-lines" aria-hidden="true" />
              </div>
              <Droppable
                droppableId="sidebar"
                renderClone={(provided, snapshot, rubric) => {
                  const task = tasks.find(t => t.id === rubric.draggableId);
                  if (!task) return <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} />;
                  return <TaskCard task={task} provided={provided} snapshot={snapshot} isClone={true} removeTask={removeTask} updateTaskContent={updateTaskContent} updateTaskNote={updateTaskNote} updateTaskTime={updateTaskTime} activeTag={activeTag} tagColor={tagColor} onTaskTagCycle={handleTaskTagCycle} tagOptionCount={allTags.length} />;
                }}
              >
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="matrix-task-stack matrix-dump-stack"
                    style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}
                  >
                    {tasks.filter(t => t.quadrant === 'sidebar').map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => <TaskCard task={task} provided={provided} snapshot={snapshot} removeTask={removeTask} updateTaskContent={updateTaskContent} updateTaskNote={updateTaskNote} updateTaskTime={updateTaskTime} activeTag={activeTag} isCrushed={crushedTaskId === task.id} tagColor={tagColor} onTaskTagCycle={handleTaskTagCycle} tagOptionCount={allTags.length} />}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>

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
                              {task.tags?.map(tag => (
                                <span key={tag} className="is-tag" style={{ '--tag-color': tagColor(tag) }}>
                                  <span className="matrix-task-tag-dot" aria-hidden="true" />#{tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                        <div className="mobile-task-actions">
                          <button type="button" onClick={() => updateTaskTime(task.id)}>
                            <Clock size={13} /> {formatTime(taskMinutes) || '시간'}
                          </button>
                          {((task.tags?.length > 0 ? allTags.length > 1 : allTags.length > 0)) && (
                            <button type="button" onClick={() => handleTaskTagCycle(task.id)}>
                              <TagIcon size={13} /> 태그
                            </button>
                          )}
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

        </div>

        {/* Main Content - Matrix */}
        <div className="matrix-main" style={{ flex: 1, padding: '0', display: 'flex', flexDirection: 'column' }}>
          {/* Header CTA */}
          <div className="matrix-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', height: '28px' }}>
            <p className="matrix-toolbar-summary" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <span>우선순위 정리</span>
              <strong>{slateSource.mobileTitle} {slateReadyCount}/{slateCandidateCount}</strong>
            </p>
            <div className="matrix-toolbar-cluster" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
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
              </div>
              <label className="matrix-send-source">
                <span>보낼 목록</span>
                <select
                  value={slateSourceId}
                  onChange={(event) => setSlateSourceId(event.target.value)}
                  aria-label="ZeroSlate로 보낼 목록 선택"
                >
                  {MATRIX_SECTIONS.map((section) => {
                    const count = tasks.filter(t => t.quadrant === section.id).length;
                    return (
                      <option key={section.id} value={section.id}>
                        {section.mobileTitle} {count}
                      </option>
                    );
                  })}
                </select>
              </label>
              <button type="button" className="matrix-send-button" onClick={handleSendToSlate} disabled={isSending}>
                <span className={isSending ? 'rocket-animate' : ''} style={{ display: 'flex' }}>🚀</span>
                <span>{isSending ? '전송중...' : `${slateSource.mobileTitle} 보내기`}</span>
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
                          return <TaskCard task={task} provided={provided} snapshot={snapshot} isClone={true} removeTask={removeTask} updateTaskContent={updateTaskContent} updateTaskNote={updateTaskNote} updateTaskTime={updateTaskTime} activeTag={activeTag} tagColor={tagColor} onTaskTagCycle={handleTaskTagCycle} tagOptionCount={allTags.length} />;
                        }}
                      >
                        {(provided, snapshot) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="matrix-task-stack"
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
                                {(provided, snapshot) => <TaskCard task={task} provided={provided} snapshot={snapshot} removeTask={removeTask} updateTaskContent={updateTaskContent} updateTaskNote={updateTaskNote} updateTaskTime={updateTaskTime} activeTag={activeTag} isCrushed={crushedTaskId === task.id} tagColor={tagColor} onTaskTagCycle={handleTaskTagCycle} tagOptionCount={allTags.length} />}
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

      {isGuideOpen && <MatrixGuideModal onClose={() => setIsGuideOpen(false)} />}

    </>
  );
}

export default App;
