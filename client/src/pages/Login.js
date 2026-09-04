import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, Globe, Home, ArrowRight, ShieldCheck } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';

const DOMESTIC_URL = process.env.REACT_APP_DOMESTIC_URL || 'http://localhost:3004';
const TYPEWORDS    = ['Secure.', 'Smart.', 'Scalable.', 'Powerful.', 'Reliable.'];

const ANIM_CSS = `
@keyframes lms-shimmer {
  0%   { background-position: -400% center; }
  100% { background-position:  400% center; }
}
@keyframes lms-scanline {
  0%   { top: -3px; opacity: 0.7; }
  100% { top: 100%; opacity: 0;   }
}
@keyframes lms-fadeup {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes lms-spin {
  to { transform: rotate(360deg); }
}
@keyframes lms-pulse-dot {
  0%,100% { opacity: 1;   transform: scale(1);    }
  50%     { opacity: 0.5; transform: scale(1.25); }
}
@keyframes lms-glow-breathe {
  0%,100% { opacity: 0.35; transform: translate(-50%,-50%) scale(1);    }
  50%     { opacity: 0.7;  transform: translate(-50%,-50%) scale(1.06); }
}
@keyframes lms-blob-drift {
  0%,100% { transform: translate(0,0) scale(1);         }
  33%     { transform: translate(14px,-11px) scale(1.04); }
  66%     { transform: translate(-9px,9px)  scale(0.97); }
}
@keyframes lms-ripple {
  to { width: 320px; height: 320px; opacity: 0; transform: translate(-50%,-50%) scale(1); }
}
@keyframes lms-ring-spin   { from { transform: translate(-50%,-50%) rotate(0deg);   } to { transform: translate(-50%,-50%) rotate(360deg);  } }
@keyframes lms-ring-spin-r { from { transform: translate(-50%,-50%) rotate(0deg);   } to { transform: translate(-50%,-50%) rotate(-360deg); } }
@keyframes lms-float-y {
  0%,100% { transform: translateY(0);    }
  50%     { transform: translateY(-8px); }
}
.lms-shimmer-text {
  background: linear-gradient(90deg,#94a3b8 0%,#38bdf8 25%,#e0e7ff 45%,#818cf8 65%,#94a3b8 100%);
  background-size: 400% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: lms-shimmer 5s linear infinite;
}
.lms-scanline {
  position: absolute; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg,transparent,rgba(56,189,248,0.55),rgba(129,140,248,0.4),transparent);
  animation: lms-scanline 6s linear infinite;
  pointer-events: none; z-index: 4;
}
.lms-input {
  width: 100%; box-sizing: border-box;
  padding: 13px 16px 13px 42px;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid rgba(255,255,255,0.08);
  border-radius: 12px; color: #e2e8f0; font-size: 14px;
  outline: none; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.lms-input::placeholder { color: #2d3f56; }
.lms-ripple-span {
  position: absolute; width: 0; height: 0; border-radius: 50%;
  background: rgba(255,255,255,0.28);
  transform: translate(-50%,-50%) scale(0);
  animation: lms-ripple 0.65s ease-out forwards;
  pointer-events: none;
}
.lms-card-3d {
  transition: transform 0.1s cubic-bezier(0.23,1,0.32,1);
  transform-style: preserve-3d;
  will-change: transform;
}
.lms-btn-mag {
  position: relative; overflow: hidden;
  width: 100%; display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 14px 20px; border-radius: 12px;
  font-size: 14px; font-weight: 700; color: #fff; border: none;
  cursor: pointer; font-family: inherit; letter-spacing: 0.02em;
  transition: box-shadow 0.25s, opacity 0.2s;
}
.lms-btn-mag:disabled { opacity: 0.62; cursor: not-allowed; }
`;

const Login = () => {
  const { login, isAuthenticated, loading, user, clearError } = useAuth();
  const location = useLocation();

  const canvasRef    = useRef(null);
  const cardRef      = useRef(null);
  const panelRef     = useRef(null);
  const animRef      = useRef(null);
  const borderRafRef = useRef(null);
  const rafRef       = useRef(null);
  const mousePanel   = useRef({ x: -9999, y: -9999 });

  const [mode,         setMode]         = useState('international');
  const [formData,     setFormData]     = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domError,     setDomError]     = useState('');
  const [intlError,    setIntlError]    = useState('');
  const borderElemRef = useRef(null);
  const modeRef       = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const [typeText,     setTypeText]     = useState('');
  const [typeCursor,   setTypeCursor]   = useState(true);

  const isDom      = mode === 'domestic';
  const accent     = isDom ? '#f97316' : '#38bdf8';
  const accentDim  = isDom ? 'rgba(249,115,22,0.18)' : 'rgba(56,189,248,0.18)';
  const accentGlow = isDom ? 'rgba(249,115,22,0.42)' : 'rgba(56,189,248,0.42)';
  const btnBg      = isDom ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#0ea5e9,#2563eb)';

  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-lms', '1');
    el.textContent = ANIM_CSS;
    document.head.appendChild(el);
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const N = 70;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.5, hue: Math.random() > 0.5 ? 195 : 240,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mousePanel.current.x, my = mousePanel.current.y;
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 7000) { const d = Math.sqrt(d2); p.x += dx / d * 1.1; p.y += dy / d * 1.1; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},90%,70%,0.75)`; ctx.fill();
      });
      const MAX = 110;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(56,189,248,${(1 - d / MAX) * 0.28})`; ctx.lineWidth = 0.6; ctx.stroke();
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { ro.disconnect(); cancelAnimationFrame(animRef.current); };
  }, []);

  useEffect(() => {
    let wi = 0, ci = 0, del = false, tid;
    const tick = () => {
      const word = TYPEWORDS[wi];
      if (!del) { ci++; setTypeText(word.slice(0, ci)); if (ci === word.length) { del = true; tid = setTimeout(tick, 1800); return; } }
      else { ci--; setTypeText(word.slice(0, ci)); if (ci === 0) { del = false; wi = (wi + 1) % TYPEWORDS.length; } }
      tid = setTimeout(tick, del ? 60 : 100);
    };
    tid = setTimeout(tick, 600);
    const blink = setInterval(() => setTypeCursor(v => !v), 530);
    return () => { clearTimeout(tid); clearInterval(blink); };
  }, []);

  useEffect(() => {
    let angle = 0;
    const step = () => {
      angle = (angle + 0.6) % 360;
      if (borderElemRef.current) {
        const dom = modeRef.current === 'domestic';
        borderElemRef.current.style.background = dom
          ? `conic-gradient(from ${angle}deg at 50% 50%, rgba(249,115,22,0.9), rgba(251,146,60,0.5), rgba(129,140,248,0.4), rgba(249,115,22,0.9))`
          : `conic-gradient(from ${angle}deg at 50% 50%, rgba(56,189,248,0.9), rgba(129,140,248,0.7), rgba(56,189,248,0.25), rgba(56,189,248,0.9))`;
      }
      borderRafRef.current = requestAnimationFrame(step);
    };
    borderRafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(borderRafRef.current);
  }, []);

  const handleWindowMouse = useCallback((e) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (panelRef.current) {
        const x = ((e.clientX / window.innerWidth)  - 0.5) * 20;
        const y = ((e.clientY / window.innerHeight) - 0.5) * 16;
        panelRef.current.style.backgroundPosition = `calc(60% + ${x}px) calc(50% + ${y}px)`;
      }
      mousePanel.current = { x: e.clientX, y: e.clientY };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleWindowMouse, { passive: true });
    return () => window.removeEventListener('mousemove', handleWindowMouse);
  }, [handleWindowMouse]);

  const handleCardMouse = useCallback((e) => {
    if (!cardRef.current) return;
    const r  = cardRef.current.getBoundingClientRect();
    const rx = ((e.clientY - r.top)  / r.height - 0.5) * -16;
    const ry = ((e.clientX - r.left) / r.width  - 0.5) *  16;
    cardRef.current.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.028)`;
  }, []);

  const createRipple = (e) => {
    const btn = e.currentTarget, rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'lms-ripple-span';
    span.style.left = (e.clientX - rect.left) + 'px';
    span.style.top  = (e.clientY - rect.top)  + 'px';
    btn.appendChild(span);
    setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 700);
  };

  const handleMagMove  = (e) => { const b = e.currentTarget, r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX-r.left-r.width/2)*0.28}px,${(e.clientY-r.top-r.height/2)*0.28}px)`; };
  const handleMagLeave = (e) => { e.currentTarget.style.transform = 'translate(0,0)'; };

  useEffect(() => { clearError(); }, []); // eslint-disable-line

  if (loading) return <LoadingSpinner message="Checking authentication..." />;

  if (isAuthenticated && user && !isDom) {
    const MAP  = { superadmin:'/super-admin-dashboard', admin:'/admin-dashboard', restricted_admin:'/restricted-dashboard', agent1:'/agent1-dashboard', agent2:'/agent2-dashboard' };
    const dest = location.state?.from?.pathname || MAP[user.role] || '/dashboard';
    return <Navigate to={dest} replace />;
  }

  const switchMode   = (m) => { setMode(m); setFormData({ email:'', password:'' }); setDomError(''); setIntlError(''); };
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleIntlSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true); setIntlError('');
    try   { const r = await login(formData); if (!r.success) setIntlError(r.error || 'Invalid email or password'); }
    catch { setIntlError('Invalid email or password'); }
    finally { setIsSubmitting(false); }
  };

  const handleDomSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true); setDomError('');
    try {
      const res = await axios.post('/domestic-api/auth/login', formData);
      const { token, user: du } = res.data;
      window.location.href = DOMESTIC_URL + `#token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(du))}`;
    } catch (err) { setDomError(err.response?.data?.message || 'Invalid email or password'); }
    finally { setIsSubmitting(false); }
  };

  const activeErr   = isDom ? domError : intlError;

  return (
    <div style={{ minHeight:'100vh', display:'flex', overflow:'hidden', background:'#04090f', fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* LEFT — image + canvas */}
      <div ref={panelRef} className="lms-left-panel" style={{
        display:'none', width:'55%', position:'relative', overflow:'hidden',
        flexDirection:'column', justifyContent:'flex-end',
        backgroundImage:'url(/loginpageimage.png)', backgroundSize:'cover', backgroundPosition:'60% 50%',
        transition:'background-position 0.07s ease-out',
      }}>
        <div style={{ position:'absolute', inset:0, zIndex:1, background:'linear-gradient(135deg,rgba(4,9,15,0.62) 0%,rgba(4,9,15,0.22) 45%,rgba(4,9,15,0.88) 100%)' }} />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:2, pointerEvents:'none' }} />
        <div className="lms-scanline" />

        {/* 3D CSS rings */}
        <div style={{ position:'absolute', top:'40%', left:'58%', zIndex:2 }}>
          <div style={{ position:'absolute', width:260, height:260, borderRadius:'50%', border:'1px solid rgba(56,189,248,0.22)', boxShadow:'0 0 30px rgba(56,189,248,0.08)', transform:'translate(-50%,-50%)', animation:'lms-ring-spin 18s linear infinite' }}>
            <div style={{ position:'absolute', top:-5, left:'50%', width:10, height:10, marginLeft:-5, borderRadius:'50%', background:'#38bdf8', boxShadow:'0 0 12px #38bdf8' }} />
          </div>
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%', border:'1px solid rgba(129,140,248,0.2)', transform:'translate(-50%,-50%)', animation:'lms-ring-spin-r 12s linear infinite' }}>
            <div style={{ position:'absolute', bottom:-4, left:'50%', width:8, height:8, marginLeft:-4, borderRadius:'50%', background:'#818cf8', boxShadow:'0 0 10px #818cf8' }} />
          </div>
          <div style={{ position:'absolute', width:100, height:100, borderRadius:'50%', border:'1px solid rgba(56,189,248,0.14)', transform:'translate(-50%,-50%)', animation:'lms-glow-breathe 3.5s ease-in-out infinite' }} />
        </div>

        {/* top-left brand */}
        <div style={{ position:'absolute', top:28, left:40, zIndex:6, display:'flex', alignItems:'center' }}>
          <img 
            src="/rglogo2.png" 
            alt="Reddington Global Consultancy" 
            style={{ height: 48, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} 
          />
        </div>

        <div style={{ position:'relative', zIndex:5, padding:'44px 48px 52px', animation:'lms-fadeup 1s ease-out both' }}>
          <h2 style={{ color:'#f1f5f9', fontSize:36, fontWeight:900, lineHeight:1.15, margin:'0 0 12px' }}>
            Manage leads.<br />
            <span style={{ color:'#38bdf8', textShadow:'0 0 28px rgba(56,189,248,0.5)' }}>Close faster.</span>
          </h2>
          <p style={{ color:'rgba(148,163,184,0.65)', fontSize:14, lineHeight:1.75, maxWidth:360, margin:'0 0 28px' }}>
            Enterprise-grade lead management for International and Domestic sales teams — real-time, secure, and built for scale.
          </p>
          <div style={{ display:'flex', gap:28 }}>
            {[['99.9%','Uptime'],['256-bit','Encryption'],['Live','Real-time sync']].map(([v,l]) => (
              <div key={l}>
                <p style={{ color:'#38bdf8', fontSize:17, fontWeight:800, margin:0, textShadow:'0 0 18px rgba(56,189,248,0.5)' }}>{v}</p>
                <p style={{ color:'rgba(148,163,184,0.45)', fontSize:11, margin:'3px 0 0', fontWeight:500 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — 3D glass card */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 24px', position:'relative', overflow:'hidden', background:'linear-gradient(155deg,#04090f 0%,#07101e 55%,#04090f 100%)' }}>
        <div style={{ position:'absolute', top:'6%',   right:'6%',  width:340, height:340, borderRadius:'50%', pointerEvents:'none', animation:'lms-blob-drift 14s ease-in-out infinite',      background: isDom ? 'radial-gradient(circle,rgba(249,115,22,0.06) 0%,transparent 68%)' : 'radial-gradient(circle,rgba(56,189,248,0.065) 0%,transparent 68%)', transition:'background 0.5s ease' }} />
        <div style={{ position:'absolute', bottom:'8%', left:'2%',   width:240, height:240, borderRadius:'50%', pointerEvents:'none', animation:'lms-blob-drift 18s ease-in-out infinite 3s',  background:'radial-gradient(circle,rgba(129,140,248,0.055) 0%,transparent 68%)' }} />
        <div style={{ position:'absolute', bottom:'30%',right:'2%',  width:160, height:160, borderRadius:'50%', pointerEvents:'none', animation:'lms-blob-drift 22s ease-in-out infinite 7s',  background:'radial-gradient(circle,rgba(56,189,248,0.04) 0%,transparent 68%)' }} />

        <div ref={cardRef} className="lms-card-3d" style={{ width:'100%', maxWidth:428 }}
          onMouseMove={handleCardMouse} onMouseLeave={() => { if (cardRef.current) cardRef.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)'; }}>

          {/* rotating gradient border */}
          <div ref={borderElemRef} style={{ padding:1.5, borderRadius:25, transition:'background 0.5s ease' }}>
            <div style={{ background:'linear-gradient(150deg,rgba(7,16,30,0.98) 0%,rgba(5,12,22,1) 100%)', borderRadius:24, padding:'38px', backdropFilter:'blur(24px)', boxShadow:`0 32px 72px rgba(0,0,0,0.6), 0 0 80px ${isDom ? 'rgba(249,115,22,0.05)' : 'rgba(56,189,248,0.05)'}`, transformStyle:'preserve-3d' }}>

              <div className="lms-mobile-brand" style={{ textAlign:'center', marginBottom:22, display:'none', transform:'translateZ(5px)' }}>
                <img 
                  src="/rglogo2.png" 
                  alt="Reddington Global Consultancy" 
                  style={{ height: 42, width: 'auto', objectFit: 'contain', margin: '0 auto' }} 
                />
              </div>

              {/* badge — z:20 */}
              <div style={{ transform:'translateZ(20px)', marginBottom:14 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:7, background: isDom ? 'rgba(249,115,22,0.09)' : 'rgba(56,189,248,0.09)', border:`1px solid ${accentDim}`, borderRadius:20, padding:'4px 12px', transition:'all 0.4s ease' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:accent, boxShadow:`0 0 8px ${accent}`, animation:'lms-pulse-dot 2s ease-in-out infinite' }} />
                  <span style={{ color:accent, fontSize:10, fontWeight:800, letterSpacing:'0.1em' }}>{isDom ? 'DOMESTIC PORTAL' : 'INTERNATIONAL PORTAL'}</span>
                </div>
              </div>

              {/* typewriter heading — z:15 */}
              <div style={{ transform:'translateZ(15px)', marginBottom:6 }}>
                <h1 style={{ color:'#f1f5f9', fontSize:26, fontWeight:900, letterSpacing:'-0.025em', margin:0 }}>Welcome back</h1>
                <p style={{ color:'#475569', fontSize:14, margin:'7px 0 0', display:'flex', alignItems:'center', gap:4 }}>
                  <ShieldCheck style={{ width:13, height:13, color:'#22c55e', flexShrink:0 }} />
                  {typeText}<span style={{ color:accent, opacity: typeCursor ? 1 : 0, marginLeft:1 }}>|</span>
                </p>
              </div>

              {/* toggle — z:10 */}
              <div style={{ transform:'translateZ(10px)', margin:'24px 0' }}>
                <div style={{ display:'flex', gap:4, padding:4, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:14 }}>
                  {[{key:'international',label:'International',Icon:Globe},{key:'domestic',label:'Domestic',Icon:Home}].map(({key,label,Icon}) => {
                    const active = mode === key;
                    return (
                      <button key={key} type="button" onClick={() => switchMode(key)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 10px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', border:'none', transition:'all 0.25s ease', fontFamily:'inherit', background: active ? (key==='domestic' ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#0ea5e9,#2563eb)') : 'transparent', color: active ? '#fff' : '#475569', boxShadow: active ? `0 4px 16px ${key==='domestic' ? 'rgba(249,115,22,0.42)' : 'rgba(14,165,233,0.42)'}` : 'none' }}>
                        <Icon style={{ width:13, height:13 }} />{label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* form — z:8 */}
              <div style={{ transform:'translateZ(8px)' }}>
                <form onSubmit={isDom ? handleDomSubmit : handleIntlSubmit} autoComplete="off">
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                    <div>
                      <label style={{ display:'block', color:'#334155', fontSize:10, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>Email address</label>
                      <div style={{ position:'relative' }}>
                        <Mail style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', width:15, height:15, color:'#1e3a5f', pointerEvents:'none' }} />
                        <input id="email" name="email" type="email" autoComplete="email" required className="lms-input" style={{ paddingLeft:42 }}
                          onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 3px ${isDom ? 'rgba(249,115,22,0.12)' : 'rgba(56,189,248,0.12)'},0 0 18px ${isDom ? 'rgba(249,115,22,0.06)' : 'rgba(56,189,248,0.06)'}`; }}
                          onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }}
                          placeholder="you@company.com" value={formData.email} onChange={handleChange} />
                      </div>
                    </div>

                    <div>
                      <label style={{ display:'block', color:'#334155', fontSize:10, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>Password</label>
                      <div style={{ position:'relative' }}>
                        <Lock style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', width:15, height:15, color:'#1e3a5f', pointerEvents:'none' }} />
                        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="lms-input" style={{ paddingLeft:42, paddingRight:44 }}
                          onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 3px ${isDom ? 'rgba(249,115,22,0.12)' : 'rgba(56,189,248,0.12)'},0 0 18px ${isDom ? 'rgba(249,115,22,0.06)' : 'rgba(56,189,248,0.06)'}`; }}
                          onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }}
                          placeholder="••••••••" value={formData.password} onChange={handleChange} />
                        <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                          style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#334155', padding:2, display:'flex', transition:'color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'} onMouseLeave={e => e.currentTarget.style.color = '#334155'}>
                          {showPassword ? <EyeOff style={{ width:15, height:15 }} /> : <Eye style={{ width:15, height:15 }} />}
                        </button>
                      </div>
                    </div>

                    {activeErr && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#f87171', fontSize:13, fontWeight:500 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#ef4444', flexShrink:0, display:'inline-block' }} />
                        {activeErr}
                      </div>
                    )}

                    {/* submit — z:18, magnetic + ripple */}
                    <div style={{ transform:'translateZ(18px)', marginTop:4 }}>
                      <button type="submit" disabled={isSubmitting} className="lms-btn-mag"
                        style={{ background:btnBg, boxShadow: isSubmitting ? 'none' : `0 6px 26px ${accentGlow}`, opacity: isSubmitting ? 0.65 : 1 }}
                        onMouseMove={!isSubmitting ? handleMagMove : undefined}
                        onMouseLeave={handleMagLeave}
                        onClick={createRipple}>
                        {isSubmitting
                          ? <><div style={{ width:15, height:15, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.25)', borderTopColor:'#fff', animation:'lms-spin 0.65s linear infinite', flexShrink:0 }} />Authenticating…</>
                          : <>Sign in <ArrowRight style={{ width:15, height:15 }} /></>}
                      </button>
                    </div>

                  </div>
                </form>
              </div>

              {/* footer — z:4 */}
              <div style={{ transform:'translateZ(4px)', marginTop:26, paddingTop:18, borderTop:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ color:'#0f172a', fontSize:11, margin:0 }}>&copy; {new Date().getFullYear()} Reddington Global Consultancy</p>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px rgba(34,197,94,0.7)', animation:'lms-pulse-dot 2.2s ease-in-out infinite' }} />
                  <span style={{ color:'#22c55e', fontSize:11, fontWeight:600 }}>All systems operational</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) { .lms-left-panel  { display: flex  !important; } }
        @media (max-width: 1023px) { .lms-mobile-brand { display: block !important; } }
      `}</style>
    </div>
  );
};

export default Login;
