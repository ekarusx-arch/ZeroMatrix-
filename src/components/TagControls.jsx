import { useEffect, useRef, useState } from 'react';
import { Palette, Tag } from 'lucide-react';
import { TAG_COLOR_OPTIONS } from '../lib/tagPalette';

export function TagSelectionRow({ tags, selectedTags, getColor, onToggle }) {
  if (tags.length === 0) return null;

  return (
    <div className="matrix-tag-selection" aria-label="작업 태그 선택">
      <Tag size={13} aria-hidden="true" />
      <div className="matrix-tag-selection-list">
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`matrix-tag-choice ${selected ? 'is-selected' : ''}`}
              style={{ '--tag-color': getColor(tag) }}
              onClick={() => onToggle(tag)}
              aria-pressed={selected}
            >
              <span className="matrix-tag-dot" aria-hidden="true" />
              #{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TagFilterBar({ activeTag, getColor, onColorChange, onFilter, tags }) {
  const [editingTag, setEditingTag] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const closePalette = (event) => {
      if (!containerRef.current?.contains(event.target)) setEditingTag(null);
    };
    document.addEventListener('pointerdown', closePalette);
    return () => document.removeEventListener('pointerdown', closePalette);
  }, []);

  if (tags.length === 0) return null;

  return (
    <div className="matrix-tag-filter-row" ref={containerRef}>
      <div className="matrix-tag-filter-heading">
        <Tag size={14} aria-hidden="true" />
        <span>태그</span>
        <small>색상 점을 눌러 바로 변경</small>
      </div>
      <div className="matrix-tag-filter-list">
        <button
          type="button"
          className={`matrix-tag-all ${activeTag === null ? 'is-active' : ''}`}
          onClick={() => onFilter(null)}
          aria-pressed={activeTag === null}
        >
          전체
        </button>
        {tags.map((tag) => (
          <div key={tag} className="matrix-tag-filter-control" style={{ '--tag-color': getColor(tag) }}>
            <button
              type="button"
              className={`matrix-tag-filter-chip ${activeTag === tag ? 'is-active' : ''}`}
              onClick={() => onFilter(activeTag === tag ? null : tag)}
              aria-pressed={activeTag === tag}
            >
              #{tag}
            </button>
            <button
              type="button"
              className="matrix-tag-swatch"
              style={{ backgroundColor: getColor(tag) }}
              onClick={() => setEditingTag(editingTag === tag ? null : tag)}
              aria-label={`${tag} 태그 색상 변경`}
              aria-expanded={editingTag === tag}
              title="태그 색상 변경"
            />
            {editingTag === tag && (
              <div className="matrix-tag-palette" role="group" aria-label={`${tag} 색상 선택`}>
                <div className="matrix-tag-palette-title">
                  <Palette size={13} aria-hidden="true" /> #{tag}
                </div>
                <div className="matrix-tag-palette-colors">
                  {TAG_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={getColor(tag).toLowerCase() === color.toLowerCase() ? 'is-selected' : ''}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        onColorChange(tag, color);
                        setEditingTag(null);
                      }}
                      aria-label={`${tag} 색상을 ${color}로 변경`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
