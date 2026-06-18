import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Zap, Briefcase, Globe } from 'lucide-react';

const INTL_URL   = process.env.REACT_APP_INTERNATIONAL_URL || 'http://localhost:3000';
const TYPEWORDS  = ['Fast.', 'Secure.', 'Smart.', 'Reliable.', 'Scalable.'];

/* ─── CSS injected once ──────────────────────────────────────────── */
const ANIM_CSS = `
@keyframes dom-shimmer {
  0%   { background-position: -400% center; }
  100% { background-position:  400% center; }
}
@keyframes dom-scanline {
  0%   { top: -3px; opacity: 0.7; }
  100% { top: 100%; opacity: 0;   }
}
@keyframes dom-fadeup {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes dom-pulse-dot {
  0%,100% { opacity:1;   transform:scale(1);    }
  50%     { opacity:0.5; transform:scale(1.25); }
}
@keyframes dom-glow-breathe {
  0%,100% { opacity:0.35; transform:translate(-50%,-50%) scale(1);    }
  50%     { opacity:0.7;  transform:translate(-50%,-50%) scale(1.06); }
}
@keyframes dom-blob-drift {
  0%,100% { transform:translate(0,0) scale(1);              }
  33%     { transform:translate(14px,-11px) scale(1.04);    }
  66%     { transform:translate(-9px,9px)  scale(0.97);     }
}
@keyframes dom-ripple {
  to { width:320px; height:320px; opacity:0; transform:translate(-50%,-50%) scale(1); }
}
@keyframes dom-ring-spin   { from{transform:translate(-50%,-50%) rotate(0deg)}   to{transform:translate(-50%,-50%) rotate(360deg)}  }
@keyframes dom-ring-spin-r { from{transform:translate(-50%,-50%) rotate(0deg)}   to{transform:translate(-50%,-50%) rotate(-360deg)} }
@keyframes dom-float-y {
  0%,100% { transform:translateY(0);    }
  50%     { transform:translateY(-8px); }
}
.dom-shimmer-text {
  background: linear-gradient(90deg,#4ade80 0%,#16a34a 20%,#bbf7d0 42%,#22c55e 60%,#4ade80 100%);
  background-size: 400% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: dom-shimmer 5s linear infinite;
}
.dom-scanline {
  position:absolute; left:0; right:0; height:2px;
  background:linear-gradient(90deg,transparent,rgba(22,163,74,0.6),rgba(74,222,128,0.4),transparent);
  animation:dom-scanline 6s linear infinite;
  pointer-events:none; z-index:4;
}
.dom-input {
  width:100%; box-sizing:border-box;
  padding:13px 16px 13px 42px;
  background:rgba(255,255,255,0.04);
  border:1.5px solid rgba(255,255,255,0.08);
  border-radius:12px; color:#e2e8f0; font-size:14px;
  outline:none; transition:border-color 0.2s,background 0.2s,box-shadow 0.2s;
  font-family:inherit;
}
.dom-input::placeholder { color:#2d3f56; }
.dom-input:focus {
  border-color:rgba(22,163,74,0.55);
  background:rgba(22,163,74,0.04);
  box-shadow:0 0 0 3px rgba(22,163,74,0.14);
}
.dom-ripple-span {
  position:absolute; width:0; height:0; border-radius:50%;
  background:rgba(255,255,255,0.26);
  transform:translate(-50%,-50%) scale(0);
  animation:dom-ripple 0.65s ease-out forwards;
  pointer-events:none;
}
.dom-card-3d {
  transition:transform 0.1s cubic-bezier(0.23,1,0.32,1);
  transform-style:preserve-3d;
  will-change:transform;
}
.dom-btn-mag {
  position:relative; overflow:hidden;
  width:100%; display:flex; align-items:center; justify-content:center;
  gap:8px; padding:14px 20px; border-radius:12px;
  font-size:14px; font-weight:700; color:#fff; border:none;
  cursor:pointer; font-family:inherit; letter-spacing:0.02em;
  transition:box-shadow 0.25s,opacity 0.2s;
}
.dom-btn-mag:disabled { opacity:0.62; cursor:not-allowed; }
@media (min-width:1024px) { .dom-left-panel { display:flex !important; } }
@media (max-width:1023px) { .dom-mobile-brand { display:block !important; } }
`;

/* ─── Component ─────────────────────────────────────────────────── */
const LoginPage = () => {
  const { login, isAuthenticated, bootstrapping } = useAuth();
  const navigate = useNavigate();

  const canvasRef    = useRef(null);
  const cardRef      = useRef(null);
  const panelRef     = useRef(null);
  const animRef      = useRef(null);
  const borderRafRef = useRef(null);
  const rafRef       = useRef(null);
  const mousePanel   = useRef({ x: -9999, y: -9999 });

  const [form,         setForm]         = useState({ email: '', password: '' });
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [cardTilt,     setCardTilt]     = useState({ rx: 0, ry: 0, active: false });
  const [borderAngle,  setBorderAngle]  = useState(0);
  const [typeText,     setTypeText]     = useState('');
  const [typeCursor,   setTypeCursor]   = useState(true);

  /* inject CSS */
  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-dom-login', '1');
    el.textContent = ANIM_CSS;
    document.head.appendChild(el);
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);

  /* canvas constellation */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const N = 65;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.5, hue: Math.random() > 0.5 ? 142 : 160,
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
        ctx.fillStyle = `hsla(${p.hue},80%,65%,0.75)`; ctx.fill();
      });
      const MAX = 110;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(34,197,94,${(1 - d / MAX) * 0.3})`; ctx.lineWidth = 0.6; ctx.stroke();
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { ro.disconnect(); cancelAnimationFrame(animRef.current); };
  }, []);

  /* typewriter */
  useEffect(() => {
    let wi = 0, ci = 0, del = false, tid;
    const tick = () => {
      const word = TYPEWORDS[wi];
      if (!del) { ci++; setTypeText(word.slice(0, ci)); if (ci === word.length) { del = true; tid = setTimeout(tick, 1800); return; } }
      else      { ci--; setTypeText(word.slice(0, ci)); if (ci === 0) { del = false; wi = (wi + 1) % TYPEWORDS.length; } }
      tid = setTimeout(tick, del ? 60 : 100);
    };
    tid = setTimeout(tick, 600);
    const blink = setInterval(() => setTypeCursor(v => !v), 530);
    return () => { clearTimeout(tid); clearInterval(blink); };
  }, []);

  /* rotating border */
  useEffect(() => {
    let angle = 0;
    const step = () => { angle = (angle + 0.6) % 360; setBorderAngle(angle); borderRafRef.current = requestAnimationFrame(step); };
    borderRafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(borderRafRef.current);
  }, []);

  /* mouse → parallax + constellation */
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

  /* card 3D tilt */
  const handleCardMouse = useCallback((e) => {
    if (!cardRef.current) return;
    const r  = cardRef.current.getBoundingClientRect();
    const rx = ((e.clientY - r.top)  / r.height - 0.5) * -16;
    const ry = ((e.clientX - r.left) / r.width  - 0.5) *  16;
    setCardTilt({ rx, ry, active: true });
  }, []);

  useEffect(() => {
    if (!cardRef.current) return;
    const { rx, ry, active } = cardTilt;
    cardRef.current.style.transform = active
      ? `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.028)`
      : `perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)`;
  }, [cardTilt]);

  /* ripple */
  const createRipple = (e) => {
    const btn = e.currentTarget, rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'dom-ripple-span';
    span.style.left = (e.clientX - rect.left) + 'px';
    span.style.top  = (e.clientY - rect.top)  + 'px';
    btn.appendChild(span);
    setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 700);
  };

  /* magnetic button */
  const handleMagMove  = (e) => { const b = e.currentTarget, r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX-r.left-r.width/2)*0.28}px,${(e.clientY-r.top-r.height/2)*0.28}px)`; };
  const handleMagLeave = (e) => { e.currentTarget.style.transform = 'translate(0,0)'; };

  /* redirect if already logged in */
  if (bootstrapping) return null;
  if (isAuthenticated) { navigate('/agent', { replace: true }); return null; }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Email and password are required.'); return; }
    setLoading(true);
    try {
      const userData = await login(form.email, form.password);
      toast.success(`Welcome, ${userData.name}!`);
      if      (userData.role === 'dom_superadmin') navigate('/superadmin');
      else if (userData.role === 'dom_admin')      navigate('/admin');
      else                                         navigate('/agent');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const borderGrad = `conic-gradient(from ${borderAngle}deg at 50% 50%, rgba(22,163,74,0.9), rgba(74,222,128,0.55), rgba(134,239,172,0.35), rgba(22,163,74,0.9))`;

  /* ─── render ─── */
  return (
    <div style={{ minHeight:'100vh', display:'flex', overflow:'hidden', background:'#04090f', fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* LEFT PANEL */}
      <div ref={panelRef} className="dom-left-panel" style={{
        display:'none', width:'55%', position:'relative', overflow:'hidden',
        flexDirection:'column', justifyContent:'flex-end',
        backgroundImage:`url(${process.env.PUBLIC_URL}/loginpageimage.png)`,
        backgroundSize:'cover', backgroundPosition:'60% 50%',
        transition:'background-position 0.07s ease-out',
      }}>
        {/* overlay */}
        <div style={{ position:'absolute', inset:0, zIndex:1, background:'linear-gradient(135deg,rgba(4,9,15,0.68) 0%,rgba(4,9,15,0.25) 45%,rgba(4,9,15,0.9) 100%)' }} />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:2, pointerEvents:'none' }} />
        <div className="dom-scanline" />

        {/* 3D rings */}
        <div style={{ position:'absolute', top:'40%', left:'58%', zIndex:2 }}>
          <div style={{ position:'absolute', width:260, height:260, borderRadius:'50%', border:'1px solid rgba(22,163,74,0.28)', boxShadow:'0 0 30px rgba(22,163,74,0.10)', transform:'translate(-50%,-50%)', animation:'dom-ring-spin 18s linear infinite' }}>
            <div style={{ position:'absolute', top:-5, left:'50%', width:10, height:10, marginLeft:-5, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 12px #22c55e' }} />
          </div>
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%', border:'1px solid rgba(74,222,128,0.22)', transform:'translate(-50%,-50%)', animation:'dom-ring-spin-r 12s linear infinite' }}>
            <div style={{ position:'absolute', bottom:-4, left:'50%', width:8, height:8, marginLeft:-4, borderRadius:'50%', background:'#4ade80', boxShadow:'0 0 10px #4ade80' }} />
          </div>
          <div style={{ position:'absolute', width:100, height:100, borderRadius:'50%', border:'1px solid rgba(22,163,74,0.16)', transform:'translate(-50%,-50%)', animation:'dom-glow-breathe 3.5s ease-in-out infinite' }} />
        </div>

        {/* brand — top-left */}
        <div style={{ position:'absolute', top:32, left:40, zIndex:6, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,rgba(22,163,74,0.16),rgba(74,222,128,0.12))', border:'1px solid rgba(22,163,74,0.32)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(10px)', boxShadow:'0 0 18px rgba(22,163,74,0.14)', animation:'dom-float-y 4s ease-in-out infinite' }}>
            <Zap style={{ width:16, height:16, color:'#22c55e' }} />
          </div>
          <div>
            <p className="dom-shimmer-text" style={{ fontWeight:900, fontSize:16, letterSpacing:'0.18em', margin:0 }}>IMMERGIX</p>
            <p style={{ color:'rgba(148,163,184,0.55)', fontSize:10, margin:0, marginTop:1 }}>by Reddington Global</p>
          </div>
        </div>

        {/* bottom headline */}
        <div style={{ position:'relative', zIndex:5, padding:'44px 48px 52px', animation:'dom-fadeup 1s ease-out both' }}>
          <h2 style={{ color:'#f1f5f9', fontSize:36, fontWeight:900, lineHeight:1.15, margin:'0 0 8px' }}>
            Domestic Loans.<br />
            <span style={{ color:'#22c55e', textShadow:'0 0 28px rgba(34,197,94,0.55)' }}>
              {typeText}<span style={{ opacity: typeCursor ? 1 : 0, transition:'opacity 0.08s' }}>|</span>
            </span>
          </h2>
          <p style={{ color:'rgba(148,163,184,0.65)', fontSize:14, lineHeight:1.75, maxWidth:360, margin:'0 0 28px' }}>
            India-first loan management for agents and admins — real-time leads, seamless workflows, and secure access.
          </p>
          <div style={{ display:'flex', gap:28 }}>
            {[['Live','Real-time leads'],['Secure','256-bit encrypted'],['Fast','Sub-second response']].map(([v,l]) => (
              <div key={l}>
                <p style={{ color:'#22c55e', fontSize:17, fontWeight:800, margin:0, textShadow:'0 0 18px rgba(34,197,94,0.5)' }}>{v}</p>
                <p style={{ color:'rgba(148,163,184,0.45)', fontSize:11, margin:'3px 0 0', fontWeight:500 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 24px', position:'relative', overflow:'hidden', background:'linear-gradient(155deg,#04090f 0%,#07101e 55%,#04090f 100%)' }}>
        {/* background blobs */}
        <div style={{ position:'absolute', top:'6%',   right:'6%',  width:340, height:340, borderRadius:'50%', pointerEvents:'none', animation:'dom-blob-drift 14s ease-in-out infinite',     background:'radial-gradient(circle,rgba(22,163,74,0.07) 0%,transparent 68%)' }} />
        <div style={{ position:'absolute', bottom:'8%',left:'2%',   width:240, height:240, borderRadius:'50%', pointerEvents:'none', animation:'dom-blob-drift 18s ease-in-out infinite 3s', background:'radial-gradient(circle,rgba(74,222,128,0.055) 0%,transparent 68%)' }} />
        <div style={{ position:'absolute', bottom:'30%',right:'2%', width:160, height:160, borderRadius:'50%', pointerEvents:'none', animation:'dom-blob-drift 22s ease-in-out infinite 7s', background:'radial-gradient(circle,rgba(22,163,74,0.04) 0%,transparent 68%)' }} />

        <div ref={cardRef} className="dom-card-3d" style={{ width:'100%', maxWidth:428 }}
          onMouseMove={handleCardMouse} onMouseLeave={() => setCardTilt({ rx:0, ry:0, active:false })}>

          {/* rotating gradient border */}
          <div style={{ padding:1.5, borderRadius:25, background:borderGrad }}>
            <div style={{ background:'linear-gradient(150deg,rgba(7,16,30,0.98) 0%,rgba(5,12,22,1) 100%)', borderRadius:24, padding:'38px', backdropFilter:'blur(24px)', boxShadow:'0 32px 72px rgba(0,0,0,0.6), 0 0 80px rgba(22,163,74,0.06)', transformStyle:'preserve-3d' }}>

              {/* mobile brand */}
              <div className="dom-mobile-brand" style={{ textAlign:'center', marginBottom:22, display:'none', transform:'translateZ(5px)' }}>
                <p className="dom-shimmer-text" style={{ fontWeight:900, fontSize:18, letterSpacing:'0.18em', margin:0 }}>IMMERGIX</p>
                <p style={{ color:'rgba(148,163,184,0.5)', fontSize:10, margin:'2px 0 0', textAlign:'center' }}>by Reddington Global</p>
              </div>

              {/* badge */}
              <div style={{ transform:'translateZ(20px)', marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'center' }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:99, border:'1px solid rgba(22,163,74,0.28)', background:'rgba(22,163,74,0.08)', backdropFilter:'blur(8px)' }}>
                    <Briefcase style={{ width:13, height:13, color:'#22c55e' }} />
                    <span style={{ color:'#22c55e', fontSize:11, fontWeight:700, letterSpacing:'0.08em' }}>DOMESTIC PORTAL</span>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', animation:'dom-pulse-dot 1.8s ease-in-out infinite' }} />
                  </div>
                </div>
              </div>

              {/* heading */}
              <div style={{ transform:'translateZ(15px)', marginBottom:24, textAlign:'center' }}>
                <h1 style={{ color:'#f1f5f9', fontSize:26, fontWeight:800, margin:'0 0 6px', lineHeight:1.2 }}>
                  Welcome back
                </h1>
                <p style={{ color:'rgba(148,163,184,0.5)', fontSize:13, margin:0 }}>Sign in to your domestic account</p>
              </div>

              {/* form */}
              <form onSubmit={handleSubmit} style={{ transform:'translateZ(8px)' }}>
                {/* email */}
                <div style={{ marginBottom:16, position:'relative' }}>
                  <label style={{ display:'block', color:'rgba(148,163,184,0.7)', fontSize:12, fontWeight:600, marginBottom:7, letterSpacing:'0.04em', textTransform:'uppercase' }}>Email address</label>
                  <div style={{ position:'relative' }}>
                    <Mail style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', width:16, height:16, color:'rgba(22,163,74,0.5)', pointerEvents:'none' }} />
                    <input
                      type="email" name="email" value={form.email} onChange={handleChange}
                      placeholder="agent@example.com" required autoComplete="email"
                      className="dom-input"
                    />
                  </div>
                </div>

                {/* password */}
                <div style={{ marginBottom:24, position:'relative' }}>
                  <label style={{ display:'block', color:'rgba(148,163,184,0.7)', fontSize:12, fontWeight:600, marginBottom:7, letterSpacing:'0.04em', textTransform:'uppercase' }}>Password</label>
                  <div style={{ position:'relative' }}>
                    <Lock style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', width:16, height:16, color:'rgba(22,163,74,0.5)', pointerEvents:'none' }} />
                    <input
                      type={showPass ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange}
                      placeholder="••••••••" required autoComplete="current-password"
                      className="dom-input" style={{ paddingRight:44 }}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(148,163,184,0.4)', padding:0, display:'flex' }}>
                      {showPass ? <EyeOff style={{ width:16, height:16 }} /> : <Eye style={{ width:16, height:16 }} />}
                    </button>
                  </div>
                </div>

                {/* submit */}
                <div style={{ transform:'translateZ(18px)' }} onMouseMove={handleMagMove} onMouseLeave={handleMagLeave}>
                  <button type="submit" disabled={loading} className="dom-btn-mag"
                    style={{ background:'linear-gradient(135deg,#16a34a,#166534)', boxShadow:'0 8px 32px rgba(22,163,74,0.40)' }}
                    onClick={createRipple}>
                    {loading
                      ? <span style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'dom-spin 0.8s linear infinite', display:'inline-block' }} />
                      : <><span>Sign In</span><ArrowRight style={{ width:17, height:17 }} /></>
                    }
                  </button>
                </div>
              </form>

              {/* footer */}
              <div style={{ transform:'translateZ(4px)', marginTop:24, paddingTop:20, borderTop:'1px solid rgba(255,255,255,0.05)', textAlign:'center' }}>
                <p style={{ color:'rgba(148,163,184,0.38)', fontSize:11, margin:'0 0 8px' }}>Looking for international process?</p>
                <a href={INTL_URL} style={{ display:'inline-flex', alignItems:'center', gap:5, color:'#38bdf8', fontSize:12, fontWeight:600, textDecoration:'none' }}>
                  <Globe style={{ width:13, height:13 }} />
                  Switch to International LMS
                </a>
                <p style={{ color:'rgba(100,116,139,0.35)', fontSize:10, margin:'18px 0 0' }}>
                  © 2026 IMMERGIX — Reddington Global
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
