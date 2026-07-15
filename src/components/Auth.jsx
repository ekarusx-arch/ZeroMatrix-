import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage('이메일 또는 비밀번호가 올바르지 않습니다.');
    } else {
      setMessage('로그인 성공!');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');

    // Keep standalone OAuth callbacks on the suite app that started the flow.
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      setMessage('Google 로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'var(--bg-color)',
      color: 'var(--text-color)'
    }}>
      <div className="glass-panel" style={{
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <span style={{ fontSize: '24px', fontWeight: 800 }}>Z</span>
          </div>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>ZeroMatrix</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
          제로슬레이트 계정으로 로그인하세요.
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            className="glass-input"
            type="email"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', outline: 'none' }}
          />
          <input
            className="glass-input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', outline: 'none' }}
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{
              padding: '12px',
              background: 'var(--accent-color)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: '10px'
            }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          <span style={{ height: '1px', flex: 1, background: 'var(--border-color)' }} />
          또는
          <span style={{ height: '1px', flex: 1, background: 'var(--border-color)' }} />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            padding: '12px',
            background: 'var(--card-bg)',
            color: 'var(--text-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          G&nbsp;&nbsp;Google로 로그인
        </button>

        <p style={{ color: 'var(--text-secondary)', margin: '-8px 0 0', fontSize: '0.72rem', lineHeight: 1.45 }}>
          Google 로그인은 처음이면 계정이 자동으로 만들어질 수 있습니다. ZeroMatrix는 ZeroSlate Pro 권한이 있는 계정만 이용할 수 있습니다.
        </p>

        {message && <p style={{ fontSize: '0.85rem', color: message.includes('성공') ? 'var(--success-color)' : 'var(--danger-color)', marginTop: '10px' }}>{message}</p>}
      </div>
    </div>
  );
}
