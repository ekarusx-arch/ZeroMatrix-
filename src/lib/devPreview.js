export const isMatrixPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('preview') === 'matrix';

export const previewSession = {
  user: {
    id: 'matrix-preview-user',
    email: 'preview@zeroslate.kr',
  },
};

export const previewTagPalette = [
  { tag: '기획', color: '#FB923C' },
  { tag: '개발', color: '#60A5FA' },
  { tag: '집중', color: '#A78BFA' },
  { tag: '연락', color: '#34D399' },
];

export const previewTasks = [
  { id: 'preview-1', content: '이번 주 제품 방향 정리', quadrant: 'sidebar', timeEstimate: 30, time_estimate: 30, tags: ['기획'], notes: '' },
  { id: 'preview-2', content: '결제 화면 오류 수정', quadrant: 'q1', timeEstimate: 120, time_estimate: 120, tags: ['개발', '집중'], notes: '' },
  { id: 'preview-3', content: '신규 온보딩 구조 설계', quadrant: 'q2', timeEstimate: 60, time_estimate: 60, tags: ['기획'], notes: '' },
  { id: 'preview-4', content: '파트너 답변 전달', quadrant: 'q3', timeEstimate: 15, time_estimate: 15, tags: ['연락'], notes: '' },
  { id: 'preview-5', content: '관심 없는 뉴스레터 정리', quadrant: 'q4', timeEstimate: 0, time_estimate: 0, tags: [], notes: '' },
];
