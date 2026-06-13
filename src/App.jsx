import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, X, Clock, Tag, FileText, Send, Plus, LogOut, Activity } from 'lucide-react';
import Auth from './components/Auth';
import { supabase } from './lib/supabaseClient';

const QUADRANTS = [
  { id: 'q1', title: '중요하고 긴급함 (Do First)', color: 'var(--danger-color)' },
  { id: 'q2', title: '중요하지만 긴급하지 않음 (Schedule)', color: 'var(--success-color)' },
  { id: 'q3', title: '중요하지 않지만 긴급함 (Delegate)', color: 'var(--accent-color)' },
  { id: 'q4', title: '중요하지도 긴급하지도 않음 (Eliminate)', color: 'var(--text-secondary)' },
];

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

  const tagRegex = /#(\w+)/g;
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
        className="glass-button"
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
      className={`glass-button ${isCrushed ? 'crush-animate' : ''}`}
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
      <div {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', color: 'var(--border-color)', cursor: isDragging ? 'grabbing' : 'grab' }}>
        <GripVertical size={16} />
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '4px', flex: 1}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
          <span style={{wordBreak: 'break-all', fontSize: '0.9rem', fontWeight: 500}}>{task.content}</span>
          {task.notes && <FileText size={12} color="var(--accent-color)" />}
        </div>
        {(task.timeEstimate > 0 || (task.tags && task.tags.length > 0)) && (
          <div style={{display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap'}}>
            {task.timeEstimate > 0 && (
              <span style={{fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-color)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px'}}>
                <Clock size={10} /> {formatTime(task.timeEstimate)}
              </span>
            )}
            {task.tags?.map(tag => (
              <span key={tag} style={{fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--accent-light)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px'}}>
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
  const [nudgeMessage, setNudgeMessage] = useState(null);
  const [draggingSourceId, setDraggingSourceId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [activeTag, setActiveTag] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [crushedTaskId, setCrushedTaskId] = useState(null);

  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  
  const [isZenMode, setIsZenMode] = useState(false);
  const [zenTask, setZenTask] = useState(null);

  const openZenMode = (taskContent = null) => {
    setZenTask(taskContent);
    setIsZenMode(true);
  };

  const allTags = Array.from(new Set(tasks.flatMap(t => t.tags || [])));

  useEffect(() => {
    const savedTheme = localStorage.getItem('zeromatrix-theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

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
  }, []);

  const fetchTasks = async (userId) => {
    const { data, error } = await supabase
      .from('matrix_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching tasks', error);
    } else {
      const formatted = (data || []).map(t => ({
        ...t,
        timeEstimate: t.time_estimate // map db snake_case to component camelCase
      }));
      setTasks(formatted);
    }
  };

  useEffect(() => {
    const quadrantCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    tasks.forEach(t => {
      if (t.quadrant.startsWith('q')) {
        quadrantCounts[t.quadrant]++;
      }
    });

    const overloaded = Object.values(quadrantCounts).some(count => count >= 5);
    if (overloaded) {
      setNudgeMessage('생각이 너무 복잡해요! 🧠 조금 미뤄보는 건 어떨까요?');
    } else {
      setNudgeMessage(null);
    }
  }, [tasks]);

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
      if (error) console.error('Error updating quadrant', error);
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
      setTasks([...tasks, { ...data, timeEstimate: data.time_estimate }]);
    }

    setNewTask('');
    setSelectedTime(null);
    setSelectedTags([]);
  };

  const removeTask = async (id) => {
    setTasks(tasks.filter(t => t.id !== id));
    await supabase.from('matrix_tasks').delete().eq('id', id);
  };

  const updateTaskNote = async (id, newNote) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, notes: newNote } : t));
    await supabase.from('matrix_tasks').update({ notes: newNote }).eq('id', id);
  };

  const handleSendToSlate = () => {
    const todayTasks = tasks.filter(t => t.quadrant === 'q1').map(t => t.content);
    if (todayTasks.length === 0) {
      alert('오늘 할 일(중요+긴급)이 없습니다!');
      return;
    }

    setIsSending(true);

    const textToCopy = todayTasks.map(t => `- [ ] ${t}`).join('\n');
    localStorage.setItem('zeroslate_shared_tasks', JSON.stringify(todayTasks));
    
    setTimeout(() => {
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`🚀 제로슬레이트로 연동 성공!\n\n${textToCopy}`);
        setIsSending(false);
      });
    }, 800);
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <>
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div style={{ background: 'var(--bg-color)', display: 'flex', justifyContent: 'center', height: '100vh' }}>
          <div style={{ display: 'flex', width: '100%', maxWidth: '1400px', padding: '24px', gap: '24px' }}>
          {/* Sidebar - Brain Dump */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '380px', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <span style={{ fontSize: '14px' }}>Z</span>
              </div>
              ZeroMatrix
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-color)' }}>
              <span style={{ color: 'var(--accent-color)' }}>⚡️</span> Brain Dump
            </h2>
            
            <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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

          {/* Droppable Sidebar List */}
          <div className="glass-panel" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
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
        <div style={{ flex: 1, padding: '0', display: 'flex', flexDirection: 'column' }}>
          {/* Header CTA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', height: '28px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              우선순위를 정리하고, 로켓을 발사하세요.
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.user.email}</span>
                <button 
                  onClick={() => supabase.auth.signOut()}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', marginLeft: '4px', opacity: 0.7 }}
                  title="로그아웃"
                >
                  <LogOut size={14} />
                </button>
              </div>
              <button onClick={handleSendToSlate} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', background: '#1e293b', fontSize: '0.85rem', fontWeight: 600, color: 'white', border: 'none', cursor: 'pointer' }}>
                <span className={isSending ? 'rocket-animate' : ''} style={{ display: 'flex' }}>🚀</span>
                <span>{isSending ? '전송중...' : '제로슬레이트로 보내기'}</span>
              </button>
            </div>
          </div>

          {/* Matrix Grid */}
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
              {QUADRANTS.map((q, idx) => {
                const qTasks = tasks.filter(t => t.quadrant === q.id);
                const totalMinutes = qTasks.reduce((sum, t) => sum + (t.timeEstimate || 0), 0);
                const isOverloadedTime = q.id === 'q1' && totalMinutes > 240;
                const isRight = idx % 2 === 1;
                const isBottom = idx >= 2;

                return (
                  <div key={q.id} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: draggingSourceId === q.id ? 100 : 1 }}>
                    <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', borderRight: isRight ? 'none' : '1px solid var(--border-color)', borderBottom: isBottom ? 'none' : '1px solid var(--border-color)' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            src={`${import.meta.env.VITE_ZERONOISE_URL || 'http://localhost:5500'}${zenTask ? `?task=${encodeURIComponent(zenTask)}` : ''}`} 
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="ZeroNoise Zen Mode"
          />
        </div>
      )}
    </>
  );
}

export default App;
