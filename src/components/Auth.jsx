import { useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage(error.error_description || error.message);
    } else {
      setMessage('이메일로 매직 링크가 전송되었습니다. 이메일을 확인해주세요!');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      }
    });
    if (error) console.error(error);
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
          브레인 덤프를 시작하려면 로그인하세요.
        </p>

        <button 
          onClick={handleGoogleLogin}
          className="glass-button"
          style={{
            padding: '12px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: '8px'
          }}
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '16px', height: '16px' }} />
          Google로 시작하기
        </button>

        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          <span style={{ margin: '0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>또는</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            className="glass-input"
            type="email"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? '전송 중...' : '매직 링크 보내기'}
          </button>
        </form>

        {message && <p style={{ fontSize: '0.85rem', color: 'var(--success-color)', marginTop: '10px' }}>{message}</p>}
      </div>
    </div>
  );
}
