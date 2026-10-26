import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { api } from "./api.js";
import App from "./App.jsx";
import { ServiceCoreLogo } from "./brand.jsx";

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

function PublicSignPage({token}) {
  const [estimate,setEstimate] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(null);
  const [sigName,setSigName] = useState('');
  const [isDrawing,setIsDrawing] = useState(false);
  const [submitted,setSubmitted] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const canvasRef = useRef(null);

  useEffect(()=>{
    api.getPublicEstimate(token)
      .then(setEstimate)
      .catch(e=>setError(e.message||'This link is invalid or has expired.'))
      .finally(()=>setLoading(false));
  },[token]);

  const fmt = n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

  const clearSig = ()=>{ const cv=canvasRef.current; if(cv){ cv.getContext('2d').clearRect(0,0,cv.width,cv.height); } };

  const onDown = e=>{
    setIsDrawing(true);
    const cv=canvasRef.current; if(!cv) return;
    const r=cv.getBoundingClientRect();
    const ctx=cv.getContext('2d'); ctx.beginPath();
    const x=e.touches?e.touches[0].clientX-r.left:e.clientX-r.left;
    const y=e.touches?e.touches[0].clientY-r.top:e.clientY-r.top;
    ctx.moveTo(x,y);
  };
  const onMove = e=>{
    if(!isDrawing) return;
    const cv=canvasRef.current; if(!cv) return;
    const r=cv.getBoundingClientRect();
    const ctx=cv.getContext('2d');
    const x=e.touches?e.touches[0].clientX-r.left:e.clientX-r.left;
    const y=e.touches?e.touches[0].clientY-r.top:e.clientY-r.top;
    ctx.lineWidth=2; ctx.lineCap='round'; ctx.strokeStyle='#1D70B7';
    ctx.lineTo(x,y); ctx.stroke();
  };
  const onUp = ()=>setIsDrawing(false);

  const submit = async()=>{
    if(!sigName.trim()) return alert('Please enter your name.');
    const cv=canvasRef.current;
    if(!cv) return;
    const sigData=cv.toDataURL('image/png');
    setSubmitting(true);
    try {
      await api.signPublicEstimate(token,{signature_data:sigData,signed_by_name:sigName});
      setSubmitted(true);
    } catch(e){ alert(e.message||'Error submitting signature.'); }
    finally { setSubmitting(false); }
  };

  const S = {
    page:{minHeight:'100vh',background:'#07091a',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:'32px 16px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf4'},
    card:{background:'#0d1123',border:'1px solid #1e2d5a',borderRadius:14,padding:28,width:'100%',maxWidth:620},
    h1:{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,marginBottom:4},
    label:{fontSize:11,letterSpacing:'.08em',color:'#6b7aaa',display:'block',marginBottom:4,textTransform:'uppercase'},
    inp:{width:'100%',background:'#12183a',border:'1px solid #1e2d5a',borderRadius:6,padding:'9px 12px',color:'#e8eaf4',fontSize:14},
    btn:{width:'100%',background:'#E20613',border:'none',borderRadius:8,padding:'13px',color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',letterSpacing:'.03em'},
  };

  if(loading) return <div style={{...S.page,justifyContent:'center',color:'#6b7aaa'}}>Loading estimate…</div>;
  if(error)   return <div style={{...S.page,justifyContent:'center'}}><div style={S.card}><div style={{...S.h1,color:'#E20613'}}>Link Expired</div><p style={{color:'#6b7aaa',marginTop:8}}>{error}</p></div></div>;
  if(submitted) return (
    <div style={{...S.page,justifyContent:'center'}}>
      <div style={{...S.card,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}>✅</div>
        <div style={{...S.h1}}>Estimate Signed!</div>
        <p style={{color:'#6b7aaa',marginTop:8}}>Your signature has been recorded. You will receive a copy once the work is complete.</p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <svg width="32" height="28" viewBox="0 0 40 34" fill="none"><polygon points="8,34 0,0 32,0 40,34" fill="#E20613"/></svg>
          <div>
            <div style={{fontSize:11,letterSpacing:'.14em',color:'#6b7aaa'}}>DAVIS PLUMBING</div>
            <div style={S.h1}>Review &amp; Sign Estimate</div>
          </div>
        </div>
        <div style={{borderTop:'1px solid #1e2d5a',paddingTop:16}}>
          {(estimate.items||[]).map(item=>(
            <div key={item.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1e2d5a14'}}>
              <span style={{fontSize:14,fontWeight:600}}>{item.description}</span>
              <span style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#e8eaf4'}}>{fmt(item.flat_rate)}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:12,paddingTop:12,borderTop:'1px solid #1e2d5a'}}>
            <span style={{fontSize:16,fontWeight:800}}>Total</span>
            <span style={{fontSize:20,fontWeight:800,color:'#E20613'}}>{fmt(estimate.total)}</span>
          </div>
        </div>
        {estimate.notes&&<p style={{marginTop:12,fontSize:12,color:'#6b7aaa',fontStyle:'italic'}}>{estimate.notes}</p>}
      </div>

      <div style={S.card}>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,marginBottom:16}}>Your Signature</div>
        <label style={S.label}>Full Name</label>
        <input value={sigName} onChange={e=>setSigName(e.target.value)} placeholder="Your full name" style={{...S.inp,marginBottom:16}}/>
        <label style={S.label}>Signature</label>
        <div style={{border:'2px solid #1D70B7',borderRadius:8,background:'#fff',marginBottom:8}}>
          <canvas ref={canvasRef} width={560} height={180}
            style={{display:'block',cursor:'crosshair',touchAction:'none',maxWidth:'100%'}}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
        </div>
        <button onClick={clearSig} style={{background:'transparent',border:'1px solid #1e2d5a',borderRadius:6,padding:'5px 14px',color:'#6b7aaa',fontSize:12,cursor:'pointer',marginBottom:16}}>Clear Signature</button>
        <p style={{fontSize:11,color:'#6b7aaa',marginBottom:16}}>By signing, you authorize {estimate.company_name||'the contractor'} to perform the work described above for the total amount shown.</p>
        <button onClick={submit} disabled={submitting} style={S.btn}>{submitting?'Submitting…':'✓ Approve & Sign Estimate'}</button>
      </div>
    </div>
  );
}

function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dps_token");
    if (token) {
      api.me().then(setUser).catch(() => localStorage.removeItem("dps_token")).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);
  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    localStorage.setItem("dps_token", token);
    setUser(user);
  };
  const logout = async () => {
    try { await api.logoutBackend(); } catch {}
    localStorage.removeItem("dps_token");
    setUser(null);
  };
  if (loading) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0b0e13",color:"#5daf7c",fontFamily:"monospace",fontSize:14}}>
      Loading ServiceCore Pro...
    </div>
  );
  return (
    <AuthContext.Provider value={{user,login,logout}}>
      {user ? <App /> : <LoginPage />}
    </AuthContext.Provider>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@dps.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try { await login(email, password); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0b0e13"}}>
      <div style={{background:"#111520",border:"1px solid #232b3e",borderRadius:16,padding:40,width:380}}>
        <div style={{marginBottom:32}}>
          <ServiceCoreLogo size={52}/>
        </div>
        <div style={{fontSize:18,fontWeight:600,color:"#e2e8f5",marginBottom:4}}>Sign in</div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:24}}>Demo: admin@dps.com / password</div>
        {error && (
          <div style={{background:"#f5656518",border:"1px solid #f5656544",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#f56565",marginBottom:16}}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,color:"#64748b",display:"block",marginBottom:6}}>EMAIL</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{width:"100%",background:"#171d2a",border:"1px solid #2d3a52",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#e2e8f5",fontFamily:"monospace"}}
            />
          </div>
          <div style={{marginBottom:24}}>
            <label style={{fontSize:11,color:"#64748b",display:"block",marginBottom:6}}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{width:"100%",background:"#171d2a",border:"1px solid #2d3a52",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#e2e8f5",fontFamily:"monospace"}}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{width:"100%",padding:"12px",background:loading?"#3ecf8e44":"#3ecf8e22",border:"1px solid #3ecf8e",borderRadius:8,color:"#3ecf8e",fontSize:14,fontWeight:600,cursor:loading?"not-allowed":"pointer"}}
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Public feedback page — opens from review-request URLs the customer receives
function PublicFeedbackPage({ token }) {
  const [ctx, setCtx]         = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [rating, setRating]   = useState(0);
  const [hover,  setHover]    = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,    setDone]    = useState(null); // {rating, redirect_url}

  useEffect(() => {
    api.getFeedbackContext(token)
      .then(setCtx)
      .catch(e => setLoadErr(e.message || 'Could not load feedback page'));
  }, [token]);

  const submit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      const r = await api.submitFeedback(token, { rating, comment });
      setDone(r);
      // Auto-redirect after 2.5s if a redirect URL was returned (high rating → public review platform)
      if (r.redirect_url) setTimeout(() => { window.location.href = r.redirect_url; }, 2500);
    } catch (e) {
      alert(e.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const S = {
    page:    {minHeight:'100vh', background:'#0b0e13', color:'#e2e8f5', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:'system-ui, -apple-system, sans-serif'},
    card:    {background:'#111520', border:'1px solid #232b3e', borderRadius:16, padding:36, width:'100%', maxWidth:480},
    title:   {fontSize:22, fontWeight:800, marginBottom:6, fontFamily:'Georgia, serif'},
    sub:     {fontSize:13, color:'#94a3b8', marginBottom:24},
    star:    (filled) => ({fontSize:38, color:filled ? '#f59e0b' : '#3a4566', cursor:'pointer', transition:'transform .1s, color .15s', userSelect:'none'}),
    txt:     {width:'100%', background:'#171d2a', border:'1px solid #2d3a52', borderRadius:8, padding:'12px 14px', fontSize:14, color:'#e2e8f5', boxSizing:'border-box', resize:'vertical', minHeight:90, fontFamily:'inherit'},
    btn:     (disabled) => ({width:'100%', padding:'14px', background: disabled ? '#3ecf8e22' : '#3ecf8e', color: disabled ? '#3ecf8e' : '#0b0e13', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor: disabled ? 'not-allowed' : 'pointer', marginTop:18, transition:'all .15s'}),
  };

  if (loadErr) return (
    <div style={S.page}><div style={S.card}>
      <div style={{fontSize:24, marginBottom:12}}>😕</div>
      <div style={S.title}>Link not found</div>
      <div style={S.sub}>{loadErr}. The link may have expired or already been used.</div>
    </div></div>
  );
  if (!ctx) return (
    <div style={S.page}><div style={S.card}>
      <div style={{color:'#5daf7c', fontFamily:'monospace', fontSize:13}}>Loading…</div>
    </div></div>
  );
  if (ctx.status === 'completed') return (
    <div style={S.page}><div style={S.card}>
      <div style={{fontSize:42, marginBottom:12}}>✅</div>
      <div style={S.title}>Thanks, we got your feedback</div>
      <div style={S.sub}>You already submitted a rating for this visit. We appreciate it!</div>
    </div></div>
  );
  if (done) return (
    <div style={S.page}><div style={S.card}>
      <div style={{fontSize:42, marginBottom:12}}>{done.rating >= 4 ? '🎉' : '🙏'}</div>
      <div style={S.title}>{done.rating >= 4 ? 'Thank you so much!' : 'Thanks — we hear you'}</div>
      <div style={S.sub}>
        {done.redirect_url
          ? "We'd love it if you shared this on Google. Sending you there now…"
          : done.rating >= 4
            ? "Glad we could help. Have a great day!"
            : "We've notified our manager — someone will follow up shortly to make this right."
        }
      </div>
      {done.redirect_url && (
        <a href={done.redirect_url} style={{display:'block', textAlign:'center', padding:'12px', background:'#4285f4', color:'#fff', borderRadius:10, fontWeight:700, textDecoration:'none', fontSize:14}}>
          Open Google Review →
        </a>
      )}
    </div></div>
  );

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>How was your visit{ctx.customer_first_name ? `, ${ctx.customer_first_name}` : ''}?</div>
        <div style={S.sub}>
          {ctx.technician_name ? `${ctx.technician_name} ` : 'Your technician '}
          {ctx.company_name ? `from ${ctx.company_name} ` : ''}
          would love your feedback. Tap a star.
        </div>

        <div style={{display:'flex', justifyContent:'center', gap:6, padding:'16px 0'}}>
          {[1,2,3,4,5].map(n => (
            <span key={n}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              style={S.star(n <= (hover || rating))}>
              ★
            </span>
          ))}
        </div>
        {rating > 0 && (
          <div style={{textAlign:'center', fontSize:13, color: rating >= 4 ? '#3ecf8e' : '#f59e0b', marginBottom:12, fontWeight:600}}>
            {rating === 5 && 'Excellent — thank you!'}
            {rating === 4 && 'Great, glad to hear it!'}
            {rating === 3 && 'Thanks for your feedback'}
            {rating === 2 && "We're sorry — please tell us what went wrong"}
            {rating === 1 && "Really sorry — your comments will help us fix this"}
          </div>
        )}

        <textarea
          placeholder={rating > 0 && rating <= 3 ? 'What could we have done better?' : 'Anything else you\'d like us to know? (optional)'}
          value={comment}
          onChange={e => setComment(e.target.value)}
          style={S.txt}
        />

        <button onClick={submit} disabled={!rating || submitting} style={S.btn(!rating || submitting)}>
          {submitting ? 'Sending…' : 'Submit Feedback'}
        </button>

        <div style={{fontSize:11, color:'#64748b', textAlign:'center', marginTop:16}}>
          Your feedback goes directly to the business. Not shared publicly unless you choose to post on Google.
        </div>
      </div>
    </div>
  );
}

// Route public pages before mounting the full app
const signMatch = window.location.pathname.match(/^\/sign\/([a-f0-9]+)$/i);
const fbMatch   = window.location.pathname.match(/^\/feedback\/([A-Za-z0-9_-]+)$/);
ReactDOM.createRoot(document.getElementById("root")).render(
  signMatch ? <PublicSignPage token={signMatch[1]} />
  : fbMatch ? <PublicFeedbackPage token={fbMatch[1]} />
  : <Root />
);
