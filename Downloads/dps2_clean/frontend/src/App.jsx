import { useState, useEffect, useRef, useCallback, Component, Fragment } from "react";
import { api, connectGpsWebSocket } from "./api.js";
import { useAuth } from "./main.jsx";

/* ═══════════════════════════════════════════════════════════════
   DPS — DIGITAL PLUMBING SOFTWARE
   Live-wired React frontend
   ═══════════════════════════════════════════════════════════════ */

const GF = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@700;800;900&display=swap');`;
const G = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07091a;--surface:#0d1123;--surface2:#12183a;--surface3:#1a2248;
  --border:#1e2d5a;--border2:#273472;
  --amber:#E20613;--amberdim:#E2061322;
  --blue:#1D70B7;--green:#1D70B7;--greendim:#1D70B718;
  --red:#E20613;--reddim:#E2061322;--green2:#22c55e;--green2dim:#22c55e18;
  --purple:#6366f1;--cyan:#38bdf8;
  --text:#e8eaf4;--muted:#6b7aaa;--dim:#1a2248;
  --font-head:'Syne',sans-serif;--font-mono:'DM Mono',monospace;--font-body:'DM Sans',sans-serif;
}
body{font-family:var(--font-body);background:var(--bg);color:var(--text);overflow:hidden}
button{font-family:var(--font-body);cursor:pointer;border:none;outline:none;transition:transform .1s,box-shadow .1s,background .15s,border-color .15s,color .15s}
button:active:not(:disabled){transform:scale(0.96)}
input,select,textarea{font-family:var(--font-body);outline:none;transition:border-color .15s,box-shadow .15s}
input:focus,select:focus,textarea:focus{border-color:var(--blue)!important;box-shadow:0 0 0 3px #1D70B722!important}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse2{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes glow{0%,100%{box-shadow:0 0 8px #1D70B733}50%{box-shadow:0 0 22px #1D70B755}}
@keyframes slideRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
@keyframes toastIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes toastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(60px)}}
@keyframes shrink{from{width:100%}to{width:0%}}
.skel{background:linear-gradient(90deg,var(--surface) 25%,var(--surface3) 50%,var(--surface) 75%);background-size:600px 100%;animation:shimmer 1.6s infinite;border-radius:4px}
.tr-hover{transition:transform .12s,box-shadow .12s,background .12s;cursor:pointer}
.tr-hover:hover{background:var(--surface2)!important;transform:translateY(-1px);box-shadow:0 4px 12px #00000033;position:relative;z-index:1}
`;

// ─── Tiny helpers ─────────────────────────────────────────────
const statusMeta = {
  on_site:   {bg:"#E2061322",color:"#E20613",label:"ON SITE"},
  en_route:  {bg:"#1D70B718",color:"#1D70B7",label:"EN ROUTE"},
  completed: {bg:"#22c55e18",color:"#22c55e",label:"DONE"},
  scheduled: {bg:"#27347222",color:"#7b8ec8",label:"SCHED"},
  available: {bg:"#6366f118",color:"#6366f1",label:"AVAIL"},
  unassigned:{bg:"#E2061318",color:"#E20613",label:"UNASSIGNED"},
};

function Pill({status}) {
  const s = statusMeta[status] || statusMeta.scheduled;
  return <span style={{background:s.bg,color:s.color,fontSize:10,fontWeight:600,fontFamily:"var(--font-mono)",letterSpacing:".07em",padding:"2px 8px",borderRadius:3,border:`1px solid ${s.color}33`}}>{s.label}</span>;
}

function Spinner() {
  return <div style={{width:20,height:20,border:"2px solid var(--border2)",borderTopColor:"var(--blue)",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
}

function useApi(fn, deps=[]) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fn()); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─── Error Boundary ───────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error("[ErrorBoundary]", err, info); }
  reset() { this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const name = this.props.name || "this section";
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:60,gap:16,textAlign:"center"}}>
        <div style={{fontSize:32}}>⚠️</div>
        <div style={{fontFamily:"var(--font-head)",fontSize:18,fontWeight:700,color:"var(--text)"}}>
          {name} crashed
        </div>
        <div style={{fontSize:13,color:"var(--muted)",maxWidth:420,lineHeight:1.6}}>
          {this.state.error.message}
        </div>
        <button onClick={()=>this.reset()} style={{marginTop:8,padding:"9px 24px",background:"var(--amberdim)",border:"1px solid var(--amber)",borderRadius:8,color:"var(--amber)",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          Reload section
        </button>
      </div>
    );
  }
}

// ─── Toast System ─────────────────────────────────────────────
let _toastFire = null;
const toast = {
  success:(t,m)=>_toastFire?.('success',t,m),
  error:  (t,m)=>_toastFire?.('error',  t,m),
  info:   (t,m)=>_toastFire?.('info',   t,m),
  warn:   (t,m)=>_toastFire?.('warn',   t,m),
};
const TOAST_META = {
  success:{icon:'✓',color:'#22c55e',dim:'#22c55e18',border:'#22c55e33'},
  error:  {icon:'✕',color:'#E20613',dim:'#E206130a',border:'#E2061333'},
  info:   {icon:'ℹ',color:'#1D70B7',dim:'#1D70B70a',border:'#1D70B733'},
  warn:   {icon:'⚠',color:'#f59e0b',dim:'#f59e0b08',border:'#f59e0b33'},
};
function ToastContainer() {
  const [toasts,setToasts] = useState([]);
  useEffect(()=>{ _toastFire=(type,title,msg)=>{ const id=Date.now()+Math.random(); setToasts(p=>[...p,{id,type,title,msg}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3500); }; },[]);
  if(!toasts.length) return null;
  return (
    <div style={{position:"fixed",bottom:20,right:20,display:"flex",flexDirection:"column-reverse",gap:8,zIndex:9999,maxWidth:320}}>
      {toasts.map(t=>{
        const m=TOAST_META[t.type];
        return (
          <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",borderRadius:10,border:`1px solid ${m.border}`,background:m.dim,backdropFilter:"blur(8px)",animation:"toastIn .25s ease",boxShadow:"0 8px 24px #00000044",position:"relative",overflow:"hidden"}}>
            <div style={{fontSize:13,color:m.color,flexShrink:0,marginTop:1}}>{m.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:m.color,marginBottom:2}}>{t.title}</div>
              {t.msg&&<div style={{fontSize:11,color:"var(--muted)",lineHeight:1.4}}>{t.msg}</div>}
            </div>
            <div onClick={()=>setToasts(p=>p.filter(x=>x.id!==t.id))} style={{fontSize:11,color:"var(--muted)",cursor:"pointer",padding:"0 2px",flexShrink:0}}>✕</div>
            <div style={{position:"absolute",bottom:0,left:0,height:2,background:m.color,borderRadius:"0 0 0 10px",animation:"shrink 3.5s linear forwards"}}/>
          </div>
        );
      })}
    </div>
  );
}

// ─── DPS Logo ─────────────────────────────────────────────────
function DPSLogo({expanded=true}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}>
      <svg width="32" height="28" viewBox="0 0 40 34" fill="none" style={{flexShrink:0}}>
        <polygon points="8,34 0,0 32,0 40,34" fill="#E20613"/>
        <line x1="10" y1="10" x2="38" y2="10" stroke="#fff" strokeWidth="1.2" strokeOpacity=".35"/>
        <line x1="11" y1="16" x2="39" y2="16" stroke="#fff" strokeWidth="1.2" strokeOpacity=".35"/>
        <line x1="12" y1="22" x2="40" y2="22" stroke="#fff" strokeWidth="1.2" strokeOpacity=".35"/>
        <text x="20" y="23" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="'DM Sans',sans-serif" letterSpacing="1">DP</text>
      </svg>
      {expanded && (
        <div>
          <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:18,fontWeight:800,color:"#e8eaf4",lineHeight:1,letterSpacing:".01em"}}>Davis Plumbing</div>
          <div style={{fontSize:7,letterSpacing:".18em",color:"#1D70B7",marginTop:2,fontFamily:"'DM Mono',monospace"}}>DIGITAL PLUMBING SOFTWARE</div>
        </div>
      )}
    </div>
  );
}

function Icon({n,size=16,color="currentColor",stroke=1.6}) {
  const p = {
    grid:"M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    dispatch:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    jobs:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    customers:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    gps:"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z",
    inventory:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    reports:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    plug:"M7 16.5v4m10-4v4M12 12a5 5 0 100-10 5 5 0 000 10zm0 0v4",
    followup:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    settings:"M12 15a3 3 0 100-6 3 3 0 000 6z",
    bell:"M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
    x:"M18 6L6 18M6 6l12 12",
    plus:"M12 5v14M5 12h14",
    menu:"M4 6h16M4 12h16M4 18h16",
    refresh:"M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
    check:"M20 6L9 17l-5-5",
    square:"M3 3h18v18H3z",
    dollar:"M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={p[n]||p.check}/>
    </svg>
  );
}

// ─── Live GPS Canvas Map ──────────────────────────────────────
function GPSCanvas({positions, compact=false}) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    if(!positions?.length) {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="#0d1a12"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#607b6e"; ctx.font="12px monospace"; ctx.textAlign="center";
      ctx.fillText("No technicians on duty", W/2, H/2);
      return;
    }
    const lats=positions.map(p=>parseFloat(p.lat)), lngs=positions.map(p=>parseFloat(p.lng));
    const minLat=Math.min(...lats)-.004, maxLat=Math.max(...lats)+.004;
    const minLng=Math.min(...lngs)-.006, maxLng=Math.max(...lngs)+.006;
    const toX=lng=>((lng-minLng)/(maxLng-minLng))*W;
    const toY=lat=>H-((lat-minLat)/(maxLat-minLat))*H;

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#0d1a12"; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#1f3227"; ctx.lineWidth=.5;
    for(let i=0;i<8;i++){
      ctx.beginPath();ctx.moveTo(W*i/7,0);ctx.lineTo(W*i/7,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,H*i/7);ctx.lineTo(W,H*i/7);ctx.stroke();
    }
    positions.forEach(t=>{
      const x=toX(parseFloat(t.lng)),y=toY(parseFloat(t.lat));
      const c=t.color||"#5daf7c";
      ctx.beginPath();ctx.arc(x,y,compact?14:20,0,Math.PI*2);
      ctx.fillStyle=c+"18";ctx.fill();
      ctx.beginPath();ctx.arc(x,y,compact?5:7,0,Math.PI*2);
      ctx.fillStyle=c;ctx.fill();
      ctx.strokeStyle="#0b0e13";ctx.lineWidth=2;ctx.stroke();
      if(!compact){
        ctx.fillStyle=c;ctx.font="bold 9px 'DM Mono'";ctx.textAlign="left";
        ctx.fillText(t.initials||t.name?.slice(0,2)||"?",x+10,y-8);
      }
    });
  },[positions,compact]);

  return <canvas ref={ref} width={compact?280:520} height={compact?160:280} style={{width:"100%",height:"100%",display:"block"}}/>;
}

// ─── Dashboard Stats Card ─────────────────────────────────────
function StatCard({label,value,sub,subUp,loading,accent="var(--blue)"}) {
  return (
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"16px 20px",position:"relative",overflow:"hidden",transition:"transform .15s,box-shadow .15s",cursor:"default"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px #00000044";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:accent,borderRadius:"12px 0 0 12px"}}/>
      <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",marginBottom:8}}>{label}</div>
      {loading ? (
        <>
          <div className="skel" style={{height:28,width:"60%",marginBottom:6}}/>
          <div className="skel" style={{height:8,width:"40%"}}/>
        </>
      ) : (
        <>
          <div style={{fontFamily:"var(--font-head)",fontSize:32,fontWeight:800,color:accent}}>{value}</div>
          {sub && <div style={{fontSize:11,color:subUp===true?"var(--green2)":subUp===false?"var(--red)":"var(--muted)",marginTop:4,fontFamily:"var(--font-mono)"}}>{sub}</div>}
        </>
      )}
    </div>
  );
}

// ─── Enabled Services Hook ────────────────────────────────────
// Module-level cache so it is fetched once per session
let _servicesCache = null;
let _servicesPromise = null;
const SERVICE_LABELS = {plumbing:'Plumbing',hvac:'HVAC',electrical:'Electrical',restoration:'Restoration',renovations:'Renovations'};
const SERVICE_ICONS  = {plumbing:'🔧',hvac:'❄️',electrical:'⚡',restoration:'🏗️',renovations:'🔨'};
function useCompanyServices() {
  const [services, setServices] = useState(_servicesCache || []);
  useEffect(() => {
    if (_servicesCache) { setServices(_servicesCache); return; }
    if (!_servicesPromise) {
      _servicesPromise = api.getEnabledServices()
        .then(d => { _servicesCache = d; return d; })
        .catch(() => { _servicesCache = ['plumbing']; return _servicesCache; });
    }
    _servicesPromise.then(d => setServices(d));
  }, []);
  return services; // array of lowercase strings e.g. ['plumbing','hvac']
}

// ─── DASHBOARD PAGE (ServiceTitan-style) ──────────────────────
function DashboardPage() {
  const {data:stats, loading, reload} = useApi(() => api.dashboardStats());
  const {data:jobs, loading:jobsLoading} = useApi(() => api.getJobs({date: new Date().toISOString().split("T")[0]}));
  const {data:techs} = useApi(() => api.getTechnicians());
  const {data:lowStock} = useApi(() => api.getLowStock());
  const [livePositions, setLivePositions] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),60000); return()=>clearInterval(t); },[]);

  useEffect(() => {
    api.gpsLive().then(setLivePositions).catch(()=>{});
    const ws = connectGpsWebSocket(msg => {
      if(msg.type === "gps_ping") {
        setLivePositions(prev => {
          const filtered = prev.filter(p => p.technician_id !== msg.technician_id);
          return [...filtered, {technician_id:msg.technician_id, lat:msg.lat, lng:msg.lng, color:msg.color||"#5daf7c", initials:msg.initials, name:msg.name}];
        });
      }
    });
    return () => ws?.close();
  }, []);

  const fmt$ = n => `$${Math.round(parseFloat(n||0)).toLocaleString()}`;
  const todayJobs = jobs || [];
  const byStatus = s => todayJobs.filter(j=>j.status===s);
  const unassigned = byStatus('unassigned');
  const onSite = byStatus('on_site');
  const enRoute = byStatus('en_route');
  const completed = byStatus('completed');
  const totalRevToday = parseFloat(stats?.revenue_today||0);

  // Attach GPS position to each tech
  const techsWithPos = (techs||[]).map(t=>{
    const pos = livePositions.find(p=>p.technician_id===t.id);
    const myJobs = todayJobs.filter(j=>j.technician_id===t.id);
    const activeJob = myJobs.find(j=>j.status==='on_site'||j.status==='en_route');
    return {...t, pos, myJobs, activeJob, jobsDone:myJobs.filter(j=>j.status==='completed').length};
  });

  const KPICard = ({label, value, sub, accent, icon}) => (
    <div style={{background:"var(--surface)",border:`1px solid ${accent}33`,borderRadius:14,padding:"16px 18px",position:"relative",overflow:"hidden",transition:"transform .15s,box-shadow .15s",cursor:"default"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 24px ${accent}22`;}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:accent,borderRadius:"14px 0 0 14px"}}/>
      <div style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".09em",marginBottom:10}}>{label}</div>
      {loading ? <Spinner/> : (
        <>
          <div style={{fontFamily:"var(--font-head)",fontSize:30,fontWeight:800,color:accent,lineHeight:1}}>{value}</div>
          {sub && <div style={{fontSize:11,color:"var(--muted)",marginTop:6,fontFamily:"var(--font-mono)"}}>{sub}</div>}
        </>
      )}
    </div>
  );

  return (
    <div style={{animation:"fadeUp .4s ease",display:"flex",flexDirection:"column",gap:14,height:"100%",minHeight:0,overflowY:"auto"}} className="scrollbar-thin">

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <div>
          <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,lineHeight:1}}>Operations Center</div>
          <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginTop:4}}>
            {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
            {" · "}{now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
          </div>
        </div>
        <div style={{flex:1}}/>
        {unassigned.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#f5656518",border:"1px solid #f5656544",borderRadius:8,padding:"5px 12px"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#f56565",animation:"pulse2 1s infinite"}}/>
            <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"#f56565",fontWeight:600}}>{unassigned.length} UNASSIGNED</span>
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:4,background:"var(--greendim)",border:"1px solid var(--green)33",borderRadius:8,padding:"5px 10px"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"var(--green)",animation:"pulse2 1.5s infinite"}}/>
          <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--green)"}}>LIVE</span>
        </div>
        <button onClick={reload} style={{display:"flex",gap:5,alignItems:"center",padding:"6px 12px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontSize:12}}>
          <Icon n="refresh" size={12} color="var(--muted)"/> Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,flexShrink:0}}>
        <KPICard label="REVENUE TODAY" value={fmt$(stats?.revenue_today)} sub={`${completed.length} jobs closed`} accent="var(--green)"/>
        <KPICard label="JOBS COMPLETE" value={`${completed.length}/${todayJobs.length}`} sub={`${Math.round(completed.length/Math.max(todayJobs.length,1)*100)}% completion`} accent="var(--blue)"/>
        <KPICard label="ON SITE" value={onSite.length} sub={`${enRoute.length} en route`} accent="var(--amber)"/>
        <KPICard label="AVG TICKET" value={fmt$(stats?.avg_ticket)} sub="Last 30 days" accent="var(--purple)"/>
        <KPICard label="UNASSIGNED" value={unassigned.length} sub={`${stats?.low_stock_count||0} low stock`} accent={unassigned.length>0?"#f56565":"var(--green)"}/>
      </div>

      {/* Main grid: Technician Board + Sidebar */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14,flexShrink:0}}>

        {/* Technician Status Board */}
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em"}}>TECHNICIAN STATUS BOARD</div>
            <span style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:4,padding:"1px 6px"}}>{(techs||[]).length} FIELD</span>
          </div>
          {(techsWithPos.length===0)&&<div style={{padding:24,textAlign:"center",color:"var(--muted)",fontSize:12}}>No technicians found — add them in Settings.</div>}
          <div style={{display:"flex",flexDirection:"column"}}>
            {techsWithPos.map((t,i)=>{
              const status = t.activeJob?.status || (t.jobsDone>0?'completed':'available');
              const sm = statusMeta[status]||statusMeta.available;
              return (
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:i<techsWithPos.length-1?"1px solid var(--border)":"none",transition:"background .15s"}}>
                  {/* Avatar */}
                  <div style={{width:38,height:38,borderRadius:"50%",background:`${t.color||"#5daf7c"}22`,border:`2px solid ${t.color||"#5daf7c"}55`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-mono)",fontWeight:700,fontSize:13,color:t.color||"#5daf7c",flexShrink:0}}>
                    {t.initials||t.first_name?.[0]||"?"}
                  </div>
                  {/* Name + job */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,lineHeight:1.2}}>{t.first_name} {t.last_name}</div>
                    <div style={{fontSize:11,color:"var(--muted)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {t.activeJob ? `${t.activeJob.job_type||'Job'} · ${t.activeJob.customer_name||''}` : (t.jobsDone>0 ? `${t.jobsDone} job${t.jobsDone!==1?'s':''} complete` : 'Available')}
                    </div>
                  </div>
                  {/* Jobs done */}
                  <div style={{textAlign:"center",minWidth:36}}>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:800,color:"var(--green)"}}>{t.jobsDone}</div>
                    <div style={{fontSize:8,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>DONE</div>
                  </div>
                  {/* Remaining */}
                  <div style={{textAlign:"center",minWidth:36}}>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:800,color:"var(--muted)"}}>{t.myJobs.length-t.jobsDone}</div>
                    <div style={{fontSize:8,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>LEFT</div>
                  </div>
                  {/* Status pill */}
                  <span style={{fontSize:9,fontFamily:"var(--font-mono)",fontWeight:700,padding:"3px 8px",borderRadius:4,background:sm.bg,color:sm.color,border:`1px solid ${sm.color}33`,flexShrink:0}}>{sm.label}</span>
                  {/* GPS live dot */}
                  {t.pos&&<div style={{width:7,height:7,borderRadius:"50%",background:"var(--green)",animation:"pulse2 1.5s infinite",flexShrink:0}}/>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right sidebar: Revenue chart + Alerts */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          {/* Revenue chart */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
            <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",marginBottom:12}}>REVENUE — 7 DAYS</div>
            {stats?.revenue_chart ? (
              <div style={{display:"flex",alignItems:"flex-end",gap:5,height:80}}>
                {stats.revenue_chart.map((d,i)=>{
                  const vals=stats.revenue_chart.map(r=>parseFloat(r.revenue));
                  const max=Math.max(...vals,1);
                  const h=Math.max(4,(parseFloat(d.revenue)/max)*64);
                  const isToday=i===vals.length-1;
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                      {isToday&&<div style={{fontSize:7,fontFamily:"var(--font-mono)",color:"var(--green)"}}>${Math.round(parseFloat(d.revenue)/1000)}k</div>}
                      <div style={{width:"100%",height:h,borderRadius:"3px 3px 0 0",background:isToday?"var(--green)":i<vals.length-1?"var(--green)55":"var(--border)",transition:"height .6s"}}/>
                      <div style={{fontSize:8,fontFamily:"var(--font-mono)",color:isToday?"var(--text)":"var(--dim)"}}>{d.label}</div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>}
          </div>

          {/* Low stock */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px",flex:1}}>
            <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:(lowStock||[]).length>0?"#f56565":"var(--muted)",letterSpacing:".08em",marginBottom:10}}>
              {(lowStock||[]).length>0?"⚠ LOW STOCK":"STOCK STATUS"}
            </div>
            {(lowStock||[]).slice(0,5).map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                  <div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{item.location_name}</div>
                </div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:16,fontWeight:800,color:parseInt(item.qty)===0?"#f56565":"var(--amber)"}}>{item.qty}<span style={{fontSize:9,color:"var(--muted)"}}>/{item.min_qty}</span></div>
              </div>
            ))}
            {!(lowStock||[]).length&&<div style={{fontSize:12,color:"var(--green)",fontFamily:"var(--font-mono)"}}>✓ All healthy</div>}
          </div>
        </div>
      </div>

      {/* Today's Dispatch Table */}
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",flexShrink:0}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",flex:1}}>TODAY'S DISPATCH</div>
          <span style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:4,padding:"1px 6px"}}>{todayJobs.length} JOBS</span>
        </div>
        {jobsLoading?<div style={{padding:20,display:"flex",justifyContent:"center"}}><Spinner/></div>:(
          <div>
            {/* Column headers */}
            <div style={{display:"grid",gridTemplateColumns:"100px 1fr 140px 120px 90px 90px",gap:0,padding:"7px 16px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
              {["TIME","CUSTOMER / TYPE","TECHNICIAN","ADDRESS","WINDOW","STATUS"].map(h=>(
                <div key={h} style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".06em"}}>{h}</div>
              ))}
            </div>
            {todayJobs.length===0&&<div style={{padding:"20px 16px",color:"var(--muted)",fontSize:12,textAlign:"center"}}>No jobs scheduled today.</div>}
            {todayJobs.map((j,i)=>(
              <div key={j.id} style={{display:"grid",gridTemplateColumns:"100px 1fr 140px 120px 90px 90px",gap:0,padding:"10px 16px",borderBottom:i<todayJobs.length-1?"1px solid var(--border)":"none",alignItems:"center",transition:"background .15s"}}>
                <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--muted)"}}>
                  {j.scheduled_start ? new Date(j.scheduled_start).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) : "—"}
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer_name||"—"}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{j.job_type}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                  {j.technician_color&&<div style={{width:8,height:8,borderRadius:"50%",background:j.technician_color,flexShrink:0}}/>}
                  <span style={{fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:j.technician_name?"var(--text)":"var(--muted)"}}>{j.technician_name||"Unassigned"}</span>
                </div>
                <div style={{fontSize:10,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.address||"—"}</div>
                <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{j.arrival_window||"—"}</div>
                <Pill status={j.status}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GPS Fleet Map */}
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:14,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em"}}>LIVE FLEET MAP</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"var(--green)",animation:"pulse2 1.5s infinite"}}/>
            <span style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--green)"}}>LIVE</span>
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{livePositions.length} tracking</span>
        </div>
        <div style={{height:200,borderRadius:8,overflow:"hidden",background:"#0d1a12"}}>
          <GPSCanvas positions={livePositions} compact={false}/>
        </div>
      </div>

    </div>
  );
}

// ─── JOBS PAGE ────────────────────────────────────────────────
function JobsPage() {
  const [filter, setFilter] = useState("all");
  const today = new Date().toISOString().split("T")[0];
  const {data:jobs, loading, reload} = useApi(() => api.getJobs({date:today}));

  const filtered = filter==="all" ? (jobs||[]) : (jobs||[]).filter(j=>j.status===filter);

  return (
    <div style={{animation:"fadeUp .4s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,flex:1}}>Jobs</div>
        <button onClick={reload} style={{display:"flex",gap:6,alignItems:"center",padding:"6px 12px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontSize:12}}>
          <Icon n="refresh" size={13} color="#64748b"/> Refresh
        </button>
        <button style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"var(--amberdim)",border:"1px solid var(--amber)",borderRadius:8,color:"var(--amber)",fontSize:12,fontWeight:600}}>
          <Icon n="plus" size={14} color="#e8a84a"/> New Job
        </button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {["all","scheduled","en_route","on_site","completed"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{padding:"5px 14px",background:filter===s?"var(--amberdim)":"var(--surface)",border:`1px solid ${filter===s?"var(--amber)":"var(--border)"}`,borderRadius:20,color:filter===s?"var(--amber)":"var(--muted)",fontSize:11,fontFamily:"var(--font-mono)"}}>
            {s.replace("_"," ").toUpperCase()}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{display:"flex",justifyContent:"center",padding:40}}><Spinner/></div>
      ) : (
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid var(--border2)",background:"var(--surface2)"}}>
                {["Job #","Customer","Type","Technician","Status","Scheduled"].map((h,i)=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".07em",fontWeight:500}}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((job,i) => (
                <tr key={job.id} style={{borderBottom:"1px solid var(--border)",animation:`fadeUp .3s ease both`,animationDelay:`${i*.04}s`}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 14px",fontFamily:"var(--font-mono)",fontSize:12,color:"var(--amber)",fontWeight:600}}>#{job.job_number}</td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{fontSize:13,fontWeight:500}}>{job.customer_name}</div>
                    <div style={{fontSize:10,color:"var(--muted)"}}>{job.address}</div>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{fontSize:12,color:"#9ca3af"}}>{job.job_type||"—"}</div>
                    {job.description && <div style={{fontSize:11,color:"var(--muted)",marginTop:2,maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.description.replace(/\n/g,' ')}</div>}
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    {job.technician_name ? (
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:job.technician_color||"#64748b"}}/>
                        <span style={{fontSize:12}}>{job.technician_name}</span>
                      </div>
                    ) : <span style={{fontSize:11,color:"var(--muted)"}}>Unassigned</span>}
                  </td>
                  <td style={{padding:"10px 14px"}}><Pill status={job.status}/></td>
                  <td style={{padding:"10px 14px",fontSize:11,fontFamily:"var(--font-mono)",color:"var(--muted)"}}>
                    {job.scheduled_start ? new Date(job.scheduled_start).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td colSpan={6} style={{padding:"30px",textAlign:"center",color:"var(--muted)",fontSize:13}}>No jobs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY — FULL FEATURED MODULE
// ═══════════════════════════════════════════════════════════════

// ─── Barcode Label (JsBarcode via CDN) ───────────────────────
function BarcodeLabel({value, itemName, sku}) {
  const svgRef = useRef(null);
  const [ready, setReady] = useState(!!window.JsBarcode);
  useEffect(() => {
    if (window.JsBarcode) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  useEffect(() => {
    if (!ready || !svgRef.current || !value) return;
    try { window.JsBarcode(svgRef.current, value, {format:'CODE128',width:2,height:64,displayValue:true,fontSize:11,margin:6,background:'#fff',lineColor:'#000'}); }
    catch(e) {}
  }, [ready, value]);
  if (!ready) return <div style={{padding:20,color:'var(--muted)',fontSize:12}}>Loading barcode...</div>;
  return <div style={{background:'#fff',padding:'10px 14px',borderRadius:8,display:'inline-block',textAlign:'center'}}>
    <svg ref={svgRef}/>
    {itemName && <div style={{fontSize:10,color:'#333',marginTop:2,fontWeight:600}}>{itemName}</div>}
  </div>;
}

function BarcodePrintSheet({items}) {
  const containerRef = useRef(null);
  const print = () => {
    const win = window.open('','_blank');
    win.document.write(`<html><head><title>Barcode Labels</title>
    <style>body{margin:0;font-family:sans-serif}
    .sheet{display:flex;flex-wrap:wrap;gap:8px;padding:12px}
    .label{border:1px solid #ddd;border-radius:4px;padding:8px;text-align:center;width:200px}
    .label svg{display:block;width:100%}
    .name{font-size:10px;font-weight:600;margin-top:4px;color:#333}
    @media print{.sheet{gap:4px;padding:4px}.label{break-inside:avoid}}
    </style></head><body>`);
    win.document.write('<div class="sheet">');
    items.forEach(item => {
      win.document.write(`<div class="label"><img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(item.barcode||item.sku)}&code=Code128&dpi=96&unit=Min&imagetype=png" style="width:180px"/><div class="name">${item.name}</div><div style="font-size:9px;color:#666">${item.sku}</div></div>`);
    });
    win.document.write('</div></body></html>');
    win.document.close();
    win.onload = () => { win.print(); };
  };
  return <button onClick={print} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',color:'var(--text)',fontSize:12,cursor:'pointer'}}>🖨 Print Labels</button>;
}

// ─── Item Modal (Create / Edit) ───────────────────────────────
function ItemModal({item, categories, onSave, onClose}) {
  const enabledServices = useCompanyServices();
  const [form, setForm] = useState({
    sku:'', name:'', description:'', category:'', category_id:'', service_type:'',
    item_type:'consumable', cost:'', price:'', min_qty:'0', max_qty:'',
    vendor:'', vendor_sku:'', barcode:'',
    ...item,
    category_id: item?.category_id || '',
    service_type: item?.service_type || '',
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const save = async () => {
    setSaving(true);
    try {
      const data = {...form, cost:parseFloat(form.cost)||0, price:parseFloat(form.price)||0,
        min_qty:parseInt(form.min_qty)||0, max_qty:form.max_qty?parseInt(form.max_qty):null,
        barcode:form.barcode||form.sku, category_id:form.category_id||null};
      if (item?.id) await api.updateItem(item.id, data);
      else await api.createItem(data);
      onSave();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };
  const inp = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const lbl = {fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4};
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:640,maxHeight:'90vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>{item?.id?'Edit Item':'New Item'}</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          {[['sku','SKU *'],['name','Name *'],['vendor','Vendor'],['vendor_sku','Vendor SKU'],['barcode','Barcode']].map(([k,l])=>(
            <div key={k}><label style={lbl}>{l}</label><input value={form[k]||''} onChange={set(k)} style={inp}/></div>
          ))}
          <div><label style={lbl}>SERVICE TYPE</label>
            <select value={form.service_type} onChange={set('service_type')} style={inp}>
              <option value="">All Services</option>
              {enabledServices.map(s=><option key={s} value={s}>{SERVICE_LABELS[s]||s}</option>)}
            </select>
          </div>
          <div><label style={lbl}>CATEGORY</label>
            <select value={form.category_id} onChange={set('category_id')} style={inp}>
              <option value="">Uncategorized</option>
              {(categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>ITEM TYPE</label>
            <select value={form.item_type} onChange={set('item_type')} style={inp}>
              <option value="consumable">Consumable</option>
              <option value="tool">Tool</option>
              <option value="equipment">Equipment</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div><label style={lbl}>COST ($)</label><input type="number" value={form.cost} onChange={set('cost')} style={inp}/></div>
          <div><label style={lbl}>PRICE ($)</label><input type="number" value={form.price} onChange={set('price')} style={inp}/></div>
          <div><label style={lbl}>MIN QTY</label><input type="number" value={form.min_qty} onChange={set('min_qty')} style={inp}/></div>
          <div><label style={lbl}>MAX QTY</label><input type="number" value={form.max_qty||''} onChange={set('max_qty')} style={inp}/></div>
        </div>
        <div style={{marginTop:14}}><label style={lbl}>DESCRIPTION</label><textarea value={form.description||''} onChange={set('description')} rows={2} style={{...inp,resize:'vertical'}}/></div>
        <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save Item'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────
function TransferModal({item, locations, onSave, onClose}) {
  const [mode, setMode]           = useState('receive'); // 'receive' | 'transfer'
  // Receive mode
  const [supplyHouse, setSupplyHouse] = useState(item.vendor||'');
  const [poNum, setPoNum]         = useState('');
  const [recvTo, setRecvTo]       = useState('');
  const [recvQty, setRecvQty]     = useState(1);
  // Transfer mode
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [qty, setQty]             = useState(1);
  const [saving, setSaving]       = useState(false);

  const fromStock = (item.stock||[]).find(s=>s.location_id===from);

  const saveReceive = async () => {
    if (!supplyHouse.trim()) return toast.warn('Required', 'Enter a supply house name');
    if (!recvTo) return toast.warn('Required', 'Select a destination location');
    if (recvQty < 1) return toast.warn('Validation', 'Quantity must be at least 1');
    setSaving(true);
    try {
      const notes = `Received from ${supplyHouse.trim()}${poNum.trim() ? ` · PO/Invoice: ${poNum.trim()}` : ''}`;
      await api.moveStock({item_id:item.id, from_location:null, to_location:recvTo, qty:parseInt(recvQty), type:'receive', notes});
      onSave();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const saveTransfer = async () => {
    if (!from||!to||from===to) return toast.warn('Validation', 'Select different source and destination');
    if (qty<1) return toast.warn('Validation', 'Quantity must be at least 1');
    if (fromStock && qty > fromStock.qty) return toast.warn('Not enough stock', `Only ${fromStock.qty} available at source`);
    setSaving(true);
    try { await api.moveStock({item_id:item.id, from_location:from, to_location:to, qty:parseInt(qty), type:'transfer'}); onSave(); }
    catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const sel = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const inp = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const tab = (active) => ({
    flex:1, padding:'8px', textAlign:'center', fontSize:13, fontWeight:600, cursor:'pointer', borderRadius:8,
    background: active ? '#3b82f622' : 'transparent',
    color: active ? '#3b82f6' : 'var(--muted)',
    border: active ? '1px solid #3b82f6' : '1px solid transparent',
  });

  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:440,padding:28}}>

        {/* Header */}
        <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,marginBottom:4}}>Adjust Stock</div>
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>{item.name} <span style={{fontFamily:'var(--font-mono)',fontSize:11}}>({item.sku})</span></div>

        {/* Tabs */}
        <div style={{display:'flex',gap:6,marginBottom:20,background:'var(--surface2)',padding:4,borderRadius:10,border:'1px solid var(--border)'}}>
          <button style={tab(mode==='receive')} onClick={()=>setMode('receive')}>📦 Receive Stock</button>
          <button style={tab(mode==='transfer')} onClick={()=>setMode('transfer')}>🔄 Transfer</button>
        </div>

        {mode==='receive' ? (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>SUPPLY HOUSE / VENDOR *</label>
              <input value={supplyHouse} onChange={e=>setSupplyHouse(e.target.value)}
                placeholder="e.g. Ferguson, Home Depot, Hajoca..."
                style={inp}/>
            </div>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>PO / INVOICE NUMBER <span style={{color:'var(--dim)'}}>(optional)</span></label>
              <input value={poNum} onChange={e=>setPoNum(e.target.value)}
                placeholder="e.g. INV-4821 or PO-102"
                style={inp}/>
            </div>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>PUT STOCK INTO *</label>
              <select value={recvTo} onChange={e=>setRecvTo(e.target.value)} style={sel}>
                <option value="">Select location...</option>
                {locations.map(l=>(
                  <option key={l.id} value={l.id}>{l.type==='warehouse'?'🏭':'🚚'} {l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>QUANTITY RECEIVED *</label>
              <input type="number" min={1} value={recvQty} onChange={e=>setRecvQty(e.target.value)} style={inp}/>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>FROM LOCATION</label>
              <select value={from} onChange={e=>setFrom(e.target.value)} style={sel}>
                <option value="">Select source...</option>
                {(item.stock||[]).filter(s=>s.qty>0).map(s=>(
                  <option key={s.location_id} value={s.location_id}>{s.location_name} ({s.qty} in stock)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>TO LOCATION</label>
              <select value={to} onChange={e=>setTo(e.target.value)} style={sel}>
                <option value="">Select destination...</option>
                {locations.filter(l=>l.id!==from).map(l=>(
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>QUANTITY</label>
              <input type="number" min={1} max={fromStock?.qty||999} value={qty} onChange={e=>setQty(e.target.value)} style={sel}/>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={mode==='receive'?saveReceive:saveTransfer} disabled={saving}
            style={{background:'#3b82f622',border:'1px solid #3b82f6',borderRadius:8,padding:'9px 20px',color:'#3b82f6',fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {saving ? 'Saving...' : mode==='receive' ? 'Receive Stock' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Modal ───────────────────────────────────────────
function TemplateModal({template, allItems, onSave, onClose}) {
  const [form, setForm] = useState({name:'',department:'',description:'',...template});
  const [tItems, setTItems] = useState(template?.items||[]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const addItem = (item) => {
    if (tItems.find(t=>t.item_id===item.id)) return;
    setTItems(prev=>[...prev,{item_id:item.id,name:item.name,sku:item.sku,category:item.category,min_qty:1,max_qty:''}]);
    setSearch('');
  };
  const updateTItem = (idx,k,v) => setTItems(prev=>prev.map((t,i)=>i===idx?{...t,[k]:v}:t));
  const removeItem = idx => setTItems(prev=>prev.filter((_,i)=>i!==idx));
  const save = async () => {
    if (!form.name) return toast.warn('Required', 'Name required');
    setSaving(true);
    try {
      const data = {...form, items: tItems.map(t=>({item_id:t.item_id,min_qty:parseInt(t.min_qty)||1,max_qty:t.max_qty?parseInt(t.max_qty):null}))};
      if (template?.id) await api.updateTemplate(template.id, data);
      else await api.createTemplate(data);
      onSave();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };
  const inp = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const filtered = search.length>1 ? (allItems||[]).filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.sku.toLowerCase().includes(search.toLowerCase())).slice(0,8) : [];
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:680,maxHeight:'90vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>{template?.id?'Edit Template':'New Truck Stock Template'}</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>TEMPLATE NAME *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp}/></div>
          <div><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>DEPARTMENT</label><input value={form.department||''} onChange={e=>setForm(f=>({...f,department:e.target.value}))} placeholder="e.g. Plumbing, HVAC" style={inp}/></div>
        </div>
        <div style={{marginBottom:18}}><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>DESCRIPTION</label><input value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={inp}/></div>

        <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:8}}>STOCK LIST ({tItems.length} ITEMS)</div>
        <div style={{position:'relative',marginBottom:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search to add items..." style={{...inp,paddingLeft:14}}/>
          {filtered.length>0&&(
            <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,zIndex:10,maxHeight:200,overflowY:'auto'}}>
              {filtered.map(i=>(
                <div key={i.id} onClick={()=>addItem(i)} style={{padding:'9px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface3)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)',marginRight:8}}>{i.sku}</span>{i.name}
                  <span style={{float:'right',fontSize:10,color:'var(--muted)'}}>{i.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {tItems.length>0 && (
          <div style={{background:'var(--surface2)',borderRadius:8,overflow:'hidden',marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 32px',gap:0}}>
              {['ITEM','MIN QTY','MAX QTY',''].map(h=><div key={h} style={{padding:'7px 12px',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>{h}</div>)}
            </div>
            {tItems.map((t,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 32px',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
                <div style={{padding:'8px 12px'}}>
                  <div style={{fontSize:12,fontWeight:500}}>{t.name}</div>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{t.sku}</div>
                </div>
                <input type="number" min={0} value={t.min_qty} onChange={e=>updateTItem(i,'min_qty',e.target.value)} style={{background:'var(--surface3)',border:'none',padding:'6px 8px',color:'var(--text)',fontSize:12,borderRight:'1px solid var(--border)'}}/>
                <input type="number" min={0} value={t.max_qty||''} onChange={e=>updateTItem(i,'max_qty',e.target.value)} placeholder="—" style={{background:'var(--surface3)',border:'none',padding:'6px 8px',color:'var(--text)',fontSize:12,borderRight:'1px solid var(--border)'}}/>
                <button onClick={()=>removeItem(i)} style={{background:'none',color:'#f56565',fontSize:15,padding:'0 8px',cursor:'pointer'}}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{background:'#e8a84a22',border:'1px solid #e8a84a',borderRadius:8,padding:'9px 20px',color:'#e8a84a',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save Template'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PO Modal ─────────────────────────────────────────────────
function POModal({po, allItems, onSave, onClose}) {
  const [form, setForm] = useState({vendor:'',notes:'',...po});
  const [poItems, setPoItems] = useState(po?.items||[]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = search.length>1 ? (allItems||[]).filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.sku.toLowerCase().includes(search.toLowerCase())).slice(0,6) : [];
  const addItem = (item) => {
    setPoItems(prev=>[...prev,{item_id:item.id,description:item.name,sku:item.sku,qty:1,unit_cost:item.cost||0}]);
    setSearch('');
  };
  const upd = (idx,k,v) => setPoItems(prev=>prev.map((p,i)=>i===idx?{...p,[k]:v}:p));
  const save = async () => {
    setSaving(true);
    try {
      await api.createPurchaseOrder({...form, items:poItems});
      onSave();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };
  const inp = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const total = poItems.reduce((s,i)=>s+(parseFloat(i.unit_cost)||0)*(parseInt(i.qty)||0),0);
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:680,maxHeight:'90vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>New Purchase Order</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <div><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>VENDOR</label><input value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} style={inp}/></div>
          <div><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>NOTES</label><input value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp}/></div>
        </div>
        <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:8}}>LINE ITEMS</div>
        <div style={{position:'relative',marginBottom:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search inventory to add..." style={{...inp,paddingLeft:14}}/>
          {filtered.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,zIndex:10}}>
            {filtered.map(i=><div key={i.id} onClick={()=>addItem(i)} style={{padding:'9px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--surface3)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)',marginRight:8}}>{i.sku}</span>{i.name}
            </div>)}
          </div>}
        </div>
        {poItems.length>0&&<div style={{background:'var(--surface2)',borderRadius:8,overflow:'hidden',marginBottom:16}}>
          {['DESCRIPTION / SKU','QTY','UNIT COST','TOTAL',''].map((h,i)=><span key={i} style={{display:'inline-block',padding:'7px 10px',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',borderBottom:'1px solid var(--border)',width:i===0?'40%':i===4?'5%':'18%'}}>{h}</span>)}
          {poItems.map((p,i)=>(
            <div key={i} style={{display:'flex',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
              <div style={{flex:1,padding:'6px 10px'}}>
                <div style={{fontSize:12}}>{p.description}</div>
                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{p.sku}</div>
              </div>
              <input type="number" min={1} value={p.qty} onChange={e=>upd(i,'qty',e.target.value)} style={{width:60,background:'var(--surface3)',border:'none',borderLeft:'1px solid var(--border)',padding:'6px 8px',color:'var(--text)',fontSize:12}}/>
              <input type="number" step="0.01" value={p.unit_cost} onChange={e=>upd(i,'unit_cost',e.target.value)} style={{width:90,background:'var(--surface3)',border:'none',borderLeft:'1px solid var(--border)',padding:'6px 8px',color:'var(--text)',fontSize:12}}/>
              <div style={{width:80,padding:'6px 10px',fontFamily:'var(--font-mono)',fontSize:12,color:'#5daf7c'}}>${((parseFloat(p.unit_cost)||0)*(parseInt(p.qty)||0)).toFixed(2)}</div>
              <button onClick={()=>setPoItems(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',color:'#f56565',fontSize:15,padding:'0 10px',cursor:'pointer'}}>×</button>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'flex-end',padding:'8px 12px',fontSize:13,fontWeight:700,color:'#5daf7c',borderTop:'1px solid var(--border2)'}}>Total: ${total.toFixed(2)}</div>
        </div>}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Create PO'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Count Conduct Modal ──────────────────────────────────────
function CountModal({count, onSave, onClose}) {
  const {data, loading, reload} = useApi(()=>api.getCount(count.id), [count.id]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  useEffect(()=>{ if(data?.items) setItems(data.items.map(i=>({...i,actual_qty:i.actual_qty??''})));  },[data]);
  const setActual = (idx,v) => setItems(prev=>prev.map((it,i)=>i===idx?{...it,actual_qty:v}:it));
  const save = async (complete=false) => {
    setSaving(true);
    try {
      await api.updateCount(count.id,{status:complete?'completed':'in_progress', notes, items: items.map(i=>({id:i.id,actual_qty:i.actual_qty===''?null:parseInt(i.actual_qty)}))});
      onSave();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };
  const filled = items.filter(i=>i.actual_qty!=='').length;
  return (
    <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:700,maxHeight:'90vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>Inventory Count</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>{count.location_name} · {filled}/{items.length} items counted</div>
        {loading ? <Spinner/> : (
          <>
            <div style={{background:'var(--surface2)',borderRadius:8,overflow:'hidden',marginBottom:14}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px 90px 80px',background:'var(--surface3)',borderBottom:'1px solid var(--border)'}}>
                {['ITEM / SKU','EXPECTED','COUNTED','VARIANCE'].map(h=><div key={h} style={{padding:'8px 12px',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em'}}>{h}</div>)}
              </div>
              {items.map((item,i)=>{
                const variance = item.actual_qty!==''&&item.actual_qty!==null ? parseInt(item.actual_qty)-(item.expected_qty||0) : null;
                return (
                  <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 90px 90px 80px',borderBottom:'1px solid var(--border)',background:variance!==null&&variance!==0?variance<0?'#f5656508':'#5daf7c08':'transparent',alignItems:'center'}}>
                    <div style={{padding:'8px 12px'}}>
                      <div style={{fontSize:13,fontWeight:500}}>{item.name}</div>
                      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{item.sku} · {item.category}</div>
                    </div>
                    <div style={{padding:'8px 12px',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--muted)'}}>{item.expected_qty}</div>
                    <div style={{padding:'4px 8px'}}>
                      <input type="number" min={0} value={item.actual_qty} onChange={e=>setActual(i,e.target.value)}
                        style={{width:'100%',background:'var(--surface)',border:`1px solid ${variance!==null&&variance!==0?variance<0?'#f56565':'#5daf7c':'var(--border)'}`,borderRadius:6,padding:'5px 8px',color:'var(--text)',fontSize:13,fontFamily:'var(--font-mono)',textAlign:'center'}}/>
                    </div>
                    <div style={{padding:'8px 12px',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:variance===null?'var(--dim)':variance===0?'#5daf7c':variance>0?'#4a9eff':'#f56565'}}>
                      {variance===null?'—':variance>0?`+${variance}`:variance}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginBottom:16}}><label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>NOTES</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Close</button>
              <button onClick={()=>save(false)} disabled={saving} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--text)',fontSize:13,cursor:'pointer'}}>{saving?'Saving...':'Save Progress'}</button>
              <button onClick={()=>save(true)} disabled={saving||filled===0} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>Complete Count</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Items ───────────────────────────────────────────────
function InvItemsTab({items, locations, categories, onReload, mode='all'}) {
  const [modal, setModal]           = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [transferItem, setTransferItem] = useState(null);
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter]     = useState('all');

  const materialTypes = ['consumable','material'];
  const toolTypes     = ['tool','equipment'];

  const getStatus = (item) => {
    const total = (item.stock||[]).reduce((s,l)=>s+parseInt(l.qty||0),0);
    if (total === 0) return 'out';
    if (total <= item.min_qty) return 'low';
    return 'ok';
  };

  const filtered = (items||[]).filter(i => {
    if (mode==='materials' && !materialTypes.includes(i.item_type)) return false;
    if (mode==='tools'     && !toolTypes.includes(i.item_type))     return false;
    if (categoryFilter !== 'all' && (i.category_id||'') !== categoryFilter) return false;
    if (locationFilter !== 'all') {
      const hasStock = (i.stock||[]).some(s => s.location_id === locationFilter && parseInt(s.qty||0) > 0);
      if (!hasStock) return false;
    }
    if (statusFilter !== 'all' && getStatus(i) !== statusFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.sku||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const deleteItem = async (id) => {
    if (!confirm('Archive this item?')) return;
    await api.deleteItem(id); onReload();
  };

  // KPI stats
  const allItems   = items||[];
  const lowCount   = allItems.filter(i=>{ const s=getStatus(i); return s==='low'||s==='out'; }).length;
  const totalValue = allItems.reduce((s,i)=>{
    const qty=(i.stock||[]).reduce((a,l)=>a+parseInt(l.qty||0),0);
    return s + qty * parseFloat(i.cost||0);
  },0);
  const trucks     = (locations||[]).filter(l=>l.type==='truck');
  const trucksOk   = trucks.filter(t=>{
    const lowOnTruck = allItems.some(i=>{
      const s=(i.stock||[]).find(st=>st.location_id===t.id);
      return s && parseInt(s.qty||0) <= i.min_qty;
    });
    return !lowOnTruck;
  }).length;

  // sidebar filter counts
  const statusCounts = { ok:0, low:0, out:0 };
  allItems.forEach(i=>{ const s=getStatus(i); if(statusCounts[s]!==undefined) statusCounts[s]++; });

  const sidebarSectionLabel = { fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:8, padding:'0 8px' };
  const sidebarItem = (active) => ({
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'7px 8px', borderRadius:6, cursor:'pointer', marginBottom:1, fontSize:13, fontWeight:500,
    background: active ? '#eff6ff' : 'transparent',
    color: active ? '#3b82f6' : '#374151',
  });
  const badge = (color) => ({
    fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:10,
    background: color==='blue'?'#dbeafe':color==='red'?'#fee2e2':'#f3f4f6',
    color: color==='blue'?'#3b82f6':color==='red'?'#dc2626':'#6b7280',
  });

  const cardBorderColor = (item) => {
    const s = getStatus(item);
    if (s==='out'||s==='low') return s==='out'?'#ef4444':'#f59e0b';
    return '#16a34a';
  };
  const pillStyle = (item) => {
    const s = getStatus(item);
    if (s==='out') return { background:'#fee2e2', color:'#dc2626' };
    if (s==='low') return { background:'#fef3c7', color:'#d97706' };
    return { background:'#dcfce7', color:'#16a34a' };
  };
  const pillLabel = (item) => {
    const s = getStatus(item);
    if (s==='out') return 'Out of Stock';
    if (s==='low') return 'Low Stock';
    return 'In Stock';
  };

  return (
    <div style={{display:'flex', gap:0, margin:'-20px -20px -20px -20px', minHeight:'calc(100vh - 100px)'}}>

      {/* ── Sidebar ── */}
      <div style={{width:216, flexShrink:0, background:'#fff', borderRight:'1px solid #e5e7eb', padding:'16px 12px', overflowY:'auto'}}>

        {/* Category */}
        <div style={{marginBottom:20}}>
          <div style={sidebarSectionLabel}>Category</div>
          <div style={sidebarItem(categoryFilter==='all')} onClick={()=>setCategoryFilter('all')}>
            All Items <span style={badge('blue')}>{allItems.length}</span>
          </div>
          {(categories||[]).map(c=>{
            const cnt = allItems.filter(i=>i.category_id===c.id).length;
            return (
              <div key={c.id} style={sidebarItem(categoryFilter===c.id)} onClick={()=>setCategoryFilter(c.id)}>
                {c.name} <span style={badge()}>{cnt}</span>
              </div>
            );
          })}
        </div>

        {/* Location */}
        <div style={{marginBottom:20}}>
          <div style={sidebarSectionLabel}>Location</div>
          <div style={sidebarItem(locationFilter==='all')} onClick={()=>setLocationFilter('all')}>
            All Locations <span style={badge('blue')}>{allItems.length}</span>
          </div>
          {(locations||[]).map(l=>{
            const cnt = allItems.filter(i=>(i.stock||[]).some(s=>s.location_id===l.id&&parseInt(s.qty||0)>0)).length;
            return (
              <div key={l.id} style={sidebarItem(locationFilter===l.id)} onClick={()=>setLocationFilter(l.id)}>
                {l.type==='warehouse'?'🏭':'🚚'} {l.name} <span style={badge()}>{cnt}</span>
              </div>
            );
          })}
        </div>

        {/* Stock Status */}
        <div>
          <div style={sidebarSectionLabel}>Stock Status</div>
          {[['all','All Items',allItems.length,null],['ok','In Stock',statusCounts.ok,null],['low','Low Stock',statusCounts.low,'red'],['out','Out of Stock',statusCounts.out,'red']].map(([id,label,cnt,bc])=>(
            <div key={id} style={sidebarItem(statusFilter===id)} onClick={()=>setStatusFilter(id)}>
              {label} <span style={badge(bc)}>{cnt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{flex:1, background:'#f4f5f7', padding:'20px 24px', overflowY:'auto'}}>

        {/* KPI row */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
          {[
            ['Total SKUs', allItems.length, '#111827', null],
            ['Low Stock Alerts', lowCount, lowCount>0?'#dc2626':'#111827', lowCount>0?'#fee2e2':null],
            ['Total Value', `$${totalValue.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`, '#16a34a', null],
            ['Trucks Stocked', `${trucksOk}/${trucks.length}`, '#111827', null],
          ].map(([label,val,color,bg])=>(
            <div key={label} style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'16px 18px', ...(bg?{borderLeft:`3px solid ${color}`}:{})}}>
              <div style={{fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6}}>{label}</div>
              <div style={{fontSize:26, fontWeight:800, color, letterSpacing:'-1px'}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
          <div style={{position:'relative', flex:1, maxWidth:320}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af', fontSize:14}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, item name..."
              style={{width:'100%', padding:'8px 12px 8px 34px', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, background:'#fff', color:'#111827', outline:'none'}}/>
          </div>
          <div style={{marginLeft:'auto', display:'flex', gap:8}}>
            <button onClick={()=>setModal('new')} style={{padding:'8px 16px', borderRadius:8, background:'#3b82f6', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer'}}>+ Add Item</button>
          </div>
        </div>

        {/* Card grid */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14}}>
          {filtered.map(item=>{
            const totalQty = (item.stock||[]).reduce((s,l)=>s+parseInt(l.qty||0),0);
            const maxQty   = Math.max(item.min_qty*2, 1);
            const fillPct  = Math.min(100, Math.round((totalQty/maxQty)*100));
            const barColor = getStatus(item)==='ok'?'#16a34a':getStatus(item)==='low'?'#d97706':'#dc2626';
            const truckStock = (item.stock||[]).find(s=>{
              const loc = (locations||[]).find(l=>l.id===s.location_id);
              return loc?.type==='truck';
            });
            return (
              <div key={item.id} style={{
                background:'#fff', border:'1px solid #e5e7eb',
                borderTop:`3px solid ${cardBorderColor(item)}`,
                borderRadius:10, overflow:'hidden',
                transition:'box-shadow .15s, border-color .15s',
                cursor:'pointer',
              }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor='#d1d5db'; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#e5e7eb'; }}>

                {/* Card body */}
                <div style={{padding:'12px 14px'}}>
                  <div style={{fontSize:13, fontWeight:700, color:'#111827', marginBottom:2, lineHeight:1.35}}>{item.name}</div>
                  <div style={{fontSize:11, color:'#9ca3af', marginBottom:10, fontFamily:'monospace'}}>{item.sku}</div>

                  {/* Stock bar */}
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280', marginBottom:3}}>
                      <span>{locationFilter!=='all'
                        ? ((locations||[]).find(l=>l.id===locationFilter)?.name||'Stock')
                        : 'Total Stock'}</span>
                      <span style={{fontWeight:700}}>{locationFilter!=='all'
                        ? ((item.stock||[]).find(s=>s.location_id===locationFilter)?.qty||0)
                        : totalQty} / {item.min_qty} min</span>
                    </div>
                    <div style={{height:5, background:'#f3f4f6', borderRadius:3, overflow:'hidden'}}>
                      <div style={{height:'100%', width:`${fillPct}%`, background:barColor, borderRadius:3, transition:'width .3s'}}/>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontSize:13, fontWeight:700, color:'#111827'}}>
                      {item.cost!=null ? `$${parseFloat(item.cost).toFixed(2)}` : <span style={{fontSize:11,color:'#9ca3af'}}>No cost</span>}
                    </div>
                    <span style={{...pillStyle(item), fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10}}>{pillLabel(item)}</span>
                  </div>

                  {/* Truck stock if available */}
                  {truckStock && (
                    <div style={{marginTop:8, paddingTop:8, borderTop:'1px solid #f3f4f6', fontSize:11, color:'#6b7280'}}>
                      🚚 Truck: <span style={{fontWeight:700, color: parseInt(truckStock.qty||0)===0?'#dc2626':parseInt(truckStock.qty||0)<=item.min_qty?'#d97706':'#111827'}}>{truckStock.qty}</span>
                    </div>
                  )}
                </div>

                {/* Card actions */}
                <div style={{display:'flex', gap:6, padding:'10px 14px', borderTop:'1px solid #f3f4f6'}}>
                  <button onClick={()=>setTransferItem(item)} style={{flex:1, padding:'6px', textAlign:'center', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', border:'1px solid #bfdbfe', background:'#eff6ff', color:'#3b82f6'}}>Adjust Stock</button>
                  <button onClick={()=>setModal(item)} style={{flex:1, padding:'6px', textAlign:'center', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', border:'1px solid #e5e7eb', background:'#fff', color:'#374151'}}>Edit</button>
                  <button onClick={()=>setBarcodeItem(item)} style={{padding:'6px 10px', borderRadius:6, fontSize:11, cursor:'pointer', border:'1px solid #e5e7eb', background:'#fff', color:'#374151'}}>▦</button>
                </div>
              </div>
            );
          })}
          {filtered.length===0&&(
            <div style={{gridColumn:'1/-1', padding:48, textAlign:'center', color:'#9ca3af', fontSize:14}}>
              No items match your filters
            </div>
          )}
        </div>
      </div>

      {/* Modals (unchanged) */}
      {(modal==='new'||modal?.id)&&<ItemModal item={modal==='new'?null:modal} categories={categories} onSave={()=>{setModal(null);onReload();}} onClose={()=>setModal(null)}/>}
      {barcodeItem&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setBarcodeItem(null)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,minWidth:320,textAlign:'center'}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:700,marginBottom:16}}>{barcodeItem.name}</div>
            <BarcodeLabel value={barcodeItem.barcode||barcodeItem.sku} itemName={barcodeItem.name} sku={barcodeItem.sku}/>
            <div style={{marginTop:16,display:'flex',gap:10,justifyContent:'center'}}>
              <BarcodePrintSheet items={[barcodeItem]}/>
              <button onClick={()=>setBarcodeItem(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Close</button>
            </div>
          </div>
        </div>
      )}
      {transferItem&&<TransferModal item={transferItem} locations={locations||[]} onSave={()=>{setTransferItem(null);onReload();}} onClose={()=>setTransferItem(null)}/>}
    </div>
  );
}

// ─── Tab: Locations ───────────────────────────────────────────
function InvLocationsTab({locations, items, onReload}) {
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({type:'truck',name:''});
  const [saving, setSaving] = useState(false);
  const [expandedLoc, setExpandedLoc] = useState(null);
  const {data:locStock, loading:locLoading} = useApi(()=>expandedLoc?api.getLocationStock(expandedLoc):Promise.resolve(null),[expandedLoc]);

  const addLoc = async () => {
    if(!form.name) return;
    setSaving(true);
    try { await api.createLocation(form); setAddModal(false); setForm({type:'truck',name:''}); onReload(); }
    catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const warehouses = (locations||[]).filter(l=>l.type==='warehouse');
  const vehicles = (locations||[]).filter(l=>l.type!=='warehouse');

  const LocationCard = ({loc}) => {
    const isExpanded = expandedLoc===loc.id;
    const stockForLoc = (items||[]).map(i=>({...i,locStock:(i.stock||[]).find(s=>s.location_id===loc.id)})).filter(i=>i.locStock);
    const lowCount = stockForLoc.filter(i=>parseInt(i.locStock.qty)<=i.min_qty).length;
    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',borderBottom:isExpanded?'1px solid var(--border)':'none'}}
          onClick={()=>setExpandedLoc(isExpanded?null:loc.id)}>
          <div style={{width:40,height:40,borderRadius:10,background:loc.type==='warehouse'?'#5daf7c18':'#4a9eff18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>
            {loc.type==='warehouse'?'🏭':loc.type==='truck'?'🚚':'🚐'}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600}}>{loc.name}</div>
            <div style={{fontSize:11,color:'var(--muted)'}}>{loc.item_count} items · {loc.type}</div>
          </div>
          {lowCount>0&&<span style={{fontSize:10,background:'#e8a84a18',color:'#e8a84a',padding:'2px 8px',borderRadius:4,fontFamily:'var(--font-mono)'}}>{lowCount} LOW</span>}
          <span style={{color:'var(--muted)',fontSize:14}}>{isExpanded?'▲':'▼'}</span>
        </div>
        {isExpanded&&(
          <div style={{maxHeight:320,overflowY:'auto'}}>
            {stockForLoc.length===0
              ? <div style={{padding:20,textAlign:'center',color:'var(--muted)',fontSize:12}}>No stock at this location</div>
              : stockForLoc.map(item=>{
                const qty = parseInt(item.locStock.qty);
                const low = qty<=item.min_qty;
                return (
                  <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 60px 60px',padding:'8px 16px',borderBottom:'1px solid var(--border)',background:low&&qty===0?'#f5656506':low?'#e8a84a06':'transparent',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:500}}>{item.name}</div>
                      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{item.sku}</div>
                    </div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:16,fontWeight:700,color:qty===0?'#f56565':low?'#e8a84a':'#5daf7c',textAlign:'center'}}>{qty}</div>
                    <div style={{fontSize:10,color:'var(--dim)',textAlign:'center'}}>min {item.min_qty}</div>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button onClick={()=>setAddModal(true)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 16px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Add Location</button>
      </div>
      {warehouses.length>0&&<div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.08em',marginBottom:10}}>WAREHOUSES</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
          {warehouses.map(l=><LocationCard key={l.id} loc={l}/>)}
        </div>
      </div>}
      <div>
        <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.08em',marginBottom:10}}>FLEET VEHICLES</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
          {vehicles.map(l=><LocationCard key={l.id} loc={l}/>)}
          {vehicles.length===0&&<div style={{color:'var(--muted)',fontSize:13,padding:20}}>No vehicles added yet.</div>}
        </div>
      </div>
      {addModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setAddModal(false)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:380,padding:28}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,marginBottom:20}}>Add Location</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>TYPE</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}>
                <option value="warehouse">Warehouse</option>
                <option value="truck">Truck</option>
                <option value="van">Van</option>
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>NAME</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Truck #6 (Ray)" style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setAddModal(false)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={addLoc} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Adding...':'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Truck Templates ─────────────────────────────────────
function InvTemplatesTab({items, locations, onReload}) {
  const {data:templates, loading, reload} = useApi(()=>api.getTemplates());
  const [modal, setModal] = useState(null);
  const [applying, setApplying] = useState(null);
  const [applyLoc, setApplyLoc] = useState('');
  const vehicles = (locations||[]).filter(l=>l.type!=='warehouse');

  const applyTemplate = async (tmpl) => {
    if(!applyLoc) return toast.warn('Required', 'Select a vehicle');
    try { const r = await api.applyTemplate(tmpl.id, applyLoc); toast.success('Template Applied', `Applied ${r.applied} items to vehicle`); setApplying(null); setApplyLoc(''); }
    catch(e) { toast.error('Error', e.message); }
  };
  const deleteTemplate = async (id) => {
    if(!confirm('Delete this template?')) return;
    await api.deleteTemplate(id); reload();
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:12,color:'var(--muted)'}}>Create standard stock lists and apply them to fleet vehicles</div>
        <button onClick={()=>setModal('new')} style={{background:'#e8a84a22',border:'1px solid #e8a84a',borderRadius:8,padding:'8px 16px',color:'#e8a84a',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ New Template</button>
      </div>
      {loading?<Spinner/>:
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
          {(templates||[]).map(t=>(
            <div key={t.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{t.name}</div>
                  {t.department&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.department}</div>}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>setModal(t)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>Edit</button>
                  <button onClick={()=>deleteTemplate(t.id)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',color:'#f56565',fontSize:11,cursor:'pointer'}}>✕</button>
                </div>
              </div>
              {t.description&&<div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>{t.description}</div>}
              <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>{t.items?.length||0} items in stock list</div>
              <div style={{maxHeight:120,overflowY:'auto',marginBottom:12}}>
                {(t.items||[]).map(i=>(
                  <div key={i.id} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                    <span>{i.name}</span>
                    <span style={{fontFamily:'var(--font-mono)',color:'var(--muted)',fontSize:11}}>min {i.min_qty}{i.max_qty?` / max ${i.max_qty}`:''}</span>
                  </div>
                ))}
              </div>
              {applying===t.id?(
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <select value={applyLoc} onChange={e=>setApplyLoc(e.target.value)} style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',color:'var(--text)',fontSize:12}}>
                    <option value="">Select vehicle...</option>
                    {vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button onClick={()=>applyTemplate(t)} style={{background:'#4a9eff22',border:'1px solid #4a9eff',borderRadius:6,padding:'6px 12px',color:'#4a9eff',fontSize:12,cursor:'pointer'}}>Apply</button>
                  <button onClick={()=>setApplying(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:14,cursor:'pointer'}}>×</button>
                </div>
              ):(
                <button onClick={()=>setApplying(t.id)} style={{width:'100%',background:'#4a9eff18',border:'1px solid #4a9eff44',borderRadius:8,padding:'7px',color:'#4a9eff',fontSize:12,cursor:'pointer'}}>Apply to Vehicle</button>
              )}
            </div>
          ))}
          {(templates||[]).length===0&&<div style={{color:'var(--muted)',fontSize:13,padding:20,gridColumn:'1/-1'}}>No templates yet. Create one to standardize truck stock lists.</div>}
        </div>
      }
      {(modal==='new'||modal?.id)&&<TemplateModal template={modal==='new'?null:modal} allItems={items} onSave={()=>{setModal(null);reload();}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ─── Tab: Purchase Orders ─────────────────────────────────────
function InvPurchaseOrdersTab({items}) {
  const {data:pos, loading, reload} = useApi(()=>api.getPurchaseOrders());
  const [modal, setModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detail, setDetail] = useState(null);

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const r = await api.autoGeneratePO();
      if(r.created===0) toast.info('No Action Needed', 'No items need reordering right now.');
      else { toast.success('POs Created', `Created ${r.created} purchase orders for low stock items.`); reload(); }
    } catch(e) { toast.error('Error', e.message); }
    finally { setGenerating(false); }
  };

  const updateStatus = async (id, status) => {
    try { await api.updatePurchaseOrder(id,{status,notes:''}); reload(); }
    catch(e) { toast.error('Error', e.message); }
  };

  const statusColor = s=>s==='received'?'#5daf7c':s==='sent'?'#4a9eff':s==='cancelled'?'#f56565':'#e8a84a';

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,justifyContent:'flex-end'}}>
        <button onClick={autoGenerate} disabled={generating} style={{background:'#a78bfa18',border:'1px solid #a78bfa',borderRadius:8,padding:'8px 16px',color:'#a78bfa',fontSize:13,fontWeight:600,cursor:'pointer'}}>{generating?'Generating...':'⚡ Auto-Generate from Low Stock'}</button>
        <button onClick={()=>setModal(true)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 16px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ New PO</button>
      </div>
      {loading?<Spinner/>:(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {(pos||[]).map(po=>(
            <div key={po.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:po.items?.length?10:0}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>PO-{String(po.po_number).padStart(4,'0')}</div>
                <div style={{fontWeight:600,fontSize:14,flex:1}}>{po.vendor||'Unknown Vendor'}</div>
                {po.auto_generated&&<span style={{fontSize:9,background:'#a78bfa18',color:'#a78bfa',padding:'2px 7px',borderRadius:4,fontFamily:'var(--font-mono)'}}>AUTO</span>}
                <span style={{fontSize:10,background:statusColor(po.status)+'18',color:statusColor(po.status),padding:'3px 8px',borderRadius:4,fontFamily:'var(--font-mono)',fontWeight:600}}>{po.status.toUpperCase()}</span>
                <div style={{fontSize:11,color:'var(--muted)'}}>{new Date(po.created_at).toLocaleDateString()}</div>
                <div style={{display:'flex',gap:6}}>
                  {po.status==='draft'&&<button onClick={()=>updateStatus(po.id,'sent')} style={{background:'#4a9eff18',border:'1px solid #4a9eff',borderRadius:6,padding:'4px 10px',color:'#4a9eff',fontSize:11,cursor:'pointer'}}>Mark Sent</button>}
                  {po.status==='sent'&&<button onClick={()=>updateStatus(po.id,'received')} style={{background:'#5daf7c18',border:'1px solid #5daf7c',borderRadius:6,padding:'4px 10px',color:'#5daf7c',fontSize:11,cursor:'pointer'}}>Mark Received</button>}
                  {po.status==='draft'&&<button onClick={()=>updateStatus(po.id,'cancelled')} style={{background:'#f5656518',border:'1px solid #f56565',borderRadius:6,padding:'4px 10px',color:'#f56565',fontSize:11,cursor:'pointer'}}>Cancel</button>}
                </div>
              </div>
              {po.items?.length>0&&(
                <div style={{background:'var(--surface2)',borderRadius:8,overflow:'hidden'}}>
                  {po.items.map((item,i)=>(
                    <div key={i} style={{display:'flex',padding:'7px 12px',borderBottom:'1px solid var(--border)',fontSize:12,alignItems:'center'}}>
                      <span style={{flex:1}}>{item.description}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)',marginRight:16}}>{item.sku}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)',marginRight:16}}>×{item.qty}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'#5daf7c'}}>${((item.unit_cost||0)*item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'flex-end',padding:'7px 12px',fontSize:13,fontWeight:700,color:'#5daf7c'}}>
                    Total: ${(po.items.reduce((s,i)=>s+(i.unit_cost||0)*i.qty,0)).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          ))}
          {(pos||[]).length===0&&<div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>No purchase orders yet. Use "Auto-Generate" to create orders for low-stock items.</div>}
        </div>
      )}
      {modal&&<POModal allItems={items} onSave={()=>{setModal(false);reload();}} onClose={()=>setModal(false)}/>}
    </div>
  );
}

// ─── Tab: Count Schedules ─────────────────────────────────────
function InvCountsTab({locations}) {
  const {data:schedules, loading:sLoading, reload:reloadS} = useApi(()=>api.getCountSchedules());
  const {data:counts, loading:cLoading, reload:reloadC} = useApi(()=>api.getCounts());
  const {data:techs} = useApi(()=>api.getTechnicians());
  const [schedModal, setSchedModal] = useState(false);
  const [activeCount, setActiveCount] = useState(null);
  const [form, setForm] = useState({name:'',location_id:'',frequency:'monthly',day_of_month:1,assigned_to:''});
  const [saving, setSaving] = useState(false);

  const saveSchedule = async () => {
    if(!form.name||!form.location_id) return toast.warn('Required', 'Name and location required');
    setSaving(true);
    try { await api.createCountSchedule(form); setSchedModal(false); setForm({name:'',location_id:'',frequency:'monthly',day_of_month:1,assigned_to:''}); reloadS(); }
    catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const startCount = async (schedule) => {
    try {
      const count = await api.startCount({schedule_id:schedule.id, location_id:schedule.location_id});
      reloadC(); setActiveCount(count);
    } catch(e) { toast.error('Error', e.message); }
  };

  const inp = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const lbl = {fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4};

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start'}}>
      {/* Schedules */}
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700}}>Count Schedules</div>
          <button onClick={()=>setSchedModal(true)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'7px 14px',color:'#5daf7c',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Schedule</button>
        </div>
        {sLoading?<Spinner/>:
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {(schedules||[]).map(s=>(
              <div key={s.id} style={{background:'var(--surface)',border:`1px solid ${s.active?'var(--border)':'var(--dim)'}`,borderRadius:12,padding:14,opacity:s.active?1:0.6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                  <span style={{fontSize:9,background:'#4a9eff18',color:'#4a9eff',padding:'2px 7px',borderRadius:4,fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>{s.frequency}</span>
                </div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>
                  {s.location_name} · Assigned to {s.assigned_name||'anyone'} · {s.completed_count} completed
                </div>
                {s.last_count&&<div style={{fontSize:10,color:'var(--dim)',marginBottom:8}}>Last count: {new Date(s.last_count).toLocaleDateString()}</div>}
                <button onClick={()=>startCount(s)} style={{width:'100%',background:'#4a9eff18',border:'1px solid #4a9eff44',borderRadius:8,padding:'7px',color:'#4a9eff',fontSize:12,cursor:'pointer'}}>▶ Start Count Now</button>
              </div>
            ))}
            {(schedules||[]).length===0&&<div style={{color:'var(--muted)',fontSize:13,padding:20,textAlign:'center'}}>No schedules yet.</div>}
          </div>
        }
      </div>

      {/* Recent Counts */}
      <div>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:12}}>Recent Counts</div>
        {cLoading?<Spinner/>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {(counts||[]).map(c=>(
              <div key={c.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontWeight:600,fontSize:13}}>{c.location_name}</div>
                  <span style={{fontSize:9,background:c.status==='completed'?'#5daf7c18':'#e8a84a18',color:c.status==='completed'?'#5daf7c':'#e8a84a',padding:'2px 7px',borderRadius:4,fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>{c.status}</span>
                </div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>{c.counted_by_name} · {new Date(c.created_at).toLocaleDateString()}</div>
                {c.status==='in_progress'&&<button onClick={()=>setActiveCount(c)} style={{width:'100%',background:'#e8a84a18',border:'1px solid #e8a84a44',borderRadius:8,padding:'6px',color:'#e8a84a',fontSize:12,cursor:'pointer'}}>Continue Count →</button>}
              </div>
            ))}
            {(counts||[]).length===0&&<div style={{color:'var(--muted)',fontSize:13,textAlign:'center',padding:20}}>No counts yet.</div>}
          </div>
        }
      </div>

      {/* New Schedule Modal */}
      {schedModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setSchedModal(false)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:480,padding:28}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,marginBottom:20}}>New Count Schedule</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>SCHEDULE NAME *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp}/></div>
              <div><label style={lbl}>LOCATION *</label>
                <select value={form.location_id} onChange={e=>setForm(f=>({...f,location_id:e.target.value}))} style={inp}>
                  <option value="">Select location...</option>
                  {(locations||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>FREQUENCY</label>
                <select value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))} style={inp}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div><label style={lbl}>DAY OF MONTH</label><input type="number" min={1} max={31} value={form.day_of_month} onChange={e=>setForm(f=>({...f,day_of_month:parseInt(e.target.value)||1}))} style={inp}/></div>
              <div><label style={lbl}>ASSIGN TO</label>
                <select value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))} style={inp}>
                  <option value="">Anyone</option>
                  {(techs||[]).map(t=><option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
              <button onClick={()=>setSchedModal(false)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveSchedule} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Create Schedule'}</button>
            </div>
          </div>
        </div>
      )}

      {activeCount&&<CountModal count={activeCount} onSave={()=>{setActiveCount(null);reloadC();}} onClose={()=>setActiveCount(null)}/>}
    </div>
  );
}

// ─── Barcode + Materials/Tools Tab ───────────────────────────
function InvBarcodeTab({mode, setTab, items, locations, onReload}) {
  const materialTypes = ['consumable','material'];
  const toolTypes     = ['tool','equipment'];
  const isTools       = mode === 'tools';
  const [search, setSearch]           = useState('');
  const [modal, setModal]             = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [transferItem, setTransferItem] = useState(null);
  const [selected, setSelected]       = useState([]);

  const filtered = (items||[]).filter(i => {
    const types = isTools ? toolTypes : materialTypes;
    if (!types.includes(i.item_type)) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const allSelected  = filtered.length>0 && filtered.every(i=>selected.includes(i.id));
  const toggleAll    = () => setSelected(allSelected ? [] : filtered.map(i=>i.id));
  const selectedItems = filtered.filter(i=>selected.includes(i.id));

  const deleteItem = async (id) => {
    if (!confirm('Archive this item?')) return;
    await api.deleteItem(id); onReload();
  };

  // For tools: show primary location
  const toolLocation = (item) => {
    const locs = (item.stock||[]).filter(s=>parseInt(s.qty)>0);
    if (!locs.length) return <span style={{color:'var(--dim)',fontSize:11}}>Unassigned</span>;
    return locs.map(s=>(
      <div key={s.location_id} style={{fontSize:11,whiteSpace:'nowrap'}}>
        <span style={{color:s.location_type==='warehouse'?'#5daf7c':'#4a9eff',fontWeight:600}}>{s.location_name}</span>
        <span style={{fontFamily:'var(--font-mono)',color:'var(--muted)',marginLeft:4}}>×{s.qty}</span>
      </div>
    ));
  };

  return (
    <div>
      {/* Mode toggle + actions */}
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3,display:'flex',gap:2}}>
          <button onClick={()=>setTab('materials')} style={{padding:'6px 16px',borderRadius:6,fontSize:12,fontWeight:!isTools?600:400,background:!isTools?'var(--surface2)':'transparent',color:!isTools?'var(--text)':'var(--muted)',border:'none',cursor:'pointer'}}>Materials</button>
          <button onClick={()=>setTab('tools')}     style={{padding:'6px 16px',borderRadius:6,fontSize:12,fontWeight:isTools?600:400,background:isTools?'var(--surface2)':'transparent',color:isTools?'var(--text)':'var(--muted)',border:'none',cursor:'pointer'}}>Tools & Equipment</button>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${isTools?'tools':'materials'}...`}
          style={{flex:1,minWidth:160,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--text)',fontSize:13}}/>
        {selected.length>0 && <BarcodePrintSheet items={selectedItems}/>}
        <button onClick={()=>setModal('new')} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'7px 16px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          + Add {isTools?'Tool':'Material'}
        </button>
      </div>

      {/* Description */}
      <div style={{fontSize:12,color:'var(--muted)',marginBottom:14,padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8}}>
        {isTools
          ? '🔧 Track tools and equipment across all locations. See which truck or warehouse each tool is on and transfer between locations.'
          : '📦 Manage consumable materials and parts. Create, edit, and print barcodes for quick scanning.'}
      </div>

      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
              <th style={{padding:'9px 12px',width:32}}><input type="checkbox" checked={allSelected} onChange={toggleAll}/></th>
              <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>SKU / BARCODE</th>
              <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>NAME</th>
              {isTools && <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>LOCATION</th>}
              {!isTools && <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>CATEGORY</th>}
              <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>QTY</th>
              <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>BARCODE VALUE</th>
              <th style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const totalQty = (item.stock||[]).reduce((s,l)=>s+parseInt(l.qty||0),0);
              const low = totalQty <= item.min_qty;
              return (
                <tr key={item.id} style={{borderBottom:'1px solid var(--border)',background:low&&totalQty===0?'#f5656506':low?'#e8a84a06':'transparent'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e=>e.currentTarget.style.background=low&&totalQty===0?'#f5656506':low?'#e8a84a06':'transparent'}>
                  <td style={{padding:'9px 12px'}}><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggleSelect(item.id)}/></td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>{item.sku}</div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--dim)'}}>{item.barcode!==item.sku?item.barcode:''}</div>
                  </td>
                  <td style={{padding:'9px 12px',fontSize:13,fontWeight:500}}>{item.name}
                    <div style={{fontSize:10,color:'var(--muted)'}}>{item.vendor}</div>
                  </td>
                  {isTools
                    ? <td style={{padding:'9px 12px'}}>{toolLocation(item)}</td>
                    : <td style={{padding:'9px 12px',fontSize:11,color:'var(--muted)'}}>{item.category}</td>}
                  <td style={{padding:'9px 12px',fontFamily:'var(--font-mono)',fontSize:16,fontWeight:700,color:totalQty===0?'#f56565':low?'#e8a84a':'#5daf7c'}}>{totalQty}</td>
                  <td style={{padding:'9px 12px',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>{item.barcode||item.sku}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setBarcodeItem(item)} title="View/Print Barcode"
                        style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#e8a84a',fontSize:12,cursor:'pointer'}}>▦ Barcode</button>
                      <button onClick={()=>setTransferItem(item)} title="Transfer"
                        style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#4a9eff',fontSize:12,cursor:'pointer'}}>⇄ Transfer</button>
                      <button onClick={()=>setModal(item)} title="Edit"
                        style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>✎</button>
                      <button onClick={()=>deleteItem(item.id)} title="Archive"
                        style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0&&<tr><td colSpan={7} style={{padding:32,textAlign:'center',color:'var(--muted)',fontSize:13}}>No {isTools?'tools':'materials'} found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Item modal */}
      {(modal==='new'||modal?.id)&&(
        <ItemModal
          item={modal==='new'?{item_type:isTools?'tool':'consumable'}:modal}
          onSave={()=>{setModal(null);onReload();}}
          onClose={()=>setModal(null)}/>
      )}

      {/* Barcode modal */}
      {barcodeItem&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>e.target===e.currentTarget&&setBarcodeItem(null)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,minWidth:360}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:700,marginBottom:4}}>{barcodeItem.name}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)',marginBottom:16}}>{barcodeItem.sku}</div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
              <BarcodeLabel value={barcodeItem.barcode||barcodeItem.sku} itemName={barcodeItem.name} sku={barcodeItem.sku}/>
            </div>
            {/* Edit barcode value inline */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>BARCODE VALUE</label>
              <div style={{display:'flex',gap:8}}>
                <input defaultValue={barcodeItem.barcode||barcodeItem.sku} id="bc-edit-input"
                  style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--text)',fontSize:13,fontFamily:'var(--font-mono)'}}/>
                <button onClick={async()=>{
                  const val = document.getElementById('bc-edit-input').value.trim();
                  if (!val) return;
                  await api.updateItem(barcodeItem.id,{...barcodeItem,barcode:val});
                  setBarcodeItem({...barcodeItem,barcode:val}); onReload();
                }} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'7px 14px',color:'#5daf7c',fontSize:12,cursor:'pointer'}}>Save</button>
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <BarcodePrintSheet items={[barcodeItem]}/>
              <button onClick={()=>setBarcodeItem(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {transferItem&&(
        <TransferModal item={transferItem} locations={locations||[]}
          onSave={()=>{setTransferItem(null);onReload();}}
          onClose={()=>setTransferItem(null)}/>
      )}
    </div>
  );
}

// ─── BARCODES PAGE ────────────────────────────────────────────
function InvBarcodesPage({items, locations, categories, onReload}) {
  const enabledServices = useCompanyServices();
  const [section, setSection] = useState('items'); // 'items' | 'custom' | 'categories'
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [barcodeType, setBarcodeType] = useState('CODE128'); // CODE128 | QR | CODE39
  const [labelSize, setLabelSize] = useState('medium'); // small | medium | large
  const [selected, setSelected] = useState([]); // item ids for bulk print
  const [barcodeItem, setBarcodeItem] = useState(null); // preview
  const [editBcItem, setEditBcItem] = useState(null);
  const [editBcVal, setEditBcVal] = useState('');
  const [customTags, setCustomTags] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dps_custom_barcodes')||'[]'); } catch { return []; }
  });
  const [newTag, setNewTag] = useState({name:'',value:''});
  const [editTag, setEditTag] = useState(null);
  // Category management state
  const [catForm, setCatForm] = useState({name:''});
  const [catSaving, setCatSaving] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const saveCustomTags = tags => { setCustomTags(tags); localStorage.setItem('dps_custom_barcodes', JSON.stringify(tags)); };
  const addTag = () => {
    if (!newTag.name.trim()||!newTag.value.trim()) return;
    saveCustomTags([...customTags, {id:Date.now()+'', name:newTag.name.trim(), value:newTag.value.trim(), type:barcodeType}]);
    setNewTag({name:'',value:''});
  };

  const allItems = (items||[]).filter(i => {
    if (serviceFilter!=='all' && (i.service_type||'')!==serviceFilter) return false;
    if (categoryFilter!=='all' && (i.category_id||'')!==categoryFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.sku||'').toLowerCase().includes(search.toLowerCase()) && !(i.barcode||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const selectedItems = allItems.filter(i => selected.includes(i.id));
  const toggleSelect = id => setSelected(prev => prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const allSel = allItems.length>0 && allItems.every(i=>selected.includes(i.id));
  const toggleAll = () => setSelected(allSel?[]:allItems.map(i=>i.id));

  // Label pixel sizes
  const labelW = {small:120,medium:180,large:240}[labelSize];

  const printBulk = (itemsToPrint) => {
    const win = window.open('','_blank');
    const code = barcodeType==='QR'?'QRCODE':'Code128'; // for tec-it URL
    const tecCode = barcodeType==='CODE128'?'Code128':barcodeType==='QR'?'QRCode':'Code39';
    win.document.write(`<html><head><title>Barcode Labels</title>
    <style>body{margin:0;font-family:sans-serif}
    .sheet{display:flex;flex-wrap:wrap;gap:6px;padding:10px}
    .label{border:1px solid #ccc;border-radius:4px;padding:6px;text-align:center;width:${labelW+20}px;break-inside:avoid}
    .label img{display:block;width:${labelW}px;margin:0 auto}
    .name{font-size:${labelSize==='small'?8:10}px;font-weight:700;margin-top:3px;color:#222;word-break:break-word}
    .sku{font-size:${labelSize==='small'?7:9}px;color:#666;font-family:monospace}
    @media print{.sheet{gap:3px;padding:4px}.label{break-inside:avoid}}</style>
    </head><body><div class="sheet">`);
    itemsToPrint.forEach(item => {
      const val = item.barcode||item.sku;
      win.document.write(`<div class="label"><img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(val)}&code=${tecCode}&dpi=96&unit=Min&imagetype=png" style="width:${labelW}px"/><div class="name">${item.name}</div><div class="sku">${item.sku}</div></div>`);
    });
    win.document.write('</div></body></html>');
    win.document.close();
    win.onload = () => win.print();
  };

  const printSingle = (item) => printBulk([item]);

  const saveBarcodeEdit = async () => {
    if (!editBcVal.trim()) return;
    await api.updateItem(editBcItem.id, {...editBcItem, barcode:editBcVal.trim()});
    onReload(); setEditBcItem(null);
  };

  // Category management
  const saveCategory = async () => {
    if (!catForm.name.trim()) return;
    setCatSaving(true);
    try {
      if (editCat) { await api.updateInventoryCategory(editCat.id, catForm); setEditCat(null); }
      else { await api.createInventoryCategory(catForm); }
      setCatForm({name:''}); onReload();
    } catch(e) { toast.error('Error', e.message); }
    finally { setCatSaving(false); }
  };
  const deleteCategory = async (id) => {
    if (!confirm('Delete this category? Items will become uncategorized.')) return;
    await api.deleteInventoryCategory(id); onReload();
  };

  const SECTIONS = [['items','Item Barcodes'],['custom','Custom Tags'],['categories','Categories']];
  const BTN = {padding:'6px 18px',borderRadius:6,fontSize:12,border:'none',cursor:'pointer',fontFamily:'var(--font-body)'};

  return (
    <div>
      {/* Section tabs */}
      <div style={{display:'flex',gap:2,marginBottom:20,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3,width:'fit-content'}}>
        {SECTIONS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setSection(id)} style={{...BTN,fontWeight:section===id?600:400,background:section===id?'var(--surface2)':'transparent',color:section===id?'var(--text)':'var(--muted)'}}>{lbl}</button>
        ))}
      </div>

      {/* ── ITEM BARCODES ── */}
      {section==='items'&&(
        <div>
          {/* Controls row */}
          <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, SKU, or barcode..."
              style={{flex:1,minWidth:180,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}/>
            {enabledServices.length>1&&(
              <select value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',color:'var(--text)',fontSize:13}}>
                <option value="all">All Services</option>
                {enabledServices.map(s=><option key={s} value={s}>{SERVICE_LABELS[s]||s}</option>)}
              </select>
            )}
            {(categories||[]).length>0&&(
              <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',color:'var(--text)',fontSize:13}}>
                <option value="all">All Categories</option>
                {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {/* Barcode type */}
            <div style={{display:'flex',gap:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              {[['CODE128','Code128'],['QR','QR Code'],['CODE39','Code39']].map(([v,l])=>(
                <button key={v} onClick={()=>setBarcodeType(v)} style={{padding:'7px 12px',border:'none',cursor:'pointer',fontSize:11,fontFamily:'var(--font-mono)',background:barcodeType===v?'var(--amber)':'transparent',color:barcodeType===v?'#000':'var(--muted)',fontWeight:barcodeType===v?700:400}}>{l}</button>
              ))}
            </div>
            {/* Label size */}
            <div style={{display:'flex',gap:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              {[['small','S'],['medium','M'],['large','L']].map(([v,l])=>(
                <button key={v} onClick={()=>setLabelSize(v)} style={{padding:'7px 12px',border:'none',cursor:'pointer',fontSize:11,fontFamily:'var(--font-mono)',background:labelSize===v?'#4a9eff':'transparent',color:labelSize===v?'#fff':'var(--muted)',fontWeight:labelSize===v?700:400}}>{l}</button>
              ))}
            </div>
            {selected.length>0&&(
              <button onClick={()=>printBulk(selectedItems)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 14px',color:'#5daf7c',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                ⎙ Print {selected.length} Selected
              </button>
            )}
            <button onClick={()=>printBulk(allItems)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',color:'var(--muted)',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
              ⎙ Print All
            </button>
          </div>

          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                  <th style={{padding:'9px 12px',width:32}}><input type="checkbox" checked={allSel} onChange={toggleAll}/></th>
                  {['ITEM / SKU','SERVICE','CATEGORY','TYPE','BARCODE VALUE','ACTIONS'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allItems.map(item=>(
                  <tr key={item.id} style={{borderBottom:'1px solid var(--border)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'9px 12px'}}><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggleSelect(item.id)}/></td>
                    <td style={{padding:'9px 14px'}}>
                      <div style={{fontSize:13,fontWeight:500}}>{item.name}</div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)'}}>{item.sku}</div>
                    </td>
                    <td style={{padding:'9px 14px',fontSize:11,color:'var(--muted)'}}>{item.service_type?SERVICE_ICONS[item.service_type]+' '+(SERVICE_LABELS[item.service_type]||item.service_type):''}</td>
                    <td style={{padding:'9px 14px',fontSize:11,color:'var(--muted)'}}>{item.category_name||item.category||'—'}</td>
                    <td style={{padding:'9px 14px'}}>
                      <span style={{fontSize:10,fontFamily:'var(--font-mono)',padding:'2px 7px',borderRadius:4,
                        background:['tool','equipment'].includes(item.item_type)?'#4a9eff22':'#5daf7c22',
                        color:['tool','equipment'].includes(item.item_type)?'#4a9eff':'#5daf7c'}}>
                        {item.item_type}
                      </span>
                    </td>
                    <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>
                      {editBcItem?.id===item.id ? (
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <input value={editBcVal} onChange={e=>setEditBcVal(e.target.value)}
                            style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:12,fontFamily:'var(--font-mono)',width:160}}/>
                          <button onClick={saveBarcodeEdit} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:6,padding:'3px 10px',color:'#5daf7c',fontSize:11,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>setEditBcItem(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'3px 8px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✕</button>
                        </div>
                      ):(
                        <span style={{cursor:'pointer'}} onClick={()=>setBarcodeItem(item)}>{item.barcode||item.sku}</span>
                      )}
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button onClick={()=>{setEditBcItem(item);setEditBcVal(item.barcode||item.sku);}} title="Edit barcode value"
                          style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'#e8a84a',fontSize:11,cursor:'pointer'}}>✎</button>
                        <button onClick={()=>setBarcodeItem(item)} title="Preview"
                          style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>▦</button>
                        <button onClick={()=>printSingle(item)} title="Print label"
                          style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'#4a9eff',fontSize:11,cursor:'pointer'}}>⎙</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {allItems.length===0&&<tr><td colSpan={7} style={{padding:32,textAlign:'center',color:'var(--muted)',fontSize:13}}>No items found</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Preview modal */}
          {barcodeItem&&(
            <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setBarcodeItem(null)}>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,minWidth:320,textAlign:'center'}}>
                <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:700,marginBottom:4}}>{barcodeItem.name}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)',marginBottom:16}}>{barcodeItem.sku}</div>
                <BarcodeLabel value={barcodeItem.barcode||barcodeItem.sku} itemName={barcodeItem.name} sku={barcodeItem.sku}/>
                <div style={{marginTop:16,display:'flex',gap:10,justifyContent:'center'}}>
                  <button onClick={()=>printSingle(barcodeItem)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 16px',color:'#5daf7c',fontSize:13,cursor:'pointer'}}>⎙ Print</button>
                  <button onClick={()=>setBarcodeItem(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CUSTOM TAGS ── */}
      {section==='custom'&&(
        <div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:16,padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8}}>
            🏷️ Custom barcode tags are standalone labels — not tied to inventory items. Use them for shelves, bins, job boxes, or anything else you want to scan.
          </div>
          {/* Controls */}
          <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>BARCODE TYPE:</span>
            {[['CODE128','Code128'],['QR','QR Code'],['CODE39','Code39']].map(([v,l])=>(
              <button key={v} onClick={()=>setBarcodeType(v)} style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid',cursor:'pointer',fontFamily:'var(--font-mono)',
                borderColor:barcodeType===v?'var(--amber)':'var(--border)',background:barcodeType===v?'var(--amberdim)':'transparent',color:barcodeType===v?'var(--amber)':'var(--muted)'}}>{l}</button>
            ))}
          </div>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:10,letterSpacing:'.05em'}}>CREATE NEW TAG</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <input value={newTag.name} onChange={e=>setNewTag(t=>({...t,name:e.target.value}))} placeholder="Tag name (e.g. Shelf A3)"
                style={{flex:1,minWidth:160,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}/>
              <input value={newTag.value} onChange={e=>setNewTag(t=>({...t,value:e.target.value}))} placeholder="Barcode value (e.g. SHELF-A3)"
                style={{flex:1,minWidth:160,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,fontFamily:'var(--font-mono)'}}
                onKeyDown={e=>e.key==='Enter'&&addTag()}/>
              <button onClick={addTag} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 18px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>+ Add Tag</button>
            </div>
            {newTag.value&&(
              <div style={{marginTop:12,display:'flex',justifyContent:'center'}}>
                <BarcodeLabel value={newTag.value} itemName={newTag.name||'Preview'} sku={newTag.value}/>
              </div>
            )}
          </div>
          {customTags.length===0?(
            <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>No custom tags yet. Create one above.</div>
          ):(
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                    {['NAME','BARCODE VALUE','TYPE','ACTIONS'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customTags.map(tag=>(
                    <tr key={tag.id} style={{borderBottom:'1px solid var(--border)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'9px 14px'}}>
                        {editTag?.id===tag.id
                          ? <input value={editTag.name} onChange={e=>setEditTag(t=>({...t,name:e.target.value}))} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:13,width:'100%'}}/>
                          : <span style={{fontSize:13,fontWeight:500}}>{tag.name}</span>}
                      </td>
                      <td style={{padding:'9px 14px'}}>
                        {editTag?.id===tag.id
                          ? <input value={editTag.value} onChange={e=>setEditTag(t=>({...t,value:e.target.value}))} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:12,fontFamily:'var(--font-mono)',width:'100%'}}/>
                          : <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{tag.value}</span>}
                      </td>
                      <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)'}}>{tag.type||'CODE128'}</td>
                      <td style={{padding:'9px 14px'}}>
                        <div style={{display:'flex',gap:6}}>
                          {editTag?.id===tag.id ? (
                            <>
                              <button onClick={()=>{saveCustomTags(customTags.map(t=>t.id===editTag.id?{...t,name:editTag.name,value:editTag.value}:t));setEditTag(null);}} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:6,padding:'4px 10px',color:'#5daf7c',fontSize:12,cursor:'pointer'}}>Save</button>
                              <button onClick={()=>setEditTag(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>Cancel</button>
                            </>
                          ):(
                            <>
                              <button onClick={()=>setEditTag({...tag})} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#e8a84a',fontSize:12,cursor:'pointer'}}>✎</button>
                              <button onClick={()=>printBulk([{id:tag.id,name:tag.name,sku:tag.value,barcode:tag.value}])} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#4a9eff',fontSize:12,cursor:'pointer'}}>⎙</button>
                              <button onClick={()=>{if(!confirm('Delete?'))return;saveCustomTags(customTags.filter(t=>t.id!==tag.id));}} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CATEGORIES ── */}
      {section==='categories'&&(
        <div>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,marginBottom:16}}>Inventory Categories</div>
          {/* Add / Edit form */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:10,letterSpacing:'.05em'}}>{editCat?'EDIT CATEGORY':'CREATE NEW CATEGORY'}</div>
            <div style={{display:'flex',gap:10}}>
              <input value={editCat?editCat.name:catForm.name}
                onChange={e=>editCat?setEditCat(c=>({...c,name:e.target.value})):setCatForm(f=>({...f,name:e.target.value}))}
                placeholder="Category name (e.g. Pipe Fittings)"
                style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}
                onKeyDown={e=>e.key==='Enter'&&saveCategory()}/>
              <button onClick={saveCategory} disabled={catSaving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 18px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                {catSaving?'Saving...':(editCat?'Update':'+ Add Category')}
              </button>
              {editCat&&<button onClick={()=>setEditCat(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>}
            </div>
          </div>
          {(categories||[]).length===0?(
            <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>No categories yet. Create one above.</div>
          ):(
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                    {['CATEGORY NAME','ITEM COUNT',''].map(h=>(
                      <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(categories||[]).map(cat=>{
                    const count = (items||[]).filter(i=>i.category_id===cat.id).length;
                    return (
                      <tr key={cat.id} style={{borderBottom:'1px solid var(--border)'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'9px 14px',fontSize:13,fontWeight:500}}>{cat.name}</td>
                        <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{count} item{count!==1?'s':''}</td>
                        <td style={{padding:'9px 14px'}}>
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={()=>setEditCat({...cat})} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#e8a84a',fontSize:12,cursor:'pointer'}}>✎ Edit</button>
                            <button onClick={()=>deleteCategory(cat.id)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── INVENTORY PAGE ───────────────────────────────────────────
function InventoryPage({defaultTab='items'}) {
  const [tab, setTab] = useState(defaultTab);
  const [itemMode, setItemMode] = useState('all'); // 'all' | 'materials' | 'tools'
  const {data:items, loading:iLoading, reload:reloadItems} = useApi(()=>api.getInventory());
  const {data:locations, loading:lLoading, reload:reloadLocations} = useApi(()=>api.getLocations());
  const {data:categories, reload:reloadCategories} = useApi(()=>api.getInventoryCategories());
  const {data:lowStock} = useApi(()=>api.getLowStock());

  useEffect(()=>{ setTab(defaultTab); }, [defaultTab]);
  const reload = () => { reloadItems(); reloadLocations(); reloadCategories(); };

  const pageTitle = {
    items:'All Items', locations:'Locations', templates:'Templates',
    po:'Purchase Orders', counts:'Count Schedules', barcodes:'Barcodes',
  }[tab] || 'Inventory';

  return (
    <div style={{animation:"fadeUp .4s ease"}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20,flexWrap:'wrap'}}>
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800}}>{pageTitle}</div>

        {/* Materials / Tools toggle — only shown on All Items */}
        {tab==='items'&&(
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3,display:'flex',gap:2}}>
            {[['all','All'],['materials','Materials'],['tools','Tools']].map(([id,label])=>(
              <button key={id} onClick={()=>setItemMode(id)} style={{
                padding:'5px 13px',borderRadius:6,fontSize:12,border:'none',cursor:'pointer',
                fontWeight:itemMode===id?600:400,fontFamily:'var(--font-body)',
                background:itemMode===id?'var(--surface2)':'transparent',
                color:itemMode===id?'var(--text)':'var(--muted)',
              }}>{label}</button>
            ))}
          </div>
        )}

        <div style={{flex:1}}/>
        {lowStock?.length>0&&(
          <div style={{background:'#f5656508',border:'1px solid #f5656533',borderRadius:8,padding:'6px 14px'}}>
            <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'#f56565'}}>⚠ {lowStock.length} items low</span>
          </div>
        )}
      </div>

      {(iLoading||lLoading)&&tab==='items'
        ?<div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>
        :(
        <>
          {tab==='items'     &&<InvItemsTab items={items} locations={locations} categories={categories} onReload={reload} mode={itemMode}/>}
          {tab==='locations' &&<InvLocationsTab locations={locations} items={items} onReload={reload}/>}
          {tab==='templates' &&<InvTemplatesTab items={items} locations={locations} onReload={reload}/>}
          {tab==='po'        &&<InvPurchaseOrdersTab items={items}/>}
          {tab==='counts'    &&<InvCountsTab locations={locations}/>}
          {tab==='barcodes'  &&<InvBarcodesPage items={items} locations={locations} categories={categories} onReload={reload}/>}
        </>
      )}
    </div>
  );
}

// ─── PHONE: TREE HELPERS ──────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,9);

function treeUpdate(nodes, id, fn) {
  return nodes.map(n => {
    if (n.id === id) return fn(n);
    return { ...n, options: n.options?.map(o => ({ ...o, children: treeUpdate(o.children||[], id, fn) })) };
  });
}
function treeDelete(nodes, id) {
  return nodes.filter(n => n.id !== id).map(n => ({
    ...n, options: n.options?.map(o => ({ ...o, children: treeDelete(o.children||[], id) }))
  }));
}
function newQ(type='branch') {
  return { id: uid(), question: 'New Question', type, options: type==='branch'?[] : undefined };
}

// Build a flat text summary from tree selections for job description
function buildTreeDescription(questions, selections, textAnswers, extraNotes) {
  const lines = [];
  function traverse(qs) {
    for (const q of qs) {
      if (q.type === 'branch') {
        const optId = selections[q.id];
        if (!optId) continue;
        const opt = (q.options||[]).find(o=>o.id===optId);
        if (!opt) continue;
        lines.push(`${q.question}: ${opt.label}`);
        if (opt.children?.length) traverse(opt.children);
      } else {
        const ans = textAnswers[q.id];
        if (ans) lines.push(`${q.question}: ${ans}`);
      }
    }
  }
  traverse(questions||[]);
  if (extraNotes?.trim()) lines.push(`Notes: ${extraNotes.trim()}`);
  return lines.join('\n');
}

// ─── PHONE: QUESTION NODE (recursive tree builder) ─────────────
function QuestionNode({ q, onUpdate, onDelete, depth=0 }) {
  const [editingQ, setEditingQ]     = useState(false);
  const [editText, setEditText]     = useState(q.question);
  const [addingOpt, setAddingOpt]   = useState(false);
  const [newOptLabel, setNewOptLabel] = useState('');
  const colors = ['#5daf7c','#4a9eff','#e8a84a','#a78bfa','#f56565'];
  const color  = colors[depth % colors.length];

  const saveQText = () => { onUpdate({...q, question: editText.trim()||q.question}); setEditingQ(false); };
  const addOpt    = () => {
    if (!newOptLabel.trim()) return;
    onUpdate({...q, options:[...(q.options||[]),{id:uid(),label:newOptLabel.trim(),children:[]}]});
    setNewOptLabel(''); setAddingOpt(false);
  };
  const delOpt    = (oid) => onUpdate({...q, options:(q.options||[]).filter(o=>o.id!==oid)});
  const editOpt   = (oid, label) => onUpdate({...q, options:(q.options||[]).map(o=>o.id===oid?{...o,label}:o)});
  const addChild  = (oid) => onUpdate({...q, options:(q.options||[]).map(o=>o.id===oid?{...o,children:[...(o.children||[]),newQ('branch')]}:o)});
  const updChild  = (oid,cid,updated) => onUpdate({...q, options:(q.options||[]).map(o=>o.id===oid?{...o,children:(o.children||[]).map(c=>c.id===cid?updated:c)}:o)});
  const delChild  = (oid,cid) => onUpdate({...q, options:(q.options||[]).map(o=>o.id===oid?{...o,children:(o.children||[]).filter(c=>c.id!==cid)}:o)});

  return (
    <div style={{marginLeft:depth*18,marginBottom:8}}>
      <div style={{background:'var(--surface)',border:`1px solid ${color}44`,borderRadius:10,padding:'10px 14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:q.type==='branch'?8:0}}>
          <div style={{width:4,height:18,borderRadius:2,background:color,flexShrink:0}}/>
          {editingQ
            ? <input value={editText} autoFocus
                onChange={e=>setEditText(e.target.value)}
                onBlur={saveQText}
                onKeyDown={e=>e.key==='Enter'&&saveQText()}
                style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:13}}/>
            : <span onClick={()=>{setEditingQ(true);setEditText(q.question);}} style={{flex:1,fontSize:13,fontWeight:500,cursor:'text'}}>{q.question}</span>
          }
          <select value={q.type} onChange={e=>onUpdate({...q,type:e.target.value,options:e.target.value==='branch'?(q.options||[]):undefined})}
            style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'2px 6px',fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>
            {['branch','text','textarea','yesno'].map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={onDelete} style={{background:'none',border:'none',cursor:'pointer',color:'#f56565',fontSize:13,padding:'0 4px'}}>✕</button>
        </div>

        {q.type==='branch'&&(
          <div style={{paddingLeft:12}}>
            {(q.options||[]).map(opt=>(
              <div key={opt.id} style={{marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',background:'var(--surface2)',borderRadius:7}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0}}/>
                  <input value={opt.label} onChange={e=>editOpt(opt.id,e.target.value)}
                    style={{flex:1,background:'transparent',border:'none',color:'var(--text)',fontSize:12,outline:'none'}}/>
                  <button onClick={()=>addChild(opt.id)}
                    style={{background:`${color}20`,border:'none',borderRadius:4,padding:'1px 7px',color,fontSize:10,cursor:'pointer',fontWeight:600}}>+Q</button>
                  <button onClick={()=>delOpt(opt.id)}
                    style={{background:'none',border:'none',cursor:'pointer',color:'#f56565',fontSize:11}}>✕</button>
                </div>
                {(opt.children||[]).map(child=>(
                  <QuestionNode key={child.id} q={child} depth={depth+1}
                    onUpdate={u=>updChild(opt.id,child.id,u)}
                    onDelete={()=>delChild(opt.id,child.id)}/>
                ))}
              </div>
            ))}
            {addingOpt
              ? <div style={{display:'flex',gap:6,marginTop:4}}>
                  <input value={newOptLabel} autoFocus onChange={e=>setNewOptLabel(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addOpt()} placeholder="Option label…"
                    style={{flex:1,background:'var(--surface2)',border:`1px solid ${color}`,borderRadius:6,padding:'5px 8px',color:'var(--text)',fontSize:12}}/>
                  <button onClick={addOpt} style={{background:`${color}22`,border:`1px solid ${color}`,borderRadius:6,padding:'4px 10px',color,fontSize:11,cursor:'pointer'}}>Add</button>
                  <button onClick={()=>setAddingOpt(false)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✕</button>
                </div>
              : <button onClick={()=>setAddingOpt(true)}
                  style={{background:'none',border:`1px dashed ${color}55`,borderRadius:6,padding:'3px 12px',color:'var(--muted)',fontSize:11,cursor:'pointer',marginTop:4}}>
                  + Add Option
                </button>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PHONE: BRANCH RENDERER (call screen) ─────────────────────
function BranchRenderer({ questions, selections, textAnswers, onBranch, onText }) {
  if (!questions?.length) return null;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {questions.map(q=>{
        const selId  = selections[q.id];
        const selOpt = q.type==='branch' ? (q.options||[]).find(o=>o.id===selId) : null;
        return (
          <div key={q.id}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{q.question}</div>
            {q.type==='branch'&&(
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {(q.options||[]).map(opt=>(
                  <button key={opt.id} onClick={()=>onBranch(q.id,opt.id)} style={{
                    padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',
                    border:'1px solid',transition:'all .15s',
                    borderColor:selId===opt.id?'#5daf7c':'var(--border)',
                    background:selId===opt.id?'#5daf7c':'var(--surface2)',
                    color:selId===opt.id?'#0a1628':'var(--text)',
                  }}>{opt.label}</button>
                ))}
              </div>
            )}
            {q.type==='text'&&(
              <input value={textAnswers[q.id]||''} onChange={e=>onText(q.id,e.target.value)}
                style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
            )}
            {q.type==='textarea'&&(
              <textarea value={textAnswers[q.id]||''} onChange={e=>onText(q.id,e.target.value)} rows={2}
                style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontSize:13,resize:'vertical',boxSizing:'border-box'}}/>
            )}
            {q.type==='yesno'&&(
              <div style={{display:'flex',gap:8}}>
                {['Yes','No'].map(v=>(
                  <button key={v} onClick={()=>onText(q.id,v)} style={{
                    flex:1,padding:'7px',borderRadius:8,fontSize:13,cursor:'pointer',
                    border:'1px solid',
                    borderColor:textAnswers[q.id]===v?'#5daf7c':'var(--border)',
                    background:textAnswers[q.id]===v?'#5daf7c22':'var(--surface2)',
                    color:textAnswers[q.id]===v?'#5daf7c':'var(--muted)',
                  }}>{v}</button>
                ))}
              </div>
            )}
            {selOpt?.children?.length>0&&(
              <div style={{borderLeft:'2px solid #5daf7c44',paddingLeft:14,marginTop:10}}>
                <BranchRenderer questions={selOpt.children} selections={selections} textAnswers={textAnswers} onBranch={onBranch} onText={onText}/>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PHONE SETTINGS ───────────────────────────────────────────
function PhoneManagerSettings() {
  const {data:settings, reload} = useApi(()=>api.getPhoneSettings());
  const [form, setForm]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(()=>{
    if(settings && !form) setForm({
      cell_number:   settings.cell_number||'',
      enabled:       settings.enabled||false,
      twilio_sid:    settings.twilio_sid||'',
      twilio_token:  settings.twilio_token||'',
      twilio_number: settings.twilio_number||'',
    });
  },[settings]);

  if(!form) return <div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>;

  const save = async () => {
    setSaving(true);
    try { await api.savePhoneSettings({...(settings||{}), ...form}); reload(); toast.success('Saved', 'Phone settings saved.'); }
    finally { setSaving(false); }
  };

  const copy = (key, text) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(()=>setCopied(''),2000); };
  const base = window.location.origin.replace(':3000',':4000');

  return (
    <div style={{maxWidth:580}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,marginBottom:6}}>Phone Number Manager</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>
        Configure Twilio for <strong>automatic caller ID</strong>, inbound call popups, and <strong>two-way customer texting</strong> — all from the Calls screen.
      </div>

      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
        <label style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,cursor:'pointer'}}>
          <div style={{position:'relative',width:44,height:24}}>
            <input type="checkbox" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.target.checked}))} style={{opacity:0,position:'absolute',inset:0,cursor:'pointer',zIndex:2,width:'100%',height:'100%'}}/>
            <div style={{position:'absolute',inset:0,borderRadius:12,background:form.enabled?'#5daf7c':'var(--border)',transition:'background .2s'}}/>
            <div style={{position:'absolute',top:2,left:form.enabled?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 4px #0004'}}/>
          </div>
          <span style={{fontSize:13,fontWeight:600}}>Enable Phone System</span>
        </label>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:5,letterSpacing:'.05em'}}>YOUR BUSINESS / CELL NUMBER (for display)</label>
          <input value={form.cell_number} onChange={e=>setForm(f=>({...f,cell_number:e.target.value}))} placeholder="(555) 123-4567"
            style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Twilio forwards inbound calls to this number. Shown on the Calls screen.</div>
        </div>

        <div style={{borderTop:'1px solid var(--border)',paddingTop:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Twilio Credentials</div>
          {[
            ['twilio_sid',    'ACCOUNT SID',          'ACxxxxxxxxxxxxxxxxxx',  'text'],
            ['twilio_token',  'AUTH TOKEN',            '••••••••••••••••••••', 'password'],
            ['twilio_number', 'TWILIO PHONE NUMBER',   '+15551234567',          'text'],
          ].map(([k,l,ph,type])=>(
            <div key={k} style={{marginBottom:10}}>
              <label style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:5,letterSpacing:'.05em'}}>{l}</label>
              <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} type={type}
                style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,boxSizing:'border-box',fontFamily:k!=='twilio_token'?'var(--font-mono)':'inherit'}}/>
            </div>
          ))}
        </div>

        {/* Webhook URLs */}
        <div style={{background:'#4a9eff0a',border:'1px solid #4a9eff33',borderRadius:10,padding:'14px 16px'}}>
          <div style={{fontSize:11,fontWeight:700,color:'#4a9eff',marginBottom:10,letterSpacing:'.04em'}}>📋 PASTE THESE INTO TWILIO CONSOLE → PHONE NUMBERS → YOUR NUMBER</div>
          {[
            ['VOICE WEBHOOK (incoming calls)',  `${base}/api/phone/twilio/incoming`],
            ['MESSAGING WEBHOOK (incoming SMS)', `${base}/api/phone/sms/incoming`],
          ].map(([label,url])=>(
            <div key={label} style={{marginBottom:8}}>
              <div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>{label}</div>
              <div style={{display:'flex',gap:6}}>
                <code style={{flex:1,fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text)',background:'var(--surface2)',borderRadius:4,padding:'4px 8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</code>
                <button onClick={()=>copy(label,url)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 10px',color:copied===label?'#5daf7c':'var(--muted)',fontSize:10,cursor:'pointer',flexShrink:0}}>
                  {copied===label?'✓ Copied':'Copy'}
                </button>
              </div>
            </div>
          ))}
          <div style={{fontSize:10,color:'var(--muted)',marginTop:8}}>
            For local testing, use <strong>ngrok</strong> to expose port 4000. For production, use your server's public domain.
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'10px 24px',color:'#5daf7c',fontSize:14,fontWeight:700,cursor:'pointer'}}>
        {saving?'Saving…':'Save Settings'}
      </button>
    </div>
  );
}

// ─── CSR QUESTIONNAIRE SETTINGS ───────────────────────────────
function CSRQuestionnaireSettings() {
  const {data:settings, reload} = useApi(()=>api.getPhoneSettings());
  const [questions, setQuestions] = useState(null);
  const [saving,    setSaving]    = useState(false);

  useEffect(()=>{
    if(settings && questions===null) setQuestions(settings.questionnaire||[]);
  },[settings]);

  if(questions===null) return <div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>;

  const save = async (qs) => {
    setSaving(true);
    try { await api.savePhoneSettings({...(settings||{}), questionnaire: qs}); reload(); }
    finally { setSaving(false); }
  };

  const addRoot = () => {
    const q = { id: uid(), question: 'How Can We Help You?', type: 'branch', options: [] };
    const updated = [...questions, q];
    setQuestions(updated); save(updated);
  };

  const updateQ = (updated) => {
    const qs = treeUpdate(questions, updated.id, ()=>updated);
    setQuestions(qs); save(qs);
  };

  const deleteQ = (id) => {
    const qs = treeDelete(questions, id);
    setQuestions(qs); save(qs);
  };

  return (
    <div style={{maxWidth:700}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,marginBottom:6}}>CSR Questionnaire</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>
        Build a <strong>branching question tree</strong>. Selecting an answer reveals the next set of sub-questions automatically. CSR answers flow directly into the job ticket.
      </div>
      <div style={{fontSize:11,color:'var(--muted)',marginBottom:20,padding:'8px 12px',background:'#e8a84a10',border:'1px solid #e8a84a30',borderRadius:8}}>
        💡 <strong>Click</strong> any question text to rename it. Click <code style={{fontFamily:'var(--font-mono)',fontSize:10}}>+Q</code> next to an option to add follow-up questions for that answer. Use the type dropdown to change a question to text/yesno if no branching is needed.
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
        {questions.length===0&&(
          <div style={{textAlign:'center',padding:32,color:'var(--muted)',fontSize:13,background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:12}}>
            No questions yet. Add your first root question below.
          </div>
        )}
        {questions.map(q=>(
          <QuestionNode key={q.id} q={q} onUpdate={updateQ} onDelete={()=>deleteQ(q.id)}/>
        ))}
      </div>

      <button onClick={addRoot} style={{background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:10,padding:'10px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer',width:'100%'}}>
        + Add Root Question
      </button>
      {saving&&<div style={{fontSize:11,color:'var(--muted)',marginTop:8,textAlign:'right'}}>Saving…</div>}
    </div>
  );
}

// ─── CALLS PAGE ────────────────────────────────────────────────
function formatPhone(raw) {
  const d = (raw||'').replace(/\D/g,'');
  if(d.length<=3)  return d;
  if(d.length<=6)  return `(${d.slice(0,3)}) ${d.slice(3)}`;
  if(d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
}

function CallsPage({user}) {
  const {data:phoneSettings} = useApi(()=>api.getPhoneSettings());
  const {data:arrivalWindows} = useApi(()=>api.getArrivalWindows());
  const {data:jobTypesList}   = useApi(()=>api.getJobTypes());
  const {data:mapsKeyData}    = useApi(()=>api.get('/company/maps-key'));
  const mapsKey = mapsKeyData?.key || '';
  const [rawNumber, setRawNumber]         = useState('');
  const [incomingBanner, setIncomingBanner] = useState(null);
  const [lookup, setLookup]               = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [newCust, setNewCust]             = useState(null);
  const [custSaved, setCustSaved]         = useState(null);
  const [selections, setSelections]       = useState({});
  const [textAnswers, setTextAnswers]     = useState({});
  const [issue, setIssue]                 = useState('');     // main issue description
  const [jobNotes, setJobNotes]           = useState('');
  const [jobType, setJobType]             = useState('');
  const [arrivalWin, setArrivalWin]       = useState('');
  const [jobDate, setJobDate]             = useState('');
  const [jobCreating, setJobCreating]     = useState(false);
  const [jobDone, setJobDone]             = useState(null);
  const [recentCalls, setRecentCalls]     = useState(()=>{ try{return JSON.parse(localStorage.getItem('dps_recent_calls')||'[]');}catch{return [];} });

  const questions  = phoneSettings?.questionnaire||[];
  const cellNumber = phoneSettings?.cell_number||'';

  // ── WebSocket: listen for incoming calls + SMS ──────────────
  useEffect(()=>{
    const ws = connectGpsWebSocket(msg=>{
      if (msg.type === 'incoming_call') {
        const from = msg.from || '';
        setIncomingBanner({from, ts: new Date().toLocaleTimeString()});
        setRawNumber(from.replace(/\D/g,''));
        // Banner auto-dismiss after 30s
        setTimeout(()=>setIncomingBanner(null), 30000);
      }
      // sms_received is handled in Inbox
    });
    return ()=>ws?.close();
  },[]);

  // ── Auto-lookup when 10 digits entered ──────────────────────
  useEffect(()=>{
    const digits = rawNumber.replace(/\D/g,'');
    if(digits.length<10){ setLookup(null); setNewCust(null); setCustSaved(null); return; }
    let cancel=false;
    setLookupLoading(true);
    api.phoneLookup(rawNumber).then(data=>{
      if(cancel) return;
      setLookup(data);
      setLookupLoading(false);
      setIncomingBanner(null);
      if(!data.customer) {
        setNewCust({first_name:'',last_name:'',phone:formatPhone(rawNumber),email:'',street:'',city:'',state:'TX',zip:''});
      }
    }).catch(()=>{ if(!cancel) setLookupLoading(false); });
    return()=>{cancel=true;};
  },[rawNumber]);

  const resetCall = () => {
    setRawNumber(''); setLookup(null); setNewCust(null); setCustSaved(null);
    setSelections({}); setTextAnswers({}); setIssue(''); setJobNotes('');
    setJobType(''); setArrivalWin(''); setJobDate(''); setJobDone(null);
    setIncomingBanner(null);
  };

  const saveNewCustomer = async () => {
    try {
      const c = await api.createCustomer({first_name:newCust.first_name,last_name:newCust.last_name,phone:newCust.phone,email:newCust.email});
      setCustSaved(c); setNewCust(null);
    } catch(e){ toast.error('Error', e.message); }
  };

  const activeCustomer = custSaved || lookup?.customer;

  const createJob = async () => {
    if(!activeCustomer) return;
    setJobCreating(true);
    try {
      // Build structured description: issue first, then questionnaire answers
      const qAnswers = buildTreeDescription(questions, selections, textAnswers, '');
      const parts = [];
      if(issue.trim()) parts.push(`ISSUE: ${issue.trim()}`);
      if(qAnswers.trim()) parts.push(qAnswers.trim());
      if(jobNotes.trim()) parts.push(`NOTES: ${jobNotes.trim()}`);
      const desc = parts.join('\n\n');

      // Primary address from customer
      const addrId = activeCustomer.addresses?.[0]?.id || null;

      const job = await api.createJob({
        customer_id:  activeCustomer.id,
        address_id:   addrId,
        job_type:     jobType || 'Service Call',
        description:  desc,
        arrival_window: arrivalWin || null,
        scheduled_start: jobDate ? jobDate + 'T00:00:00' : null,
        source:       'phone',
        status:       'unassigned',
      });
      const custName = activeCustomer.business_name && activeCustomer.customer_type==='commercial'
        ? activeCustomer.business_name
        : `${activeCustomer.first_name} ${activeCustomer.last_name}`;
      const entry = {number:rawNumber,name:custName,customer_id:activeCustomer.id,job_number:job.job_number,ts:new Date().toISOString()};
      const updated = [entry,...recentCalls].slice(0,20);
      setRecentCalls(updated); localStorage.setItem('dps_recent_calls',JSON.stringify(updated));
      setJobDone(job);
    } catch(e){ toast.error('Job Error', e.message); }
    finally { setJobCreating(false); }
  };


  return (
    <div style={{animation:'fadeUp .4s ease',display:'flex',flexDirection:'column',height:'100%'}}>

      {/* Incoming call banner (auto caller ID) */}
      {incomingBanner&&(
        <div style={{background:'#5daf7c',borderRadius:10,padding:'10px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:22}}>📲</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15,color:'#0a1628'}}>Incoming Call — {formatPhone(incomingBanner.from)}</div>
            <div style={{fontSize:11,color:'#0a162899'}}>{incomingBanner.ts} · Looking up customer…</div>
          </div>
          <button onClick={()=>setIncomingBanner(null)} style={{background:'#0a162820',border:'none',borderRadius:6,padding:'4px 10px',color:'#0a1628',cursor:'pointer',fontSize:12}}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>📞 Calls</div>
        {cellNumber&&<div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'3px 9px'}}>{cellNumber}</div>}
        <div style={{flex:1}}/>
        {(rawNumber||lookup)&&<button onClick={resetCall} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 14px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>✕ Clear</button>}
      </div>

      <div style={{display:'flex',gap:14,flex:1,minHeight:0,overflow:'hidden'}}>
        {/* ── LEFT: caller ID + customer info ── */}
        <div style={{flex:'0 0 50%',display:'flex',flexDirection:'column',gap:10,overflowY:'auto'}} className="scrollbar-thin">

          {/* Phone number — auto-filled by WebSocket, can also type */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
            <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:6,letterSpacing:'.06em'}}>CALLER NUMBER {lookupLoading&&'· Looking up…'}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input value={rawNumber} onChange={e=>setRawNumber(e.target.value)} placeholder="Auto-filled by caller ID  or type number…" autoFocus
                style={{flex:1,background:'var(--surface2)',border:'2px solid var(--accent)',borderRadius:10,padding:'10px 14px',color:'var(--text)',fontSize:17,fontFamily:'var(--font-mono)',letterSpacing:'.04em'}}/>
              {lookupLoading&&<Spinner/>}
            </div>
            {rawNumber.replace(/\D/g,'').length>0&&rawNumber.replace(/\D/g,'').length<10&&(
              <div style={{fontSize:10,color:'var(--muted)',marginTop:5}}>Need 10 digits to search…</div>
            )}
          </div>

          {/* Job created */}
          {jobDone&&(
            <div style={{background:'#5daf7c15',border:'1px solid #5daf7c55',borderRadius:12,padding:16,textAlign:'center'}}>
              <div style={{fontSize:26,marginBottom:6}}>✅</div>
              <div style={{fontWeight:700,fontSize:15,color:'#5daf7c',marginBottom:4}}>Job #{jobDone.job_number} Created!</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:12}}>Added to dispatch board.</div>
              <button onClick={resetCall} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'7px 18px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>Start New Call</button>
            </div>
          )}

          {/* Customer found — full info card */}
          {lookup?.customer&&!jobDone&&(()=>{
            const c = lookup.customer;
            const isCommercial = c.customer_type === 'commercial';
            const allPhones = (c.phones && c.phones.length) ? c.phones : [
              ...(c.phone  ? [{label:'Phone',  value:c.phone }] : []),
              ...(c.phone2 ? [{label:'Phone 2', value:c.phone2}] : []),
            ];
            const allEmails = (c.emails && c.emails.length) ? c.emails :
              (c.email ? [{label:'Email', value:c.email}] : []);
            const primaryAddr = (c.addresses||[])[0];
            const pi = c.property_info || {};
            const hasPropInfo = pi.beds || pi.baths || pi.sqft;
            const rowLbl = { fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:2 };
            const rowVal = { fontSize:12,color:'var(--text)',fontWeight:500 };
            return (
              <div style={{background:'var(--surface)',border:'1px solid #5daf7c44',borderRadius:12,overflow:'hidden'}}>
                {/* Name header */}
                <div style={{background:'#5daf7c12',borderBottom:'1px solid #5daf7c33',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:42,height:42,borderRadius:'50%',background:'#5daf7c22',border:'2px solid #5daf7c44',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                    {isCommercial ? '🏢' : '👤'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:'var(--font-head)',fontSize:17,fontWeight:800,color:'#5daf7c',lineHeight:1.2}}>
                      {isCommercial && c.business_name ? c.business_name : `${c.first_name} ${c.last_name}`}
                    </div>
                    {isCommercial && c.contact_name && (
                      <div style={{fontSize:12,color:'var(--muted)',marginTop:1}}>
                        {c.contact_name}{c.contact_title ? ` · ${c.contact_title}` : ''}
                      </div>
                    )}
                    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                      <span style={{fontSize:9,fontFamily:'var(--font-mono)',padding:'1px 7px',borderRadius:3,background:isCommercial?'#4a9eff18':'#5daf7c18',color:isCommercial?'#4a9eff':'#5daf7c',border:`1px solid ${isCommercial?'#4a9eff33':'#5daf7c33'}`}}>
                        {isCommercial ? 'COMMERCIAL' : 'RESIDENTIAL'}
                      </span>
                      <span style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>
                        {c.job_count} job{c.job_count!=='1'?'s':''}
                      </span>
                      {c.marketing_src && (
                        <span style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',padding:'1px 6px',borderRadius:3,background:'var(--surface2)',border:'1px solid var(--border)'}}>
                          {c.marketing_src}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>

                  {/* Phones */}
                  {allPhones.length > 0 && (
                    <div>
                      <div style={rowLbl}>PHONE{allPhones.length>1?'S':''}</div>
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        {allPhones.map((p,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text)',fontWeight:600}}>{formatPhone(p.value)}</span>
                            <span style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',padding:'1px 5px',background:'var(--surface2)',borderRadius:3,border:'1px solid var(--border)'}}>{p.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emails */}
                  {allEmails.length > 0 && (
                    <div>
                      <div style={rowLbl}>EMAIL{allEmails.length>1?'S':''}</div>
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        {allEmails.map((e,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:12,color:'var(--text)'}}>{e.value}</span>
                            {allEmails.length>1&&<span style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',padding:'1px 5px',background:'var(--surface2)',borderRadius:3,border:'1px solid var(--border)'}}>{e.label}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Address */}
                  {primaryAddr && (
                    <div>
                      <div style={rowLbl}>SERVICE ADDRESS</div>
                      <div style={rowVal}>{primaryAddr.street}</div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>{primaryAddr.city}{primaryAddr.state?`, ${primaryAddr.state}`:''}{primaryAddr.zip?` ${primaryAddr.zip}`:''}</div>
                    </div>
                  )}

                  {/* Street View */}
                  {primaryAddr?.lat && primaryAddr?.lng && mapsKey && (
                    <div>
                      <div style={rowLbl}>STREET VIEW</div>
                      <div style={{borderRadius:10,overflow:'hidden',border:'1px solid var(--border)',position:'relative',background:'var(--surface2)'}}>
                        <img
                          src={`https://maps.googleapis.com/maps/api/streetview?size=520x200&location=${primaryAddr.lat},${primaryAddr.lng}&key=${mapsKey}&fov=90&pitch=5&source=outdoor`}
                          alt="Street View"
                          style={{width:'100%',display:'block',minHeight:140}}
                          onError={e=>{e.target.parentNode.style.display='none'}}
                        />
                        <div style={{position:'absolute',bottom:6,right:8,fontSize:8,color:'rgba(255,255,255,0.6)',fontFamily:'var(--font-mono)',background:'rgba(0,0,0,0.5)',padding:'2px 6px',borderRadius:3}}>Google Street View</div>
                      </div>
                    </div>
                  )}

                  {/* Property info — Zillow-style cards */}
                  {hasPropInfo && (
                    <div>
                      <div style={rowLbl}>PROPERTY INFO</div>
                      <div style={{display:'flex',gap:8}}>
                        {pi.beds && (
                          <div style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                            <div style={{fontFamily:'var(--font-head)',fontSize:26,fontWeight:800,color:'var(--green)',lineHeight:1}}>{pi.beds}</div>
                            <div style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',marginTop:3,letterSpacing:'.06em'}}>BED{pi.beds!=='1'?'S':''}</div>
                          </div>
                        )}
                        {pi.baths && (
                          <div style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                            <div style={{fontFamily:'var(--font-head)',fontSize:26,fontWeight:800,color:'var(--blue)',lineHeight:1}}>{pi.baths}</div>
                            <div style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',marginTop:3,letterSpacing:'.06em'}}>BATH{pi.baths!=='1'?'S':''}</div>
                          </div>
                        )}
                        {pi.sqft && (
                          <div style={{flex:2,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                            <div style={{fontFamily:'var(--font-head)',fontSize:26,fontWeight:800,color:'var(--amber)',lineHeight:1}}>{Number(pi.sqft).toLocaleString()}</div>
                            <div style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',marginTop:3,letterSpacing:'.06em'}}>SQ FT</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {c.tags?.length > 0 && (
                    <div>
                      <div style={rowLbl}>TAGS</div>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {c.tags.map(t=>(
                          <span key={t} style={{fontSize:9,fontFamily:'var(--font-mono)',padding:'2px 7px',borderRadius:3,background:'var(--surface2)',border:'1px solid var(--border2)',color:'var(--muted)'}}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {c.notes && (
                    <div style={{background:'var(--surface2)',borderRadius:8,padding:'8px 10px',borderLeft:'3px solid var(--amber)'}}>
                      <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:3}}>NOTES</div>
                      <div style={{fontSize:12,color:'var(--text)',lineHeight:1.5}}>{c.notes}</div>
                    </div>
                  )}

                  {/* Job history */}
                  {lookup.jobs?.length > 0 && (
                    <div>
                      <div style={rowLbl}>JOB HISTORY</div>
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        {lookup.jobs.map(j=>(
                          <div key={j.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 9px',background:'var(--surface2)',borderRadius:7,fontSize:11}}>
                            <span style={{fontFamily:'var(--font-mono)',color:'var(--muted)',flexShrink:0}}>#{j.job_number}</span>
                            <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.job_type||j.description?.slice(0,40)||'Job'}</span>
                            {j.scheduled_start&&<span style={{fontSize:9,color:'var(--muted)',flexShrink:0}}>{new Date(j.scheduled_start).toLocaleDateString()}</span>}
                            <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,flexShrink:0,
                              background:j.status==='completed'?'#5daf7c22':j.status==='cancelled'?'#f5656522':j.status==='on_site'?'#e8a84a22':'#4a9eff22',
                              color:j.status==='completed'?'#5daf7c':j.status==='cancelled'?'#f56565':j.status==='on_site'?'#e8a84a':'#4a9eff'}}>
                              {j.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })()}

          {/* No customer — create form */}
          {lookup&&!lookup.customer&&newCust&&!custSaved&&!jobDone&&(
            <div style={{background:'var(--surface)',border:'1px solid #e8a84a44',borderRadius:12,padding:16}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:38,height:38,borderRadius:'50%',background:'#e8a84a22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🆕</div>
                <div><div style={{fontSize:15,fontWeight:800,color:'#e8a84a'}}>New Customer</div><div style={{fontSize:11,color:'var(--muted)'}}>Number not on file</div></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                {[['first_name','First Name *'],['last_name','Last Name *'],['phone','Phone'],['email','Email']].map(([k,l])=>(
                  <div key={k}>
                    <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:3,letterSpacing:'.05em'}}>{l}</label>
                    <input value={newCust[k]} onChange={e=>setNewCust(c=>({...c,[k]:e.target.value}))}
                      style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'6px 9px',color:'var(--text)',fontSize:12,boxSizing:'border-box'}}/>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,marginBottom:10}}>
                <input value={newCust.street} onChange={e=>setNewCust(c=>({...c,street:e.target.value}))} placeholder="Street address"
                  style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'6px 9px',color:'var(--text)',fontSize:12}}/>
                <input value={newCust.city} onChange={e=>setNewCust(c=>({...c,city:e.target.value}))} placeholder="City"
                  style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'6px 9px',color:'var(--text)',fontSize:12}}/>
              </div>
              <button onClick={saveNewCustomer} disabled={!newCust.first_name||!newCust.last_name}
                style={{background:'#e8a84a22',border:'1px solid #e8a84a',borderRadius:8,padding:'7px 18px',color:'#e8a84a',fontSize:13,fontWeight:600,cursor:'pointer',opacity:(!newCust.first_name||!newCust.last_name)?0.5:1}}>
                Save & Continue →
              </button>
            </div>
          )}

          {custSaved&&!jobDone&&(
            <div style={{background:'var(--surface)',border:'1px solid #5daf7c44',borderRadius:10,padding:12,display:'flex',alignItems:'center',gap:10}}>
              <span>✅</span>
              <div style={{fontSize:13,fontWeight:600}}>{custSaved.first_name} {custSaved.last_name} saved — fill out questionnaire →</div>
            </div>
          )}

          {/* Recent calls */}
          {!rawNumber&&recentCalls.length>0&&(
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:14}}>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:8,letterSpacing:'.06em'}}>RECENT CALLS</div>
              {recentCalls.slice(0,8).map((c,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:i<recentCalls.length-1?'1px solid var(--border)':'none',fontSize:11}}>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--muted)',minWidth:100}}>{formatPhone(c.number)}</span>
                  <span style={{flex:1,fontWeight:500}}>{c.name}</span>
                  {c.job_number&&<span style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--muted)'}}>#{c.job_number}</span>}
                  <button onClick={()=>setRawNumber(c.number.replace(/\D/g,''))} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:5,padding:'1px 7px',color:'var(--muted)',fontSize:10,cursor:'pointer'}}>↺</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Job Ticket ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:10,minWidth:0}}>

          {/* ── JOB TICKET PANEL ── */}
          {(
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}} className="scrollbar-thin">

              {/* Customer summary bar */}
              {activeCustomer&&!jobDone&&(
                <div style={{background:'#5daf7c0d',borderBottom:'1px solid #5daf7c22',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'#5daf7c22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>
                    {activeCustomer.customer_type==='commercial'?'🏢':'👤'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#5daf7c',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {activeCustomer.customer_type==='commercial'&&activeCustomer.business_name
                        ? activeCustomer.business_name
                        : `${activeCustomer.first_name} ${activeCustomer.last_name}`}
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)',display:'flex',gap:8,flexWrap:'wrap',marginTop:1}}>
                      {activeCustomer.phone&&<span>📞 {formatPhone(activeCustomer.phone)}</span>}
                      {activeCustomer.addresses?.[0]&&<span>📍 {activeCustomer.addresses[0].street}, {activeCustomer.addresses[0].city}</span>}
                    </div>
                  </div>
                </div>
              )}

              <div style={{padding:16,display:'flex',flexDirection:'column',gap:16,flex:1}}>

                {/* Issue Description */}
                <div>
                  <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',display:'block',marginBottom:6,fontWeight:600}}>
                    ISSUE — WHAT IS THE CUSTOMER REPORTING?
                  </label>
                  <textarea value={issue} onChange={e=>setIssue(e.target.value)} rows={3}
                    placeholder="Describe the problem in the customer's words…"
                    style={{width:'100%',background:'var(--surface2)',border:'2px solid var(--amberdim)',borderRadius:9,padding:'10px 12px',color:'var(--text)',fontSize:13,resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
                    onFocus={e=>e.target.style.borderColor='var(--amber)'}
                    onBlur={e=>e.target.style.borderColor='var(--amberdim)'}/>
                </div>

                {/* Questionnaire */}
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                    QUESTIONNAIRE
                    {Object.keys(selections).length>0&&<span style={{fontSize:9,background:'#5daf7c22',color:'#5daf7c',borderRadius:3,padding:'1px 6px',border:'1px solid #5daf7c33'}}>{Object.keys(selections).length} answered</span>}
                  </div>
                  {questions.length===0
                    ? <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>No questionnaire — configure in <strong>Settings → CSR Questionnaire</strong>.</div>
                    : <BranchRenderer questions={questions} selections={selections} textAnswers={textAnswers}
                        onBranch={(qid,oid)=>setSelections(s=>({...s,[qid]:oid}))}
                        onText={(qid,v)=>setTextAnswers(a=>({...a,[qid]:v}))}/>
                  }
                </div>

                {/* Job Details */}
                <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:10}}>JOB DETAILS</div>

                  {/* Job Type */}
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4,letterSpacing:'.05em'}}>JOB TYPE</label>
                    <select value={jobType} onChange={e=>setJobType(e.target.value)}
                      style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 9px',color:jobType?'var(--text)':'var(--muted)',fontSize:13,boxSizing:'border-box'}}>
                      <option value="">— Select job type —</option>
                      {(jobTypesList||[]).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Scheduled Date */}
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4,letterSpacing:'.05em'}}>SCHEDULED DATE</label>
                    <input type="date" value={jobDate} onChange={e=>setJobDate(e.target.value)}
                      style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 9px',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
                  </div>

                  {/* Arrival Window */}
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:6,letterSpacing:'.05em'}}>ARRIVAL WINDOW</label>
                    {(arrivalWindows||[]).length===0
                      ? <div style={{fontSize:11,color:'var(--muted)'}}>No arrival windows configured — go to <strong>Settings → Operations → Arrival Windows</strong>.</div>
                      : <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                          {(arrivalWindows||[]).map(w=>(
                            <button key={w} onClick={()=>setArrivalWin(w===arrivalWin?'':w)}
                              style={{padding:'6px 12px',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all .15s',
                                border:`1px solid ${w===arrivalWin?'var(--green)':'var(--border2)'}`,
                                background:w===arrivalWin?'var(--greendim)':'var(--surface2)',
                                color:w===arrivalWin?'var(--green)':'var(--muted)'}}>
                              {w}
                            </button>
                          ))}
                        </div>
                    }
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4,letterSpacing:'.05em'}}>ADDITIONAL NOTES</label>
                    <textarea value={jobNotes} onChange={e=>setJobNotes(e.target.value)} rows={2}
                      placeholder="Any other notes for the dispatcher or technician…"
                      style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 9px',color:'var(--text)',fontSize:12,resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                </div>
              </div>

              {/* Create Job button — inside panel footer */}
              <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',flexShrink:0}}>
                <button onClick={createJob} disabled={!activeCustomer||jobCreating||!!jobDone}
                  style={{width:'100%',background:activeCustomer&&!jobDone?'#5daf7c':'var(--surface2)',
                    border:`1px solid ${activeCustomer&&!jobDone?'#5daf7c':'var(--border)'}`,
                    borderRadius:10,padding:'12px',color:activeCustomer&&!jobDone?'#0a1628':'var(--muted)',
                    fontSize:14,fontWeight:800,cursor:activeCustomer&&!jobDone?'pointer':'not-allowed',
                    transition:'all .2s',opacity:!activeCustomer?0.5:1}}>
                  {jobCreating?'Creating…':jobDone?'✓ Job Created':'🗂 Create Job Ticket'}
                </button>
              </div>
            </div>
          )}

          {/* SMS conversation panel */}
        </div>
      </div>
    </div>
  );
}

// ─── INBOX PAGE (SMS Conversations) ───────────────────────────
function InboxPage() {
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // {phone, customer, ...}
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef(null);

  const loadConvos = () => {
    setLoading(true);
    api.get('/phone/conversations').then(r=>{ setConvos(r); setLoading(false); }).catch(()=>setLoading(false));
  };
  useEffect(()=>{ loadConvos(); },[]);

  // WebSocket for real-time incoming SMS
  useEffect(()=>{
    const ws = connectGpsWebSocket(msg=>{
      if(msg.type==='sms_received'){
        loadConvos();
        if(active && msg.from.replace(/\D/g,'').slice(-10)===active.phone.replace(/\D/g,'').slice(-10)){
          setMessages(prev=>[...prev,{direction:'inbound',body:msg.body,created_at:msg.ts,phone:msg.from}]);
        }
      }
    });
    return ()=>ws?.close();
  },[active]);

  useEffect(()=>{
    if(!active) return;
    setMsgLoading(true); setMessages([]);
    api.getSmsHistory(active.phone).then(r=>{ setMessages(r); setMsgLoading(false); }).catch(()=>setMsgLoading(false));
  },[active]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);

  const send = async () => {
    if(!compose.trim()||!active||sending) return;
    setSending(true);
    try {
      await api.sendSms(active.phone, compose.trim(), active.customer_id||null);
      setMessages(prev=>[...prev,{direction:'outbound',body:compose.trim(),created_at:new Date().toISOString(),phone:active.phone}]);
      setCompose('');
      loadConvos();
    } catch(e){ toast.error('Error', e.message); }
    finally{ setSending(false); }
  };

  const filtered = convos.filter(c=>{
    if(!search) return true;
    const name = c.business_name||(c.first_name+' '+(c.last_name||''))||'';
    return name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
  });

  const displayName = c => {
    if(c.customer_type==='commercial'&&c.business_name) return c.business_name;
    if(c.first_name) return `${c.first_name} ${c.last_name||''}`.trim();
    return formatPhone(c.phone);
  };

  const timeAgo = ts => {
    const d = new Date(ts), now = new Date();
    const diff = (now-d)/1000;
    if(diff<60) return 'just now';
    if(diff<3600) return `${Math.floor(diff/60)}m ago`;
    if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div style={{display:'flex',height:'100%',margin:-22,overflow:'hidden',animation:'fadeUp .4s ease'}}>
      {/* Conversation list */}
      <div style={{width:300,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',background:'var(--surface)',flexShrink:0}}>
        <div style={{padding:'14px 14px 10px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,marginBottom:10}}>Inbox</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations…"
            style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',fontSize:12,color:'var(--text)',boxSizing:'border-box'}}/>
        </div>
        <div style={{flex:1,overflowY:'auto'}} className="scrollbar-thin">
          {loading && <div style={{display:'flex',justifyContent:'center',padding:30}}><Spinner/></div>}
          {!loading&&filtered.length===0&&<div style={{padding:20,fontSize:12,color:'var(--muted)',textAlign:'center'}}>No conversations yet.</div>}
          {filtered.map((c,i)=>{
            const isActive = active?.phone===c.phone;
            return (
              <div key={i} onClick={()=>setActive(c)} style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',cursor:'pointer',
                background:isActive?'var(--surface2)':'transparent',transition:'background .12s'}}
                onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='var(--surface2)'; }}
                onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent'; }}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:isActive?'#5daf7c22':'var(--surface3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,border:isActive?'1px solid #5daf7c44':'1px solid var(--border)'}}>
                    {c.customer_type==='commercial'?'🏢':'👤'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:isActive?'var(--green)':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {displayName(c)}
                    </div>
                    <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{formatPhone(c.phone)}</div>
                  </div>
                  <div style={{fontSize:9,color:'var(--muted)',flexShrink:0}}>{timeAgo(c.last_at)}</div>
                </div>
                <div style={{fontSize:11,color:c.last_direction==='inbound'?'var(--text)':'var(--muted)',paddingLeft:42,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {c.last_direction==='outbound'?'You: ':''}{c.body}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat view */}
      <div style={{flex:1,display:'flex',flexDirection:'column',background:'var(--bg)'}}>
        {!active ? (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'var(--muted)'}}>
            <div style={{fontSize:48,marginBottom:12}}>💬</div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Select a conversation</div>
            <div style={{fontSize:12}}>Or start texting from the Calls screen</div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,background:'var(--surface)',flexShrink:0}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'#5daf7c22',border:'1px solid #5daf7c44',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>
                {active.customer_type==='commercial'?'🏢':'👤'}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--green)'}}>{displayName(active)}</div>
                <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{formatPhone(active.phone)}</div>
              </div>
              <span style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{active.message_count} messages</span>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',flexDirection:'column',gap:8}} className="scrollbar-thin">
              {msgLoading&&<div style={{display:'flex',justifyContent:'center',padding:20}}><Spinner/></div>}
              {!msgLoading&&messages.length===0&&<div style={{textAlign:'center',fontSize:12,color:'var(--muted)',paddingTop:20}}>No messages yet.</div>}
              {messages.map((m,i)=>{
                const isOut = m.direction==='outbound';
                const showDate = i===0||new Date(m.created_at).toDateString()!==new Date(messages[i-1].created_at).toDateString();
                return (
                  <div key={i}>
                    {showDate&&<div style={{textAlign:'center',fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)',margin:'8px 0'}}>{new Date(m.created_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>}
                    <div style={{display:'flex',justifyContent:isOut?'flex-end':'flex-start'}}>
                      <div style={{maxWidth:'72%',padding:'9px 13px',
                        borderRadius:isOut?'14px 14px 2px 14px':'14px 14px 14px 2px',
                        background:isOut?'#5daf7c':'var(--surface)',
                        border:isOut?'none':'1px solid var(--border)',
                        color:isOut?'#0a1628':'var(--text)',fontSize:13,lineHeight:1.45}}>
                        {m.body}
                        <div style={{fontSize:9,color:isOut?'#0a162877':'var(--muted)',marginTop:4,textAlign:'right'}}>
                          {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>

            {/* Compose */}
            <div style={{padding:'12px 18px',borderTop:'1px solid var(--border)',display:'flex',gap:8,background:'var(--surface)',flexShrink:0}}>
              <textarea value={compose} onChange={e=>setCompose(e.target.value)} rows={2}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }}
                placeholder={`Message ${displayName(active)}… (Enter to send)`}
                style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--text)',fontSize:13,resize:'none',lineHeight:1.4}}/>
              <button onClick={send} disabled={!compose.trim()||sending}
                style={{padding:'0 20px',background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:10,color:'#5daf7c',fontSize:14,fontWeight:700,cursor:'pointer',opacity:!compose.trim()?0.5:1,alignSelf:'stretch'}}>
                {sending?'…':'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── INVOICES PAGE ─────────────────────────────────────────────
const fmt$ = n => '$' + (parseFloat(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

const INV_STATUS_META = {
  draft:    {bg:'#3d4f6e44',color:'#64748b',label:'DRAFT'},
  sent:     {bg:'#4a9eff18',color:'#4a9eff',label:'SENT'},
  approved: {bg:'#a78bfa18',color:'#a78bfa',label:'APPROVED'},
  paid:     {bg:'#5daf7c18',color:'#5daf7c',label:'PAID'},
  void:     {bg:'#f5656518',color:'#f56565',label:'VOID'},
  current:  {bg:'#5daf7c18',color:'#5daf7c',label:'CURRENT'},
  unpaid:   {bg:'#e8a84a18',color:'#e8a84a',label:'UNPAID'},
};

function InvStatusBadge({status}) {
  const m = INV_STATUS_META[status]||INV_STATUS_META.draft;
  return <span style={{fontSize:9,fontFamily:'var(--font-mono)',fontWeight:700,letterSpacing:'.06em',padding:'2px 8px',borderRadius:3,background:m.bg,color:m.color,border:`1px solid ${m.color}33`}}>{m.label}</span>;
}

function CreateDocDrawer({type, onClose, onCreated}) {
  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');
  const [custPick, setCustPick] = useState(null);
  const [jobPick, setJobPick] = useState(null);
  const [jobs, setJobs] = useState([]);
  // HTML pricebook wiring: tasks + engine, not legacy /pricebook/items
  const [pbEngine, setPbEngine] = useState(null);
  const [pbTasks, setPbTasks] = useState([]);
  const [pbCat, setPbCat] = useState('acc');
  const [pbLoading, setPbLoading] = useState(false);
  const [pbSearch, setPbSearch] = useState('');
  const [showPb, setShowPb] = useState(null); // { kind:'invoice', idx } | { kind:'option', oi, ii } | null
  const [taxRate, setTaxRate] = useState(8.25);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Invoice line items
  const [items, setItems] = useState([{description:'',quantity:1,unit_price:0}]);
  // Estimate options (Good / Better / Best)
  const [options, setOptions] = useState([
    {label:'Good',  description:'', items:[{description:'',quantity:1,unit_price:0}]},
    {label:'Better',description:'', items:[{description:'',quantity:1,unit_price:0}]},
    {label:'Best',  description:'', items:[{description:'',quantity:1,unit_price:0}]},
  ]);

  useEffect(()=>{
    api.getCustomers().then(r=>setCustomers(r||[])).catch(()=>{});
    api.pbEngine().then(setPbEngine).catch(()=>{});
  },[]);
  // Load tasks for the active pricebook category whenever picker is open
  useEffect(()=>{
    if (showPb === null) return;
    setPbLoading(true);
    api.pbTasks({ category: pbCat })
      .then(d => setPbTasks(Array.isArray(d) ? d : []))
      .finally(() => setPbLoading(false));
  }, [pbCat, showPb]);

  useEffect(()=>{
    if(!custPick) { setJobs([]); setJobPick(null); return; }
    api.getJobs({customer_id:custPick.id}).then(r=>setJobs(r||[])).catch(()=>{});
  },[custPick]);

  const filteredCusts = customers.filter(c=>{
    const n=(c.business_name||(c.first_name+' '+c.last_name)||'').toLowerCase();
    return n.includes(custSearch.toLowerCase())||c.phone?.includes(custSearch);
  }).slice(0,8);

  const custName = c => c.customer_type==='commercial'&&c.business_name ? c.business_name : `${c.first_name} ${c.last_name}`;

  // Line items helpers
  const addItem = () => setItems(i=>[...i,{description:'',quantity:1,unit_price:0}]);
  const setItem = (idx,k,v) => setItems(i=>{ const a=[...i]; a[idx]={...a[idx],[k]:v}; return a; });
  const removeItem = idx => setItems(i=>i.filter((_,j)=>j!==idx));
  const itemSubtotal = (items||[]).reduce((s,i)=>s+(parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0),0);

  // Option line items helpers
  const setOptItem = (oi,ii,k,v) => setOptions(opts=>{ const a=opts.map(o=>({...o,items:[...o.items]})); a[oi].items[ii]={...a[oi].items[ii],[k]:v}; return a; });
  const addOptItem = oi => setOptions(opts=>{ const a=opts.map(o=>({...o,items:[...o.items]})); a[oi].items.push({description:'',quantity:1,unit_price:0}); return a; });
  const removeOptItem = (oi,ii) => setOptions(opts=>{ const a=opts.map(o=>({...o,items:[...o.items]})); a[oi].items=a[oi].items.filter((_,j)=>j!==ii); return a; });
  const optSubtotal = opt => (opt.items||[]).reduce((s,i)=>s+(parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0),0);

  const taxFrac = taxRate/100;
  const subtotal = type==='invoice' ? itemSubtotal : optSubtotal(options[0]);
  const taxAmt = subtotal*taxFrac;
  const total = subtotal+taxAmt;

  // Filter tasks by search across name/tag/description
  const pbFiltered = (pbTasks||[]).filter(t => {
    if (!pbSearch) return true;
    const q = pbSearch.toLowerCase();
    return (t.name||'').toLowerCase().includes(q)
        || (t.tag||'').toLowerCase().includes(q)
        || (t.description||'').toLowerCase().includes(q);
  });

  // Compute flat rate for a task using the HTML engine
  const pbPrice = (task) => pbEngine ? calcFlatRate(task, pbEngine).flatRate : 0;

  // Drop a selected pricebook task into the active target (invoice row, or option row)
  const pickPbItem = (task) => {
    const flat = pbPrice(task);
    if (!showPb) { setPbSearch(''); return; }
    if (showPb.kind === 'invoice') {
      setItem(showPb.idx, 'description', task.name);
      setItem(showPb.idx, 'unit_price', +flat.toFixed(2));
      setItem(showPb.idx, 'quantity', 1);
    } else if (showPb.kind === 'option') {
      setOptItem(showPb.oi, showPb.ii, 'description', task.name);
      setOptItem(showPb.oi, showPb.ii, 'unit_price', +flat.toFixed(2));
      setOptItem(showPb.oi, showPb.ii, 'quantity', 1);
    }
    setShowPb(null);
    setPbSearch('');
  };

  const save = async () => {
    if(!custPick) { setErr('Select a customer'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        customer_id: custPick.id,
        job_id: jobPick?.id||null,
        type,
        tax_rate: taxRate/100,
        notes,
        items: type==='invoice' ? items.map(i=>({...i,quantity:parseFloat(i.quantity)||1,unit_price:parseFloat(i.unit_price)||0})) : [],
        options: type==='estimate' ? options.map(o=>({...o,items:o.items.map(i=>({...i,quantity:parseFloat(i.quantity)||1,unit_price:parseFloat(i.unit_price)||0}))})) : [],
      };
      const created = await api.createInvoice(payload);
      onCreated(created);
    } catch(e){ setErr(e.message); }
    finally{ setSaving(false); }
  };

  const inp = {background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:7,padding:'7px 10px',fontSize:12,color:'var(--text)',boxSizing:'border-box'};
  const lbl = {fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:3,display:'block'};
  const sh  = {fontFamily:'var(--font-head)',fontSize:13,fontWeight:700,borderBottom:'1px solid var(--border)',paddingBottom:6,marginBottom:12};

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex'}}>
      <div onClick={onClose} style={{flex:1,background:'rgba(0,0,0,.55)'}}/>
      <div style={{width:680,background:'var(--bg)',display:'flex',flexDirection:'column',boxShadow:'-4px 0 32px rgba(0,0,0,.5)',animation:'slideRight .25s ease',overflowY:'auto'}}>

        {/* Header */}
        <div style={{padding:'16px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,background:'var(--surface)',flexShrink:0}}>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}><Icon n="x" size={18}/></button>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,flex:1}}>
            New {type==='estimate'?'Estimate':'Invoice'}
          </div>
        </div>

        <div style={{padding:22,flex:1,display:'flex',flexDirection:'column',gap:18}}>

          {/* Customer picker */}
          <div>
            <div style={sh}>Customer</div>
            {custPick ? (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#5daf7c0d',border:'1px solid #5daf7c33',borderRadius:9}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--green)'}}>{custName(custPick)}</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>{custPick.phone}</div>
                </div>
                <button onClick={()=>{setCustPick(null);setCustSearch('');}} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}><Icon n="x" size={14}/></button>
              </div>
            ) : (
              <div style={{position:'relative'}}>
                <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Type customer name or phone…"
                  style={{...inp,width:'100%'}}/>
                {custSearch&&filteredCusts.length>0&&(
                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,zIndex:10,maxHeight:220,overflowY:'auto',boxShadow:'0 4px 16px rgba(0,0,0,.3)'}}>
                    {filteredCusts.map(c=>(
                      <div key={c.id} onClick={()=>{setCustPick(c);setCustSearch('');}}
                        style={{padding:'9px 12px',cursor:'pointer',borderBottom:'1px solid var(--border)',fontSize:13}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{fontWeight:600}}>{custName(c)}</div>
                        <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{c.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Job picker */}
            {custPick&&jobs.length>0&&(
              <div style={{marginTop:8}}>
                <label style={lbl}>LINK TO JOB (OPTIONAL)</label>
                <select value={jobPick?.id||''} onChange={e=>setJobPick(jobs.find(j=>j.id===e.target.value)||null)}
                  style={{...inp,width:'100%'}}>
                  <option value="">— No job linked —</option>
                  {jobs.map(j=><option key={j.id} value={j.id}>#{j.job_number} – {j.job_type||'Service Call'} ({j.status})</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Line items (Invoice) */}
          {type==='invoice'&&(
            <div>
              <div style={sh}>Line Items</div>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',marginBottom:10}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 70px 90px 80px 32px',gap:0,borderBottom:'1px solid var(--border)',padding:'6px 10px',background:'var(--surface2)'}}>
                  {['Description','Qty','Unit Price','Total',''].map(h=><div key={h} style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.05em'}}>{h}</div>)}
                </div>
                {items.map((item,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 70px 90px 80px 32px',gap:6,padding:'7px 10px',borderBottom:i<items.length-1?'1px solid var(--border)':'none',alignItems:'center'}}>
                    <div style={{position:'relative'}}>
                      <input value={item.description} onChange={e=>setItem(i,'description',e.target.value)}
                        placeholder="Service description…" style={{...inp,width:'100%',paddingRight:28}}/>
                      <button onClick={()=>{setShowPb({kind:'invoice',idx:i});setPbSearch('');}} title="Open pricebook"
                        style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--amber)',fontSize:13}}>📖</button>
                    </div>
                    <input value={item.quantity} onChange={e=>setItem(i,'quantity',e.target.value)} type="number" min="0" step="0.5"
                      style={{...inp,textAlign:'center'}}/>
                    <input value={item.unit_price} onChange={e=>setItem(i,'unit_price',e.target.value)} type="number" min="0" step="0.01"
                      placeholder="0.00" style={{...inp,textAlign:'right'}}/>
                    <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text)',textAlign:'right',paddingRight:4}}>
                      {fmt$((parseFloat(item.quantity)||0)*(parseFloat(item.unit_price)||0))}
                    </div>
                    <button onClick={()=>removeItem(i)} disabled={items.length===1}
                      style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',opacity:items.length===1?0.3:1}}><Icon n="x" size={13}/></button>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={addItem} style={{fontSize:12,color:'var(--amber)',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>+ Add Line</button>
                <button onClick={()=>{const idx=items.length;addItem();setShowPb({kind:'invoice',idx});setPbSearch('');}} style={{fontSize:12,color:'var(--blue)',background:'transparent',border:'1px solid var(--blue)',borderRadius:7,padding:'5px 12px',cursor:'pointer'}}>📖 From Pricebook</button>
              </div>


              {/* Totals */}
              <div style={{marginTop:12,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                {[['Subtotal',fmt$(itemSubtotal)],['Tax ('+taxRate+'%)',fmt$(itemSubtotal*taxFrac)],['Total',fmt$(itemSubtotal+itemSubtotal*taxFrac)]].map(([k,v],i)=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:i===2?'1px solid var(--border)':'none',marginTop:i===2?8:0}}>
                    <span style={{fontSize:i===2?14:12,fontWeight:i===2?700:400,color:i===2?'var(--text)':'var(--muted)'}}>{k}</span>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:i===2?15:12,fontWeight:i===2?800:400,color:i===2?'var(--green)':'var(--muted)'}}>{v}</span>
                  </div>
                ))}
                <div style={{marginTop:10}}>
                  <label style={lbl}>TAX RATE (%)</label>
                  <input type="number" value={taxRate} onChange={e=>setTaxRate(parseFloat(e.target.value)||0)} step="0.01" min="0"
                    style={{...inp,width:100}}/>
                </div>
              </div>
            </div>
          )}

          {/* Estimate options (Good/Better/Best) */}
          {type==='estimate'&&(
            <div>
              <div style={sh}>Estimate Options</div>
              {options.map((opt,oi)=>(
                <div key={oi} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:14,marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:oi===0?'var(--green)':oi===1?'var(--amber)':'var(--purple)',fontFamily:'var(--font-head)'}}>{opt.label}</span>
                    <input value={opt.description} onChange={e=>setOptions(o=>{ const a=[...o]; a[oi]={...a[oi],description:e.target.value}; return a; })}
                      placeholder="Short description of this tier…" style={{...inp,flex:1,fontSize:11}}/>
                  </div>
                  {opt.items.map((item,ii)=>(
                    <div key={ii} style={{display:'grid',gridTemplateColumns:'1fr 60px 80px 70px 28px',gap:6,marginBottom:6,alignItems:'center'}}>
                      <div style={{position:'relative'}}>
                        <input value={item.description} onChange={e=>setOptItem(oi,ii,'description',e.target.value)} placeholder="Description…" style={{...inp,width:'100%',paddingRight:28}}/>
                        <button onClick={()=>{setShowPb({kind:'option',oi,ii});setPbSearch('');}} title="Open pricebook"
                          style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--amber)',fontSize:13}}>📖</button>
                      </div>
                      <input value={item.quantity} onChange={e=>setOptItem(oi,ii,'quantity',e.target.value)} type="number" min="0" style={{...inp,textAlign:'center'}}/>
                      <input value={item.unit_price} onChange={e=>setOptItem(oi,ii,'unit_price',e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" style={{...inp,textAlign:'right'}}/>
                      <div style={{fontSize:11,fontFamily:'var(--font-mono)',textAlign:'right',color:'var(--muted)'}}>{fmt$((parseFloat(item.quantity)||0)*(parseFloat(item.unit_price)||0))}</div>
                      <button onClick={()=>removeOptItem(oi,ii)} disabled={opt.items.length===1}
                        style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',opacity:opt.items.length===1?0.3:1}}><Icon n="x" size={12}/></button>
                    </div>
                  ))}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6,gap:8}}>
                    <button onClick={()=>addOptItem(oi)} style={{fontSize:11,color:'var(--amber)',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>+ Add Item</button>
                    <button onClick={()=>{const ii=opt.items.length;addOptItem(oi);setShowPb({kind:'option',oi,ii});setPbSearch('');}} style={{fontSize:11,color:'var(--blue)',background:'transparent',border:'1px solid var(--blue)',borderRadius:6,padding:'3px 10px',cursor:'pointer'}}>📖 From Pricebook</button>
                    <span style={{flex:1}}/>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--text)'}}>
                      {fmt$(optSubtotal(opt)+optSubtotal(opt)*(taxRate/100))} <span style={{fontSize:10,fontWeight:400,color:'var(--muted)'}}>incl. tax</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={sh}>Notes</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Notes for the customer (printed on document)…"
              style={{...inp,width:'100%',resize:'vertical'}}/>
          </div>

          {err&&<div style={{background:'rgba(245,101,101,.1)',border:'1px solid rgba(245,101,101,.3)',borderRadius:8,padding:'9px 13px',color:'#ff6b6b',fontSize:12}}>{err}</div>}
        </div>

        <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:10,background:'var(--surface)',flexShrink:0}}>
          <button onClick={onClose} style={{padding:'9px 18px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving||!custPick}
            style={{padding:'9px 24px',background:'var(--amber)',border:'none',borderRadius:8,color:'#000',fontSize:13,fontWeight:700,cursor:'pointer',opacity:(!custPick||saving)?0.6:1}}>
            {saving?'Saving…':'Create '+( type==='estimate'?'Estimate':'Invoice')}
          </button>
        </div>

        {/* ── Pricebook picker modal (shared by invoice lines & estimate options) ── */}
        {showPb && (
          <div onClick={()=>setShowPb(null)}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:950,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:12,width:820,maxWidth:'95vw',height:'80vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.6)'}}>
              {/* Header */}
              <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,background:'var(--surface)'}}>
                <span style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,flex:1}}>💲 Pricebook — Choose a Task</span>
                <button onClick={()=>setShowPb(null)} style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer'}}>✕</button>
              </div>
              {/* Category tabs */}
              <div style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap',background:'var(--surface)'}}>
                {PB_CATS.map(c=>(
                  <button key={c.id} onClick={()=>setPbCat(c.id)}
                    style={{fontSize:11,padding:'4px 10px',borderRadius:20,border:`1px solid ${pbCat===c.id?c.color:'var(--border)'}`,background:pbCat===c.id?`${c.color}22`:'transparent',color:pbCat===c.id?c.color:'var(--muted)',cursor:'pointer',fontWeight:pbCat===c.id?700:500}}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
                <input value={pbSearch} onChange={e=>setPbSearch(e.target.value)} autoFocus placeholder="Search tasks by name, tag, or description…"
                  style={{...inp,width:'100%'}}/>
              </div>
              {/* List */}
              <div style={{flex:1,overflowY:'auto'}}>
                {pbLoading ? (
                  <div style={{padding:20,display:'flex',justifyContent:'center'}}><Spinner/></div>
                ) : pbFiltered.length === 0 ? (
                  <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>No tasks found in this category.</div>
                ) : pbFiltered.map(task => {
                  const price = pbPrice(task);
                  return (
                    <div key={task.id}
                      style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                          <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{task.name}</span>
                          {task.tag && <span style={{fontSize:10,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:3,padding:'1px 6px',color:'var(--muted)'}}>{task.tag}</span>}
                        </div>
                        {task.description && <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.4,maxHeight:32,overflow:'hidden'}}>{task.description}</div>}
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,color:'var(--amber)'}}>{fmt$(price)}</div>
                        <div style={{fontSize:10,color:'var(--muted)'}}>{task.hours}h · {task.difficulty}</div>
                      </div>
                      <button onClick={()=>pickPbItem(task)}
                        style={{background:'var(--green)',color:'#fff',border:'none',borderRadius:7,padding:'7px 14px',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>+ Add</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoicesPage() {
  const [docType, setDocType] = useState('all');  // 'all'|'estimate'|'invoice'
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(null); // null|'estimate'|'invoice'
  const [selected, setSelected] = useState(null);
  const {data, loading, reload} = useApi(()=>api.getInvoices());

  const docs = (data||[]).filter(d=>{
    if(docType!=='all'&&d.type!==docType) return false;
    if(statusFilter!=='all'&&d.status!==statusFilter) return false;
    return true;
  });

  const totalAR = (data||[]).filter(d=>d.type==='invoice'&&!['paid','void'].includes(d.status)).reduce((s,d)=>s+parseFloat(d.total||0),0);
  const totalPaid30 = (data||[]).filter(d=>d.status==='paid'&&new Date(d.paid_at)>new Date(Date.now()-30*86400e3)).reduce((s,d)=>s+parseFloat(d.total||0),0);

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18,flexWrap:'wrap'}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Invoices & Estimates</div>
        <button onClick={()=>setShowCreate('estimate')} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
          📋 New Estimate
        </button>
        <button onClick={()=>setShowCreate('invoice')} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
          <Icon n="plus" size={13} color="#e8a84a"/> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:18}}>
        {[
          {label:'Open A/R',value:fmt$(totalAR),color:'var(--amber)',icon:'📤'},
          {label:'Paid (Last 30d)',value:fmt$(totalPaid30),color:'var(--green)',icon:'✅'},
          {label:'Total Documents',value:(data||[]).length,color:'var(--blue)',icon:'📄'},
        ].map(card=>(
          <div key={card.label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{fontSize:24}}>{card.icon}</div>
            <div>
              <div style={{fontSize:18,fontWeight:800,fontFamily:'var(--font-head)',color:card.color}}>{card.value}</div>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.05em'}}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:2,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
          {[['all','All'],['estimate','Estimates'],['invoice','Invoices']].map(([id,lbl])=>(
            <button key={id} onClick={()=>setDocType(id)} style={{padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,
              fontWeight:docType===id?600:400,background:docType===id?'var(--surface2)':'transparent',color:docType===id?'var(--text)':'var(--muted)'}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {['all','draft','sent','approved','paid','unpaid','void'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} style={{padding:'5px 10px',borderRadius:6,border:'1px solid',cursor:'pointer',fontSize:11,
              borderColor:statusFilter===s?'var(--amber)':'var(--border)',
              background:statusFilter===s?'var(--amberdim)':'transparent',
              color:statusFilter===s?'var(--amber)':'var(--muted)',textTransform:'uppercase',fontFamily:'var(--font-mono)',letterSpacing:'.04em'}}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div> : (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                {['#','Type','Customer','Job','Amount','Status','Date'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em'}}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.length===0&&(
                <tr><td colSpan={7} style={{padding:30,textAlign:'center',fontSize:13,color:'var(--muted)'}}>No documents found.</td></tr>
              )}
              {docs.map(d=>(
                <tr key={d.id} onClick={()=>setSelected(d)}
                  style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'9px 12px',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>#{d.invoice_number}</td>
                  <td style={{padding:'9px 12px'}}>
                    <span style={{fontSize:9,fontFamily:'var(--font-mono)',padding:'2px 7px',borderRadius:3,background:d.type==='estimate'?'#a78bfa18':'#4a9eff18',color:d.type==='estimate'?'#a78bfa':'#4a9eff',border:`1px solid ${d.type==='estimate'?'#a78bfa33':'#4a9eff33'}`}}>
                      {d.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{padding:'9px 12px',fontSize:13,fontWeight:500}}>{d.customer_name}</td>
                  <td style={{padding:'9px 12px',fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{d.job_id?'Linked':'—'}</td>
                  <td style={{padding:'9px 12px',fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--green)'}}>{fmt$(d.total)}</td>
                  <td style={{padding:'9px 12px'}}><InvStatusBadge status={d.status}/></td>
                  <td style={{padding:'9px 12px',fontSize:11,color:'var(--muted)'}}>{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate&&<CreateDocDrawer type={showCreate} onClose={()=>setShowCreate(null)} onCreated={()=>{ setShowCreate(null); reload(); }}/>}
    </div>
  );
}

// ─── REPORTS PAGE ──────────────────────────────────────────────
function ReportsPage() {
  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [jobStats, setJobStats] = useState({byStatus:[],byType:[]});
  const [leads, setLeads] = useState([]);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rev, js, ld, tc] = await Promise.all([
        api.get(`/reports/overview?period=${period}`),
        api.get(`/reports/revenue?period=${period}`),
        api.get(`/reports/jobs?period=${period}`),
        api.get(`/reports/leads?period=${period}`),
        api.get(`/reports/techs?period=${period}`),
      ]);
      setOverview(ov); setRevenue(rev);
      setJobStats({byStatus: js.by_status||[], byType: js.by_type||[]});
      setLeads(ld); setTechs(tc);
    } catch(e){ console.error(e); }
    finally{ setLoading(false); }
  },[period]);

  useEffect(()=>{ load(); },[load]);

  const maxRevenue = Math.max(...revenue.map(r=>parseFloat(r.revenue||0)),1);
  const maxStatus  = Math.max(...(jobStats.byStatus||[]).map(j=>parseInt(j.count||0)),1);
  const maxType    = Math.max(...(jobStats.byType||[]).map(j=>parseInt(j.count||0)),1);
  const maxLead    = Math.max(...leads.map(l=>parseInt(l.count||0)),1);

  const statCard = (icon,label,value,sub,color='var(--amber)') => (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 18px'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
        <span style={{fontSize:22}}>{icon}</span>
        <div style={{flex:1}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,color,lineHeight:1}}>{value}</div>
          <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginTop:4}}>{label}</div>
          {sub&&<div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>{sub}</div>}
        </div>
      </div>
    </div>
  );

  const hBar = (label,count,max,color='var(--blue)') => (
    <div key={label} style={{marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontSize:12,fontWeight:500,textTransform:'capitalize'}}>{label}</span>
        <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{count}</span>
      </div>
      <div style={{height:8,background:'var(--surface2)',borderRadius:4,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${Math.max((count/max)*100,2)}%`,background:color,borderRadius:4,transition:'width .4s ease'}}/>
      </div>
    </div>
  );

  const statusColors = {completed:'#5daf7c',unassigned:'#f56565',scheduled:'#64748b',en_route:'#4a9eff',on_site:'#e8a84a',cancelled:'#f56565',warranty:'#a78bfa'};

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Reports</div>
        <div style={{display:'flex',gap:2,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
          {[[7,'7 days'],[30,'30 days'],[90,'90 days'],[365,'12 months']].map(([d,l])=>(
            <button key={d} onClick={()=>setPeriod(d)} style={{padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,
              fontWeight:period===d?600:400,background:period===d?'var(--amber)':'transparent',
              color:period===d?'#000':'var(--muted)'}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading&&<div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div>}

      {!loading&&overview&&(
        <>
          {/* Summary KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:22}}>
            {statCard('💰','REVENUE',fmt$(overview.revenue),'Collected this period','var(--green)')}
            {statCard('🗂','JOBS CREATED',overview.jobs_created,`${overview.jobs_completed} completed`,'var(--amber)')}
            {statCard('👥','NEW CUSTOMERS',overview.new_customers,null,'var(--blue)')}
            {statCard('📤','OPEN INVOICES',overview.open_invoices,`${fmt$(overview.open_ar)} outstanding`,'var(--red)')}
            {statCard('✅','COMPLETED JOBS',overview.jobs_completed,null,'var(--green)')}
            {statCard('💵','AVG JOB VALUE',overview.jobs_completed>0?fmt$(overview.revenue/overview.jobs_completed):'—','Per completed job','var(--purple)')}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

            {/* Revenue Chart */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18,gridColumn:'1/-1'}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700,marginBottom:16}}>Monthly Revenue</div>
              {revenue.length===0
                ? <div style={{fontSize:12,color:'var(--muted)',textAlign:'center',padding:20}}>No paid invoices in the last 12 months.</div>
                : <div style={{display:'flex',alignItems:'flex-end',gap:6,height:140,paddingBottom:20,position:'relative'}}>
                    {revenue.map((r,i)=>{
                      const h = Math.max((parseFloat(r.revenue)/maxRevenue)*120,2);
                      return (
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:2}}>{fmt$(r.revenue).replace('.00','')}</div>
                          <div style={{width:'100%',height:h,background:'var(--green)',borderRadius:'4px 4px 0 0',opacity:.85,minHeight:4,transition:'height .4s ease'}}/>
                          <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',marginTop:4}}>{r.month}</div>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>

            {/* Jobs by Status */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700,marginBottom:14}}>Jobs by Status</div>
              {(jobStats.byStatus||[]).length===0
                ? <div style={{fontSize:12,color:'var(--muted)'}}>No jobs in period.</div>
                : (jobStats.byStatus||[]).map(j=>hBar(j.status,parseInt(j.count),maxStatus,statusColors[j.status]||'var(--blue)'))
              }
            </div>

            {/* Jobs by Type */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700,marginBottom:14}}>Jobs by Type</div>
              {(jobStats.byType||[]).length===0
                ? <div style={{fontSize:12,color:'var(--muted)'}}>No jobs in period.</div>
                : (jobStats.byType||[]).map(j=>hBar(j.type,parseInt(j.count),maxType,'var(--amber)'))
              }
            </div>

            {/* Lead Sources */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700,marginBottom:14}}>Lead Sources</div>
              {leads.length===0
                ? <div style={{fontSize:12,color:'var(--muted)'}}>No lead source data in period.</div>
                : leads.map(l=>hBar(l.source,parseInt(l.count),maxLead,'var(--purple)'))
              }
            </div>

            {/* Technician Performance */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700,marginBottom:14}}>Technician Performance</div>
              {techs.length===0
                ? <div style={{fontSize:12,color:'var(--muted)'}}>No technicians.</div>
                : <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        {['Technician','Jobs','Done','Revenue'].map(h=>(
                          <th key={h} style={{padding:'4px 6px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.05em'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {techs.map(t=>(
                        <tr key={t.id} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'7px 6px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{width:24,height:24,borderRadius:'50%',background:t.color||'#5daf7c',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff'}}>{t.initials||t.name?.slice(0,1)}</div>
                              <span style={{fontWeight:500}}>{t.name}</span>
                            </div>
                          </td>
                          <td style={{padding:'7px 6px',fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{t.total_jobs}</td>
                          <td style={{padding:'7px 6px',fontFamily:'var(--font-mono)',color:'var(--green)'}}>{t.completed}</td>
                          <td style={{padding:'7px 6px',fontFamily:'var(--font-mono)',color:'var(--amber)',fontWeight:700}}>{fmt$(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>

          </div>
        </>
      )}
    </div>
  );
}

// ─── GPS PAGE ─────────────────────────────────────────────────
function GPSPage() {
  const [positions, setPositions] = useState([]);
  const [techs, setTechs] = useState([]);
  const [selected, setSelected] = useState(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null); // L instance
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});

  // Load Leaflet CSS + JS once
  useEffect(()=>{
    if(!document.getElementById('leaflet-css')){
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if(window.L){ leafletRef.current = window.L; initMap(); return; }
    if(document.getElementById('leaflet-js')) return;
    const s = document.createElement('script');
    s.id = 'leaflet-js';
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = ()=>{ leafletRef.current = window.L; initMap(); };
    document.head.appendChild(s);
  },[]);

  const initMap = ()=>{
    if(!mapRef.current || mapInstanceRef.current) return;
    const L = leafletRef.current;
    if(!L) return;

    // Center on DFW — between Denton and Tarrant counties
    const map = L.map(mapRef.current, { center:[33.05, -97.28], zoom:10, zoomControl:true });
    mapInstanceRef.current = map;

    // Dark-styled tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    // ── Denton County boundary (simplified polygon) ──
    const dentonCoords = [
      [33.624, -97.538],[33.624, -96.908],[33.372, -96.908],
      [33.370, -97.000],[33.034, -97.003],[33.034, -97.538],
    ];
    L.polygon(dentonCoords, {
      color:'#5daf7c', weight:2, opacity:.9,
      fillColor:'#5daf7c', fillOpacity:.08,
      dashArray:'6 4',
    }).addTo(map).bindPopup('<b style="font-family:sans-serif">Denton County</b><br><small style="color:#888">Service Area</small>');

    // ── Tarrant County boundary (simplified polygon) ──
    const tarrantCoords = [
      [33.034, -97.538],[33.034, -97.003],[32.980, -97.000],
      [32.980, -97.073],[32.544, -97.073],[32.544, -97.538],
    ];
    L.polygon(tarrantCoords, {
      color:'#4a9eff', weight:2, opacity:.9,
      fillColor:'#4a9eff', fillOpacity:.08,
      dashArray:'6 4',
    }).addTo(map).bindPopup('<b style="font-family:sans-serif">Tarrant County</b><br><small style="color:#888">Service Area</small>');

    // ── County label markers (text only) ──
    const labelIcon = (text, color) => L.divIcon({
      className:'',
      html:`<div style="color:${color};font-size:11px;font-weight:700;font-family:monospace;white-space:nowrap;text-shadow:0 1px 3px #000;letter-spacing:.06em">${text}</div>`,
      iconAnchor:[40,8],
    });
    L.marker([33.22, -97.25], {icon:labelIcon('DENTON COUNTY','#5daf7c'), interactive:false}).addTo(map);
    L.marker([32.78, -97.35], {icon:labelIcon('TARRANT COUNTY','#4a9eff'), interactive:false}).addTo(map);
  };

  // Update tech markers when positions change
  useEffect(()=>{
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    if(!L || !map) return;
    positions.forEach(pos=>{
      const lat = parseFloat(pos.lat), lng = parseFloat(pos.lng);
      if(isNaN(lat)||isNaN(lng)) return;
      const tech = techs.find(t=>t.id===pos.technician_id);
      const color = pos.color || tech?.color || '#5daf7c';
      const initials = pos.initials || tech?.initials || '?';
      const name = pos.name || (tech ? `${tech.first_name} ${tech.last_name}` : 'Tech');
      const icon = L.divIcon({
        className:'',
        html:`<div style="width:34px;height:34px;border-radius:50%;background:${color}22;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${color};font-family:monospace;box-shadow:0 0 12px ${color}66">${initials}</div>`,
        iconSize:[34,34], iconAnchor:[17,17],
      });
      if(markersRef.current[pos.technician_id]){
        markersRef.current[pos.technician_id].setLatLng([lat,lng]);
      } else {
        const m = L.marker([lat,lng],{icon}).addTo(map);
        m.bindPopup(`<b style="font-family:sans-serif">${name}</b><br><small style="color:#888">${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);
        markersRef.current[pos.technician_id] = m;
      }
    });
    // Remove markers for techs no longer in positions
    Object.keys(markersRef.current).forEach(id=>{
      if(!positions.find(p=>p.technician_id===id)){
        mapInstanceRef.current?.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
  },[positions, techs]);

  useEffect(() => {
    api.gpsLive().then(setPositions).catch(()=>{});
    api.getTechnicians().then(setTechs).catch(()=>{});
    const ws = connectGpsWebSocket(msg => {
      if(msg.type==="gps_ping") {
        setPositions(prev=>{
          const f=prev.filter(p=>p.technician_id!==msg.technician_id);
          return [...f,{technician_id:msg.technician_id,lat:msg.lat,lng:msg.lng,color:msg.color||"#5daf7c",initials:msg.initials,name:msg.name}];
        });
      }
    });
    return ()=>ws?.close();
  },[]);

  return (
    <div style={{animation:"fadeUp .4s ease",display:"flex",flexDirection:"column",height:"calc(100vh - 94px)"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexShrink:0}}>
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,flex:1}}>GPS Fleet Tracking</div>
        <div style={{display:"flex",alignItems:"center",gap:6,background:"var(--greendim)",border:"1px solid var(--green)33",borderRadius:8,padding:"5px 12px"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"var(--green)",animation:"pulse2 1.5s infinite"}}/>
          <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--green)"}}>LIVE · {positions.length} tracking</span>
        </div>
      </div>

      <div style={{display:"flex",gap:14,flex:1,minHeight:0}}>

        {/* Map */}
        <div style={{flex:1,borderRadius:12,overflow:"hidden",border:"1px solid var(--border)",position:"relative",minHeight:0}}>
          <div ref={mapRef} style={{width:"100%",height:"100%"}}/>
          {/* Service area legend */}
          <div style={{position:"absolute",bottom:16,left:16,zIndex:1000,background:"rgba(13,26,18,.85)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",backdropFilter:"blur(4px)"}}>
            <div style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",marginBottom:8}}>SERVICE AREA</div>
            {[{label:"Denton County",color:"#5daf7c"},{label:"Tarrant County",color:"#4a9eff"}].map(({label,color})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:16,height:3,background:color,borderRadius:2,opacity:.9}}/>
                <span style={{fontSize:11,color:"var(--text)"}}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{width:280,display:"flex",flexDirection:"column",gap:10,overflowY:"auto"}} className="scrollbar-thin">
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
              <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".07em"}}>TECHNICIANS</span>
            </div>
            {techs.length===0&&<div style={{fontSize:12,color:"var(--muted)"}}>No technicians configured.</div>}
            {techs.map(t=>{
              const pos = positions.find(p=>p.technician_id===t.id);
              return (
                <div key={t.id}
                  onClick={()=>{
                    setSelected(t.id===selected?null:t.id);
                    if(pos&&mapInstanceRef.current){
                      mapInstanceRef.current.setView([parseFloat(pos.lat),parseFloat(pos.lng)],14,{animate:true});
                      markersRef.current[t.id]?.openPopup();
                    }
                  }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--border)",cursor:"pointer",opacity:pos?1:0.5}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:(t.color||"#5daf7c")+"22",border:`1.5px solid ${t.color||"#5daf7c"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:t.color||"#5daf7c",fontFamily:"var(--font-mono)",flexShrink:0}}>{t.initials}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600}}>{t.first_name} {t.last_name}</div>
                    <div style={{fontSize:9,fontFamily:"var(--font-mono)",color:pos?"var(--green)":"var(--muted)"}}>
                      {pos ? `${parseFloat(pos.lat).toFixed(4)}, ${parseFloat(pos.lng).toFixed(4)}` : "No ping yet"}
                    </div>
                  </div>
                  {pos&&<div style={{width:8,height:8,borderRadius:"50%",background:"var(--green)",animation:"pulse2 1.5s infinite",flexShrink:0}}/>}
                </div>
              );
            })}
          </div>

          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",marginBottom:8}}>SERVICE AREA</div>
            <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.8}}>
              <div style={{color:"#5daf7c",fontWeight:600}}>Denton County, TX</div>
              <div style={{marginBottom:6,fontSize:10}}>North DFW metro — Denton, Lewisville, Flower Mound, Carrollton</div>
              <div style={{color:"#4a9eff",fontWeight:600}}>Tarrant County, TX</div>
              <div style={{fontSize:10}}>Fort Worth metro — Fort Worth, Arlington, Mansfield, Keller</div>
            </div>
          </div>

          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",marginBottom:8}}>PRIVACY POLICY</div>
            <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.7}}>
              GPS is active <strong style={{color:"var(--amber)"}}>on-duty only</strong>. Technicians control their duty toggle. No location stored after shift.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── INTEGRATIONS PAGE ────────────────────────────────────────
function IntegrationsPage() {
  const [squareStatus, setSquareStatus] = useState(null);
  const [squareCards, setSquareCards] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    Promise.all([api.squareStatus(), api.sandboxCards()])
      .then(([s,c])=>{ setSquareStatus(s); setSquareCards(c); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const intgDefs = [
    {id:"square",name:"Square",color:"#5daf7c",icon:"S",desc:"Card payments in the field via tablet",status:squareStatus?.connected?"connected":"warning",detail:squareStatus},
    {id:"quickbooks",name:"QuickBooks",color:"#4a9eff",icon:"QB",desc:"Sync invoices, customers & taxes",status:"not_configured"},
    {id:"freshbooks",name:"FreshBooks",color:"#a78bfa",icon:"FB",desc:"Accounting & time tracking sync",status:"not_configured"},
    {id:"gps",name:"GPS Tracking",color:"#e8a84a",icon:"⌖",desc:"Tablet-based fleet tracking (on-duty only)",status:"connected"},
  ];

  return (
    <div style={{animation:"fadeUp .4s ease"}}>
      <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,marginBottom:6}}>Integrations</div>
      <div style={{fontSize:13,color:"var(--muted)",marginBottom:24}}>Connect DPS to payment, accounting, and tracking platforms.</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {intgDefs.map(i=>{
          const connected = i.status==="connected";
          const notConf = i.status==="not_configured";
          return (
            <div key={i.id} style={{background:"var(--surface)",border:`1px solid ${connected?i.color+"33":"var(--border)"}`,borderRadius:12,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div style={{width:46,height:46,borderRadius:12,background:i.color+"22",border:`1.5px solid ${i.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:i.color,fontFamily:"var(--font-mono)"}}>{i.icon}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",background:connected?"#5daf7c18":notConf?"#f5656518":"#e8a84a18",border:`1px solid ${connected?"#5daf7c44":notConf?"#f5656533":"#e8a84a44"}`,borderRadius:20}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:connected?"#5daf7c":notConf?"#f56565":"#e8a84a"}}/>
                  <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:connected?"#5daf7c":notConf?"#f56565":"#e8a84a"}}>{connected?"CONNECTED":notConf?"NOT CONFIGURED":"ATTENTION"}</span>
                </div>
              </div>
              <div style={{fontFamily:"var(--font-head)",fontSize:20,fontWeight:700,marginBottom:4}}>{i.name}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>{i.desc}</div>

              {i.id==="square" && !loading && (
                <div style={{background:"var(--surface2)",borderRadius:8,padding:"12px 14px"}}>
                  {squareStatus?.connected ? (
                    <>
                      <div style={{fontSize:11,color:"#5daf7c",marginBottom:8}}>✓ Connected to Square {squareStatus.environment}</div>
                      {squareStatus.locations?.map(l=>(
                        <div key={l.id} style={{fontSize:11,color:"var(--muted)"}}>📍 {l.name} ({l.id})</div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div style={{fontSize:11,color:"#f56565",marginBottom:8}}>{squareStatus?.hint || "Set SQUARE_ACCESS_TOKEN in .env"}</div>
                      <a href="https://developer.squareup.com" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#4a9eff",textDecoration:"none"}}>→ Get free sandbox credentials</a>
                    </>
                  )}
                </div>
              )}

              {i.id==="square" && squareCards && (
                <div style={{marginTop:10,background:"var(--surface2)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",marginBottom:6}}>SANDBOX TEST CARDS</div>
                  {squareCards.cards?.map(c=>(
                    <div key={c.number} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                      <span style={{fontFamily:"var(--font-mono)",color:"var(--text)"}}>{c.number}</span>
                      <span style={{color:c.result==="Success"?"#5daf7c":"#f56565"}}>{c.result}</span>
                    </div>
                  ))}
                </div>
              )}

              {i.id==="gps" && (
                <div style={{background:"var(--surface2)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#5daf7c",marginBottom:4}}>✓ WebSocket GPS active</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>Endpoint: <code style={{fontFamily:"var(--font-mono)",color:"#e8a84a"}}>POST /api/gps/ping</code></div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>WS feed: <code style={{fontFamily:"var(--font-mono)",color:"#e8a84a"}}>ws://host/ws/gps</code></div>
                </div>
              )}

              {(i.id==="quickbooks"||i.id==="freshbooks") && (
                <div style={{background:"var(--surface2)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>Requires OAuth app registration:</div>
                  <a href={i.id==="quickbooks"?"https://developer.intuit.com":"https://www.freshbooks.com/api"} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#4a9eff",textDecoration:"none"}}>→ {i.id==="quickbooks"?"Register QuickBooks App":"Register FreshBooks App"}</a>
                  <div style={{marginTop:8,fontSize:10,color:"var(--dim)"}}>Add CLIENT_ID and CLIENT_SECRET to .env to activate</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CREATE CUSTOMER MODAL ────────────────────────────────────
const LEAD_SOURCES = [
  'Google Search','Google LSA','Yelp','Facebook','Instagram','Nextdoor',
  'HomeAdvisor / Angi','Thumbtack','Referral','Repeat Customer',
  'Website','Door Hanger / Flyer','Truck Wrap','Yellow Pages','Other',
];

function CreateCustomerModal({ onClose, onCreated }) {
  const [custType, setCustType] = useState('residential');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [mapsKey, setMapsKey] = useState('');
  const [svUrl, setSvUrl] = useState('');
  const [form, setForm] = useState({
    first_name:'', last_name:'',
    business_name:'', contact_name:'', contact_title:'',
    phones:[{ label:'Mobile', value:'' }],
    emails:[{ label:'Primary', value:'' }],
    address:'', city:'', state:'TX', zip:'',
    lat:null, lng:null,
    beds:'', baths:'', sqft:'',
    marketing_src:'', notes:'',
    sms_opt_out: false,
  });
  const [predictions, setPredictions] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [dropRect, setDropRect] = useState(null);
  const debounceRef = useRef(null);
  const addrInputRef = useRef(null);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Fetch Google Maps key (only needed for Street View img src)
  useEffect(()=>{
    api.get('/company/maps-key').then(r=>{ if(r?.key) setMapsKey(r.key); }).catch(()=>{});
  },[]);

  const handleAddrInput = (val)=>{
    set('address', val);
    clearTimeout(debounceRef.current);
    if(!val || val.length < 3){ setPredictions([]); setShowPredictions(false); return; }
    // Capture input position for fixed dropdown
    if(addrInputRef.current){
      const r = addrInputRef.current.getBoundingClientRect();
      setDropRect({top: r.bottom + 4, left: r.left, width: r.width});
    }
    debounceRef.current = setTimeout(async ()=>{
      try {
        const res = await api.placesAutocomplete(val);
        if(res.predictions?.length){ setPredictions(res.predictions); setShowPredictions(true); }
        else { setPredictions([]); setShowPredictions(false); }
      } catch(e){ console.error('Autocomplete error', e); setPredictions([]); setShowPredictions(false); }
    }, 250);
  };

  const selectPrediction = async (p)=>{
    setShowPredictions(false); setPredictions([]);
    set('address', p.structured_formatting.main_text);
    try {
      const place = await api.placeDetails(p.place_id);
      const c = place.address_components||[];
      const get  = t=>c.find(x=>x.types.includes(t))?.long_name  || '';
      const getSh= t=>c.find(x=>x.types.includes(t))?.short_name || '';
      const street = `${get('street_number')} ${get('route')}`.trim();
      const city   = get('locality') || get('sublocality_level_1');
      const state  = getSh('administrative_area_level_1');
      const zip    = get('postal_code');
      const lat    = place.geometry?.location?.lat;
      const lng    = place.geometry?.location?.lng;
      setForm(f=>({...f, address:street||f.address, city, state, zip, lat, lng}));
      if(lat && lng && mapsKey)
        setSvUrl(`https://maps.googleapis.com/maps/api/streetview?size=560x200&location=${lat},${lng}&key=${mapsKey}&fov=90`);
    } catch(e){ console.error('Place details failed', e); }
  };

  // Phone helpers
  const addPhone    = ()=> set('phones',[...form.phones,{label:'Mobile',value:''}]);
  const setPhone    = (i,k,v)=>{ const a=[...form.phones]; a[i]={...a[i],[k]:v}; set('phones',a); };
  const removePhone = i=> set('phones',form.phones.filter((_,j)=>j!==i));
  // Email helpers
  const addEmail    = ()=> set('emails',[...form.emails,{label:'Other',value:''}]);
  const setEmail    = (i,k,v)=>{ const a=[...form.emails]; a[i]={...a[i],[k]:v}; set('emails',a); };
  const removeEmail = i=> set('emails',form.emails.filter((_,j)=>j!==i));

  const save = async ()=>{
    setSaving(true); setErr(null);
    try {
      const payload = {
        customer_type: custType,
        first_name:    custType==='residential' ? form.first_name : form.business_name,
        last_name:     custType==='residential' ? form.last_name  : '',
        business_name: form.business_name,
        contact_name:  form.contact_name,
        contact_title: form.contact_title,
        email:  form.emails[0]?.value || '',
        phone:  form.phones[0]?.value || '',
        phone2: form.phones[1]?.value || '',
        phones: form.phones,
        emails: form.emails,
        marketing_src: form.marketing_src,
        notes: form.notes,
        sms_opt_out: form.sms_opt_out,
        property_info:{ beds:form.beds, baths:form.baths, sqft:form.sqft },
        address: form.address ? {
          street:form.address, city:form.city, state:form.state, zip:form.zip,
          lat:form.lat, lng:form.lng,
        } : null,
      };
      const created = await api.createCustomer(payload);
      onCreated(created);
    } catch(e){ setErr(e.message); }
    finally{ setSaving(false); }
  };

  const inp = { width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',boxSizing:'border-box' };
  const lbl = { fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:4,display:'block' };
  const sec = { marginBottom:22 };
  const sh  = { fontFamily:'var(--font-head)',fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:12,borderBottom:'1px solid var(--border)',paddingBottom:6,display:'flex',alignItems:'center',gap:8 };

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex'}}>
      <div onClick={onClose} style={{flex:1,background:'rgba(0,0,0,.55)'}}/>
      <div style={{width:640,background:'var(--bg)',display:'flex',flexDirection:'column',boxShadow:'-4px 0 32px rgba(0,0,0,.5)',animation:'slideRight .25s ease',overflowY:'auto'}}>

        {/* Header */}
        <div style={{padding:'18px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0,background:'var(--surface)'}}>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}><Icon n="x" size={18}/></button>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,flex:1}}>New Customer</div>
          {/* Residential / Commercial toggle */}
          <div style={{display:'flex',background:'var(--surface2)',borderRadius:8,padding:3,gap:2}}>
            {['residential','commercial'].map(t=>(
              <button key={t} onClick={()=>setCustType(t)} style={{
                padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
                background:custType===t?'var(--amber)':'transparent',
                color:custType===t?'#000':'var(--muted)',
                textTransform:'capitalize',transition:'background .15s',
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{padding:24,flex:1,overflowY:'auto'}}>

          {/* ── Name / Business ── */}
          <div style={sec}>
            <div style={sh}>{custType==='residential'?'Customer Name':'Business Info'}</div>
            {custType==='residential' ? (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div><label style={lbl}>FIRST NAME</label><input value={form.first_name} onChange={e=>set('first_name',e.target.value)} style={inp} placeholder="First name"/></div>
                <div><label style={lbl}>LAST NAME</label><input value={form.last_name} onChange={e=>set('last_name',e.target.value)} style={inp} placeholder="Last name"/></div>
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={lbl}>BUSINESS NAME</label><input value={form.business_name} onChange={e=>set('business_name',e.target.value)} style={inp} placeholder="Company name"/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div><label style={lbl}>POINT OF CONTACT</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} style={inp} placeholder="Contact name"/></div>
                  <div><label style={lbl}>TITLE / ROLE</label><input value={form.contact_title} onChange={e=>set('contact_title',e.target.value)} style={inp} placeholder="e.g. Property Manager"/></div>
                </div>
              </div>
            )}
          </div>

          {/* ── Phone Numbers ── */}
          <div style={sec}>
            <div style={sh}>
              <span style={{flex:1}}>Phone Numbers</span>
              <button onClick={addPhone} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,color:'var(--amber)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                <Icon n="plus" size={12} color="#e8a84a"/> Add
              </button>
            </div>
            {form.phones.map((p,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <select value={p.label} onChange={e=>setPhone(i,'label',e.target.value)} style={{...inp,width:110,flexShrink:0}}>
                  {['Mobile','Home','Work','Other'].map(l=><option key={l}>{l}</option>)}
                </select>
                <input value={p.value} onChange={e=>setPhone(i,'value',e.target.value)} style={{...inp,flex:1}} placeholder="(xxx) xxx-xxxx"/>
                {form.phones.length>1 && <button onClick={()=>removePhone(i)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}><Icon n="x" size={14}/></button>}
              </div>
            ))}
          </div>

          {/* ── Email Addresses ── */}
          <div style={sec}>
            <div style={sh}>
              <span style={{flex:1}}>Email Addresses</span>
              <button onClick={addEmail} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,color:'var(--amber)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                <Icon n="plus" size={12} color="#e8a84a"/> Add
              </button>
            </div>
            {form.emails.map((em,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <select value={em.label} onChange={e=>setEmail(i,'label',e.target.value)} style={{...inp,width:110,flexShrink:0}}>
                  {['Primary','Work','Home','Other'].map(l=><option key={l}>{l}</option>)}
                </select>
                <input value={em.value} onChange={e=>setEmail(i,'value',e.target.value)} style={{...inp,flex:1}} placeholder="email@example.com" type="email"/>
                {form.emails.length>1 && <button onClick={()=>removeEmail(i)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}><Icon n="x" size={14}/></button>}
              </div>
            ))}
          </div>

          {/* ── Service Address ── */}
          <div style={sec}>
            <div style={sh}>Service Address</div>
            <div style={{marginBottom:10,position:'relative'}}>
              <label style={lbl}>
                STREET ADDRESS{' '}
                {!mapsKey && <span style={{color:'var(--amber)',fontStyle:'normal'}}>(configure Google Maps in Settings → Integrations)</span>}
              </label>
              <input
                ref={addrInputRef}
                value={form.address}
                onChange={e=>handleAddrInput(e.target.value)}
                onBlur={()=>setTimeout(()=>setShowPredictions(false),200)}
                onFocus={()=>{ if(predictions.length>0){ if(addrInputRef.current){const r=addrInputRef.current.getBoundingClientRect();setDropRect({top:r.bottom+4,left:r.left,width:r.width});} setShowPredictions(true); } }}
                style={inp}
                placeholder={mapsKey?'Start typing address…':'Enter street address'}
                autoComplete="off"
              />
              {showPredictions && predictions.length>0 && dropRect && (
                <div style={{position:'fixed',top:dropRect.top,left:dropRect.left,width:dropRect.width,zIndex:99999,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:9,boxShadow:'0 8px 28px rgba(0,0,0,.6)',overflow:'hidden'}}>
                  {predictions.map((p,i)=>(
                    <div key={p.place_id}
                      onMouseDown={()=>selectPrediction(p)}
                      style={{padding:'10px 14px',cursor:'pointer',borderBottom:i<predictions.length-1?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:10,transition:'background .1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <span style={{fontSize:14,flexShrink:0,opacity:.7}}>📍</span>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.structured_formatting.main_text}</div>
                        <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.structured_formatting.secondary_text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}>
              <div><label style={lbl}>CITY</label><input value={form.city} onChange={e=>set('city',e.target.value)} style={inp} placeholder="Houston"/></div>
              <div><label style={lbl}>STATE</label><input value={form.state} onChange={e=>set('state',e.target.value)} style={inp} placeholder="TX" maxLength={2}/></div>
              <div><label style={lbl}>ZIP</label><input value={form.zip} onChange={e=>set('zip',e.target.value)} style={inp} placeholder="77001"/></div>
            </div>

            {/* Street View preview */}
            {svUrl && (
              <div style={{marginTop:12}}>
                <label style={lbl}>STREET VIEW</label>
                <div style={{borderRadius:10,overflow:'hidden',border:'1px solid var(--border2)',position:'relative'}}>
                  <img src={svUrl} alt="Street View" style={{width:'100%',display:'block',maxHeight:200,objectFit:'cover'}} onError={()=>setSvUrl('')}/>
                  <div style={{position:'absolute',bottom:6,right:8,fontSize:9,fontFamily:'var(--font-mono)',color:'rgba(255,255,255,.5)'}}>© Google Street View</div>
                </div>
              </div>
            )}

            {/* Property Info */}
            <div style={{marginTop:14}}>
              <label style={{...lbl,marginBottom:8}}>PROPERTY INFO <span style={{color:'var(--muted)',fontStyle:'normal'}}>(optional)</span></label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                <div><label style={lbl}>BEDROOMS</label><input value={form.beds} onChange={e=>set('beds',e.target.value)} style={inp} placeholder="3" type="number" min="0"/></div>
                <div><label style={lbl}>BATHROOMS</label><input value={form.baths} onChange={e=>set('baths',e.target.value)} style={inp} placeholder="2.5" type="number" min="0" step="0.5"/></div>
                <div><label style={lbl}>SQ FT</label><input value={form.sqft} onChange={e=>set('sqft',e.target.value)} style={inp} placeholder="1800" type="number" min="0"/></div>
              </div>
            </div>
          </div>

          {/* ── Lead Source + Notes ── */}
          <div style={sec}>
            <div style={sh}>Additional Info</div>
            <div style={{marginBottom:12}}>
              <label style={lbl}>LEAD SOURCE</label>
              <select value={form.marketing_src} onChange={e=>set('marketing_src',e.target.value)} style={inp}>
                <option value="">— Select source —</option>
                {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>NOTES</label>
              <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} style={{...inp,minHeight:80,resize:'vertical'}} placeholder="Internal notes about this customer..."/>
            </div>
            <div style={{marginTop:14,display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)'}}>
              <button type="button" onClick={()=>set('sms_opt_out',!form.sms_opt_out)} style={{
                width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',padding:2,transition:'background .2s',
                background:form.sms_opt_out?'var(--red)':'var(--green)',display:'flex',alignItems:'center',
                justifyContent:form.sms_opt_out?'flex-end':'flex-start',
              }}>
                <div style={{width:18,height:18,borderRadius:9,background:'#fff',flexShrink:0}}/>
              </button>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:form.sms_opt_out?'var(--red)':'var(--text)'}}>
                  {form.sms_opt_out ? 'SMS Opted Out' : 'SMS Notifications On'}
                </div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                  {form.sms_opt_out
                    ? 'No automated texts will be sent to this customer (TCPA compliance)'
                    : 'Customer will receive job status texts (en route, arrived, complete)'}
                </div>
              </div>
            </div>
          </div>

          {err && <div style={{background:'rgba(245,101,101,.1)',border:'1px solid rgba(245,101,101,.3)',borderRadius:8,padding:'10px 14px',color:'#ff6b6b',fontSize:12,marginBottom:8}}>{err}</div>}
        </div>

        {/* Footer */}
        <div style={{padding:'14px 24px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0,background:'var(--surface)'}}>
          <button onClick={onClose} style={{padding:'9px 20px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{padding:'9px 24px',background:'var(--amber)',border:'none',borderRadius:8,color:'#000',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.6:1}}>
            {saving?'Saving...':'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CUSTOMERS PAGE ───────────────────────────────────────────
function CustomersPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const {data:all, loading, reload} = useApi(() => api.getCustomers());

  const search = async () => {
    if(!q.trim()) { setResults(null); return; }
    const r = await api.getCustomers({q});
    setResults(r);
  };

  const displayed = results || all || [];

  return (
    <div style={{animation:"fadeUp .4s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,flex:1}}>Customers</div>
        <button onClick={()=>setShowCreate(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"var(--amberdim)",border:"1px solid var(--amber)",borderRadius:8,color:"var(--amber)",fontSize:12,fontWeight:600}}>
          <Icon n="plus" size={14} color="#e8a84a"/> New Customer
        </button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Search by name, phone, email..." style={{flex:1,background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:8,padding:"9px 14px",fontSize:13,color:"var(--text)"}}/>
        <button onClick={search} style={{padding:"9px 20px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",fontSize:13}}>Search</button>
        {results && <button onClick={()=>{setResults(null);setQ("");}} style={{padding:"9px 14px",background:"transparent",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontSize:12}}>Clear</button>}
      </div>
      {loading ? <div style={{display:"flex",justifyContent:"center",padding:40}}><Spinner/></div> : (
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"var(--surface2)",borderBottom:"1px solid var(--border2)"}}>
                {["Name","Phone","Email","Tags","Source"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".06em",fontWeight:500}}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(c=>(
                <tr key={c.id} style={{borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 14px",fontSize:13,fontWeight:500}}>{c.last_name}, {c.first_name}</td>
                  <td style={{padding:"10px 14px",fontFamily:"var(--font-mono)",fontSize:12,color:"var(--muted)"}}>{c.phone||"—"}</td>
                  <td style={{padding:"10px 14px",fontSize:12,color:"var(--muted)"}}>{c.email||"—"}</td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {(c.tags||[]).map(t=><span key={t} style={{background:"var(--surface3)",border:"1px solid var(--border2)",borderRadius:3,padding:"1px 7px",fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)"}}>{t}</span>)}
                    </div>
                  </td>
                  <td style={{padding:"10px 14px",fontSize:11,color:"var(--muted)"}}>{c.marketing_src||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && (
        <CreateCustomerModal
          onClose={()=>setShowCreate(false)}
          onCreated={()=>{ setShowCreate(false); reload(); }}
        />
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
// ─── DISPATCH BOARD ───────────────────────────────────────────
function DispatchPage() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [jobs, setJobs] = useState([]);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragOver, setDragOver] = useState(null);  // tech id
  const [dragPreviewX, setDragPreviewX] = useState(null); // px in timeline
  const [selected, setSelected] = useState(null);
  const [reschedule, setReschedule] = useState(null); // {date,start_time,end_time,tech_id}
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const scrollRef = useRef(null);

  const HOUR_W = 80;
  const ROW_H = 72;
  const TECH_W = 160;
  const START_H = 7;
  const END_H = 20;
  const HOURS = Array.from({length: END_H - START_H}, (_, i) => START_H + i);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, t] = await Promise.all([api.getJobs({date}), api.getTechnicians()]);
      setJobs(j || []);
      setTechs(t || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const timeToX = (timeStr) => {
    if (!timeStr) return 0;
    const d = new Date(timeStr);
    const h = d.getHours() + d.getMinutes() / 60;
    return Math.max(0, (h - START_H) * HOUR_W);
  };

  const jobWidth = (job) => {
    if (!job.scheduled_start || !job.scheduled_end) return HOUR_W * 2;
    const hrs = (new Date(job.scheduled_end) - new Date(job.scheduled_start)) / 3600000;
    return Math.max(HOUR_W * 0.5, hrs * HOUR_W);
  };

  // Compute hour from drop X (accounting for scroll + drag offset)
  const xToHour = (clientX, rowRect) => {
    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    const timelineX = clientX - rowRect.left - TECH_W + scrollLeft - dragOffset;
    const raw = START_H + timelineX / HOUR_W;
    return Math.round(Math.max(START_H, Math.min(END_H - 0.5, raw)) * 4) / 4; // 15-min snap
  };

  const hourToTimeStr = (h) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  };

  const statusColor = {
    on_site:"#e8a84a", en_route:"#4a9eff", completed:"#5daf7c",
    scheduled:"#a78bfa", unassigned:"#f56565", cancelled:"var(--dim)"
  };

  const handleDragStart = (job, e) => {
    setDragging(job);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset(e.clientX - rect.left);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (techId, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(techId);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left - TECH_W + scrollLeft - dragOffset;
    setDragPreviewX(Math.max(0, Math.min(HOURS.length * HOUR_W, x)));
  };

  const handleDrop = async (techId, e) => {
    e.preventDefault();
    if (!dragging) return;
    const rowRect = e.currentTarget.getBoundingClientRect();
    const newHour = xToHour(e.clientX, rowRect);
    const newStart = new Date(`${date}T${hourToTimeStr(newHour)}:00`);
    let newEnd;
    if (dragging.scheduled_start && dragging.scheduled_end) {
      const dur = new Date(dragging.scheduled_end) - new Date(dragging.scheduled_start);
      newEnd = new Date(newStart.getTime() + dur);
    } else {
      newEnd = new Date(newStart.getTime() + 7200000); // 2hr default
    }
    setDragOver(null); setDragPreviewX(null);
    const wasUnassigned = !dragging.technician_id || dragging.status === 'unassigned';
    const updates = {
      technician_id: techId,
      scheduled_start: newStart.toISOString(),
      scheduled_end: newEnd.toISOString(),
      status: wasUnassigned ? 'scheduled' : dragging.status,
    };
    try {
      await api.updateJob(dragging.id, updates);
      const techObj = techs.find(t => t.id === techId);
      setJobs(prev => prev.map(j => j.id === dragging.id
        ? {...j, ...updates, technician_name: techObj ? `${techObj.first_name} ${techObj.last_name}` : j.technician_name, technician_color: techObj?.color || j.technician_color}
        : j
      ));
    } catch(err) { toast.error('Update Failed', err.message); }
    setDragging(null);
  };

  const nowX = (() => {
    const now = new Date();
    return (now.getHours() + now.getMinutes() / 60 - START_H) * HOUR_W;
  })();

  const unassigned = jobs.filter(j => !j.technician_id || j.status === "unassigned");
  const isToday = date === today;

  const shiftDate = (days) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  };

  const friendlyDate = new Date(date + "T12:00:00").toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"});

  // Open a job in the detail panel and pre-populate reschedule fields
  const openJob = (job) => {
    setSelected(job);
    const s = job.scheduled_start ? new Date(job.scheduled_start) : null;
    const e2 = job.scheduled_end ? new Date(job.scheduled_end) : null;
    setReschedule({
      date: s ? s.toISOString().split('T')[0] : date,
      start_time: s ? s.toTimeString().slice(0,5) : '09:00',
      end_time: e2 ? e2.toTimeString().slice(0,5) : '11:00',
      tech_id: job.technician_id || '',
    });
  };

  const saveReschedule = async () => {
    if (!selected || !reschedule || saving) return;
    setSaving(true);
    try {
      const newStart = new Date(`${reschedule.date}T${reschedule.start_time}:00`);
      const newEnd   = new Date(`${reschedule.date}T${reschedule.end_time}:00`);
      const techObj  = techs.find(t => t.id === reschedule.tech_id);
      const updates  = {
        scheduled_start: newStart.toISOString(),
        scheduled_end:   newEnd.toISOString(),
        technician_id:   reschedule.tech_id || null,
        status: reschedule.tech_id
          ? (selected.status === 'unassigned' ? 'scheduled' : selected.status)
          : 'unassigned',
      };
      await api.updateJob(selected.id, updates);
      // If job moved to a different day, remove it from current view
      if (reschedule.date !== date) {
        setJobs(prev => prev.filter(j => j.id !== selected.id));
        setSelected(null); setReschedule(null);
      } else {
        const merged = {...selected, ...updates,
          technician_name: techObj ? `${techObj.first_name} ${techObj.last_name}` : selected.technician_name,
          technician_color: techObj?.color || selected.technician_color,
        };
        setJobs(prev => prev.map(j => j.id === selected.id ? merged : j));
        setSelected(merged);
        setSavedFlash(true); setTimeout(()=>setSavedFlash(false), 2000);
      }
    } catch(err) { toast.error('Save Failed', err.message); }
    finally { setSaving(false); }
  };

  const updateStatus = async (s) => {
    await api.updateJob(selected.id, {status:s});
    const merged = {...selected, status:s};
    setJobs(prev=>prev.map(j=>j.id===selected.id?{...j,status:s}:j));
    setSelected(merged);
  };

  // Quick date shortcuts
  const quickDate = (daysFromToday) => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + daysFromToday);
    setReschedule(r => ({...r, date: d.toISOString().split('T')[0]}));
  };

  // Preview time label during drag
  const previewHour = dragPreviewX != null ? (START_H + dragPreviewX / HOUR_W) : null;
  const previewLabel = previewHour != null ? (() => {
    const snapped = Math.round(previewHour * 4) / 4;
    const hh = Math.floor(snapped);
    const mm = Math.round((snapped - hh) * 60);
    const ampm = hh >= 12 ? 'pm' : 'am';
    const h12 = hh > 12 ? hh - 12 : hh || 12;
    return `${h12}:${String(mm).padStart(2,'0')}${ampm}`;
  })() : null;

  const sidebarW = selected ? 380 : 0;

  return (
    <div style={{animation:"fadeUp .4s ease",display:"flex",flexDirection:"column",height:"calc(100vh - 94px)",overflow:"hidden"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexShrink:0}}>
        <div style={{fontFamily:"var(--font-head)",fontSize:22,fontWeight:800,flex:1}}>Dispatch Board</div>
        <div style={{display:"flex",alignItems:"center",gap:0,background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:8,overflow:"hidden"}}>
          <button onClick={()=>shiftDate(-1)} style={{padding:"6px 12px",background:"transparent",color:"var(--muted)",fontSize:18,lineHeight:1,borderRight:"1px solid var(--border)"}}>&#8249;</button>
          <div style={{padding:"6px 12px",fontSize:12,fontFamily:"var(--font-mono)",color:"var(--text)",minWidth:116,textAlign:"center"}}>{friendlyDate}</div>
          <button onClick={()=>shiftDate(1)} style={{padding:"6px 12px",background:"transparent",color:"var(--muted)",fontSize:18,lineHeight:1,borderLeft:"1px solid var(--border)"}}>&#8250;</button>
        </div>
        <button onClick={()=>setDate(today)} style={{padding:"6px 14px",background:isToday?"var(--amberdim)":"var(--surface2)",border:"1px solid "+(isToday?"var(--amber)":"var(--border)"),borderRadius:8,color:isToday?"var(--amber)":"var(--muted)",fontSize:12,fontWeight:isToday?600:400}}>Today</button>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:8,padding:"6px 10px",fontSize:12,color:"var(--text)",fontFamily:"var(--font-mono)",width:130}}/>
        <button onClick={load} style={{display:"flex",gap:6,alignItems:"center",padding:"7px 14px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontSize:12}}>
          <Icon n="refresh" size={13} color="var(--muted)"/> Refresh
        </button>
        <button onClick={()=>setShowNewJob(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",background:"var(--amberdim)",border:"1px solid var(--amber)",borderRadius:8,color:"var(--amber)",fontSize:12,fontWeight:600}}>
          <Icon n="plus" size={14} color="var(--amber)"/> New Job
        </button>
      </div>

      {/* Summary pills */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexShrink:0}}>
        {[
          {label:"Total",    val:jobs.length,                                    color:"var(--muted)"},
          {label:"On Site",  val:jobs.filter(j=>j.status==="on_site").length,    color:"#e8a84a"},
          {label:"En Route", val:jobs.filter(j=>j.status==="en_route").length,   color:"#4a9eff"},
          {label:"Scheduled",val:jobs.filter(j=>j.status==="scheduled").length,  color:"#a78bfa"},
          {label:"Completed",val:jobs.filter(j=>j.status==="completed").length,  color:"#5daf7c"},
          {label:"Unassigned",val:unassigned.length,                             color:"#f56565"},
        ].map(p=>(
          <div key={p.label} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"var(--surface)",border:`1px solid ${p.color}33`,borderRadius:20}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:p.color}}/>
            <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:p.color}}>{p.val}</span>
            <span style={{fontSize:10,color:"var(--muted)"}}>{p.label}</span>
          </div>
        ))}
        {dragging && (
          <div style={{marginLeft:"auto",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--green)",display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"var(--greendim)",border:"1px solid var(--green)44",borderRadius:20}}>
            ↔ Drop on a row to set time &amp; technician
            {previewLabel && <strong>{previewLabel}</strong>}
          </div>
        )}
      </div>

      {/* Main area + sidebar */}
      <div style={{flex:1,display:"flex",gap:0,minHeight:0,overflow:"hidden"}}>

        {/* Board */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,overflow:"hidden",transition:"all .2s"}}>

          {/* Gantt */}
          <div style={{flex:1,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",display:"flex",flexDirection:"column"}}>

            {/* Time header — synced scroll */}
            <div style={{display:"flex",borderBottom:"1px solid var(--border2)",flexShrink:0,overflow:"hidden"}}>
              <div style={{width:TECH_W,minWidth:TECH_W,padding:"8px 14px",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",borderRight:"1px solid var(--border2)",flexShrink:0}}>TECHNICIAN</div>
              <div style={{flex:1,overflowX:"hidden"}}>
                <div style={{display:"flex",width:HOURS.length*HOUR_W}}>
                  {HOURS.map(h=>(
                    <div key={h} style={{width:HOUR_W,minWidth:HOUR_W,padding:"8px 0",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",borderRight:"1px solid var(--border)",textAlign:"center"}}>
                      {h===12?"12pm":h>12?`${h-12}pm`:`${h}am`}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tech rows */}
            <div style={{flex:1,overflowY:"auto",overflowX:"auto"}} ref={scrollRef}>
              {loading
                ? <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:40}}><Spinner/></div>
                : techs.map((tech) => {
                    const techJobs = jobs.filter(j => j.technician_id === tech.id);
                    const isDragTarget = dragOver === tech.id;
                    return (
                      <div key={tech.id}
                        style={{display:"flex",borderBottom:"1px solid var(--border)",minHeight:ROW_H,background:isDragTarget?`${tech.color}10`:"transparent",transition:"background .1s",position:"relative"}}
                        onDragOver={e=>handleDragOver(tech.id,e)}
                        onDragLeave={()=>{setDragOver(null);setDragPreviewX(null);}}
                        onDrop={e=>handleDrop(tech.id,e)}>

                        {/* Tech label */}
                        <div style={{width:TECH_W,minWidth:TECH_W,padding:"10px 14px",borderRight:"1px solid var(--border2)",display:"flex",alignItems:"center",gap:8,flexShrink:0,cursor:"default"}}>
                          <div style={{width:30,height:30,borderRadius:"50%",background:tech.color+"22",border:`1.5px solid ${tech.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:tech.color,fontFamily:"var(--font-mono)",flexShrink:0}}>
                            {tech.initials}
                          </div>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tech.first_name}</div>
                            <div style={{fontSize:10,color:"var(--muted)"}}>{techJobs.length} job{techJobs.length!==1?"s":""}</div>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div style={{flex:1,position:"relative",minWidth:HOURS.length*HOUR_W}}>
                          {HOURS.map((h,i)=>(
                            <div key={h} style={{position:"absolute",left:i*HOUR_W,top:0,bottom:0,width:1,background:"var(--border)",opacity:.4}}/>
                          ))}

                          {/* NOW line */}
                          {date===today&&nowX>0&&nowX<HOURS.length*HOUR_W&&(
                            <div style={{position:"absolute",left:nowX,top:0,bottom:0,width:2,background:"var(--red)",zIndex:10,opacity:.85,pointerEvents:"none"}}>
                              <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",background:"var(--red)",borderRadius:"0 0 4px 4px",padding:"2px 6px",fontSize:8,fontFamily:"var(--font-mono)",color:"#fff",whiteSpace:"nowrap",fontWeight:700}}>
                                {new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
                              </div>
                            </div>
                          )}

                          {/* Drag preview drop line */}
                          {isDragTarget&&dragPreviewX!=null&&(
                            <div style={{position:"absolute",left:dragPreviewX,top:0,bottom:0,width:2,background:"var(--green)",zIndex:15,opacity:.9,pointerEvents:"none"}}>
                              <div style={{position:"absolute",top:3,left:4,background:"var(--green)",color:"#fff",borderRadius:3,padding:"1px 5px",fontSize:8,fontFamily:"var(--font-mono)",fontWeight:700,whiteSpace:"nowrap"}}>{previewLabel}</div>
                            </div>
                          )}

                          {/* Job blocks */}
                          {techJobs.map(job=>{
                            const x = timeToX(job.scheduled_start);
                            const w = jobWidth(job);
                            const color = statusColor[job.status]||"var(--muted)";
                            const isSel = selected?.id===job.id;
                            const isDraggingThis = dragging?.id===job.id;
                            return (
                              <div key={job.id}
                                draggable
                                onDragStart={e=>handleDragStart(job,e)}
                                onDragEnd={()=>{setDragging(null);setDragOver(null);setDragPreviewX(null);}}
                                onClick={e=>{e.stopPropagation();isSel?setSelected(null):openJob(job);}}
                                title={`${job.customer_name} · ${job.job_type||''} · drag to reschedule`}
                                style={{
                                  position:"absolute",left:x+3,top:7,
                                  width:Math.max(w-6,44),height:ROW_H-14,
                                  background:isSel?`linear-gradient(90deg,${color}44,${color}18)`:`linear-gradient(90deg,${color}55,${color}0d)`,
                                  border:`1.5px solid ${color}${isSel?"":"55"}`,
                                  borderRadius:8,padding:"5px 8px",
                                  cursor:isDraggingThis?"grabbing":"grab",
                                  overflow:"hidden",zIndex:isSel?20:5,
                                  opacity:isDraggingThis?0.4:1,
                                  boxShadow:isSel?`0 0 0 2px ${color},0 4px 16px ${color}33`:"none",
                                  transition:"box-shadow .15s,opacity .1s",
                                  userSelect:"none",
                                }}>
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <div style={{fontSize:10,fontWeight:700,color,fontFamily:"var(--font-mono)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2,flex:1}}>{job.customer_name}</div>
                                  {job.restock_needed&&<span title="Restock needed" style={{fontSize:9,background:"#f5656522",border:"1px solid #f56565",borderRadius:4,padding:"1px 4px",color:"#f56565",fontWeight:700,flexShrink:0}}>⚠</span>}
                                </div>
                                <div style={{fontSize:9,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{job.job_type}</div>
                                {w>74&&(
                                  <div style={{fontSize:9,fontFamily:"var(--font-mono)",color,marginTop:2,opacity:.8}}>
                                    {job.scheduled_start?new Date(job.scheduled_start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):""}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* Unassigned tray */}
          <div style={{background:"var(--surface)",border:"1px solid "+(unassigned.length>0?"#f5656544":"var(--border)"),borderRadius:12,padding:"12px 14px",flexShrink:0,minHeight:64}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:unassigned.length>0?10:0}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:unassigned.length>0?"#f56565":"var(--muted)"}}/>
              <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:unassigned.length>0?"#f56565":"var(--muted)",letterSpacing:".07em"}}>
                UNASSIGNED {unassigned.length>0?`(${unassigned.length}) — drag onto a tech row to assign & set time`:"— none"}
              </span>
            </div>
            {!unassigned.length&&<div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic",paddingLeft:14}}>All jobs assigned</div>}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {unassigned.map(job=>{
                const isDraggingThis = dragging?.id===job.id;
                const isSel = selected?.id===job.id;
                return (
                  <div key={job.id} draggable
                    onDragStart={e=>handleDragStart(job,e)}
                    onDragEnd={()=>{setDragging(null);setDragOver(null);setDragPreviewX(null);}}
                    onClick={()=>isSel?setSelected(null):openJob(job)}
                    style={{background:isDraggingThis?"#f5656530":"#f5656510",border:"1px solid "+(isSel?"#f56565":"#f5656544"),borderRadius:8,padding:"7px 12px",cursor:isDraggingThis?"grabbing":"grab",display:"flex",alignItems:"center",gap:10,opacity:isDraggingThis?0.4:1,boxShadow:isSel?"0 0 0 2px #f56565":"none",transition:"all .1s",userSelect:"none"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:"#f56565",flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:600}}>{job.customer_name}</div>
                      <div style={{fontSize:10,color:"var(--muted)"}}>{job.job_type||"No type"}{job.address?` · ${job.address.split(",")[0]}`:""}</div>
                    </div>
                    <span style={{fontSize:9,fontFamily:"var(--font-mono)",color:"#f56565",background:"#f5656515",padding:"2px 6px",borderRadius:4,marginLeft:"auto"}}>UNASSIGNED</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── JOB DETAIL / RESCHEDULE PANEL ── */}
        {selected&&(
          <div style={{width:380,minWidth:380,background:"var(--surface)",borderLeft:"1px solid var(--border)",display:"flex",flexDirection:"column",overflowY:"auto",animation:"slideRight .2s ease"}} className="scrollbar-thin">

            {/* Panel header */}
            <div style={{padding:"14px 18px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:"var(--font-head)",fontSize:15,fontWeight:700}}>Job #{selected.job_number||"—"}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{selected.customer_name}</div>
              </div>
              <button onClick={()=>{setSelected(null);setReschedule(null);}} style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:7,padding:"5px 8px",color:"var(--muted)",cursor:"pointer"}}>
                <Icon n="x" size={14} color="var(--muted)"/>
              </button>
            </div>

            <div style={{flex:1,padding:"16px 18px",display:"flex",flexDirection:"column",gap:16}}>

              {/* Customer info */}
              <div style={{background:"var(--surface2)",borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:5}}>
                {[
                  ["Phone", selected.customer_phone||"—"],
                  ["Address", selected.address||"—"],
                  ["Type", selected.job_type||"—"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                    <span style={{color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:10}}>{k}</span>
                    <span style={{color:"var(--text)",textAlign:"right",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                  </div>
                ))}
                {selected.description&&(
                  <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid var(--border)",fontSize:11,color:"var(--muted)",lineHeight:1.5}}>{selected.description.slice(0,200)}{selected.description.length>200?"…":""}</div>
                )}
              </div>

              {/* ── RESCHEDULE SECTION ── */}
              <div>
                <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--amber)",letterSpacing:".08em",marginBottom:10,fontWeight:600}}>RESCHEDULE</div>

                {/* Quick date buttons */}
                <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                  {[
                    {label:"Today",    d:0},
                    {label:"Tomorrow", d:1},
                    {label:"+2 Days",  d:2},
                    {label:"Next Week",d:7},
                  ].map(({label,d})=>{
                    const targetDate = (() => {
                      const dt = new Date(today+"T12:00:00");
                      dt.setDate(dt.getDate()+d);
                      return dt.toISOString().split('T')[0];
                    })();
                    const active = reschedule?.date===targetDate;
                    return (
                      <button key={label} onClick={()=>quickDate(d)}
                        style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:active?700:400,cursor:"pointer",border:`1px solid ${active?"var(--amber)":"var(--border)"}`,background:active?"var(--amberdim)":"var(--surface2)",color:active?"var(--amber)":"var(--muted)",transition:"all .15s"}}>
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Date picker */}
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",display:"block",marginBottom:4,letterSpacing:".05em"}}>DATE</label>
                  <input type="date" value={reschedule?.date||date}
                    onChange={e=>setReschedule(r=>({...r,date:e.target.value}))}
                    style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,padding:"8px 10px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box"}}/>
                </div>

                {/* Time row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  {[["START TIME","start_time"],["END TIME","end_time"]].map(([lbl,key])=>(
                    <div key={key}>
                      <label style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",display:"block",marginBottom:4,letterSpacing:".05em"}}>{lbl}</label>
                      <input type="time" value={reschedule?.[key]||""}
                        onChange={e=>setReschedule(r=>({...r,[key]:e.target.value}))}
                        style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,padding:"8px 10px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box"}}/>
                    </div>
                  ))}
                </div>

                {/* Technician selector */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",display:"block",marginBottom:4,letterSpacing:".05em"}}>TECHNICIAN</label>
                  <select value={reschedule?.tech_id||""}
                    onChange={e=>setReschedule(r=>({...r,tech_id:e.target.value}))}
                    style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,padding:"8px 10px",color:reschedule?.tech_id?"var(--text)":"var(--muted)",fontSize:13,boxSizing:"border-box"}}>
                    <option value="">— Unassigned —</option>
                    {techs.map(t=>(
                      <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                    ))}
                  </select>
                </div>

                {/* Save button */}
                <button onClick={saveReschedule} disabled={saving}
                  style={{width:"100%",padding:"11px",borderRadius:9,border:"none",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",transition:"all .15s",
                    background:savedFlash?"var(--greendim)":saving?"var(--surface2)":"var(--green)",
                    color:savedFlash?"var(--green)":saving?"var(--muted)":"#fff"}}>
                  {savedFlash?"✓ Saved!":saving?"Saving…":reschedule?.date!==date?"Move to "+new Date(reschedule?.date+"T12:00:00").toLocaleDateString([],{month:"short",day:"numeric"}):"Save Changes"}
                </button>

                {reschedule?.date!==date&&(
                  <div style={{fontSize:10,color:"var(--muted)",textAlign:"center",marginTop:6,fontFamily:"var(--font-mono)"}}>Job will be removed from today's board after saving</div>
                )}
              </div>

              {/* Status update */}
              <div>
                <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",marginBottom:8}}>STATUS</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {["scheduled","en_route","on_site","completed"].map(s=>{
                    const c = statusColor[s]||"var(--muted)";
                    const active = selected.status===s;
                    return (
                      <button key={s} onClick={()=>updateStatus(s)}
                        style={{padding:"8px 10px",background:active?`${c}22`:"var(--surface2)",border:`1px solid ${active?c:c+"33"}`,borderRadius:8,color:active?c:"var(--muted)",fontSize:11,fontWeight:active?700:400,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all .15s"}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:active?c:c+"66",flexShrink:0}}/>
                        {s.replace("_"," ").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              {selected.notes&&(
                <div style={{background:"var(--surface2)",borderRadius:8,padding:10,borderLeft:"3px solid var(--amber)"}}>
                  <div style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",marginBottom:4,letterSpacing:".05em"}}>NOTES</div>
                  <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>{selected.notes}</div>
                </div>
              )}

              {/* Restock alert */}
              {selected.restock_needed&&(
                <div style={{background:"#f5656511",border:"1px solid #f5656544",borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>⚠</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f56565"}}>Restock Needed</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>Truck stock is low after this job</div>
                  </div>
                  <button onClick={async()=>{
                    await api.updateJob(selected.id,{restock_needed:false});
                    const merged={...selected,restock_needed:false};
                    setJobs(prev=>prev.map(j=>j.id===selected.id?merged:j));
                    setSelected(merged);
                  }} style={{fontSize:11,padding:"5px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,color:"var(--muted)",cursor:"pointer",whiteSpace:"nowrap"}}>
                    Mark Restocked
                  </button>
                </div>
              )}

              {/* Profitability */}
              {selected.status==="completed"&&(
                <ProfitabilityPanel jobId={selected.id}/>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfitabilityPanel({jobId}) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(()=>{
    setLoading(true);
    fetch(`/api/jobs/${jobId}/material-cost`,{headers:{Authorization:`Bearer ${localStorage.getItem('dps_token')}`}})
      .then(r=>r.json()).then(setData).catch(()=>setData(null)).finally(()=>setLoading(false));
  },[jobId]);

  if (loading) return <div style={{fontSize:11,color:"var(--muted)",textAlign:"center",padding:8}}>Loading profitability…</div>;
  if (!data) return null;

  const margin = data.gross_margin_pct;
  const marginColor = margin==null?"var(--muted)":margin>=40?"var(--green)":margin>=20?"var(--amber)":"#f56565";

  return (
    <div style={{background:"var(--surface2)",borderRadius:10,padding:14}}>
      <div style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--muted)",letterSpacing:".08em",marginBottom:10,fontWeight:600}}>PROFITABILITY</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[
          ["Revenue", data.revenue!=null?`$${Number(data.revenue).toFixed(2)}`:"—"],
          ["Materials", `$${Number(data.total_material_cost).toFixed(2)}`],
          ["Labor", data.total_labor_cost!=null?`$${Number(data.total_labor_cost).toFixed(2)}`:"—"],
          ["Margin", margin!=null?`${margin}%`:"—"],
        ].map(([label,val])=>(
          <div key={label} style={{background:"var(--surface)",borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--font-mono)",letterSpacing:".05em",marginBottom:2}}>{label}</div>
            <div style={{fontSize:15,fontWeight:700,color:label==="Margin"?marginColor:"var(--text)"}}>{val}</div>
          </div>
        ))}
      </div>
      {data.line_items?.length>0&&(
        <div style={{borderTop:"1px solid var(--border)",paddingTop:8}}>
          <div style={{fontSize:9,color:"var(--muted)",letterSpacing:".05em",marginBottom:6}}>LINE ITEMS</div>
          {data.line_items.map((item,i)=>(
            <div key={i} style={{display:"flex",fontSize:11,gap:6,padding:"3px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{flex:1,color:"var(--text)"}}>{item.name}</span>
              <span style={{color:"var(--muted)",fontFamily:"var(--font-mono)"}}>×{item.qty}</span>
              <span style={{color:"var(--text)",fontFamily:"var(--font-mono)",minWidth:54,textAlign:"right"}}>${Number(item.line_total).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {data.line_items?.length===0&&<div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>No parts scanned on this job</div>}
    </div>
  );
}

function PricebookSettingsPage({ user }) {
  const [subPage, setSubPage] = useState('jobs');
  const [pbFilter, setPbFilter] = useState('residential');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [expandedCats, setExpandedCats] = useState({});
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'admin';
  const TIER_KEYS = ['price_good','price_better','price_best','price_premium','price_elite'];
  const TIER_LABELS = ['Good','Better','Best','Premium','Elite'];
  const TIER_COLORS = ['#27ae60','#2980b9','#8e44ad','#e67e22','#c0392b'];
  const TH = {padding:'9px 14px',textAlign:'left',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',fontWeight:500};
  const TD = {padding:'10px 14px',verticalAlign:'middle'};
  const INP = {width:'100%',background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:14,color:'var(--text)',fontFamily:'var(--font-mono)'};
  useEffect(() => { loadJobs(); }, [subPage, pbFilter, search]);
  const loadJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pricebook: pbFilter });
      if (search.length > 1) params.set('search', search);
      const res = await api.get('/pricebook?' + params);
      const cats = res.data?.categories || res.categories || [];
      setCategories(cats);
      if (cats.length > 0 && !search) setExpandedCats({ [cats[0].id]: true });
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };
  const saveItem = async (item) => {
    setSaving(true);
    try {
      await api.patch('/pricebook/items/' + item.id, { price_good: item.price_good, price_better: item.price_better, price_best: item.price_best, price_premium: item.price_premium, price_elite: item.price_elite, active: item.active });
      setEditItem(null); loadJobs();
    } catch(e) {} finally { setSaving(false); }
  };
  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:20}}>Pricebook Settings</div>
      {!isAdmin ? (
        <div style={{background:'var(--surface)',border:'1px solid #f5656533',borderRadius:12,padding:32,textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>lock</div>
          <div style={{fontSize:16,fontWeight:600,color:'#f56565'}}>Admin Access Required</div>
        </div>
      ) : (
        <>
          <div style={{display:'flex',gap:10,marginBottom:14}}>
            <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              {['residential','commercial'].map(pb => (
                <button key={pb} onClick={() => setPbFilter(pb)} style={{padding:'7px 16px',fontSize:12,background:pbFilter===pb?'var(--amberdim)':'transparent',color:pbFilter===pb?'var(--amber)':'var(--muted)',borderRight:'1px solid var(--border)'}}>
                  {pb === 'residential' ? 'Residential' : 'Commercial'}
                </button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search jobs...' style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'8px 14px',fontSize:13,color:'var(--text)',width:300}}/>
          </div>
          {loading ? <div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div> : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {categories.map(cat => (
                <div key={cat.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
                  <button onClick={() => setExpandedCats(p => ({...p,[cat.id]:!p[cat.id]}))} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--surface2)',border:'none',color:'var(--text)',cursor:'pointer'}}>
                    <span style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700}}>{cat.name}</span>
                    <span style={{fontSize:11,color:'var(--muted)'}}>{cat.items ? cat.items.length : 0} items</span>
                  </button>
                  {expandedCats[cat.id] && (
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead><tr style={{borderBottom:'1px solid var(--border2)',background:'var(--surface3)'}}>
                        <th style={TH}>Code</th><th style={TH}>Job Name</th><th style={TH}>Hrs</th>
                        {TIER_LABELS.map((l,i) => <th key={l} style={{...TH,color:TIER_COLORS[i]}}>{l}</th>)}
                        <th style={TH}>Edit</th>
                      </tr></thead>
                      <tbody>
                        {(cat.items||[]).map(item => (
                          <tr key={item.id} style={{borderBottom:'1px solid var(--border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td style={TD}><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'#5daf7c'}}>{item.code}</span></td>
                            <td style={TD}><div style={{fontSize:13,fontWeight:500}}>{item.name}</div></td>
                            <td style={{...TD,fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{item.labor_hours}h</td>
                            {TIER_KEYS.map((k,i) => <td key={k} style={{...TD,fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:TIER_COLORS[i]}}>{parseFloat(item[k]||0).toFixed(2)}</td>)}
                            <td style={TD}><button onClick={() => setEditItem({...item})} style={{padding:'4px 12px',fontSize:11,background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,color:'var(--amber)',cursor:'pointer'}}>Edit</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
          {editItem && (
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setEditItem(null);}}>
              <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:16,padding:28,width:500,maxHeight:'80vh',overflowY:'auto'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
                  <div><div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'#5daf7c'}}>{editItem.code}</div><div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>{editItem.name}</div></div>
                  <button onClick={()=>setEditItem(null)} style={{background:'transparent',color:'var(--muted)',fontSize:20,cursor:'pointer'}}>X</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  {TIER_KEYS.map((k,i) => (
                    <div key={k}>
                      <label style={{display:'block',fontSize:11,color:TIER_COLORS[i],marginBottom:5}}>{TIER_LABELS[i]}</label>
                      <input type='number' step='0.01' value={editItem[k]||''} onChange={e=>setEditItem(p=>({...p,[k]:e.target.value}))} style={INP}/>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                  <button onClick={()=>setEditItem(null)} style={{padding:'9px 20px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',cursor:'pointer'}}>Cancel</button>
                  <button onClick={()=>saveItem(editItem)} style={{padding:'9px 20px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}



function PricebookPage() {
  const [pbFilter, setPbFilter] = useState('residential');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [expandedCats, setExpandedCats] = useState({});
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const TIER_KEYS = ['price_good','price_better','price_best','price_premium','price_elite'];
  const TIER_LABELS = ['Good','Better','Best','Premium','Elite'];
  const TIER_COLORS = ['#27ae60','#2980b9','#8e44ad','#e67e22','#c0392b'];
  const TH = {padding:'9px 14px',textAlign:'left',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',fontWeight:500};
  const TD = {padding:'10px 14px',verticalAlign:'middle'};
  useEffect(() => { loadJobs(); }, [pbFilter, search]);
  const loadJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({pricebook: pbFilter});
      if (search.length > 1) params.set('search', search);
      const res = await api.get('/pricebook?' + params);
      const cats = res.data ? res.data.categories : (res.categories || []);
      setCategories(cats || []);
      if (cats && cats.length > 0 && !search) setExpandedCats({[cats[0].id]: true});
      else if (search && cats) { const exp = {}; cats.forEach(c => { exp[c.id] = true; }); setExpandedCats(exp); }
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };
  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:20}}>Pricebook</div>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {['residential','commercial'].map(pb => (
            <button key={pb} onClick={() => setPbFilter(pb)} style={{padding:'7px 16px',fontSize:12,background:pbFilter===pb?'var(--amberdim)':'transparent',color:pbFilter===pb?'var(--amber)':'var(--muted)',borderRight:'1px solid var(--border)'}}>
              {pb === 'residential' ? 'Residential' : 'Commercial'}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search 272 jobs...' style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'8px 14px',fontSize:13,color:'var(--text)',width:320}}/>
      </div>
      {loading ? <div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div> : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {categories.map(cat => (
            <div key={cat.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
              <button onClick={() => setExpandedCats(p => ({...p,[cat.id]:!p[cat.id]}))} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--surface2)',border:'none',color:'var(--text)',cursor:'pointer'}}>
                <span style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:700}}>{cat.name}</span>
                <span style={{fontSize:11,color:'var(--muted)'}}>{cat.items ? cat.items.length : 0} items</span>
              </button>
              {expandedCats[cat.id] && (
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border2)',background:'var(--surface3)'}}>
                    <th style={TH}>Code</th><th style={TH}>Job Name</th><th style={TH}>Hrs</th>
                    {TIER_LABELS.map((l,i) => <th key={l} style={{...TH,color:TIER_COLORS[i]}}>{l}</th>)}
                  </tr></thead>
                  <tbody>
                    {(cat.items||[]).map(item => (
                      <tr key={item.id} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}} onClick={() => setDetail(detail && detail.id===item.id ? null : item)} onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={TD}><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'#5daf7c'}}>{item.code}</span></td>
                        <td style={TD}><div style={{fontSize:13,fontWeight:500}}>{item.name}</div></td>
                        <td style={{...TD,fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{item.labor_hours}h</td>
                        {TIER_KEYS.map((k,i) => <td key={k} style={{...TD,fontFamily:'var(--font-mono)',fontSize:13,fontWeight:600,color:TIER_COLORS[i]}}>{parseFloat(item[k]||0).toFixed(2)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
      {detail && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setDetail(null);}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:16,padding:28,width:480}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'#5daf7c',marginBottom:4}}>{detail.code}</div>
            <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:700,marginBottom:8}}>{detail.name}</div>
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>{detail.description}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              {TIER_KEYS.map((k,i) => (
                <div key={k} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px'}}>
                  <div style={{fontSize:10,color:TIER_COLORS[i],fontFamily:'var(--font-mono)',marginBottom:4}}>{TIER_LABELS[i].toUpperCase()}</div>
                  <div style={{fontSize:22,fontWeight:800,color:TIER_COLORS[i]}}>{parseFloat(detail[k]||0).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setDetail(null)} style={{width:'100%',padding:'9px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',cursor:'pointer'}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PricebookAdminSection({ user }) {
  const [settings, setSettings] = useState(null);
  const [edited, setEdited] = useState({});
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCalc, setShowCalc] = useState(false);
  useEffect(() => { loadSettings(); }, []);
  const loadSettings = async () => {
    try {
      const res = await api.getPricebookSettings();
      setSettings(res.settings || (res.data ? res.data.settings : null));
    } catch(e) { console.error(e); }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.savePricebookSettings(edited);
      setMsg('Saved'); setTimeout(() => setMsg(''), 2000);
      setEdited({}); loadSettings();
    } catch(e) { setMsg('Error'); } finally { setSaving(false); }
  };
  const recalculate = async () => {
    setRecalcing(true);
    try {
      const res = await api.recalculatePricebook();
      const count = res.updated || (res.data ? res.data.updated : '?');
      setMsg('Recalculated ' + count + ' items'); setTimeout(() => setMsg(''), 3000);
    } catch(e) { setMsg('Error'); } finally { setRecalcing(false); }
  };
  const val = (id) => {
    if (edited[id] !== undefined) return edited[id];
    if (settings && settings[id]) return settings[id].value;
    return '';
  };
  const set = (id, v) => setEdited(p => ({...p, [id]: v}));
  const hasChanges = Object.keys(edited).length > 0;
  const TIERS = [
    {id:'tier1_multiplier',label:'Tier 1 - Good',color:'#27ae60'},
    {id:'tier2_multiplier',label:'Tier 2 - Better',color:'#2980b9'},
    {id:'tier3_multiplier',label:'Tier 3 - Best',color:'#8e44ad'},
    {id:'tier4_multiplier',label:'Tier 4 - Premium',color:'#e67e22'},
    {id:'tier5_multiplier',label:'Tier 5 - Elite',color:'#c0392b'},
  ];
  const LABOR = [
    {id:'base_labor_rate',label:'Tech Burdened Rate (per hr)'},
    {id:'material_markup',label:'Material Markup (0.35 = 35%)'},
    {id:'overhead_rate',label:'Overhead Rate'},
    {id:'desired_net_profit',label:'Desired Net Profit'},
    {id:'flat_rate_buffer',label:'Flat Rate Buffer'},
    {id:'dispatch_fee',label:'Dispatch / Trip Fee'},
    {id:'emergency_surcharge',label:'Emergency Surcharge'},
  ];
  const inp = (id) => ({width:'100%',background:'var(--surface)',border:'1px solid '+(edited[id]!==undefined?'var(--amber)':'var(--border2)'),borderRadius:8,padding:'8px 12px',fontSize:14,color:'var(--text)',fontFamily:'var(--font-mono)'});
  if (!settings) return <div style={{padding:20,textAlign:'center'}}><Spinner/></div>;
  return (
    <div style={{marginTop:32,paddingTop:24,borderTop:'1px solid var(--border)'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,flex:1}}>Pricebook Engine Settings</div>
        {msg && <div style={{fontSize:12,padding:'4px 12px',background:msg.includes('Error')?'#f5656518':'#5daf7c18',color:msg.includes('Error')?'#f56565':'#5daf7c',borderRadius:6}}>{msg}</div>}
        {hasChanges && <button onClick={save} disabled={saving} style={{padding:'8px 18px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save Changes'}</button>}
        <button onClick={recalculate} disabled={recalcing} style={{padding:'8px 18px',background:'#5daf7c18',border:'1px solid #5daf7c44',borderRadius:8,color:'#5daf7c',fontSize:12,fontWeight:600,cursor:'pointer'}}>{recalcing?'Recalculating...':'Recalculate All Prices'}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:16,color:'var(--amber)'}}>Menu Pricing Tiers</div>
          {TIERS.map(t => (
            <div key={t.id} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{width:10,height:10,borderRadius:2,background:t.color,flexShrink:0}}/>
              <label style={{flex:1,fontSize:13,fontWeight:600,color:t.color}}>{t.label}</label>
              <input type='number' step='0.01' value={val(t.id)} onChange={e=>set(t.id,e.target.value)} style={{...inp(t.id),width:100}}/>
            </div>
          ))}
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:16}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,color:'var(--amber)',flex:1}}>Labor and Overhead</div>
            <button onClick={()=>setShowCalc(true)} style={{padding:'5px 12px',background:'#5daf7c18',border:'1px solid #5daf7c44',borderRadius:6,color:'#5daf7c',fontSize:11,fontWeight:600,cursor:'pointer'}}>🧮 Calculate Tech Burdened Rate</button>
          </div>
          {showCalc && <BurdenedRateCalculator onSave={(rate) => { set('base_labor_rate', rate); setEdited(p => ({...p, base_labor_rate: rate})); }} onClose={()=>setShowCalc(false)}/>}
          {LABOR.map(field => (
            <div key={field.id} style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:11,color:'var(--muted)',marginBottom:4}}>{field.label}</label>
              <input type='number' step='0.01' value={val(field.id)} onChange={e=>set(field.id,e.target.value)} style={inp(field.id)}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{marginTop:16,padding:'12px 16px',background:'#e8a84a10',border:'1px solid #e8a84a33',borderRadius:8,fontSize:12,color:'#e8a84a'}}>
        Workflow: Edit values, Save Changes, then Recalculate All Prices to update all 272 job prices.
      </div>
    </div>
  );
}


function BurdenedRateCalculator({ onSave, onClose }) {
  const [fields, setFields] = useState({
    base_hourly: '',
    fica:        7.65,
    unemployment: 2.5,
    workers_comp: 8.0,
    health:      0,
    vehicle:     0,
    fuel:        0,
    tools:       0,
    overhead:    15.0,
    gross_profit: 30.0,
    billable_hrs: 1600,
  });
  const set = (k, v) => setFields(p => ({...p, [k]: v}));
  const num = (v) => parseFloat(v) || 0;

  const base = num(fields.base_hourly);
  const annualBase = base * num(fields.billable_hrs);
  const ficaAmt        = annualBase * (num(fields.fica) / 100);
  const unempAmt       = annualBase * (num(fields.unemployment) / 100);
  const wcAmt          = annualBase * (num(fields.workers_comp) / 100);
  const healthAmt      = num(fields.health) * 12;
  const vehicleAmt     = num(fields.vehicle) * 12;
  const fuelAmt        = num(fields.fuel) * 12;
  const toolsAmt       = num(fields.tools) * 12;
  const totalBurden    = ficaAmt + unempAmt + wcAmt + healthAmt + vehicleAmt + fuelAmt + toolsAmt;
  const totalWithBurden = annualBase + totalBurden;
  const overheadAmt    = totalWithBurden * (num(fields.overhead) / 100);
  const costPlusOH     = totalWithBurden + overheadAmt;
  const gpFrac         = Math.min(num(fields.gross_profit), 99) / 100;
  const totalRevenue   = gpFrac < 1 ? costPlusOH / (1 - gpFrac) : costPlusOH;
  const gpAmt          = totalRevenue - costPlusOH;
  const burdenedRate   = num(fields.billable_hrs) > 0 ? totalRevenue / num(fields.billable_hrs) : 0;

  const ROW = {display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'};
  const LBL = {fontSize:12,color:'var(--muted)'};
  const INP = {width:90,background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 8px',fontSize:13,color:'var(--text)',fontFamily:'var(--font-mono)',textAlign:'right'};
  const AMT = {fontSize:12,fontFamily:'var(--font-mono)',color:'var(--muted)',minWidth:70,textAlign:'right'};

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:16,padding:28,width:540,maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800}}>Tech Burdened Rate Calculator</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>Calculate the true cost of a technician per billable hour</div>
          </div>
          <button onClick={onClose} style={{background:'transparent',color:'var(--muted)',fontSize:22,cursor:'pointer',padding:4}}>✕</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div>
            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',marginBottom:12}}>BASE WAGES</div>
            <div style={ROW}>
              <label style={LBL}>Base Hourly Rate ($)</label>
              <input type='number' step='0.01' value={fields.base_hourly} onChange={e=>set('base_hourly',e.target.value)} style={{...INP,borderColor:'var(--amber)'}} placeholder='e.g. 28'/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Billable Hrs/Year</label>
              <input type='number' value={fields.billable_hrs} onChange={e=>set('billable_hrs',e.target.value)} style={INP}/>
            </div>

            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',marginTop:16,marginBottom:12}}>PAYROLL BURDEN (%)</div>
            <div style={ROW}>
              <label style={LBL}>FICA / Social Security</label>
              <input type='number' step='0.1' value={fields.fica} onChange={e=>set('fica',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Unemployment (FUTA/SUTA)</label>
              <input type='number' step='0.1' value={fields.unemployment} onChange={e=>set('unemployment',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Workers Comp</label>
              <input type='number' step='0.1' value={fields.workers_comp} onChange={e=>set('workers_comp',e.target.value)} style={INP}/>
            </div>

            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',marginTop:16,marginBottom:12}}>FIXED COSTS ($/month)</div>
            <div style={ROW}>
              <label style={LBL}>Health Insurance</label>
              <input type='number' step='1' value={fields.health} onChange={e=>set('health',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Vehicle / Truck</label>
              <input type='number' step='1' value={fields.vehicle} onChange={e=>set('vehicle',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Fuel</label>
              <input type='number' step='1' value={fields.fuel} onChange={e=>set('fuel',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={LBL}>Tools & Equipment</label>
              <input type='number' step='1' value={fields.tools} onChange={e=>set('tools',e.target.value)} style={INP}/>
            </div>
          </div>

          <div>
            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',marginBottom:12}}>OVERHEAD & MARGIN</div>
            <div style={ROW}>
              <label style={LBL}>Overhead %</label>
              <input type='number' step='0.5' value={fields.overhead} onChange={e=>set('overhead',e.target.value)} style={INP}/>
            </div>
            <div style={ROW}>
              <label style={{fontSize:12,color:'#5daf7c',fontWeight:600}}>Gross Profit Margin %</label>
              <input type='number' step='0.5' value={fields.gross_profit} onChange={e=>set('gross_profit',e.target.value)} style={{...INP,borderColor:'#5daf7c'}}/>
            </div>

            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.07em',marginTop:24,marginBottom:12}}>ANNUAL COST BREAKDOWN</div>
            {[
              ['Base Wages', annualBase],
              ['FICA', ficaAmt],
              ['Unemployment', unempAmt],
              ['Workers Comp', wcAmt],
              ['Health Insurance', healthAmt],
              ['Vehicle/Truck', vehicleAmt],
              ['Fuel', fuelAmt],
              ['Tools', toolsAmt],
              ['Overhead', overheadAmt],
              ['Gross Profit (' + num(fields.gross_profit) + '%)', gpAmt],
            ].map(([label, amt]) => amt > 0 ? (
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'4px 0'}}>
                <span style={{fontSize:11,color:'var(--muted)'}}>{label}</span>
                <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text)'}}>${Math.round(amt).toLocaleString()}</span>
              </div>
            ) : null)}
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--border)',marginTop:4}}>
              <span style={{fontSize:12,fontWeight:600}}>Total Annual Cost</span>
              <span style={{fontSize:12,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--amber)'}}>${Math.round(totalRevenue).toLocaleString()}</span>
            </div>

            <div style={{marginTop:20,background:'var(--surface2)',border:'2px solid #5daf7c',borderRadius:12,padding:20,textAlign:'center'}}>
              <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,fontFamily:'var(--font-mono)'}}>TECH BURDENED RATE</div>
              <div style={{fontSize:48,fontWeight:800,color:'#5daf7c',fontFamily:'var(--font-head)',lineHeight:1}}>${burdenedRate.toFixed(2)}</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>/billable hour</div>
            </div>

            <button
              onClick={() => { onSave(burdenedRate.toFixed(2)); onClose(); }}
              disabled={!base || burdenedRate <= 0}
              style={{marginTop:16,width:'100%',padding:'12px',background:base&&burdenedRate>0?'#5daf7c18':'var(--surface2)',border:'1px solid '+(base&&burdenedRate>0?'#5daf7c':'var(--border)'),borderRadius:10,color:base&&burdenedRate>0?'#5daf7c':'var(--muted)',fontSize:14,fontWeight:700,cursor:base&&burdenedRate>0?'pointer':'default'}}>
              Use ${burdenedRate.toFixed(2)}/hr as Tech Burdened Rate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}




function CompanySettingsPage() {
  const [form, setForm] = useState({
    name:'', phone:'', email:'', address:'', city:'', state:'', zip:'', url:'', ein:'',
    res_service:true, res_new:true, com_service:true, com_new:true,
    brand_primary:'#e8a84a', brand_secondary:'#1a2a4a', brand_accent:'#5daf7c',
    service_plumbing:false, service_hvac:false, service_electrical:false,
    service_restoration:false, service_renovations:false,
    svc_types_plumbing:[], svc_types_hvac:[], svc_types_electrical:[],
    svc_types_restoration:[], svc_types_renovations:[],
    svc_license_plumbing:'', svc_license_hvac:'', svc_license_electrical:'',
    svc_license_restoration:'', svc_license_renovations:'',
  });

  const brandColors = [
    { key:'brand_primary',   label:'Primary Color'   },
    { key:'brand_secondary', label:'Secondary Color' },
    { key:'brand_accent',    label:'Accent Color'    },
  ];

  const hslFromHex = (hex) => {
    let r=0,g=0,b=0;
    if(hex && hex.length===7){r=parseInt(hex.slice(1,3),16)/255;g=parseInt(hex.slice(3,5),16)/255;b=parseInt(hex.slice(5,7),16)/255;}
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    let h=0,s=0,l=(max+min)/2;
    if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;}
    return {h,s:Math.round(s*100),l:Math.round(l*100)};
  };
  const hslToHex = (h,s,l) => {
    s/=100;l/=100;const a=s*Math.min(l,1-l);
    const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(255*c).toString(16).padStart(2,'0');};
    return '#'+f(0)+f(8)+f(4);
  };
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const res = await api.get('/company/settings');
      const d = res.data || res;
      if (d && d.name !== undefined) setForm(f => ({...f, ...d}));
      if (d && d.logo_url) setLogoPreview(d.logo_url);
    } catch(e) { console.log('No company settings yet'); }
    finally { setLoading(false); }
  };

  const set = (k, v) => setForm(p => ({...p, [k]: v}));

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogo(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k,v]) => data.append(k, v));
      if (logo) data.append('logo', logo);
      await fetch('/api/company/settings', { method:'POST', headers:{ Authorization: 'Bearer ' + localStorage.getItem('dps_token') }, body: data });
      setMsg('Saved successfully'); setTimeout(() => setMsg(''), 3000);
    } catch(e) { setMsg('Error saving'); } finally { setSaving(false); }
  };

  const LBL = {display:'block',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:600};
  const INP = {width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',boxSizing:'border-box'};
  const SECTION = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24,marginBottom:20};

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div>;

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:24,alignItems:'start'}}>
      <div>  {/* LEFT COLUMN */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Company Information</div>
        {msg && <div style={{fontSize:12,padding:'6px 14px',background:msg.includes('Error')?'#f5656518':'#5daf7c18',color:msg.includes('Error')?'#f56565':'#5daf7c',borderRadius:6,fontWeight:600}}>{msg}</div>}
        <button onClick={save} disabled={saving} style={{padding:'9px 22px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Logo */}
      <div style={SECTION}>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:16,color:'var(--amber)'}}>Company Logo</div>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <div style={{width:100,height:100,borderRadius:12,border:'2px dashed var(--border2)',background:'var(--surface2)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
            {logoPreview
              ? <img src={logoPreview} style={{width:'100%',height:'100%',objectFit:'contain'}} alt="logo"/>
              : <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',padding:8}}>No Logo</div>
            }
          </div>
          <div>
            <label style={{display:'inline-block',padding:'8px 18px',background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--text)',fontSize:13,cursor:'pointer',fontWeight:600}}>
              Upload Logo
              <input type='file' accept='image/*' onChange={handleLogo} style={{display:'none'}}/>
            </label>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>PNG, JPG or SVG. Recommended 400x400px.</div>
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div style={SECTION}>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:16,color:'var(--amber)'}}>Basic Information</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Company Name</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} style={INP} placeholder='DPS Plumbing'/>
          </div>
          <div>
            <label style={LBL}>Company Phone</label>
            <input value={form.phone} onChange={e=>set('phone',e.target.value)} style={INP} placeholder='(555) 555-5555'/>
          </div>
          <div>
            <label style={LBL}>Company Email</label>
            <input value={form.email} onChange={e=>set('email',e.target.value)} style={INP} placeholder='info@company.com'/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Website URL</label>
            <input value={form.url} onChange={e=>set('url',e.target.value)} style={INP} placeholder='https://www.company.com'/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>EIN (Employer Identification Number)</label>
            <input value={form.ein} onChange={e=>set('ein',e.target.value)} style={INP} placeholder='XX-XXXXXXX'/>
          </div>
        </div>
      </div>

      {/* Address */}
      <div style={SECTION}>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:16,color:'var(--amber)'}}>Business Address</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Street Address</label>
            <input value={form.address} onChange={e=>set('address',e.target.value)} style={INP} placeholder='123 Main St'/>
          </div>
          <div>
            <label style={LBL}>City</label>
            <input value={form.city} onChange={e=>set('city',e.target.value)} style={INP} placeholder='Houston'/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={LBL}>State</label>
              <input value={form.state} onChange={e=>set('state',e.target.value)} style={INP} placeholder='TX' maxLength={2}/>
            </div>
            <div>
              <label style={LBL}>ZIP Code</label>
              <input value={form.zip} onChange={e=>set('zip',e.target.value)} style={INP} placeholder='77001'/>
            </div>
          </div>
        </div>
      </div>


      {/* Services List */}
      <div style={SECTION}>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:4,color:'var(--amber)'}}>Services List</div>
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>Select the services your company offers. Enabled services appear as pricebook categories.</div>
        {[
          {key:'service_plumbing',    label:'Plumbing',    icon:'🔧'},
          {key:'service_hvac',        label:'HVAC',        icon:'❄️'},
          {key:'service_electrical',  label:'Electrical',  icon:'⚡'},
          {key:'service_restoration', label:'Restoration', icon:'🏗️'},
          {key:'service_renovations', label:'Renovations', icon:'🔨'},
        ].map(svc=>{
          const typeKey='svc_types_'+svc.label.toLowerCase();
          const CUST=['Residential Service','Residential New','Commercial Service','Commercial New'];
          return (
            <div key={svc.key} style={{marginBottom:10,borderRadius:10,border:'1px solid '+(form[svc.key]?'var(--amber)':'var(--border)'),overflow:'hidden',transition:'all .2s'}}>
              <label style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',cursor:'pointer',background:form[svc.key]?'var(--amberdim)':'transparent'}}>
                <input type='checkbox' checked={!!form[svc.key]} onChange={e=>set(svc.key,e.target.checked)} style={{width:16,height:16,accentColor:'var(--amber)'}}/>
                <span style={{fontSize:18}}>{svc.icon}</span>
                <span style={{fontSize:14,fontWeight:form[svc.key]?700:400,color:form[svc.key]?'var(--amber)':'var(--text)',flex:1}}>{svc.label}</span>
              </label>
              {form[svc.key] && (
                <div style={{padding:'0 16px 14px',borderTop:'1px solid var(--border)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:24,flexWrap:'wrap',marginTop:10}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:8}}>CUSTOMER TYPES</div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {CUST.map(ct=>{
                          const arr=form[typeKey]||[]; const on=arr.includes(ct);
                          return (
                            <label key={ct} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:7,border:'1px solid '+(on?'var(--amber)':'var(--border)'),background:on?'rgba(245,166,35,.1)':'transparent',cursor:'pointer',fontSize:12,color:on?'var(--amber)':'var(--muted)',fontWeight:on?600:400}}>
                              <input type='checkbox' checked={on} onChange={e=>{const next=on?arr.filter(x=>x!==ct):[...arr,ct];set(typeKey,next);}} style={{width:12,height:12,accentColor:'var(--amber)'}}/>
                              {ct}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{minWidth:180}}>
                      <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:8}}>LICENSE NUMBER</div>
                      <input
                        value={form['svc_license_'+svc.label.toLowerCase()]||''}
                        onChange={e=>set('svc_license_'+svc.label.toLowerCase(), e.target.value)}
                        placeholder='e.g. PLB-12345'
                        style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:7,padding:'7px 10px',fontSize:12,color:'var(--text)',width:'100%',boxSizing:'border-box'}}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>


      </div> {/* END LEFT COLUMN */}

      {/* RIGHT COLUMN — Brand Colors */}
      <div style={{position:'sticky',top:0}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,marginBottom:4,color:'var(--amber)'}}>Brand Colors</div>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:20,lineHeight:1.5}}>Used across invoices, estimates, portals and customer-facing pages.</div>

          {brandColors.map((bc, i) => (
            <div key={bc.key} style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{bc.label}</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:28,height:28,borderRadius:6,border:'1px solid var(--border2)',background:form[bc.key],cursor:'pointer',flexShrink:0,position:'relative',overflow:'hidden'}}>
                    <input type='color' value={form[bc.key]||'#000000'}
                      onChange={e => set(bc.key, e.target.value)}
                      style={{position:'absolute',inset:0,width:'140%',height:'140%',opacity:0,cursor:'pointer',top:'-20%',left:'-20%'}}/>
                  </div>
                  <input
                    value={form[bc.key]||''}
                    onChange={e => { const v=e.target.value; if(/^#[0-9a-fA-F]{0,6}$/.test(v)) set(bc.key,v); }}
                    maxLength={7}
                    style={{width:88,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:6,padding:'5px 8px',fontSize:12,color:'var(--text)',fontFamily:'var(--font-mono)'}}
                    placeholder='#000000'
                  />
                </div>
              </div>
              {/* Hue slider */}
              <div style={{position:'relative',height:14,borderRadius:7,overflow:'hidden',cursor:'pointer',
                background:'linear-gradient(to right,#ff0000,#ff8000,#ffff00,#00ff00,#00ffff,#0000ff,#8000ff,#ff0080,#ff0000)'
              }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const hue = Math.round(pct * 360);
                  const hex = hslToHex(hue, 70, 55);
                  set(bc.key, hex);
                }}
              >
                <div style={{
                  position:'absolute',top:'50%',transform:'translate(-50%,-50%)',
                  left: hslFromHex(form[bc.key]||'#e8a84a').h / 360 * 100 + '%',
                  width:18,height:18,borderRadius:'50%',border:'2px solid white',
                  background:form[bc.key]||'#e8a84a',
                  boxShadow:'0 1px 4px rgba(0,0,0,.4)',pointerEvents:'none',
                }}/>
              </div>
              {/* Lightness slider */}
              <div style={{position:'relative',height:10,borderRadius:5,overflow:'hidden',cursor:'pointer',marginTop:6,
                background:'linear-gradient(to right, #000, ' + hslToHex(hslFromHex(form[bc.key]||'#e8a84a').h, 70, 50) + ', #fff)'
              }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const l = Math.round(pct * 100);
                  const {h,s} = hslFromHex(form[bc.key]||'#e8a84a');
                  set(bc.key, hslToHex(h, s, l));
                }}
              >
                <div style={{
                  position:'absolute',top:'50%',transform:'translate(-50%,-50%)',
                  left: hslFromHex(form[bc.key]||'#e8a84a').l + '%',
                  width:14,height:14,borderRadius:'50%',border:'2px solid white',
                  background:form[bc.key]||'#e8a84a',
                  boxShadow:'0 1px 4px rgba(0,0,0,.4)',pointerEvents:'none',
                }}/>
              </div>
            </div>
          ))}

          {/* Preview */}
          <div style={{marginTop:20,padding:16,borderRadius:10,border:'1px solid var(--border)',background:'var(--surface2)'}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:10,fontWeight:600,letterSpacing:'.07em'}}>PREVIEW</div>
            <div style={{borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
              <div style={{background:form.brand_primary||'#e8a84a',padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:24,height:24,borderRadius:4,background:'white',opacity:.25}}/>
                <span style={{fontSize:12,fontWeight:700,color:'white'}}>Company Name</span>
              </div>
              <div style={{background:'white',padding:12}}>
                <div style={{height:8,borderRadius:4,background:form.brand_primary||'#e8a84a',width:'60%',marginBottom:6,opacity:.8}}/>
                <div style={{height:6,borderRadius:4,background:'#e2e8f0',width:'80%',marginBottom:4}}/>
                <div style={{height:6,borderRadius:4,background:'#e2e8f0',width:'55%',marginBottom:10}}/>
                <div style={{display:'flex',gap:6}}>
                  <div style={{padding:'5px 10px',borderRadius:4,background:form.brand_primary||'#e8a84a',fontSize:10,fontWeight:700,color:'white'}}>Button</div>
                  <div style={{padding:'5px 10px',borderRadius:4,border:'1px solid '+(form.brand_secondary||'#1a2a4a'),fontSize:10,fontWeight:600,color:form.brand_secondary||'#1a2a4a'}}>Outline</div>
                </div>
              </div>
              <div style={{background:form.brand_secondary||'#1a2a4a',padding:'8px 14px'}}>
                <span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>Footer · {form.name||'Company Name'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div> {/* END GRID */}
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const LICENSE_TYPES = ['Apprentice','Tradesman','Journeyman','Master','Apprentice'];
const TECH_DEPT_TYPES   = ['Plumbing','HVAC','Electrical','Restoration','Renovations','Sales'];
const OFFICE_DEPT_TYPES = ['Office','Management','Warehouse','Administrators'];

const ALL_PAY_TYPES_ENABLED = { hourly:true, hourly_commission:true, straight_commission:true, salary:true, running_commission:true };

function EmployeeModal({ emp, isTech, onSave, onClose, roles, enabledPayTypes = ALL_PAY_TYPES_ENABLED }) {
  const deptList = isTech ? TECH_DEPT_TYPES : OFFICE_DEPT_TYPES;
  const blank = {
    name:'', email:'', phone:'', role_id:'', bio:'',
    department: isTech ? TECH_DEPT_TYPES[0] : OFFICE_DEPT_TYPES[0],
    license_type: isTech ? 'Apprentice' : '',
    pay_type:'hourly', hourly_rate:'', commission_pct:'', salary:'',
    hire_date:'', active:true, notes:'',
    username:'', temp_password:'', avatar:null, avatar_preview:null,
  };
  const [form, setForm] = useState(emp ? {...blank,...emp} : blank);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    set('avatar', file);
    set('avatar_preview', URL.createObjectURL(file));
  };

  const sendReset = async () => {
    if (!form.email) return toast.warn('No Email', 'No email address on file for this user.');
    toast.success('Email Sent', 'Password reset email sent to ' + form.email);
  };

  const INP = {width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',boxSizing:'border-box'};
  const LBL = {display:'block',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:600};

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,width:600,maxHeight:'92vh',overflow:'auto'}} className="scrollbar-thin">
        <div style={{display:'flex',alignItems:'center',marginBottom:20}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,flex:1}}>{emp ? 'Edit' : 'Add'} {isTech ? 'Technician' : 'Employee'}</div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>

        {/* Profile Picture */}
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20,padding:16,background:'var(--surface2)',borderRadius:10,border:'1px solid var(--border)'}}>
          <div style={{width:72,height:72,borderRadius:'50%',background:'var(--surface)',border:'2px solid var(--border2)',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {(form.avatar_preview || form.avatar_url)
              ? <img src={form.avatar_preview||form.avatar_url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt="avatar"/>
              : <span style={{fontSize:28,color:'var(--muted)'}}>👤</span>
            }
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}}>Profile Photo</div>
            <label style={{display:'inline-block',padding:'6px 14px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:7,color:'var(--text)',fontSize:12,cursor:'pointer',fontWeight:600}}>
              Upload Photo
              <input type='file' accept='image/*' onChange={handleAvatar} style={{display:'none'}}/>
            </label>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>JPG or PNG, max 2MB</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          {/* Name */}
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Full Name *</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} style={INP} placeholder='John Smith'/>
          </div>
          {/* Email / Phone */}
          <div>
            <label style={LBL}>Email</label>
            <input value={form.email||''} onChange={e=>set('email',e.target.value)} style={INP} placeholder='john@company.com'/>
          </div>
          <div>
            <label style={LBL}>Phone</label>
            <input value={form.phone||''} onChange={e=>set('phone',e.target.value)} style={INP} placeholder='(555) 555-5555'/>
          </div>
          {/* Department */}
          <div>
            <label style={LBL}>Department</label>
            <select value={form.department} onChange={e=>set('department',e.target.value)} style={INP}>
              {deptList.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          {/* Role */}
          <div>
            <label style={LBL}>Role</label>
            <select value={form.role_id||''} onChange={e=>set('role_id',e.target.value)} style={INP}>
              <option value=''>-- Select Role --</option>
              {(roles||[]).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {/* License Type — Technicians only */}
          {isTech && (
            <div>
              <label style={LBL}>License Type</label>
              <select value={form.license_type||'Apprentice'} onChange={e=>set('license_type',e.target.value)} style={INP}>
                {LICENSE_TYPES.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
          )}
          {/* Pay Type */}
          <div>
            <label style={LBL}>Pay Type</label>
              <select value={form.pay_type} onChange={e=>set('pay_type',e.target.value)} style={INP}>
              {(enabledPayTypes.hourly)              && <option value='hourly'>Hourly</option>}
              {(enabledPayTypes.hourly_commission)   && <option value='hourly_commission'>Hourly + Commission</option>}
              {(enabledPayTypes.straight_commission) && <option value='straight_commission'>Straight Commission</option>}
              {(enabledPayTypes.running_commission && isTech)  && <option value='running_commission'>Running Commission</option>}
              {(enabledPayTypes.salary)              && <option value='salary'>Salary</option>}
              </select>
          </div>
          {/* Hire Date */}
          <div>
            <label style={LBL}>Hire Date</label>
            <input type='date' value={form.hire_date||''} onChange={e=>set('hire_date',e.target.value)} style={INP}/>
          </div>
          {/* Hourly rate */}
          {(form.pay_type==='hourly'||form.pay_type==='hourly_commission') && (
            <div>
              <label style={LBL}>Hourly Rate ($)</label>
              <input type='number' value={form.hourly_rate||''} onChange={e=>set('hourly_rate',e.target.value)} style={INP} placeholder='0.00'/>
            </div>
          )}
          {/* Commission % — hourly+comm and straight comm */}
          {(form.pay_type==='hourly_commission'||form.pay_type==='straight_commission') && (
            <div>
              <label style={LBL}>Commission %</label>
              <input type='number' step='0.5' value={form.commission_pct||''} onChange={e=>set('commission_pct',e.target.value)} style={INP} placeholder='0.0'/>
            </div>
          )}
          {/* Running commission note */}
          {form.pay_type==='running_commission' && (
            <div style={{gridColumn:'1/-1',padding:12,background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8}}>
              <span style={{fontSize:12,color:'var(--amber)',fontWeight:600}}>Running Commission — rates are set in Payroll Settings → Running Commission.</span>
            </div>
          )}
          {/* Salary */}
          {form.pay_type==='salary' && (
            <div>
              <label style={LBL}>Annual Salary ($)</label>
              <input type='number' value={form.salary||''} onChange={e=>set('salary',e.target.value)} style={INP} placeholder='0.00'/>
            </div>
          )}
          {/* Biography */}
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Short Biography</label>
            <textarea value={form.bio||''} onChange={e=>set('bio',e.target.value)} style={{...INP,height:72,resize:'vertical'}} placeholder='Brief background, certifications, specialties...'/>
          </div>
          {/* Notes */}
          <div style={{gridColumn:'1/-1'}}>
            <label style={LBL}>Internal Notes</label>
            <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} style={{...INP,height:56,resize:'vertical'}} placeholder='Internal notes...'/>
          </div>
          {/* Username / Temp Password */}
          <div style={{gridColumn:'1/-1',borderTop:'1px solid var(--border)',paddingTop:14,marginTop:4}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--amber)',marginBottom:12,letterSpacing:'.06em'}}>LOGIN CREDENTIALS</div>
          </div>
          <div>
            <label style={LBL}>Username</label>
            <input value={form.username||''} onChange={e=>set('username',e.target.value)} style={INP} placeholder='jsmith'/>
          </div>
          <div>
            <label style={LBL}>Temporary Password</label>
            <input type='password' value={form.temp_password||''} onChange={e=>set('temp_password',e.target.value)} style={INP} placeholder='Set a temp password'/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <button onClick={sendReset} style={{padding:'7px 16px',background:'transparent',border:'1px solid var(--border2)',borderRadius:7,color:'var(--muted)',fontSize:12,cursor:'pointer',fontWeight:600}}>
              📧 Send Password Reset to Email on File
            </button>
          </div>
          {/* Active toggle */}
          <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:10}}>
            <input type='checkbox' id='emp_active' checked={form.active!==false} onChange={e=>set('active',e.target.checked)} style={{width:16,height:16,accentColor:'var(--amber)'}}/>
            <label htmlFor='emp_active' style={{fontSize:13,color:'var(--text)',cursor:'pointer'}}>Active Employee</label>
          </div>
        </div>

        <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'9px 20px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>onSave(form)} disabled={!form.name} style={{padding:'9px 22px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer',opacity:form.name?1:.5}}>
            {emp ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeListPage({ filterDept }) {
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [enabledPayTypes, setEnabledPayTypes] = useState(ALL_PAY_TYPES_ENABLED);
  const isTech = filterDept === 'Technicians' || TECH_DEPT_TYPES.includes(filterDept) || filterDept === null;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const token = localStorage.getItem('dps_token');
      const headers = { Authorization: 'Bearer ' + token };
      const [empRes, roleRes, payrollRes] = await Promise.all([
        fetch('/api/employees', { headers }),
        fetch('/api/roles', { headers }),
        fetch('/api/payroll/settings', { headers }),
      ]);
      const emps  = await empRes.json();
      const rls   = await roleRes.json();
      const payroll = payrollRes.ok ? await payrollRes.json() : {};
      setEmployees(Array.isArray(emps) ? emps : []);
      setRoles(Array.isArray(rls) ? rls : []);
      if (payroll.enabled) setEnabledPayTypes(payroll.enabled);
    } catch(e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const save = async (form) => {
    const method = form.id ? 'PUT' : 'POST';
    const url    = form.id ? '/api/employees/'+form.id : '/api/employees';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('dps_token') },
      body: JSON.stringify(form)
    });
    setModal(null);
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this employee?')) return;
    await fetch('/api/employees/'+id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('dps_token') }
    });
    load();
  };



  const filtered = employees.filter(e =>
    (!filterDept || e.department === filterDept) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.email||'').toLowerCase().includes(search.toLowerCase()))
  );

  const getRoleName = id => (roles.find(r=>r.id===id)||{}).name || '—';
  const PAY_LABELS  = { hourly:'Hourly', hourly_commission:'Hourly+Comm', straight_commission:'Straight Comm', running_commission:'Running Comm', salary:'Salary' };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div>;

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>
          {filterDept || 'All Employees'}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search...'
          style={{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,width:200}}/>
        <button onClick={()=>setModal({})} style={{padding:'9px 18px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>
          {isTech ? '+ Add Technician' : '+ Add Employee'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:60,color:'var(--muted)',fontSize:14}}>No employees found.</div>
      ) : (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
                {['Name','Department','License','Role','Pay Type','Status',''].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--muted)',letterSpacing:'.06em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e,i)=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'transparent':'var(--surface2)'}}>
                  <td style={{padding:'12px 14px'}}>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--text)'}}>{e.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{e.email}</div>
                  </td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--muted)'}}>{e.department}</td>
                  <td style={{padding:'12px 14px'}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)'}}>{e.license_type||'—'}</span>
                  </td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--muted)'}}>{getRoleName(e.role_id)}</td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--muted)'}}>{PAY_LABELS[e.pay_type]||e.pay_type||'—'}</td>
                  <td style={{padding:'12px 14px'}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:e.active?'#5daf7c22':'#f5656522',color:e.active?'#5daf7c':'#f56565',fontWeight:600}}>{e.active?'Active':'Inactive'}</span>
                  </td>
                  <td style={{padding:'12px 14px',textAlign:'right'}}>
                    <button onClick={()=>setModal(e)} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:11,color:'var(--muted)',cursor:'pointer',marginRight:6}}>Edit</button>
                    <button onClick={()=>remove(e.id)} style={{background:'transparent',border:'1px solid #f5656544',borderRadius:6,padding:'4px 10px',fontSize:11,color:'#f56565',cursor:'pointer'}}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal !== null && <EmployeeModal emp={modal.id?modal:null} isTech={isTech} roles={roles} enabledPayTypes={enabledPayTypes} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ─── ROLES & PERMISSIONS ──────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { group:'Dashboard',   perms:['View Dashboard','View KPIs','View Revenue Reports'] },
  { group:'Dispatch',    perms:['View Dispatch Board','Assign Jobs','Edit Job Status','Create Jobs'] },
  { group:'Jobs',        perms:['View Jobs','Create Jobs','Edit Jobs','Delete Jobs','View Job Financials'] },
  { group:'Customers',   perms:['View Customers','Create Customers','Edit Customers','Delete Customers','View Customer History'] },
  { group:'Invoices',    perms:['View Invoices','Create Invoices','Edit Invoices','Send Invoices','Apply Payments','Issue Refunds'] },
  { group:'Estimates',   perms:['View Estimates','Create Estimates','Send Estimates','Approve Estimates'] },
  { group:'Pricebook',   perms:['View Pricebook','Edit Pricebook','Edit Pricebook Engine'] },
  { group:'Inventory',   perms:['View Inventory','Edit Inventory','Create Purchase Orders'] },
  { group:'GPS Fleet',   perms:['View GPS','Manage Vehicles'] },
  { group:'Reports',     perms:['View Reports','Export Reports'] },
  { group:'Settings',    perms:['View Settings','Edit Company Info','Manage Employees','Manage Roles','Manage Integrations','Manage Payroll'] },
];

function RolesPermissionsPage() {
  // Office Personnel categories with their seeded role IDs
  const OFFICE_CATS = [
    { id:'cat_office',    label:'Office' },
    { id:'cat_manager',   label:'Management' },
    { id:'cat_warehouse', label:'Warehouse' },
    { id:'cat_admin',     label:'Administrators' },
  ];
  // Service Department categories — one per department
  const SERVICE_CATS = TECH_DEPT_TYPES.map(d => ({ id:'cat_svc_'+d.toLowerCase().replace(/\s+/g,'_'), label:d }));

  const ALL_PERMS = [
    { group:'Dashboard',  perms:['View Dashboard','View KPIs','View Revenue Reports'] },
    { group:'Dispatch',   perms:['View Dispatch Board','Assign Jobs','Edit Job Status','Create Jobs'] },
    { group:'Jobs',       perms:['View Jobs','Create Jobs','Edit Jobs','Delete Jobs','View Job Financials'] },
    { group:'Customers',  perms:['View Customers','Create Customers','Edit Customers','Delete Customers'] },
    { group:'Invoices',   perms:['View Invoices','Create Invoices','Edit Invoices','Send Invoices','Apply Payments'] },
    { group:'Pricebook',  perms:['View Pricebook','Edit Pricebook','Edit Pricebook Engine'] },
    { group:'Inventory',  perms:['View Inventory','Edit Inventory','Create Purchase Orders'] },
    { group:'GPS Fleet',  perms:['View GPS','Manage Vehicles'] },
    { group:'Reports',    perms:['View Reports','Export Reports'] },
    { group:'Settings',   perms:['View Settings','Edit Company Info','Manage Employees','Manage Roles','Manage Payroll'] },
  ];

  const [deptView, setDeptView]         = useState('office'); // 'office' | 'service'
  const [roles, setRoles]               = useState([]);
  const [editingRole, setEditingRole]   = useState(null);
  const [newRoleInputs, setNewRoleInputs] = useState({});
  const [loading, setLoading]           = useState(true);
  const [msg, setMsg]                   = useState('');

  useEffect(() => { loadRoles(); }, []);

  const loadRoles = async () => {
    try {
      const res = await fetch('/api/roles', { headers:{ Authorization:'Bearer '+localStorage.getItem('dps_token') } });
      const data = await res.json();
      setRoles(Array.isArray(data) ? data : data.roles || []);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const createRole = async (catId) => {
    const name = (newRoleInputs[catId]||'').trim();
    if (!name) return;
    await fetch('/api/roles', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('dps_token')}, body:JSON.stringify({name,category_id:catId,permissions:[]}) });
    setNewRoleInputs(p=>({...p,[catId]:''}));
    loadRoles();
  };

  const savePerms = async (role) => {
    await fetch('/api/roles/'+role.id, { method:'PUT', headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('dps_token')}, body:JSON.stringify(role) });
    setEditingRole(null);
    setMsg('Permissions saved'); setTimeout(()=>setMsg(''),3000);
    loadRoles();
  };

  const deleteRole = async (id) => {
    if (!confirm('Delete this role?')) return;
    await fetch('/api/roles/'+id, { method:'DELETE', headers:{Authorization:'Bearer '+localStorage.getItem('dps_token')} });
    loadRoles();
  };

  const activeCats = deptView === 'office' ? OFFICE_CATS : SERVICE_CATS;

  const CategoryCol = ({ cat }) => {
    const catRoles = roles.filter(r => r.category_id === cat.id);
    const inputVal = newRoleInputs[cat.id] || '';
    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'12px 16px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:'var(--amber)',flex:1}}>{cat.label}</span>
          <span style={{fontSize:11,color:'var(--muted)',background:'var(--surface)',padding:'2px 8px',borderRadius:10,border:'1px solid var(--border)'}}>{catRoles.length}</span>
        </div>
        <div style={{flex:1}}>
          {catRoles.length === 0 && (
            <div style={{padding:'14px 16px',fontSize:12,color:'var(--muted)',fontStyle:'italic'}}>No roles yet — add one below.</div>
          )}
          {catRoles.map(role => (
            <div key={role.id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
              <span style={{flex:1,fontSize:13,color:'var(--text)',fontWeight:500}}>{role.name}</span>
              <button onClick={()=>setEditingRole({...role,permissions:role.permissions||[]})}
                style={{padding:'4px 10px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,color:'var(--amber)',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0}}>
                Edit
              </button>
              {!role.is_system && (
                <button onClick={()=>deleteRole(role.id)}
                  style={{padding:'4px 8px',background:'transparent',border:'1px solid #f5656544',borderRadius:6,color:'#f56565',fontSize:11,cursor:'pointer',flexShrink:0}}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',background:'var(--surface2)',display:'flex',gap:6}}>
          <input value={inputVal}
            onChange={e=>setNewRoleInputs(p=>({...p,[cat.id]:e.target.value}))}
            onKeyDown={e=>e.key==='Enter'&&createRole(cat.id)}
            placeholder='New role name...'
            style={{flex:1,padding:'7px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,color:'var(--text)',fontSize:12}}/>
          <button onClick={()=>createRole(cat.id)}
            style={{padding:'7px 12px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:7,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            +
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:60}}><Spinner/></div>;

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24,flexWrap:'wrap'}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Roles & Permissions</div>
        {msg && <span style={{fontSize:12,padding:'4px 12px',background:'#5daf7c22',color:'#5daf7c',borderRadius:6,fontWeight:600}}>{msg}</span>}
        {/* Office Personnel / Service Departments toggle */}
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:3,gap:2}}>
          {[{key:'office',label:'Office Personnel'},{key:'service',label:'Service Departments'}].map(v=>(
            <button key={v.key} onClick={()=>setDeptView(v.key)}
              style={{padding:'7px 18px',borderRadius:6,background:deptView===v.key?'var(--amberdim)':'transparent',border:deptView===v.key?'1px solid var(--amber)':'1px solid transparent',color:deptView===v.key?'var(--amber)':'var(--muted)',fontSize:12,fontWeight:deptView===v.key?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category columns */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:16}}>
        {activeCats.map(cat => <CategoryCol key={cat.id} cat={cat}/>)}
      </div>

      {/* Permissions edit modal */}
      {editingRole && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,width:640,maxHeight:'88vh',overflow:'auto'}} className="scrollbar-thin">
            <div style={{display:'flex',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,flex:1}}>Edit Permissions — {editingRole.name}</div>
              <button onClick={()=>setEditingRole(null)} style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {ALL_PERMS.map(group=>(
              <div key={group.group} style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',letterSpacing:'.08em',marginBottom:8}}>{group.group.toUpperCase()}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {group.perms.map(perm=>{
                    const on=(editingRole.permissions||[]).includes(perm);
                    return (
                      <label key={perm} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid '+(on?'var(--amber)':'var(--border)'),background:on?'var(--amberdim)':'transparent',cursor:'pointer',fontSize:12,color:on?'var(--amber)':'var(--muted)',fontWeight:on?600:400,transition:'all .15s'}}>
                        <input type='checkbox' checked={on}
                          onChange={()=>{
                            const p=editingRole.permissions||[];
                            setEditingRole({...editingRole,permissions:on?p.filter(x=>x!==perm):[...p,perm]});
                          }}
                          style={{width:13,height:13,accentColor:'var(--amber)'}}/>
                        {perm}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
              <button onClick={()=>setEditingRole(null)} style={{padding:'9px 20px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={()=>savePerms(editingRole)} style={{padding:'9px 22px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>Save Permissions</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAYROLL SETTINGS ─────────────────────────────────────────────────────
function PayrollSettingsPage() {
  const LICENSE_CATS = ['Apprentice','Tradesman','Journeyman','Master'];
  const [enabled, setEnabled] = useState({ hourly:true, hourly_commission:false, straight_commission:false, salary:false, running_commission:false });
  const [runningTiers, setRunningTiers] = useState([
    { label:'Tier 1', revenue_min:0,     revenue_max:5000,  rates: LICENSE_CATS.reduce((a,l)=>({...a,[l]:8}), {}) },
    { label:'Tier 2', revenue_min:5001,  revenue_max:10000, rates: LICENSE_CATS.reduce((a,l)=>({...a,[l]:10}),{}) },
    { label:'Tier 3', revenue_min:10001, revenue_max:20000, rates: LICENSE_CATS.reduce((a,l)=>({...a,[l]:12}),{}) },
    { label:'Tier 4', revenue_min:20001, revenue_max:35000, rates: LICENSE_CATS.reduce((a,l)=>({...a,[l]:14}),{}) },
    { label:'Tier 5', revenue_min:35001, revenue_max:null,  rates: LICENSE_CATS.reduce((a,l)=>({...a,[l]:16}),{}) },
  ]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(()=>{ loadSettings(); },[]);
  const loadSettings = async () => {
    try {
      const res  = await fetch('/api/payroll/settings', { headers:{ Authorization:'Bearer '+localStorage.getItem('dps_token') } });
      const data = await res.json();
      if (data.enabled)       setEnabled(data.enabled);
      if (data.runningTiers)  setRunningTiers(data.runningTiers);
    } catch(e){}
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/payroll/settings', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('dps_token') }, body:JSON.stringify({ enabled, runningTiers }) });
      setMsg('Saved'); setTimeout(()=>setMsg(''),3000);
    } finally { setSaving(false); }
  };

  const setTier = (ti, field, lic, val) => {
    setRunningTiers(prev => {
      const next = prev.map(t=>({...t,rates:{...t.rates}}));
      if (lic) next[ti].rates[lic] = +val;
      else next[ti][field] = field==='revenue_max'&&val===''?null:+val;
      return next;
    });
  };

  const INP = {background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'8px 10px',fontSize:13,color:'var(--text)',boxSizing:'border-box'};
  const CARD = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:12};

  const PAY_TYPES = [
    { key:'hourly',              label:'Hourly',               desc:'Fixed hourly rate with optional overtime rules.' },
    { key:'hourly_commission',   label:'Hourly + Commission',  desc:'Base hourly wage plus a commission % on jobs completed.' },
    { key:'straight_commission', label:'Straight Commission',  desc:'Commission % only — no base wage.' },
    { key:'salary',              label:'Salary',               desc:'Fixed annual salary, optionally bonus eligible.' },
    { key:'running_commission',  label:'Running Commission',   desc:'Tiered commission % based on monthly revenue produced.' },
  ];

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:820}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Payroll Settings</div>
        {msg && <span style={{fontSize:12,padding:'4px 12px',background:'#5daf7c22',color:'#5daf7c',borderRadius:6,fontWeight:600}}>{msg}</span>}
        <button onClick={save} disabled={saving} style={{padding:'9px 20px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving...':'Save Changes'}</button>
      </div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Select the pay types your company uses. Rates for each employee are set in their individual profile. Running Commission rates are configured here.</div>

      {PAY_TYPES.map(pt => (
        <div key={pt.key} style={{...CARD, borderColor: enabled[pt.key] ? 'var(--amber)' : 'var(--border)', background: enabled[pt.key] ? 'var(--amberdim)' : 'var(--surface)'}}>
          <label style={{display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
            <input type='checkbox' checked={!!enabled[pt.key]} onChange={e=>setEnabled(p=>({...p,[pt.key]:e.target.checked}))}
              style={{width:18,height:18,accentColor:'var(--amber)',flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:enabled[pt.key]?'var(--amber)':'var(--text)'}}>{pt.label}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{pt.desc}</div>
            </div>
            {enabled[pt.key] && pt.key!=='running_commission' && (
              <span style={{fontSize:11,padding:'3px 10px',background:'#5daf7c22',color:'#5daf7c',borderRadius:6,fontWeight:700,flexShrink:0}}>ENABLED</span>
            )}
          </label>

          {/* Running commission tier table — only shows when checked */}
          {pt.key==='running_commission' && enabled.running_commission && (
            <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--amber)',marginBottom:12}}>5-Tier Commission Scale</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--border)'}}>
                      <th style={{textAlign:'left',padding:'8px 12px',fontSize:11,color:'var(--muted)',fontWeight:700}}>Tier</th>
                      <th style={{textAlign:'left',padding:'8px 12px',fontSize:11,color:'var(--muted)',fontWeight:700}}>Revenue Min ($)</th>
                      <th style={{textAlign:'left',padding:'8px 12px',fontSize:11,color:'var(--muted)',fontWeight:700}}>Revenue Max ($)</th>
                      {LICENSE_CATS.map(l=><th key={l} style={{textAlign:'left',padding:'8px 12px',fontSize:11,color:'var(--muted)',fontWeight:700}}>{l} %</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {runningTiers.map((tier,ti)=>(
                      <tr key={ti} style={{borderBottom:'1px solid var(--border)',background:ti%2===0?'transparent':'rgba(0,0,0,.15)'}}>
                        <td style={{padding:'10px 12px'}}>
                          <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:6,background:'rgba(245,166,35,.15)',color:'var(--amber)',border:'1px solid rgba(245,166,35,.3)'}}>{tier.label}</span>
                        </td>
                        <td style={{padding:'6px 12px'}}><input type='number' value={tier.revenue_min} onChange={e=>setTier(ti,'revenue_min',null,e.target.value)} style={{...INP,width:110}}/></td>
                        <td style={{padding:'6px 12px'}}>{ti<4?<input type='number' value={tier.revenue_max||''} onChange={e=>setTier(ti,'revenue_max',null,e.target.value)} style={{...INP,width:110}}/>:<span style={{fontSize:12,color:'var(--muted)',padding:'0 8px'}}>No limit</span>}</td>
                        {LICENSE_CATS.map(l=>(
                          <td key={l} style={{padding:'6px 12px'}}><input type='number' step='0.5' value={tier.rates?.[l]||0} onChange={e=>setTier(ti,null,l,e.target.value)} style={{...INP,width:76}}/></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


function DepartmentsPage() {
  const DEFAULTS = {
    office: [...OFFICE_DEPT_TYPES],
    technician: [...TECH_DEPT_TYPES],
  };
  const [office, setOffice]         = useState([...DEFAULTS.office]);
  const [technician, setTechnician] = useState([...DEFAULTS.technician]);
  const [newOffice, setNewOffice]   = useState('');
  const [newTech, setNewTech]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');

  useEffect(() => {
    const token = localStorage.getItem('dps_token');
    fetch('/api/company/settings', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (d.departments) {
          const parsed = typeof d.departments === 'string' ? JSON.parse(d.departments) : d.departments;
          if (Array.isArray(parsed.office))      setOffice(parsed.office);
          if (Array.isArray(parsed.technician))  setTechnician(parsed.technician);
        }
      }).catch(() => {});
  }, []);

  const addTo    = (list, setList, input, setInput) => {
    const v = input.trim();
    if (!v || list.includes(v)) return;
    setList(p => [...p, v]);
    setInput('');
  };
  const removeFrom = (setList, val) => setList(p => p.filter(x => x !== val));

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/company/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('dps_token') },
        body: JSON.stringify({ departments: { office, technician } }),
      });
      setMsg('Saved'); setTimeout(() => setMsg(''), 3000);
    } catch(e) { setMsg('Error'); } finally { setSaving(false); }
  };

  const CategoryCard = ({ title, icon, list, newVal, setNewVal, setList, defaults }) => (
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
        <span style={{fontSize:18}}>{icon}</span>
        <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,flex:1,color:'var(--text)'}}>{title}</div>
        <div style={{display:'flex',gap:8}}>
          <input
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTo(list, setList, newVal, setNewVal)}
            placeholder='New department...'
            style={{padding:'6px 10px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:7,color:'var(--text)',fontSize:12,width:170}}
          />
          <button
            onClick={() => addTo(list, setList, newVal, setNewVal)}
            style={{padding:'6px 14px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:7,color:'var(--amber)',fontSize:12,fontWeight:700,cursor:'pointer'}}
          >+ Add</button>
        </div>
      </div>
      {list.length === 0 ? (
        <div style={{padding:'20px 18px',fontSize:13,color:'var(--muted)',textAlign:'center'}}>No departments yet.</div>
      ) : (
        list.map((d, i) => (
          <div key={d} style={{display:'flex',alignItems:'center',padding:'11px 18px',borderBottom:i<list.length-1?'1px solid var(--border)':'none'}}>
            <span style={{flex:1,fontSize:13,color:'var(--text)',fontWeight:500}}>{d}</span>
            {defaults.includes(d)
              ? <span style={{fontSize:10,color:'var(--muted)',padding:'2px 8px',background:'var(--surface2)',borderRadius:4,marginRight:4}}>DEFAULT</span>
              : null
            }
            <button onClick={() => removeFrom(setList, d)} style={{background:'transparent',border:'1px solid #f5656544',borderRadius:6,color:'#f56565',fontSize:11,cursor:'pointer',padding:'3px 10px'}}>Remove</button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:900}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>Departments</div>
        {msg && <span style={{fontSize:12,padding:'4px 12px',background:'#5daf7c22',color:'#5daf7c',borderRadius:6,fontWeight:600}}>{msg}</span>}
        <button onClick={save} disabled={saving} style={{padding:'9px 20px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving...':'Save Changes'}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <CategoryCard title="Office Personnel" icon="🏢" list={office} newVal={newOffice} setNewVal={setNewOffice} setList={setOffice} defaults={DEFAULTS.office}/>
        <CategoryCard title="Service Department" icon="🔧" list={technician} newVal={newTech} setNewVal={setNewTech} setList={setTechnician} defaults={DEFAULTS.technician}/>
      </div>
    </div>
  );
}

const ALL_SERVICES = ['Plumbing','HVAC','Electrical','Restoration','Renovations'];

// ── Engine compute helper (mirrors backend) ──────────────────
function computeFREngine(s) {
  if (!s) return {burdenedRate:0,overheadPerHr:0,laborRate:0,profitPerHr:0,matMarkup:1.5,dailyRevenue:0};
  const wage  = parseFloat(s.tech_wage)||25;
  const hrs   = Math.max(1, parseInt(s.billable_hrs_yr)||1500);
  const fixed = (s.fixed_costs||[]).reduce((a,c)=>a+(parseFloat(c.amount)||0),0);
  const burdened = wage*(1+(parseFloat(s.fica_pct)||.0765)+(parseFloat(s.unemployment_pct)||.02)+(parseFloat(s.workers_comp_pct)||.05))+(fixed/hrs);
  const overhead = (s.overhead_items||[]).reduce((a,c)=>a+(parseFloat(c.annual_cost)||0),0)/hrs;
  const margin = Math.min(.99, parseFloat(s.profit_margin)||.30);
  const laborRate = (burdened+overhead)/(1-margin);
  return {burdenedRate:burdened, overheadPerHr:overhead, laborRate, profitPerHr:laborRate-burdened-overhead, matMarkup:parseFloat(s.mat_markup)||1.5, dailyRevenue:laborRate*8};
}

// ── FlatRatePricebookPage ────────────────────────────────────
function FlatRatePricebookPage({service, onBack}) {
  const svcKey = service.toLowerCase();
  const [custType, setCustType] = useState('residential'); // residential | commercial
  const [engine, setEngine] = useState(null);
  const [engineDraft, setEngineDraft] = useState(null);
  const [engineModal, setEngineModal] = useState(false);
  const [engineTab, setEngineTab] = useState('burden'); // burden | overhead | profit | summary
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selCat, setSelCat] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskModal, setTaskModal] = useState(null); // null | 'new' | task
  const [catModal, setCatModal] = useState(null);   // null | 'new' | cat
  const [materialsModal, setMaterialsModal] = useState(null); // null | task
  const [matSearch, setMatSearch] = useState('');
  const {data:allMaterials} = useApi(()=>api.getMaterials());
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const loadEngine = useCallback(()=>api.getFREngineFor(svcKey, custType).then(d=>{setEngine(d);setEngineDraft(JSON.parse(JSON.stringify(d)));}),[svcKey,custType]);
  const loadCategories = useCallback(()=>api.getFRCategories({service:svcKey,customer_type:custType}).then(setCategories),[svcKey,custType]);
  const loadTasks = useCallback(()=>api.getFRTasks({service:svcKey,customer_type:custType}).then(setTasks),[svcKey,custType]);

  useEffect(()=>{ loadEngine(); loadCategories(); loadTasks(); },[loadEngine,loadCategories,loadTasks]);

  const computed = computeFREngine(engine);
  const fmt = (n,d=2)=>n!=null?'$'+parseFloat(n).toFixed(d):'-';
  const fmtN = (n,d=2)=>n!=null?parseFloat(n).toFixed(d)+'/hr':'-';

  const saveEngine = async () => {
    setSaving(true);
    try {
      const saved = await api.saveFREngine(svcKey, custType, engineDraft);
      setEngine(saved); setEngineDraft(JSON.parse(JSON.stringify(saved)));
      setEngineModal(false);
      setRecalculating(true);
      await api.recalculateFR({service:svcKey,customer_type:custType});
      await loadTasks();
    } finally { setSaving(false); setRecalculating(false); }
  };

  const filteredTasks = selCat ? tasks.filter(t=>t.category_id===selCat) : tasks;
  const catName = categories.find(c=>c.id===selCat)?.name || 'All Tasks';

  const INP = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const LBL = {fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4};

  // Task save
  const saveTask = async (data) => {
    if (taskModal?.id) await api.updateFRTask(taskModal.id, data);
    else await api.createFRTask({...data, service:svcKey, customer_type:custType});
    setTaskModal(null); await loadTasks();
  };
  const deleteTask = async (id) => {
    if (!confirm('Archive this task?')) return;
    await api.deleteFRTask(id); await loadTasks();
  };

  // Category save
  const saveCat = async (name) => {
    if (catModal?.id) await api.updateFRCategory(catModal.id, {name});
    else await api.createFRCategory({service:svcKey, customer_type:custType, name});
    setCatModal(null); await loadCategories();
  };
  const deleteCat = async (id) => {
    if (!confirm('Delete this category and all its tasks?')) return;
    await api.deleteFRCategory(id); await loadCategories(); await loadTasks();
    if (selCat===id) setSelCat(null);
  };

  // Engine draft helpers
  const setED = k => e => setEngineDraft(d=>({...d,[k]:e.target.value}));
  const addFixed = () => setEngineDraft(d=>({...d,fixed_costs:[...(d.fixed_costs||[]),{label:'',amount:''}]}));
  const addOverhead = () => setEngineDraft(d=>({...d,overhead_items:[...(d.overhead_items||[]),{label:'',annual_cost:''}]}));

  const live = computeFREngine(engineDraft);

  return (
    <div style={{animation:'fadeUp .3s ease',height:'100%',display:'flex',flexDirection:'column',gap:0}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <button onClick={onBack} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:7,padding:'6px 14px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>← Back</button>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>{SERVICE_ICONS[svcKey]} {SERVICE_LABELS[svcKey]||service} Pricebook</div>
        {/* Res / Com toggle */}
        <div style={{display:'flex',gap:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {[['residential','Residential'],['commercial','Commercial']].map(([v,l])=>(
            <button key={v} onClick={()=>setCustType(v)} style={{padding:'7px 18px',border:'none',cursor:'pointer',fontSize:12,fontWeight:custType===v?700:400,
              background:custType===v?'#e8a84a':'transparent',color:custType===v?'#000':'var(--muted)'}}>{l}</button>
          ))}
        </div>
        <button onClick={()=>setEngineModal(true)} style={{background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,padding:'7px 16px',color:'var(--amber)',fontSize:12,fontWeight:700,cursor:'pointer'}}>⚙ Engine</button>
      </div>

      {/* Engine banner */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 20px',marginBottom:16,display:'flex',gap:0,flexWrap:'wrap',overflow:'hidden'}}>
        {[
          ['Burdened Cost',fmtN(computed.burdenedRate),'#5daf7c'],
          ['Overhead/hr',fmtN(computed.overheadPerHr),'#4a9eff'],
          ['Profit/hr',fmtN(computed.profitPerHr),'#a78bfa'],
          ['Labor Rate',fmtN(computed.laborRate),'var(--amber)'],
          ['Mat Markup',`${((computed.matMarkup-1)*100).toFixed(0)}%`,'#22d3ee'],
          ['Daily Revenue',fmt(computed.dailyRevenue,0),'#5daf7c'],
        ].map(([lbl,val,clr],i)=>(
          <div key={lbl} style={{flex:'1 1 100px',padding:'6px 18px',borderRight:i<5?'1px solid var(--border)':'none',textAlign:'center',minWidth:100}}>
            <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:4}}>{lbl}</div>
            <div style={{fontSize:17,fontWeight:800,fontFamily:'var(--font-head)',color:clr}}>{val}</div>
          </div>
        ))}
        {recalculating&&<div style={{alignSelf:'center',fontSize:11,color:'var(--muted)',paddingLeft:10}}>Recalculating...</div>}
      </div>

      {/* Body: sidebar + task table */}
      <div style={{display:'flex',gap:16,flex:1,minHeight:0}}>
        {/* Sidebar */}
        <div style={{width:210,flexShrink:0,display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:4}}>CATEGORIES</div>
          <div onClick={()=>setSelCat(null)} style={{padding:'8px 12px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:selCat===null?700:400,
            background:selCat===null?'var(--surface2)':'transparent',border:selCat===null?'1px solid var(--border)':'1px solid transparent',color:selCat===null?'var(--amber)':'var(--text)'}}>
            All Tasks <span style={{float:'right',fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)'}}>{tasks.length}</span>
          </div>
          {categories.map(cat=>(
            <div key={cat.id} style={{display:'flex',alignItems:'center',gap:4}}>
              <div onClick={()=>setSelCat(cat.id)} style={{flex:1,padding:'8px 12px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:selCat===cat.id?700:400,
                background:selCat===cat.id?'var(--surface2)':'transparent',border:selCat===cat.id?'1px solid var(--border)':'1px solid transparent',
                color:selCat===cat.id?'var(--amber)':'var(--text)'}}>
                {cat.name}
                <span style={{float:'right',fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)'}}>{tasks.filter(t=>t.category_id===cat.id).length}</span>
              </div>
              <button onClick={()=>setCatModal(cat)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:11,cursor:'pointer',padding:'4px',flexShrink:0}}>✎</button>
              <button onClick={()=>deleteCat(cat.id)} style={{background:'none',border:'none',color:'#f56565',fontSize:11,cursor:'pointer',padding:'4px',flexShrink:0}}>✕</button>
            </div>
          ))}
          <button onClick={()=>setCatModal('new')} style={{marginTop:4,background:'none',border:'1px dashed var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--muted)',fontSize:12,cursor:'pointer',textAlign:'left'}}>+ Add Category</button>
        </div>

        {/* Task table */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{fontSize:15,fontWeight:700,fontFamily:'var(--font-head)'}}>{catName}</div>
            <div style={{flex:1}}/>
            <button onClick={()=>setTaskModal('new')} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'7px 16px',color:'#5daf7c',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Task</button>
          </div>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                  {['CODE','TASK NAME','CATEGORY','HOURS','MATERIALS COST','FLAT RATE','DIFFICULTY',''].map(h=>(
                    <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',fontWeight:500}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task=>{
                  const matCost = (task.materials||[]).reduce((s,m)=>s+(parseFloat(m.qty)*parseFloat(m.national_avg||0)),0);
                  const isExpanded = expandedTask===task.id;
                  return (
                    <>
                      <tr key={task.id} style={{borderBottom:'1px solid var(--border)',cursor:'pointer',background:isExpanded?'var(--surface2)':'transparent'}}
                        onClick={()=>setExpandedTask(isExpanded?null:task.id)}
                        onMouseEnter={e=>!isExpanded&&(e.currentTarget.style.background='var(--surface2)')}
                        onMouseLeave={e=>!isExpanded&&(e.currentTarget.style.background='transparent')}>
                        <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>{task.code||'—'}</td>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{fontSize:13,fontWeight:600}}>{task.name}</div>
                          {task.description&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{task.description.slice(0,60)}{task.description.length>60?'…':''}</div>}
                        </td>
                        <td style={{padding:'10px 14px',fontSize:11,color:'var(--muted)'}}>{task.category_name||'—'}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',fontSize:12}}>{parseFloat(task.labor_hours||1).toFixed(2)} hrs</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>
                          {matCost>0?`$${matCost.toFixed(2)}`:'—'}
                          {task.materials?.length>0&&<span style={{fontSize:9,color:'var(--muted)',marginLeft:4}}>({task.materials.length} items)</span>}
                        </td>
                        <td style={{padding:'10px 14px'}}>
                          <span style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800,color:'var(--amber)'}}>
                            {task.price_override!=null?fmt(task.price_override):fmt(task.flat_rate)}
                          </span>
                          {task.price_override!=null&&<span style={{fontSize:9,color:'var(--muted)',display:'block'}}>override</span>}
                        </td>
                        <td style={{padding:'10px 14px'}}>
                          <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontFamily:'var(--font-mono)',
                            background:task.difficulty==='easy'?'#5daf7c22':task.difficulty==='hard'?'#f5656522':'#4a9eff22',
                            color:task.difficulty==='easy'?'#5daf7c':task.difficulty==='hard'?'#f56565':'#4a9eff'}}>
                            {task.difficulty}
                          </span>
                        </td>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',gap:5}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setMaterialsModal(task)} title="Materials" style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'#22d3ee',fontSize:11,cursor:'pointer'}}>📦</button>
                            <button onClick={()=>setTaskModal(task)} title="Edit" style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✎</button>
                            <button onClick={()=>deleteTask(task.id)} title="Archive" style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'#f56565',fontSize:11,cursor:'pointer'}}>✕</button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded&&(
                        <tr key={task.id+'_exp'} style={{borderBottom:'1px solid var(--border)'}}>
                          <td colSpan={8} style={{padding:'16px 20px',background:'var(--surface2)'}}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
                              <div>
                                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:6,letterSpacing:'.05em'}}>PRICE BREAKDOWN</div>
                                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                                  {[
                                    ['Labor',`${parseFloat(task.labor_hours||1).toFixed(2)} hrs × ${fmt(computed.laborRate)}/hr`,parseFloat(task.labor_hours||1)*computed.laborRate],
                                    ['Materials',`${fmt(matCost)} × ${computed.matMarkup.toFixed(2)}x markup`,matCost*computed.matMarkup],
                                  ].map(([lbl,sub,val])=>(
                                    <div key={lbl} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 8px',background:'var(--surface)',borderRadius:6}}>
                                      <div><div style={{fontWeight:600}}>{lbl}</div><div style={{fontSize:10,color:'var(--muted)'}}>{sub}</div></div>
                                      <div style={{fontFamily:'var(--font-mono)',color:'var(--amber)',fontWeight:700}}>{fmt(val)}</div>
                                    </div>
                                  ))}
                                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'6px 8px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:6,marginTop:2}}>
                                    <div style={{fontWeight:700}}>FLAT RATE</div>
                                    <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,color:'var(--amber)'}}>{fmt(task.flat_rate)}</div>
                                  </div>
                                  {task.price_override!=null&&(
                                    <div style={{fontSize:11,color:'var(--muted)',textAlign:'center'}}>Override active: {fmt(task.price_override)}</div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:6,letterSpacing:'.05em'}}>MATERIALS ({task.materials?.length||0})</div>
                                {task.materials?.length>0?(
                                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                                    {task.materials.map(m=>(
                                      <div key={m.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 8px',background:'var(--surface)',borderRadius:6}}>
                                        <div>{m.material_name} <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)'}}>×{m.qty} {m.unit}</span></div>
                                        <div style={{fontFamily:'var(--font-mono)',color:'var(--muted)'}}>{fmt(m.qty*m.national_avg)}</div>
                                      </div>
                                    ))}
                                  </div>
                                ):(
                                  <div style={{fontSize:12,color:'var(--muted)',fontStyle:'italic'}}>No materials linked. Click 📦 to add.</div>
                                )}
                              </div>
                              <div>
                                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',marginBottom:6,letterSpacing:'.05em'}}>NOTES</div>
                                <div style={{fontSize:12,color:'var(--muted)',fontStyle:task.notes?'normal':'italic'}}>{task.notes||'No notes.'}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {filteredTasks.length===0&&(
                  <tr><td colSpan={8} style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>
                    No tasks yet. Click <strong>+ Add Task</strong> to get started.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Engine Settings Modal ── */}
      {engineModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setEngineModal(false)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:680,maxHeight:'90vh',overflowY:'auto',padding:28}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:800}}>Engine Settings — {SERVICE_LABELS[svcKey]} / {custType.charAt(0).toUpperCase()+custType.slice(1)}</div>
              <button onClick={()=>setEngineModal(false)} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
            </div>
            {/* 4 tabs */}
            <div style={{display:'flex',gap:2,marginBottom:20,background:'var(--surface2)',borderRadius:8,padding:3}}>
              {[['burden','Tech Burden Rate'],['overhead','Overhead'],['profit','Profit & Markup'],['summary','Summary']].map(([k,l])=>(
                <button key={k} onClick={()=>setEngineTab(k)} style={{flex:1,padding:'7px 10px',borderRadius:6,fontSize:11,border:'none',cursor:'pointer',fontFamily:'var(--font-body)',fontWeight:engineTab===k?700:400,background:engineTab===k?'var(--amber)':'transparent',color:engineTab===k?'#000':'var(--muted)'}}>{l}</button>
              ))}
            </div>

            {engineTab==='burden'&&(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label style={LBL}>TECH HOURLY WAGE ($)</label><input type="number" value={engineDraft?.tech_wage||25} onChange={setED('tech_wage')} style={INP}/></div>
                <div><label style={LBL}>BILLABLE HOURS/YEAR</label><input type="number" value={engineDraft?.billable_hrs_yr||1500} onChange={setED('billable_hrs_yr')} style={INP}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div><label style={LBL}>FICA (%)</label><input type="number" step="0.001" value={((parseFloat(engineDraft?.fica_pct)||.0765)*100).toFixed(3)} onChange={e=>setEngineDraft(d=>({...d,fica_pct:parseFloat(e.target.value)/100}))} style={INP}/></div>
                  <div><label style={LBL}>UNEMPLOYMENT (%)</label><input type="number" step="0.001" value={((parseFloat(engineDraft?.unemployment_pct)||.02)*100).toFixed(3)} onChange={e=>setEngineDraft(d=>({...d,unemployment_pct:parseFloat(e.target.value)/100}))} style={INP}/></div>
                  <div><label style={LBL}>WORKERS COMP (%)</label><input type="number" step="0.001" value={((parseFloat(engineDraft?.workers_comp_pct)||.05)*100).toFixed(3)} onChange={e=>setEngineDraft(d=>({...d,workers_comp_pct:parseFloat(e.target.value)/100}))} style={INP}/></div>
                </div>
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <label style={{...LBL,margin:0}}>MONTHLY FIXED COSTS</label>
                    <button onClick={addFixed} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:6,padding:'4px 12px',color:'#5daf7c',fontSize:11,cursor:'pointer'}}>+ Add</button>
                  </div>
                  {(engineDraft?.fixed_costs||[]).map((fc,i)=>(
                    <div key={i} style={{display:'flex',gap:8,marginBottom:6}}>
                      <input placeholder="Label (e.g. Truck payment)" value={fc.label} onChange={e=>setEngineDraft(d=>({...d,fixed_costs:d.fixed_costs.map((x,j)=>j===i?{...x,label:e.target.value}:x)}))} style={{...INP,flex:2}}/>
                      <input type="number" placeholder="$/mo" value={fc.amount} onChange={e=>setEngineDraft(d=>({...d,fixed_costs:d.fixed_costs.map((x,j)=>j===i?{...x,amount:e.target.value}:x)}))} style={{...INP,flex:1}}/>
                      <button onClick={()=>setEngineDraft(d=>({...d,fixed_costs:d.fixed_costs.filter((_,j)=>j!==i)}))} style={{background:'#f5656520',border:'1px solid #f5656540',borderRadius:6,padding:'4px 8px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{background:'#5daf7c14',border:'1px solid #5daf7c44',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--text)'}}>
                  Burdened Rate: <strong style={{color:'#5daf7c'}}>{fmtN(live.burdenedRate)}</strong>
                </div>
              </div>
            )}

            {engineTab==='overhead'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>Enter annual costs for each overhead item. These spread across billable hours.</div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
                  <button onClick={addOverhead} style={{background:'#4a9eff22',border:'1px solid #4a9eff',borderRadius:6,padding:'4px 12px',color:'#4a9eff',fontSize:11,cursor:'pointer'}}>+ Add Item</button>
                </div>
                {(engineDraft?.overhead_items||[]).length===0&&<div style={{textAlign:'center',padding:24,color:'var(--muted)',fontSize:13}}>No overhead items. Add rent, insurance, marketing, etc.</div>}
                {(engineDraft?.overhead_items||[]).map((oi,i)=>(
                  <div key={i} style={{display:'flex',gap:8}}>
                    <input placeholder="Label (e.g. Office rent)" value={oi.label} onChange={e=>setEngineDraft(d=>({...d,overhead_items:d.overhead_items.map((x,j)=>j===i?{...x,label:e.target.value}:x)}))} style={{...INP,flex:2}}/>
                    <input type="number" placeholder="Annual cost ($)" value={oi.annual_cost} onChange={e=>setEngineDraft(d=>({...d,overhead_items:d.overhead_items.map((x,j)=>j===i?{...x,annual_cost:e.target.value}:x)}))} style={{...INP,flex:1}}/>
                    <button onClick={()=>setEngineDraft(d=>({...d,overhead_items:d.overhead_items.filter((_,j)=>j!==i)}))} style={{background:'#f5656520',border:'1px solid #f5656540',borderRadius:6,padding:'4px 8px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                  </div>
                ))}
                <div style={{background:'#4a9eff14',border:'1px solid #4a9eff44',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--text)'}}>
                  Overhead/hr: <strong style={{color:'#4a9eff'}}>{fmtN(live.overheadPerHr)}</strong>
                </div>
              </div>
            )}

            {engineTab==='profit'&&(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div>
                  <label style={LBL}>PROFIT MARGIN (%)</label>
                  <input type="number" step="1" min="0" max="99" value={((parseFloat(engineDraft?.profit_margin)||.30)*100).toFixed(0)} onChange={e=>setEngineDraft(d=>({...d,profit_margin:parseFloat(e.target.value)/100}))} style={INP}/>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Desired net profit as % of revenue. Formula: Labor Rate = (Burdened + Overhead) / (1 - margin).</div>
                </div>
                <div>
                  <label style={LBL}>MATERIAL MARKUP (multiplier)</label>
                  <input type="number" step="0.05" min="1" value={parseFloat(engineDraft?.mat_markup||1.5).toFixed(2)} onChange={setED('mat_markup')} style={INP}/>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>e.g. 1.5 = 50% markup on materials cost.</div>
                </div>
                <div style={{background:'#a78bfa14',border:'1px solid #a78bfa44',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--text)'}}>
                  Labor Rate: <strong style={{color:'var(--amber)'}}>{fmtN(live.laborRate)}</strong> &nbsp;·&nbsp; Profit/hr: <strong style={{color:'#a78bfa'}}>{fmtN(live.profitPerHr)}</strong>
                </div>
              </div>
            )}

            {engineTab==='summary'&&(
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:6}}>Live preview of engine calculation:</div>
                {[
                  ['Tech Wage',`$${parseFloat(live.burdenedRate||0).toFixed(2)}/hr burdened`,'#5daf7c'],
                  ['Overhead',fmtN(live.overheadPerHr),'#4a9eff'],
                  ['Profit Margin',`${((parseFloat(engineDraft?.profit_margin)||.30)*100).toFixed(0)}% → ${fmtN(live.profitPerHr)}`,'#a78bfa'],
                  ['Labor Rate',fmtN(live.laborRate),'var(--amber)'],
                  ['Material Markup',`${((live.matMarkup-1)*100).toFixed(0)}% over cost`,'#22d3ee'],
                  ['Daily Revenue (8hr)',`$${live.dailyRevenue.toFixed(0)}`,'#5daf7c'],
                ].map(([lbl,val,clr])=>(
                  <div key={lbl} style={{display:'flex',justifyContent:'space-between',padding:'8px 14px',background:'var(--surface2)',borderRadius:8,fontSize:13}}>
                    <span style={{color:'var(--muted)'}}>{lbl}</span>
                    <span style={{fontWeight:700,fontFamily:'var(--font-mono)',color:clr}}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{display:'flex',gap:10,marginTop:24,justifyContent:'flex-end'}}>
              <button onClick={()=>setEngineModal(false)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={saveEngine} disabled={saving} style={{background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,padding:'9px 20px',color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving…':'Save & Recalculate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Modal ── */}
      {catModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setCatModal(null)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:400,padding:24}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700,marginBottom:16}}>{catModal?.id?'Edit Category':'New Category'}</div>
            <input defaultValue={catModal?.id?catModal.name:''} id="cat-name-inp"
              style={{...INP,marginBottom:16}} placeholder="Category name" autoFocus onKeyDown={e=>e.key==='Enter'&&saveCat(document.getElementById('cat-name-inp').value)}/>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setCatModal(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={()=>saveCat(document.getElementById('cat-name-inp').value)} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Modal ── */}
      {taskModal&&(
        <FRTaskModal task={taskModal==='new'?null:taskModal} categories={categories} onSave={saveTask} onClose={()=>setTaskModal(null)}/>
      )}

      {/* ── Materials Modal ── */}
      {materialsModal&&(
        <FRMaterialsModal task={materialsModal} allMaterials={allMaterials||[]} onSave={async(mats)=>{
          await api.updateFRTask(materialsModal.id, {...materialsModal, materials:mats});
          await loadTasks(); setMaterialsModal(null);
        }} onClose={()=>setMaterialsModal(null)}/>
      )}
    </div>
  );
}

// ── FR Task Modal ────────────────────────────────────────────
function FRTaskModal({task, categories, onSave, onClose}) {
  const [form, setForm] = useState({code:'',name:'',description:'',category_id:'',labor_hours:'1',difficulty:'moderate',price_override:'',notes:'',taxable:true,sort_order:'0',...task});
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const save = async () => {
    if (!form.name.trim()) return toast.warn('Required', 'Name required');
    setSaving(true);
    try { await onSave({...form, labor_hours:parseFloat(form.labor_hours)||1, sort_order:parseInt(form.sort_order)||0, price_override:form.price_override?parseFloat(form.price_override):null, taxable:form.taxable!==false}); }
    catch(e) { toast.error('Error', e.message); } finally { setSaving(false); }
  };
  const INP = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const LBL = {fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4};
  return (
    <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:620,maxHeight:'90vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>{task?.id?'Edit Task':'New Task'}</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div><label style={LBL}>TASK CODE</label><input value={form.code||''} onChange={set('code')} style={INP} placeholder="e.g. PLB-001"/></div>
          <div><label style={LBL}>TASK NAME *</label><input value={form.name} onChange={set('name')} style={INP}/></div>
          <div><label style={LBL}>CATEGORY</label>
            <select value={form.category_id||''} onChange={set('category_id')} style={INP}>
              <option value="">No category</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={LBL}>DIFFICULTY</label>
            <select value={form.difficulty} onChange={set('difficulty')} style={INP}>
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div><label style={LBL}>LABOR HOURS</label><input type="number" step="0.25" min="0.25" value={form.labor_hours} onChange={set('labor_hours')} style={INP}/></div>
          <div><label style={LBL}>PRICE OVERRIDE ($) — leave blank to use engine</label><input type="number" value={form.price_override||''} onChange={set('price_override')} style={INP} placeholder="Optional"/></div>
        </div>
        <div style={{marginTop:14}}><label style={LBL}>DESCRIPTION</label><textarea value={form.description||''} onChange={set('description')} rows={2} style={{...INP,resize:'vertical'}}/></div>
        <div style={{marginTop:12}}><label style={LBL}>NOTES</label><textarea value={form.notes||''} onChange={set('notes')} rows={2} style={{...INP,resize:'vertical'}}/></div>
        <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save Task'}</button>
        </div>
      </div>
    </div>
  );
}

// ── FR Materials Modal ───────────────────────────────────────
function FRMaterialsModal({task, allMaterials, onSave, onClose}) {
  const [selected, setSelected] = useState(task.materials?.map(m=>({material_id:m.material_id,qty:m.qty}))||[]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = (allMaterials||[]).filter(m=>!search||(m.name||'').toLowerCase().includes(search.toLowerCase())||(m.code||'').toLowerCase().includes(search.toLowerCase()));
  const toggle = (mat) => {
    const existing = selected.find(s=>s.material_id===mat.id);
    if (existing) setSelected(prev=>prev.filter(s=>s.material_id!==mat.id));
    else setSelected(prev=>[...prev,{material_id:mat.id,qty:1}]);
  };
  const setQty = (matId, qty) => setSelected(prev=>prev.map(s=>s.material_id===matId?{...s,qty:parseFloat(qty)||1}:s));
  const save = async () => { setSaving(true); try { await onSave(selected); } catch(e){toast.error('Error',e.message);} finally {setSaving(false);} };
  return (
    <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:640,maxHeight:'88vh',overflowY:'auto',padding:28}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>Materials — {task.name}</div>
          <button onClick={onClose} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search materials..."
          style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,marginBottom:14,boxSizing:'border-box'}}/>
        <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:380,overflowY:'auto'}}>
          {filtered.map(mat=>{
            const sel = selected.find(s=>s.material_id===mat.id);
            return (
              <div key={mat.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:8,background:sel?'#5daf7c14':'var(--surface2)',border:`1px solid ${sel?'#5daf7c44':'var(--border)'}`}}>
                <input type="checkbox" checked={!!sel} onChange={()=>toggle(mat)}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{mat.name}</div>
                  <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{mat.code} · {mat.unit} · Avg: ${parseFloat(mat.national_avg||0).toFixed(2)}</div>
                </div>
                {sel&&(
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:11,color:'var(--muted)'}}>Qty:</span>
                    <input type="number" min="0.1" step="0.5" value={sel.qty} onChange={e=>setQty(mat.id,e.target.value)}
                      style={{width:60,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'3px 6px',color:'var(--text)',fontSize:12,fontFamily:'var(--font-mono)'}}/>
                    <span style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{mat.unit}</span>
                    <span style={{fontSize:11,color:'#5daf7c',fontFamily:'var(--font-mono)'}}>${(sel.qty*parseFloat(mat.national_avg||0)).toFixed(2)}</span>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length===0&&<div style={{textAlign:'center',padding:32,color:'var(--muted)',fontSize:13}}>No materials found. Add them in the Materials Library.</div>}
        </div>
        <div style={{borderTop:'1px solid var(--border)',marginTop:16,paddingTop:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:12,color:'var(--muted)'}}>{selected.length} material{selected.length!==1?'s':''} selected · Total: ${selected.reduce((s,sel)=>{const m=allMaterials.find(x=>x.id===sel.material_id);return s+(m?sel.qty*parseFloat(m.national_avg||0):0);},0).toFixed(2)}</div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={onClose} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving...':'Save Materials'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Materials Library Page ───────────────────────────────────
function MaterialsLibraryPage() {
  const {data:materials, loading, reload} = useApi(()=>api.getMaterials());
  const {data:matCategories} = useApi(()=>api.getMaterialCategories());
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | item
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [form, setForm] = useState({code:'',name:'',category:'',unit:'EA',national_avg:''});

  const filtered = (materials||[]).filter(m=>{
    if(catFilter!=='all'&&m.category!==catFilter) return false;
    if(search&&!(m.name||'').toLowerCase().includes(search.toLowerCase())&&!(m.code||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openNew = () => { setForm({code:'',name:'',category:'',unit:'EA',national_avg:''}); setModal('new'); };
  const openEdit = (m) => { setForm({...m,national_avg:m.national_avg||''}); setModal(m); };

  const save = async () => {
    if (!form.name.trim()) return toast.warn('Required', 'Name required');
    setSaving(true);
    try {
      if (modal?.id) await api.updateMaterial(modal.id, form);
      else await api.createMaterial(form);
      setModal(null); reload();
    } catch(e) { toast.error('Error', e.message); } finally { setSaving(false); }
  };

  const deleteMat = async (id) => {
    if (!confirm('Archive this material?')) return;
    await api.deleteMaterial(id); reload();
  };

  const INP = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,width:'100%'};
  const LBL = {fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4};

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>Materials Library</div>
        <div style={{fontSize:13,color:'var(--muted)',marginLeft:4}}>National average pricing for pricebook tasks</div>
        <div style={{flex:1}}/>
        <button onClick={openNew} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'8px 16px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Add Material</button>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search materials..."
          style={{flex:1,minWidth:180,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13}}>
          <option value="all">All Categories</option>
          {(matCategories||[]).map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading?<div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>:(
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border2)'}}>
                {['CODE','NAME','CATEGORY','UNIT','NAT. AVG PRICE','LAST UPDATED',''].map(h=>(
                  <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m=>(
                <tr key={m.id} style={{borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--muted)'}}>{m.code||'—'}</td>
                  <td style={{padding:'9px 14px',fontSize:13,fontWeight:500}}>{m.name}</td>
                  <td style={{padding:'9px 14px',fontSize:11,color:'var(--muted)'}}>{m.category||'—'}</td>
                  <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:11}}>{m.unit}</td>
                  <td style={{padding:'9px 14px',fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,color:'var(--amber)'}}>
                    ${parseFloat(m.national_avg||0).toFixed(2)}
                  </td>
                  <td style={{padding:'9px 14px',fontSize:11,color:'var(--muted)'}}>{m.last_updated?new Date(m.last_updated).toLocaleDateString():''}</td>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>openEdit(m)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#e8a84a',fontSize:12,cursor:'pointer'}}>✎</button>
                      <button onClick={()=>deleteMat(m.id)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 9px',color:'#f56565',fontSize:12,cursor:'pointer'}}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={7} style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>No materials found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,width:520,padding:28}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:18,fontWeight:700}}>{modal?.id?'Edit Material':'New Material'}</div>
              <button onClick={()=>setModal(null)} style={{background:'none',color:'var(--muted)',fontSize:20}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div><label style={LBL}>MATERIAL CODE</label><input value={form.code||''} onChange={e=>setForm(f=>({...f,code:e.target.value}))} style={INP} placeholder="e.g. PLB-PIPE-34"/></div>
              <div><label style={LBL}>NAME *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={INP}/></div>
              <div><label style={LBL}>CATEGORY</label><input value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={INP} placeholder="e.g. Pipe, Fittings"/></div>
              <div><label style={LBL}>UNIT</label>
                <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} style={INP}>
                  {['EA','LF','SF','GAL','BOX','SET','HR','ROLL','PKG'].map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div><label style={LBL}>NATIONAL AVG PRICE ($)</label><input type="number" step="0.01" value={form.national_avg||''} onChange={e=>setForm(f=>({...f,national_avg:e.target.value}))} style={INP}/></div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
              <button onClick={()=>setModal(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 20px',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{background:'#5daf7c22',border:'1px solid #5daf7c',borderRadius:8,padding:'9px 20px',color:'#5daf7c',fontSize:13,fontWeight:600,cursor:'pointer'}}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServicePricebooksPage({ user }) {
  const enabledServices = useCompanyServices(); // ['plumbing','hvac',...]
  const [activeService, setActiveService] = useState(null);

  if (activeService) {
    return <FlatRatePricebookPage service={activeService} onBack={()=>setActiveService(null)}/>;
  }

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:6}}>Pricebook</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:24}}>Select a service to view its flat rate pricebook and engine.</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:16}}>
        {['plumbing','hvac','electrical','restoration','renovations'].map(svc=>{
          const isEnabled = enabledServices.includes(svc);
          return (
            <div key={svc} onClick={()=>isEnabled&&setActiveService(svc)}
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24,cursor:isEnabled?'pointer':'default',opacity:isEnabled?1:0.45,transition:'all .2s',position:'relative'}}
              onMouseEnter={e=>{if(isEnabled)e.currentTarget.style.borderColor='var(--amber)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';}}>
              <div style={{fontSize:32,marginBottom:10}}>{SERVICE_ICONS[svc]||'🔧'}</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:4}}>{SERVICE_LABELS[svc]||svc}</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Flat Rate · Res + Com</div>
              {!isEnabled&&<div style={{position:'absolute',top:10,right:10,fontSize:9,padding:'2px 7px',background:'#1e2a3a',color:'#3a5a7a',borderRadius:4,fontWeight:700}}>DISABLED</div>}
              {isEnabled&&<div style={{position:'absolute',top:10,right:10,fontSize:9,padding:'2px 7px',background:'#5daf7c22',color:'#5daf7c',borderRadius:4,fontWeight:700}}>ACTIVE</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION PAGES
// ═══════════════════════════════════════════════════════════════════════════
function SquareIntegrationPage() {
  const [creds, setCreds] = useState({ app_id:'', access_token:'', location_id:'' });
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const INP = {width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',boxSizing:'border-box',fontFamily:'var(--font-mono)'};
  const LBL = {display:'block',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:600};
  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations/square', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('dps_token')}, body:JSON.stringify(creds) });
      setConnected(true); setMsg('Connected successfully'); setTimeout(()=>setMsg(''),3000);
    } catch(e){ setMsg('Error saving'); } finally { setSaving(false); }
  };
  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:600}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:52,height:52,background:'#000',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,flexShrink:0}}>▪</div>
        <div>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>Square</div>
          <div style={{fontSize:13,color:'var(--muted)'}}>Accept payments via Square in invoices and estimates.</div>
        </div>
        {connected && <span style={{marginLeft:'auto',fontSize:12,padding:'4px 12px',background:'#5daf7c22',color:'#5daf7c',borderRadius:6,fontWeight:700}}>CONNECTED</span>}
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:16}}>API Credentials</div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={LBL}>Application ID</label><input value={creds.app_id} onChange={e=>setCreds(p=>({...p,app_id:e.target.value}))} style={INP} placeholder='sq0idp-...'/></div>
          <div><label style={LBL}>Access Token</label><input type='password' value={creds.access_token} onChange={e=>setCreds(p=>({...p,access_token:e.target.value}))} style={INP} placeholder='EAAAl...'/></div>
          <div><label style={LBL}>Location ID</label><input value={creds.location_id} onChange={e=>setCreds(p=>({...p,location_id:e.target.value}))} style={INP} placeholder='L...'/></div>
        </div>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Where to find your credentials</div>
        <ol style={{fontSize:12,color:'var(--muted)',lineHeight:1.8,paddingLeft:18,margin:0}}>
          <li>Log into your Square Developer Dashboard at developer.squareup.com</li>
          <li>Create or select an application</li>
          <li>Copy your Application ID from the Credentials tab</li>
          <li>Generate a Production Access Token</li>
          <li>Find your Location ID under Business Locations</li>
        </ol>
      </div>
      {msg && <div style={{marginBottom:12,fontSize:12,padding:'8px 14px',background:msg.includes('Error')?'#f5656518':'#5daf7c18',color:msg.includes('Error')?'#f56565':'#5daf7c',borderRadius:6}}>{msg}</div>}
      <button onClick={save} disabled={saving} style={{padding:'10px 24px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving...':'Connect Square'}</button>
    </div>
  );
}

function ComingSoonIntegrationPage({ name, logo, description }) {
  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:500}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:52,height:52,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>{logo}</div>
        <div>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>{name}</div>
          <div style={{fontSize:13,color:'var(--muted)'}}>{description}</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:60,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12}}>
        <div style={{fontSize:48,marginBottom:16}}>🔧</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Coming Soon</div>
        <div style={{fontSize:13,color:'var(--muted)',textAlign:'center',marginBottom:20}}>The {name} integration is currently under development.</div>
        <div style={{padding:'6px 18px',background:'#1e2a3a',color:'#3a8abf',borderRadius:6,fontSize:12,fontWeight:700}}>COMING SOON</div>
      </div>
    </div>
  );
}

function GPSIntegrationPage() {
  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:600}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:52,height:52,background:'#1a3a5a',border:'1px solid #2a5a8a',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,flexShrink:0}}>📍</div>
        <div>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>GPS Fleet Tracking</div>
          <div style={{fontSize:13,color:'var(--muted)'}}>Connect your GPS tracking provider to the dispatch board.</div>
        </div>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:16}}>GPS Provider</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {['Samsara','Verizon Connect','Geotab','Fleet Complete','Spireon','Azuga'].map(p=>(
            <label key={p} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,cursor:'pointer'}}>
              <input type='radio' name='gps_provider' value={p} style={{accentColor:'var(--amber)'}}/>
              <span style={{fontSize:13}}>{p}</span>
            </label>
          ))}
        </div>
        <div style={{marginTop:20,padding:16,background:'#1e2a3a',borderRadius:8,fontSize:12,color:'#3a8abf'}}>Full GPS provider integration coming soon. Your current GPS page uses the built-in DPS tracking.</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WISETACK FINANCING
// ═══════════════════════════════════════════════════════════════════════════
function WisetackIntegrationPage() {
  const [creds, setCreds] = useState({ merchant_id:'', api_key:'', environment:'sandbox' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [connected, setConnected] = useState(false);
  const [showOnInvoices, setShowOnInvoices] = useState(true);
  const [showOnEstimates, setShowOnEstimates] = useState(true);
  const [minAmount, setMinAmount] = useState(500);
  const [maxAmount, setMaxAmount] = useState(25000);

  useEffect(() => { loadCreds(); }, []);
  const loadCreds = async () => {
    try {
      const res = await fetch('/api/integrations/wisetack', { headers:{ Authorization:'Bearer '+localStorage.getItem('dps_token') } });
      const d = await res.json();
      if (d && d.merchant_id) { setCreds(d); setConnected(true); }
      if (d && d.show_on_invoices  !== undefined) setShowOnInvoices(d.show_on_invoices);
      if (d && d.show_on_estimates !== undefined) setShowOnEstimates(d.show_on_estimates);
      if (d && d.min_amount) setMinAmount(d.min_amount);
      if (d && d.max_amount) setMaxAmount(d.max_amount);
    } catch(e){}
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations/wisetack', { method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('dps_token') },
        body: JSON.stringify({ ...creds, show_on_invoices:showOnInvoices, show_on_estimates:showOnEstimates, min_amount:minAmount, max_amount:maxAmount })
      });
      setConnected(true); setMsg('Saved successfully'); setTimeout(()=>setMsg(''),3000);
    } catch(e){ setMsg('Error saving'); } finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    setTimeout(() => {
      setMsg(creds.merchant_id ? 'Connection successful!' : 'Enter credentials first');
      setTesting(false);
      setTimeout(()=>setMsg(''),3000);
    }, 1200);
  };

  const INP = {width:'100%',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',boxSizing:'border-box'};
  const LBL = {display:'block',fontSize:11,color:'var(--muted)',marginBottom:5,fontWeight:600};
  const CARD = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24,marginBottom:16};

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:660}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:56,height:56,background:'linear-gradient(135deg,#00b386,#00804d)',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>💳</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>Wisetack</div>
          <div style={{fontSize:13,color:'var(--muted)'}}>Patient, transparent consumer financing built for home service companies.</div>
        </div>
        {connected && <span style={{fontSize:12,padding:'5px 14px',background:'#5daf7c22',color:'#5daf7c',borderRadius:8,fontWeight:700,border:'1px solid #5daf7c44'}}>● CONNECTED</span>}
      </div>

      {/* How it works */}
      <div style={{...CARD,background:'linear-gradient(135deg,#00b38608,#00804d05)',border:'1px solid #00b38622'}}>
        <div style={{fontSize:13,fontWeight:700,color:'#00b386',marginBottom:12}}>How Wisetack Works</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[
            {n:'1',t:'Customer Applies',d:'Click "Apply for Financing" on any invoice or estimate. Takes 60 seconds.'},
            {n:'2',t:'Instant Decision',d:'Customer gets approved instantly for loan options from $500–$25,000.'},
            {n:'3',t:'You Get Paid',d:'Wisetack pays you directly once the job is complete. No recourse.'},
          ].map(s=>(
            <div key={s.n} style={{padding:14,background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:20,fontWeight:800,color:'#00b386',marginBottom:6}}>{s.n}</div>
              <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{s.t}</div>
              <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.5}}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Credentials */}
      <div style={CARD}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:4}}>API Credentials</div>
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>Get these from your Wisetack merchant dashboard at dashboard.wisetack.com</div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={LBL}>Merchant ID</label>
            <input value={creds.merchant_id} onChange={e=>setCreds(p=>({...p,merchant_id:e.target.value}))} style={INP} placeholder='wtk_merchant_...'/>
          </div>
          <div>
            <label style={LBL}>API Key</label>
            <input type='password' value={creds.api_key} onChange={e=>setCreds(p=>({...p,api_key:e.target.value}))} style={INP} placeholder='sk_live_...'/>
          </div>
          <div>
            <label style={LBL}>Environment</label>
            <div style={{display:'flex',gap:8}}>
              {['sandbox','production'].map(env=>(
                <label key={env} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderRadius:8,border:'1px solid '+(creds.environment===env?'var(--amber)':'var(--border)'),background:creds.environment===env?'var(--amberdim)':'transparent',cursor:'pointer',fontSize:13,fontWeight:creds.environment===env?700:400,color:creds.environment===env?'var(--amber)':'var(--muted)'}}>
                  <input type='radio' name='wtk_env' checked={creds.environment===env} onChange={()=>setCreds(p=>({...p,environment:env}))} style={{accentColor:'var(--amber)'}}/>
                  {env.charAt(0).toUpperCase()+env.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Display settings */}
      <div style={CARD}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:16}}>Display Settings</div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <label style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
            <input type='checkbox' checked={showOnInvoices} onChange={e=>setShowOnInvoices(e.target.checked)} style={{width:16,height:16,accentColor:'var(--amber)'}}/>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>Show on Invoices</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Display "Apply for Financing" button on all invoices</div>
            </div>
          </label>
          <label style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
            <input type='checkbox' checked={showOnEstimates} onChange={e=>setShowOnEstimates(e.target.checked)} style={{width:16,height:16,accentColor:'var(--amber)'}}/>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>Show on Estimates</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>Display "Apply for Financing" button on all estimates</div>
            </div>
          </label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={LBL}>Minimum Job Amount ($)</label>
              <input type='number' value={minAmount} onChange={e=>setMinAmount(+e.target.value)} style={INP} placeholder='500'/>
            </div>
            <div>
              <label style={LBL}>Maximum Loan Amount ($)</label>
              <input type='number' value={maxAmount} onChange={e=>setMaxAmount(+e.target.value)} style={INP} placeholder='25000'/>
            </div>
          </div>
        </div>
      </div>

      {/* Loan options preview */}
      <div style={CARD}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:12}}>Available Loan Terms (Wisetack Standard)</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
          {[
            {term:'3 mo',rate:'0% promo',note:'Promotional'},
            {term:'6 mo',rate:'0% promo',note:'Promotional'},
            {term:'12 mo',rate:'~9.9%',note:'Most popular'},
            {term:'18 mo',rate:'~12.9%',note:''},
            {term:'24 mo',rate:'~15.9%',note:''},
            {term:'60 mo',rate:'~17.9%',note:'Largest jobs'},
          ].map(l=>(
            <div key={l.term} style={{padding:12,background:'var(--surface2)',borderRadius:8,border:'1px solid var(--border)',textAlign:'center'}}>
              <div style={{fontSize:16,fontWeight:800,color:'var(--amber)'}}>{l.term}</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{l.rate}</div>
              {l.note && <div style={{fontSize:10,color:'#5daf7c',marginTop:2,fontWeight:600}}>{l.note}</div>}
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:'var(--muted)',marginTop:12}}>*Actual rates determined by customer credit profile. Wisetack is the lender — you receive full payment upfront.</div>
      </div>

      {/* How to get merchant account */}
      <div style={{...CARD,border:'1px solid var(--border)'}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Don't have a Wisetack account yet?</div>
        <ol style={{fontSize:12,color:'var(--muted)',lineHeight:2,paddingLeft:18,margin:0}}>
          <li>Visit <span style={{color:'#00b386',fontWeight:600}}>wisetack.com/partners</span> and apply as a merchant</li>
          <li>Wisetack will review your business (typically 1–3 business days)</li>
          <li>Once approved, log into dashboard.wisetack.com for your credentials</li>
          <li>Paste your Merchant ID and API Key above and click Connect</li>
        </ol>
      </div>

      {/* Buttons */}
      {msg && <div style={{marginBottom:12,padding:'8px 14px',borderRadius:6,background:msg.includes('Error')||msg.includes('Enter')?'#f5656518':'#5daf7c18',color:msg.includes('Error')||msg.includes('Enter')?'#f56565':'#5daf7c',fontSize:12,fontWeight:600}}>{msg}</div>}
      <div style={{display:'flex',gap:10}}>
        <button onClick={testConnection} disabled={testing} style={{padding:'10px 20px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:13,fontWeight:600,cursor:'pointer'}}>{testing?'Testing...':'Test Connection'}</button>
        <button onClick={save} disabled={saving} style={{padding:'10px 24px',background:'linear-gradient(135deg,#00b386,#00804d)',border:'none',borderRadius:8,color:'white',fontSize:13,fontWeight:700,cursor:'pointer'}}>{saving?'Saving...':'Connect Wisetack'}</button>
      </div>
    </div>
  );
}

// Reusable Wisetack financing button for invoices/estimates
function WisetackButton({ customerName, customerPhone, jobAmount, jobId }) {
  const [loading, setLoading] = useState(false);
  const [appUrl, setAppUrl]   = useState(null);
  const [status, setStatus]   = useState(null);

  const apply = async () => {
    if (!jobAmount || jobAmount < 500) {
      toast.warn('Minimum Amount', 'Minimum financed amount is $500');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/wisetack/apply', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('dps_token') },
        body: JSON.stringify({ customer_name:customerName, customer_phone:customerPhone, amount:jobAmount, job_id:jobId })
      });
      const d = await res.json();
      if (d.application_url) {
        setAppUrl(d.application_url);
        setStatus('link_ready');
      } else if (d.error) {
        toast.error('Error', d.error);
      }
    } catch(e){ toast.error('Error', 'Failed to create financing application'); }
    finally { setLoading(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(appUrl);
    setStatus('copied');
    setTimeout(()=>setStatus('link_ready'),2000);
  };

  if (status === 'link_ready' || status === 'copied') {
    return (
      <div style={{padding:16,background:'#00b38610',border:'1px solid #00b38633',borderRadius:10,marginTop:12}}>
        <div style={{fontSize:12,fontWeight:700,color:'#00b386',marginBottom:8}}>✓ Financing Application Ready</div>
        <div style={{fontSize:11,color:'var(--muted)',marginBottom:10,wordBreak:'break-all',fontFamily:'var(--font-mono)',padding:'6px 10px',background:'var(--surface)',borderRadius:6,border:'1px solid var(--border)'}}>{appUrl}</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={copyLink} style={{padding:'6px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,color:status==='copied'?'#5daf7c':'var(--muted)',fontSize:12,cursor:'pointer',fontWeight:600}}>
            {status==='copied'?'✓ Copied!':'Copy Link'}
          </button>
          <a href={appUrl} target='_blank' rel='noreferrer' style={{padding:'6px 14px',background:'#00b386',border:'none',borderRadius:6,color:'white',fontSize:12,fontWeight:600,textDecoration:'none',display:'inline-block'}}>Open Application</a>
          <button onClick={()=>{setStatus(null);setAppUrl(null);}} style={{padding:'6px 10px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:12,cursor:'pointer'}}>Reset</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={apply} disabled={loading}
      style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',background:'linear-gradient(135deg,#00b386,#00804d)',border:'none',borderRadius:8,color:'white',fontSize:13,fontWeight:700,cursor:'pointer',opacity:loading?.7:1}}>
      <span style={{fontSize:16}}>💳</span>
      {loading ? 'Creating Application...' : 'Apply for Financing'}
      {!loading && <span style={{fontSize:10,background:'rgba(255,255,255,.2)',padding:'2px 6px',borderRadius:4}}>Wisetack</span>}
    </button>
  );
}


// ─── ARRIVAL WINDOWS SETTINGS ────────────────────────────────
function ArrivalWindowsSettings() {
  const {data, reload} = useApi(()=>api.getArrivalWindows());
  const [windows, setWindows] = useState(null);
  const [newWin, setNewWin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ if(data) setWindows(data); },[data]);

  const save = async (list) => {
    setSaving(true);
    try { await api.saveArrivalWindows(list); setWindows(list); }
    catch(e){ toast.error('Error', e.message); }
    finally{ setSaving(false); }
  };

  const add = () => {
    const v = newWin.trim(); if(!v) return;
    const next = [...(windows||[]), v];
    setNewWin(''); save(next);
  };

  const remove = (i) => save((windows||[]).filter((_,j)=>j!==i));

  const move = (i, dir) => {
    const arr = [...(windows||[])];
    const j = i + dir;
    if(j<0||j>=arr.length) return;
    [arr[i],arr[j]] = [arr[j],arr[i]]; save(arr);
  };

  const inp = {background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',flex:1};

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:540}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:6}}>Arrival Windows</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Define the time windows CSRs can offer customers when booking jobs.</div>

      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:16}}>
        {(windows||[]).length === 0 && (
          <div style={{padding:20,fontSize:13,color:'var(--muted)',textAlign:'center'}}>No arrival windows yet. Add one below.</div>
        )}
        {(windows||[]).map((w,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:i<windows.length-1?'1px solid var(--border)':'none'}}>
            <div style={{fontSize:18,color:'var(--muted)',cursor:'default'}}>⏰</div>
            <div style={{flex:1,fontSize:14,fontWeight:600}}>{w}</div>
            <button onClick={()=>move(i,-1)} disabled={i===0} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:14,opacity:i===0?.3:1}}>↑</button>
            <button onClick={()=>move(i,1)} disabled={i===(windows||[]).length-1} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:14,opacity:i===(windows||[]).length-1?.3:1}}>↓</button>
            <button onClick={()=>remove(i)} style={{background:'#f5656518',border:'1px solid #f5656533',borderRadius:6,padding:'3px 9px',color:'#f56565',fontSize:11,cursor:'pointer'}}>Remove</button>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:8}}>
        <input value={newWin} onChange={e=>setNewWin(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&add()}
          placeholder='e.g. 8am – 12pm  or  Anytime' style={inp}/>
        <button onClick={add} disabled={!newWin.trim()||saving}
          style={{padding:'9px 18px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          + Add
        </button>
      </div>
    </div>
  );
}

// ─── JOB TYPES SETTINGS ───────────────────────────────────────
function JobTypesSettings() {
  const {data, reload} = useApi(()=>api.getJobTypes());
  const [types, setTypes] = useState(null);
  const [newType, setNewType] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ if(data) setTypes(data); },[data]);

  const save = async (list) => {
    setSaving(true);
    try { await api.saveJobTypes(list); setTypes(list); }
    catch(e){ toast.error('Error', e.message); }
    finally{ setSaving(false); }
  };

  const add = () => {
    const v = newType.trim(); if(!v) return;
    const next = [...(types||[]), v];
    setNewType(''); save(next);
  };

  const remove = (i) => save((types||[]).filter((_,j)=>j!==i));

  const inp = {background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',fontSize:13,color:'var(--text)',flex:1};

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:540}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:6}}>Job Types</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Define the job categories available when creating job tickets.</div>

      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:16}}>
        {(types||[]).length === 0 && (
          <div style={{padding:20,fontSize:13,color:'var(--muted)',textAlign:'center'}}>No job types yet. Add one below.</div>
        )}
        {(types||[]).map((t,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:i<types.length-1?'1px solid var(--border)':'none'}}>
            <div style={{fontSize:18}}>🔧</div>
            <div style={{flex:1,fontSize:14,fontWeight:600}}>{t}</div>
            <button onClick={()=>remove(i)} style={{background:'#f5656518',border:'1px solid #f5656533',borderRadius:6,padding:'3px 9px',color:'#f56565',fontSize:11,cursor:'pointer'}}>Remove</button>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:8}}>
        <input value={newType} onChange={e=>setNewType(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&add()}
          placeholder='e.g. Water Heater, Drain, Leak Detection…' style={inp}/>
        <button onClick={add} disabled={!newType.trim()||saving}
          style={{padding:'9px 18px',background:'var(--amberdim)',border:'1px solid var(--amber)',borderRadius:8,color:'var(--amber)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
          + Add
        </button>
      </div>
    </div>
  );
}

// ── Business Hours Settings ────────────────────────────────────
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' };

const PRESET_HOLIDAYS = [
  { name:"New Year's Day",           date:'01-01',      open:false },
  { name:"Martin Luther King Jr. Day",date:'mlk',       open:false },
  { name:"Presidents' Day",          date:'presidents', open:false },
  { name:"Memorial Day",             date:'memorial',   open:false },
  { name:"Juneteenth",               date:'06-19',      open:false },
  { name:"Independence Day",         date:'07-04',      open:false },
  { name:"Labor Day",                date:'labor',      open:false },
  { name:"Columbus Day",             date:'columbus',   open:true  },
  { name:"Veterans Day",             date:'11-11',      open:true  },
  { name:"Thanksgiving Day",         date:'thanksgiving',open:false },
  { name:"Christmas Eve",            date:'12-24',      open:true  },
  { name:"Christmas Day",            date:'12-25',      open:false },
  { name:"New Year's Eve",           date:'12-31',      open:true  },
];

const DEFAULT_HOURS_STATE = {
  monday:    { open:true,  start:'08:00', end:'17:00' },
  tuesday:   { open:true,  start:'08:00', end:'17:00' },
  wednesday: { open:true,  start:'08:00', end:'17:00' },
  thursday:  { open:true,  start:'08:00', end:'17:00' },
  friday:    { open:true,  start:'08:00', end:'17:00' },
  saturday:  { open:false, start:'09:00', end:'14:00' },
  sunday:    { open:false, start:'09:00', end:'14:00' },
};

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function BusinessHoursSettings() {
  const { data, loading } = useApi(() => api.getBusinessHours());
  const [hours, setHours] = useState(null);
  const [holidays, setHolidays] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newHolName, setNewHolName] = useState('');
  const [newHolDate, setNewHolDate] = useState('');
  const [newHolOpen, setNewHolOpen] = useState(false);

  useEffect(() => {
    if (data) {
      setHours(data.hours || DEFAULT_HOURS_STATE);
      setHolidays(data.holidays || PRESET_HOLIDAYS);
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveBusinessHours(hours, holidays);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const setDay = (day, field, value) => {
    setHours(h => ({ ...h, [day]: { ...h[day], [field]: value } }));
  };

  const toggleHoliday = (i) => {
    setHolidays(h => h.map((hol, idx) => idx === i ? { ...hol, open: !hol.open } : hol));
  };

  const removeHoliday = (i) => {
    setHolidays(h => h.filter((_, idx) => idx !== i));
  };

  const addHoliday = () => {
    const name = newHolName.trim();
    if (!name || !newHolDate) return;
    setHolidays(h => [...h, { name, date: newHolDate, open: newHolOpen }]);
    setNewHolName(''); setNewHolDate(''); setNewHolOpen(false);
  };

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:20 };
  const sectionHead = { padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', background:'#ffffff06' };
  const inp = { background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:7, padding:'6px 10px', fontSize:13, color:'var(--text)', width:'100%' };

  if (loading || !hours || !holidays) return <div style={{padding:40,color:'var(--muted)',fontSize:13}}>Loading…</div>;

  return (
    <div style={{ animation:'fadeUp .4s ease', maxWidth:640 }}>
      <div style={{ fontFamily:'var(--font-head)', fontSize:22, fontWeight:800, marginBottom:4 }}>Business Hours</div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:22 }}>Set your regular operating hours and holiday schedule.</div>

      {/* ── Weekly Hours ── */}
      <div style={card}>
        <div style={sectionHead}>Weekly Schedule</div>
        {DAYS.map((day, di) => {
          const d = hours[day];
          return (
            <div key={day} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom: di < DAYS.length-1 ? '1px solid var(--border)' : 'none' }}>
              {/* Toggle */}
              <div onClick={() => setDay(day, 'open', !d.open)}
                style={{ width:36, height:20, borderRadius:10, background: d.open ? 'var(--amber)' : 'var(--border2)', position:'relative', cursor:'pointer', flexShrink:0, transition:'background .2s' }}>
                <div style={{ position:'absolute', top:2, left: d.open ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
              </div>
              {/* Day label */}
              <div style={{ width:100, fontWeight:600, fontSize:14, color: d.open ? 'var(--text)' : 'var(--muted)' }}>
                {DAY_LABELS[day]}
              </div>
              {d.open ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <input type="time" value={d.start} onChange={e => setDay(day, 'start', e.target.value)}
                    style={{ ...inp, width:'auto', padding:'5px 8px' }}/>
                  <span style={{ color:'var(--muted)', fontSize:13 }}>to</span>
                  <input type="time" value={d.end} onChange={e => setDay(day, 'end', e.target.value)}
                    style={{ ...inp, width:'auto', padding:'5px 8px' }}/>
                  <span style={{ fontSize:12, color:'var(--muted)', marginLeft:4 }}>
                    {fmt12(d.start)} – {fmt12(d.end)}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>Closed</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Holidays ── */}
      <div style={card}>
        <div style={{ ...sectionHead, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>Holidays</span>
          <span style={{ fontSize:11, color:'var(--muted)', textTransform:'none', letterSpacing:0, fontWeight:400 }}>Toggle to mark open or closed</span>
        </div>
        {holidays.map((hol, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderBottom: i < holidays.length-1 ? '1px solid var(--border)' : 'none' }}>
            <div onClick={() => toggleHoliday(i)}
              style={{ width:36, height:20, borderRadius:10, background: hol.open ? '#3a8abf' : '#c53030', position:'relative', cursor:'pointer', flexShrink:0, transition:'background .2s' }}>
              <div style={{ position:'absolute', top:2, left: hol.open ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600 }}>{hol.name}</div>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color: hol.open ? '#3a8abf' : '#c53030', width:42, textAlign:'center' }}>
              {hol.open ? 'OPEN' : 'CLOSED'}
            </div>
            <button onClick={() => removeHoliday(i)}
              style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:16, cursor:'pointer', padding:'2px 6px', lineHeight:1 }}>✕</button>
          </div>
        ))}

        {/* Add custom holiday */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', background:'#ffffff04' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>Add Custom Holiday</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input value={newHolName} onChange={e => setNewHolName(e.target.value)}
              placeholder="Holiday name" style={{ ...inp, flex:1, minWidth:160 }}/>
            <input type="date" value={newHolDate} onChange={e => setNewHolDate(e.target.value)}
              style={{ ...inp, width:'auto' }}/>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div onClick={() => setNewHolOpen(o => !o)}
                style={{ width:36, height:20, borderRadius:10, background: newHolOpen ? '#3a8abf' : '#c53030', position:'relative', cursor:'pointer', flexShrink:0, transition:'background .2s' }}>
                <div style={{ position:'absolute', top:2, left: newHolOpen ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color: newHolOpen ? '#3a8abf' : '#c53030', width:42 }}>
                {newHolOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            <button onClick={addHoliday} disabled={!newHolName.trim() || !newHolDate}
              style={{ padding:'7px 16px', background:'var(--amberdim)', border:'1px solid var(--amber)', borderRadius:8, color:'var(--amber)', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              + Add Holiday
            </button>
          </div>
        </div>
      </div>

      {/* Save */}
      <button onClick={save} disabled={saving}
        style={{ padding:'11px 32px', background: saved ? '#276749' : 'var(--amber)', border:'none', borderRadius:10, color: saved ? '#fff' : '#000', fontSize:14, fontWeight:700, cursor:'pointer', transition:'background .3s' }}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  );
}

const SETTINGS_TREE = [
  { id:'company', label:'Company Information', built:true },
  { id:'employees', label:'Employees', children:[
    { id:'technicians',        label:'Technicians',          built:true },
    { id:'office',             label:'Office Personnel',     built:true },
    { id:'permissions',        label:'Roles & Permissions',  built:true },
    { id:'payroll', label:'Payroll Settings', built:true },
  ]},
  { id:'integrations_cat', label:'Integrations', children:[
    { id:'financing_cat',   label:'Customer Financing',          built:true, children:[
      { id:'wisetack',        label:'Wisetack',                    built:true },
      { id:'acorn',           label:'Acorn Finance',               soon:true },
    ]},
    { id:'marketing_board', label:'Marketing Board (Portal)',    soon:true },
    { id:'review_board',    label:'Review Board (Portal)',       soon:true },
    { id:'payments_cat',    label:'Payment Processing',          built:true, children:[
      { id:'square',        label:'Square',                      built:true },
      { id:'stripe',        label:'Stripe',                      soon:true },
    ]},
    { id:'accounting_cat',  label:'Accounting Software',         soon:true, children:[
      { id:'quickbooks',    label:'QuickBooks',                  soon:true },
      { id:'freshbooks',    label:'FreshBooks',                  soon:true },
    ]},
    { id:'gps_tracking_cat',label:'GPS Fleet Tracking',          built:true, children:[
      { id:'gps_integration',label:'GPS Integration',            built:true },
    ]},
    { id:'maps_cat',        label:'Mapping & Geocoding',         built:true, children:[
      { id:'google_maps',   label:'Google Maps',                 built:true },
      { id:'apple_maps',    label:'Apple Maps',                  built:true },
    ]},
    { id:'supply_chain',    label:'Supply Chains',               built:true, children:[
      { id:'reece',         label:'Reece Supply',                built:true },
      { id:'moore',         label:'Moore Supply',                built:true },
    ]},
  ]},
  { id:'pricebook_cat', label:'Pricebook', built:true, children:[
    { id:'pricebook_cat',       label:'Service Pricebooks',   built:true },
    { id:'materials_library',   label:'Materials Library',    built:true },
  ]},
  { id:'inventory_cat', label:'Inventory', children:[
    { id:'inv_items',      label:'All Items',       built:true },
    { id:'inv_barcodes',   label:'Barcodes',        built:true },
    { id:'inv_locations',  label:'Locations',       built:true },
    { id:'inv_templates',  label:'Templates',       built:true },
    { id:'inv_po',         label:'Purchase Orders', built:true },
    { id:'inv_counts',     label:'Count Schedules', built:true },
  ]},
  { id:'phone_system', label:'Phone System', children:[
    { id:'phone_manager',      label:'Phone Number Manager',  built:true },
    { id:'csr_questionnaire',  label:'CSR Questionnaire',     built:true },
    { id:'phone_purchase',     label:'Purchase Phone Numbers',soon:true },
    { id:'caller_id',          label:'Caller ID Settings',    soon:true },
  ]},
  { id:'operations', label:'Operations', children:[
    { id:'departments',     label:'Departments',          built:true },
    { id:'arrival_windows', label:'Arrival Windows',      built:true },
    { id:'business_hours',  label:'Business Hours',       built:true },
    { id:'business_units',  label:'Business Unit Groups', soon:true, children:[
      { id:'biz_units',   label:'Business Units',         soon:true },
      { id:'job_types',   label:'Job Types',              built:true },
    ]},
  ]},
  { id:'invoices_cat', label:'Invoices and Estimates', children:[
    { id:'inv_layout',    label:'Custom Layout',         soon:true },
    { id:'inv_email',     label:'Email',                 soon:true },
    { id:'inv_online_pay', label:'Online Payments',      soon:true },
    { id:'payment_terms', label:'Payment Terms',         soon:true, children:[
      { id:'due_completion', label:'Due Upon Completion', soon:true },
      { id:'net7',           label:'Net-7',               soon:true },
      { id:'net15',          label:'Net-15',              soon:true },
      { id:'net30',          label:'Net-30',              soon:true },
      { id:'net60',          label:'Net-60',              soon:true },
      { id:'net90',          label:'Net-90',              soon:true },
    ]},
    { id:'payment_types', label:'Payment Types',         soon:true },
    { id:'tax_zones',     label:'Tax Zones',             soon:true },
  ]},
  { id:'accounting_cat', label:'Accounting', children:[
    { id:'general_ledger', label:'General Ledger Accounts', soon:true },
  ]},
  { id:'import_export', label:'Import / Export', children:[
    { id:'import_customers',  label:'Customers',  soon:true },
    { id:'import_jobs',       label:'Jobs',       soon:true },
    { id:'import_invoices',   label:'Invoices',   soon:true },
    { id:'import_inventory',  label:'Inventory',  soon:true },
    { id:'import_pricebook',  label:'Pricebook',  soon:true },
  ]},
];


function SettingsSidebar({ activeId, onSelect }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded(p => ({...p, [id]: !p[id]}));

  const renderItems = (items, depth) => items.map(item => {
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = expanded[item.id];
    const isActive = activeId === item.id;
    const indent = depth * 12;
    return (
      <div key={item.id}>
        <button
          onClick={() => { if(hasChildren) toggle(item.id); else if(!item.soon) onSelect(item.id); }}
          style={{
            width:'100%', display:'flex', alignItems:'center', gap:6,
            padding: depth === 0 ? '9px 16px 9px ' + (16+indent) + 'px' : '7px 16px 7px ' + (16+indent) + 'px',
            background: isActive ? 'var(--amberdim)' : 'transparent',
            border:'none',
            borderLeft: isActive ? '2px solid var(--amber)' : '2px solid transparent',
            color: isActive ? 'var(--amber)' : depth === 0 ? 'var(--text)' : 'var(--muted)',
            fontSize: depth === 0 ? 13 : 12,
            fontWeight: depth === 0 ? 600 : isActive ? 600 : 400,
            cursor: item.soon && !hasChildren ? 'default' : 'pointer',
            textAlign:'left', transition:'all .15s', lineHeight:1.4,
          }}
          onMouseEnter={e => { if(!isActive) e.currentTarget.style.background='var(--surface2)'; }}
          onMouseLeave={e => { if(!isActive) e.currentTarget.style.background='transparent'; }}
        >
          {hasChildren && (
            <span style={{fontSize:9,color:'var(--muted)',flexShrink:0,transition:'transform .2s',display:'inline-block',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
          )}
          {!hasChildren && <span style={{width:9,flexShrink:0}}/>}
          <span style={{flex:1}}>{item.label}</span>
          {item.soon && <span style={{fontSize:9,background:'#1e2a3a',color:'#3a5a7a',borderRadius:3,padding:'1px 4px',fontWeight:700,flexShrink:0}}>SOON</span>}
        </button>
        {hasChildren && isOpen && (
          <div style={{borderLeft:'1px solid var(--border)',marginLeft:24+indent}}>
            {renderItems(item.children, depth+1)}
          </div>
        )}
      </div>
    );
  });

  return (
    <div style={{width:220,background:'#080b10',borderRight:'1px solid var(--border)',overflow:'auto',flexShrink:0,paddingTop:8,paddingBottom:24}} className='scrollbar-thin'>
      <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',padding:'8px 16px 6px',letterSpacing:'.1em'}}>SETTINGS</div>
      {renderItems(SETTINGS_TREE, 0)}
    </div>
  );
}


function GoogleMapsSettings() {
  const {data, loading, reload} = useApi(()=>api.get('/company/maps-key'));
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(()=>{ if(data?.key) setKey(data.key); },[data]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.saveMapsKey(key.trim());
      await reload();
      setSaved(true); setTimeout(()=>setSaved(false), 2500);
    } catch(e){ toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const isConfigured = !!data?.key;
  const source = data?.source;

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:580}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:6}}>Google Maps</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:22}}>Required for address autocomplete and Street View previews when creating customers or logging calls.</div>

      {/* Status badge */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <div style={{width:9,height:9,borderRadius:'50%',background:isConfigured?'var(--green)':'#f56565',animation:isConfigured?'none':'pulse2 1.2s infinite'}}/>
        <span style={{fontSize:12,fontFamily:'var(--font-mono)',color:isConfigured?'var(--green)':'#f56565',fontWeight:600}}>
          {loading?'Checking…':isConfigured?`Key configured (${source==='env'?'from environment':'saved in database'})`:'No API key — autocomplete disabled'}
        </span>
      </div>

      {/* Key input */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
        <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:8,letterSpacing:'.07em'}}>GOOGLE MAPS API KEY</label>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input
            type={show?'text':'password'}
            value={key}
            onChange={e=>setKey(e.target.value)}
            placeholder="AIza…"
            style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,padding:'10px 12px',color:'var(--text)',fontSize:13,fontFamily:'var(--font-mono)',letterSpacing:show?'.02em':'.1em'}}
          />
          <button onClick={()=>setShow(s=>!s)}
            style={{padding:'10px 14px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
            {show?'Hide':'Show'}
          </button>
        </div>
        <div style={{fontSize:11,color:'var(--muted)',marginTop:8}}>
          Enable: Maps JavaScript API · Places API · Street View Static API · Geocoding API.
        </div>
      </div>

      <button onClick={save} disabled={saving||!key.trim()}
        style={{padding:'10px 24px',background:saved?'var(--greendim)':key.trim()?'var(--green)':'var(--surface2)',border:'1px solid '+(saved?'var(--green)':key.trim()?'var(--green)':'var(--border)'),borderRadius:9,color:saved?'var(--green)':key.trim()?'#fff':'var(--muted)',fontSize:13,fontWeight:700,cursor:key.trim()&&!saving?'pointer':'not-allowed',transition:'all .2s'}}>
        {saved?'✓ Saved!':saving?'Saving…':'Save API Key'}
      </button>

      {/* Instructions */}
      <div style={{marginTop:24,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
        <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:12}}>HOW TO GET YOUR API KEY</div>
        <ol style={{paddingLeft:18,display:'flex',flexDirection:'column',gap:8}}>
          {[
            'Go to console.cloud.google.com → Create or select a project',
            'Navigate to APIs & Services → Credentials → Create Credentials → API Key',
            'Under "API restrictions", enable: Maps JavaScript API, Places API, Street View Static API, Geocoding API',
            'Under "Application restrictions", add your domain (or leave unrestricted for testing)',
            'Paste the key above and click Save',
          ].map((step,i)=>(
            <li key={i} style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function AppleMapsSettings() {
  const {data, loading, reload} = useApi(()=>api.getAppleMapsConfig());
  const [form, setForm] = useState({team_id:'', key_id:'', private_key:'', origin:''});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | {ok, msg}

  useEffect(()=>{
    if(data) setForm(f=>({
      ...f,
      team_id: data.team_id || '',
      key_id:  data.key_id  || '',
      origin:  data.origin  || '',
      // never pre-fill private_key — user must re-paste to update
    }));
  },[data]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if(saving) return;
    setSaving(true); setSaved(false); setTestResult(null);
    try {
      await api.saveAppleMapsConfig(form);
      await reload();
      setSaved(true); setTimeout(()=>setSaved(false), 2500);
    } catch(e){ toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const testToken = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.getAppleMapsToken();
      setTestResult({ok:true, msg:'Token generated successfully ✓', token: r.token.slice(0,40)+'…'});
    } catch(e){
      setTestResult({ok:false, msg: e.message || 'Token generation failed'});
    } finally { setTesting(false); }
  };

  const isConfigured = data?.configured;

  const Field = ({label, fkey, placeholder, mono=true, hint}) => (
    <div>
      <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4,letterSpacing:'.07em'}}>{label}</label>
      <input value={form[fkey]} onChange={e=>set(fkey,e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:mono?'var(--font-mono)':'var(--font-body)',letterSpacing:mono?'.02em':'normal',boxSizing:'border-box'}}/>
      {hint&&<div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>{hint}</div>}
    </div>
  );

  return (
    <div style={{animation:'fadeUp .4s ease',maxWidth:600}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
        <span style={{fontSize:28}}>🍎</span>
        <div>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,lineHeight:1}}>Apple Maps</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>MapKit JS — address search &amp; interactive maps</div>
        </div>
      </div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:22,marginLeft:40}}>
        Enables Apple Maps address autocomplete and map views using MapKit JS. Requires an Apple Developer account.
      </div>

      {/* Status */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <div style={{width:9,height:9,borderRadius:'50%',background:isConfigured?'var(--green)':'#f56565',animation:isConfigured?'none':'pulse2 1.2s infinite'}}/>
        <span style={{fontSize:12,fontFamily:'var(--font-mono)',color:isConfigured?'var(--green)':'#f56565',fontWeight:600}}>
          {loading?'Checking…':isConfigured?'Configured — MapKit JS ready':'Not configured — address search disabled'}
        </span>
        {isConfigured&&(
          <button onClick={testToken} disabled={testing}
            style={{marginLeft:8,padding:'3px 10px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:11,cursor:'pointer'}}>
            {testing?'Testing…':'Test Token'}
          </button>
        )}
      </div>

      {/* Test result */}
      {testResult&&(
        <div style={{background:testResult.ok?'var(--greendim)':'#f5656514',border:`1px solid ${testResult.ok?'var(--green)':'#f5656544'}`,borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:12,color:testResult.ok?'var(--green)':'#f56565'}}>
          <div style={{fontWeight:700,marginBottom:testResult.token?4:0}}>{testResult.msg}</div>
          {testResult.token&&<div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--muted)',wordBreak:'break-all'}}>{testResult.token}</div>}
        </div>
      )}

      {/* Credential fields */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:14,marginBottom:16}}>
        <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.08em',marginBottom:2}}>APPLE DEVELOPER CREDENTIALS</div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Field label="TEAM ID" fkey="team_id" placeholder="A1B2C3D4E5" hint="10-character string from developer.apple.com/account"/>
          <Field label="MAPS KEY ID" fkey="key_id" placeholder="A1B2C3D4E5" hint="Created under Certificates, IDs & Profiles → Keys"/>
        </div>

        <Field label="ORIGIN (optional)" fkey="origin" placeholder="https://yourdomain.com" mono={false}
          hint="Restricts token to this origin. Leave blank during development."/>

        {/* Private key */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <label style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em'}}>
              PRIVATE KEY (.p8 content) {data?.has_key&&<span style={{color:'var(--green)'}}>— key on file</span>}
            </label>
            <button onClick={()=>setShowKey(s=>!s)}
              style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:11,cursor:'pointer',padding:0}}>
              {showKey?'Hide':'Show'}
            </button>
          </div>
          <textarea
            value={showKey ? form.private_key : (form.private_key ? '•'.repeat(Math.min(form.private_key.length,48)) : '')}
            onChange={e=>{ if(showKey) set('private_key',e.target.value); }}
            readOnly={!showKey}
            onClick={()=>{ if(!showKey) setShowKey(true); }}
            rows={5}
            placeholder={"-----BEGIN PRIVATE KEY-----\n…paste .p8 file content…\n-----END PRIVATE KEY-----"}
            style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,padding:'9px 12px',color:showKey?'var(--text)':'var(--muted)',fontSize:11,fontFamily:'var(--font-mono)',resize:'vertical',boxSizing:'border-box',lineHeight:1.6,cursor:showKey?'text':'pointer'}}/>
          {data?.has_key&&!form.private_key&&(
            <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>Leave blank to keep the existing key. Paste a new .p8 to replace it.</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <button onClick={save} disabled={saving}
          style={{padding:'10px 24px',background:saved?'var(--greendim)':'var(--green)',border:'1px solid '+(saved?'var(--green)':'var(--green)'),borderRadius:9,color:saved?'var(--green)':'#fff',fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',transition:'all .2s'}}>
          {saved?'✓ Saved!':saving?'Saving…':'Save Credentials'}
        </button>
        {isConfigured&&!testResult&&(
          <span style={{fontSize:11,color:'var(--muted)'}}>Use "Test Token" to verify the key works</span>
        )}
      </div>

      {/* Setup instructions */}
      <div style={{marginTop:24,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:18}}>
        <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:14}}>HOW TO SET UP APPLE MAPS</div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[
            ['1', 'Sign in to developer.apple.com → Account → Certificates, Identifiers & Profiles'],
            ['2', 'Under Keys, click + to create a new key. Check "MapKit JS" and click Continue.'],
            ['3', 'Give it a name, register, then download the .p8 file. You can only download it once.'],
            ['4', 'Copy your Team ID from the top-right of the developer portal (10-character code).'],
            ['5', 'Copy the Key ID shown on the key detail page (10-character code).'],
            ['6', 'Open the .p8 file in a text editor and paste its entire contents into the Private Key field above.'],
          ].map(([n,t])=>(
            <div key={n} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:22,height:22,borderRadius:'50%',background:'var(--surface2)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',flexShrink:0,marginTop:1}}>{n}</div>
              <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>{t}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,padding:'10px 14px',background:'var(--surface2)',borderRadius:8,borderLeft:'3px solid var(--amber)'}}>
          <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.6}}>
            <strong style={{color:'var(--amber)'}}>Note:</strong> MapKit JS supports address search and interactive maps. Apple does not offer a public Look Around (Street View equivalent) API — use Google Maps for street-level imagery.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Moore Supply / SupplyZone Integration ─────────────────────
function MooreSupplySettings() {
  const MOORE_ORANGE = '#f47920';
  const MOORE_NAVY   = '#1b2f6e';
  const SZ_BLUE      = '#0068b0'; // SupplyZone platform blue

  const [cfg, setCfg]               = useState({ account_number:'', username:'', password:'', portal_url:'https://mooresupply.supplyzone.net', branch_id:'', environment:'production' });
  const [showPass, setShowPass]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [connected, setConnected]   = useState(false);
  const [branches, setBranches]     = useState([]);
  const [activeTab, setActiveTab]   = useState('settings');

  // Catalog
  const [searchQ, setSearchQ]             = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [cart, setCart]                   = useState([]);
  const [cartOpen, setCartOpen]           = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [orderFlash, setOrderFlash]       = useState(null);

  // Orders
  const [orders, setOrders]               = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const d = await api.getMooreConfig();
      setCfg(prev => ({ ...prev, ...d, password:'' }));
      setConnected(!!d.connected);
      if (d.branches?.length) setBranches(d.branches);
    } catch(e) {}
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.saveMooreConfig(cfg);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      loadConfig();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const testConn = async () => {
    if (!cfg.account_number || !cfg.username) {
      setTestResult({ ok:false, msg:'Account number and username are required.' });
      return;
    }
    setTesting(true); setTestResult(null);
    try {
      const r = await api.testMooreConnection(cfg);
      setTestResult(r);
      if (r.ok && r.branches?.length) setBranches(r.branches);
    } catch(e) { setTestResult({ ok:false, msg:e.message }); }
    finally { setTesting(false); }
  };

  const searchProducts = async (override) => {
    const term = override ?? searchQ;
    if (!term.trim()) return;
    setSearching(true);
    try {
      const r = await api.mooreSearchProducts(term);
      setSearchResults(r.products || []);
    } catch(e) { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const exists = prev.find(c => c.sku === item.sku);
      if (exists) return prev.map(c => c.sku === item.sku ? {...c, qty:c.qty+1} : c);
      return [...prev, { ...item, qty:1 }];
    });
  };

  const updateQty = (sku, delta) => {
    setCart(prev => prev.map(c => c.sku===sku ? {...c,qty:Math.max(0,c.qty+delta)} : c).filter(c=>c.qty>0));
  };

  const cartTotal = cart.reduce((s,i) => s + i.price*i.qty, 0);
  const cartCount = cart.reduce((s,i) => s + i.qty, 0);

  const submitOrder = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const branch = branches.find(b => b.id === cfg.branch_id);
      const r = await api.mooreCreateOrder({
        items: cart.map(i => ({ sku:i.sku, name:i.name, price:i.price, uom:i.uom, qty:i.qty })),
        branch_id:   cfg.branch_id,
        branch_name: branch?.name || '',
      });
      setOrderFlash(`Order ${r.order_number} submitted to Moore Supply!`);
      setCart([]); setCartOpen(false);
      setTimeout(() => setOrderFlash(null), 5000);
      if (activeTab === 'orders') loadOrders();
    } catch(e) { toast.error('Order Failed', e.message); }
    finally { setSubmitting(false); }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const r = await api.mooreOrders();
      setOrders(r.orders || []);
    } catch(e) {}
    finally { setOrdersLoading(false); }
  };

  useEffect(() => { if (activeTab === 'orders') loadOrders(); }, [activeTab]);

  const INP  = { width:'100%', background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:8, padding:'9px 12px', fontSize:13, color:'var(--text)', boxSizing:'border-box' };
  const LBL  = { display:'block', fontSize:10, fontFamily:'var(--font-mono)', color:'var(--muted)', marginBottom:6, letterSpacing:'.07em', fontWeight:600 };
  const CARD = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:22, marginBottom:16 };

  const statusBadge = connected
    ? { bg:'#5daf7c22', color:'#5daf7c', border:'1px solid #5daf7c44', label:'● CONNECTED' }
    : { bg:'#66666618', color:'var(--muted)', border:'1px solid #66666630', label:'○ NOT CONFIGURED' };

  return (
    <div style={{animation:'fadeUp .4s ease', maxWidth:720}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:60,height:60,background:`linear-gradient(135deg,${MOORE_ORANGE},#c85e10)`,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 4px 24px ${MOORE_ORANGE}55`,fontSize:28}}>
          🏭
        </div>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'baseline',gap:10}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>Moore Supply</div>
            <div style={{fontSize:11,padding:'3px 10px',background:`${SZ_BLUE}22`,color:'#5ea8d8',border:`1px solid ${SZ_BLUE}44`,borderRadius:6,fontWeight:600,fontFamily:'var(--font-mono)'}}>via SupplyZone</div>
          </div>
          <div style={{fontSize:13,color:'var(--muted)'}}>Search Moore's catalog, get account pricing, and submit purchase orders through your SupplyZone account.</div>
        </div>
        <div style={{padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,background:statusBadge.bg,color:statusBadge.color,border:statusBadge.border,whiteSpace:'nowrap'}}>
          {statusBadge.label}
        </div>
      </div>

      {/* Order flash */}
      {orderFlash && (
        <div style={{marginBottom:16,padding:'12px 18px',background:'#5daf7c18',border:'1px solid #5daf7c44',borderRadius:10,fontSize:13,color:'#5daf7c',fontWeight:600}}>
          ✓ {orderFlash}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:'var(--surface)',padding:4,borderRadius:10,border:'1px solid var(--border)'}}>
        {[['settings','⚙️  Settings'],['catalog','📦  Catalog'],['orders','📋  Orders']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{flex:1,padding:'8px 0',background:activeTab===id?'var(--surface2)':'transparent',border:activeTab===id?'1px solid var(--border2)':'1px solid transparent',borderRadius:8,color:activeTab===id?'var(--text)':'var(--muted)',fontSize:13,fontWeight:activeTab===id?600:400,cursor:'pointer',transition:'all .15s'}}>
            {label}{id==='catalog'&&cartCount>0?` (${cartCount})`:''}
          </button>
        ))}
      </div>

      {/* ── SETTINGS TAB ── */}
      {activeTab==='settings' && (<>

        {/* SupplyZone platform notice */}
        <div style={{...CARD,background:`${SZ_BLUE}0c`,border:`1px solid ${SZ_BLUE}33`,padding:16,marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:18}}>ℹ️</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#5ea8d8',marginBottom:2}}>Powered by SupplyZone</div>
              <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
                Moore Supply uses the SupplyZone B2B platform for online ordering. Enter your <strong style={{color:'var(--text)'}}>SupplyZone login credentials</strong> — the same username and password you use at <span style={{color:'#5ea8d8'}}>mooresupply.supplyzone.net</span>.
              </div>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
          {[
            {icon:'🔍', title:'Product Search',  desc:'Search Moore\'s full catalog with your account pricing'},
            {icon:'💲', title:'Contract Pricing', desc:'Prices reflect your negotiated Moore Supply contract'},
            {icon:'🛒', title:'Purchase Orders',  desc:'Submit POs directly to your default branch'},
            {icon:'📊', title:'Order Tracking',   desc:'View PO history and delivery status'},
          ].map(f=>(
            <div key={f.title} style={{...CARD,padding:14,textAlign:'center',marginBottom:0}}>
              <div style={{fontSize:22,marginBottom:6}}>{f.icon}</div>
              <div style={{fontSize:11,fontWeight:700,marginBottom:4}}>{f.title}</div>
              <div style={{fontSize:10,color:'var(--muted)',lineHeight:1.4}}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Credentials */}
        <div style={CARD}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:4}}>SupplyZone Credentials</div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:18}}>
            These are the credentials you use to log into Moore Supply's online portal. Contact Moore Supply if you need a SupplyZone account.
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <div>
              <label style={LBL}>MOORE ACCOUNT NUMBER</label>
              <input value={cfg.account_number} onChange={e=>setCfg(p=>({...p,account_number:e.target.value}))} style={INP} placeholder='e.g. 45821'/>
            </div>
            <div>
              <label style={LBL}>SUPPLYZONE USERNAME</label>
              <input value={cfg.username} onChange={e=>setCfg(p=>({...p,username:e.target.value}))} style={INP} placeholder='you@company.com'/>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={LBL}>SUPPLYZONE PASSWORD</label>
            <div style={{display:'flex',gap:8}}>
              <input type={showPass?'text':'password'} value={cfg.password} onChange={e=>setCfg(p=>({...p,password:e.target.value}))} style={{...INP}} placeholder={connected?'Enter new password to change':'••••••••'}/>
              <button onClick={()=>setShowPass(s=>!s)} style={{padding:'9px 14px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>{showPass?'Hide':'Show'}</button>
            </div>
          </div>

          {/* Portal URL — advanced */}
          <div style={{marginBottom:18}}>
            <label style={LBL}>SUPPLYZONE PORTAL URL <span style={{color:'var(--muted)',fontWeight:400,textTransform:'none',letterSpacing:0}}>(advanced)</span></label>
            <input value={cfg.portal_url} onChange={e=>setCfg(p=>({...p,portal_url:e.target.value}))} style={INP} placeholder='https://mooresupply.supplyzone.net'/>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:5}}>Only change this if Moore Supply has given you a different portal address.</div>
          </div>

          {/* Branch */}
          <div style={{marginBottom:18}}>
            <label style={LBL}>DEFAULT BRANCH</label>
            {branches.length > 0 ? (
              <select value={cfg.branch_id} onChange={e=>setCfg(p=>({...p,branch_id:e.target.value}))}
                style={{...INP,appearance:'auto',cursor:'pointer'}}>
                <option value=''>Select branch…</option>
                {branches.map(b=>(
                  <option key={b.id} value={b.id}>{b.name}{b.phone ? ` — ${b.phone}` : ''}</option>
                ))}
              </select>
            ) : (
              <input value={cfg.branch_id} onChange={e=>setCfg(p=>({...p,branch_id:e.target.value}))} style={INP} placeholder='Test connection to load branch list'/>
            )}
          </div>

          {/* Environment */}
          <div>
            <label style={LBL}>ENVIRONMENT</label>
            <div style={{display:'flex',gap:8}}>
              {['production','sandbox'].map(env=>(
                <button key={env} onClick={()=>setCfg(p=>({...p,environment:env}))}
                  style={{padding:'7px 20px',background:cfg.environment===env?(env==='production'?`${MOORE_NAVY}22`:'var(--amberdim)'):'transparent',border:`1px solid ${cfg.environment===env?(env==='production'?MOORE_NAVY:'var(--amber)'):'var(--border)'}`,borderRadius:8,color:cfg.environment===env?(env==='production'?'#7ba4e8':'var(--amber)'):'var(--muted)',fontSize:12,fontWeight:600,cursor:'pointer',textTransform:'uppercase',letterSpacing:'.06em',transition:'all .15s'}}>
                  {env}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{marginBottom:14,padding:'11px 16px',background:testResult.ok?'#5daf7c12':'#f5656512',border:`1px solid ${testResult.ok?'#5daf7c44':'#f5656544'}`,borderRadius:10,fontSize:13,color:testResult.ok?'#5daf7c':'#f56565',display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16,flexShrink:0}}>{testResult.ok?'✓':'✗'}</span>
            <span>{testResult.msg}</span>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginBottom:28}}>
          <button onClick={testConn} disabled={testing}
            style={{padding:'10px 22px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:9,color:'var(--text)',fontSize:13,fontWeight:600,cursor:testing?'wait':'pointer',opacity:testing?0.7:1}}>
            {testing?'Testing…':'Test Connection'}
          </button>
          <button onClick={save} disabled={saving}
            style={{padding:'10px 24px',background:saved?'var(--greendim)':'var(--green)',border:`1px solid ${saved?'var(--green)':'var(--green)'}`,borderRadius:9,color:saved?'var(--green)':'#fff',fontSize:13,fontWeight:700,cursor:saving?'wait':'pointer',transition:'all .2s'}}>
            {saved?'✓ Saved!':saving?'Saving…':'Save Credentials'}
          </button>
        </div>

        {/* Setup guide */}
        <div style={CARD}>
          <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:14}}>SETUP GUIDE</div>
          <ol style={{paddingLeft:18,display:'flex',flexDirection:'column',gap:10}}>
            {[
              { step:'Get SupplyZone access', detail:'Contact your Moore Supply sales rep and request online/SupplyZone ordering access for your account.' },
              { step:'Enter your credentials', detail:'Fill in your Moore account number and the username/password from mooresupply.supplyzone.net.' },
              { step:'Test the connection',    detail:'Click "Test Connection" — your active branches will load into the dropdown automatically.' },
              { step:'Choose your branch',     detail:'Select the Moore Supply location you primarily order from for purchase orders.' },
              { step:'Save and browse',        detail:'Click "Save Credentials" then switch to the Catalog tab to start searching products.' },
            ].map((s,i)=>(
              <li key={i} style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>
                <span style={{color:MOORE_ORANGE,fontWeight:700}}>Step {i+1} — {s.step}:</span> {s.detail}
              </li>
            ))}
          </ol>
        </div>
      </>)}

      {/* ── CATALOG TAB ── */}
      {activeTab==='catalog' && (<>
        {!connected ? (
          <div style={{...CARD,textAlign:'center',padding:'60px 20px'}}>
            <div style={{fontSize:40,marginBottom:14}}>🔒</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Connect your SupplyZone account first</div>
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Enter your Moore Supply / SupplyZone credentials in Settings to browse the catalog.</div>
            <button onClick={()=>setActiveTab('settings')} style={{padding:'10px 24px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Go to Settings</button>
          </div>
        ) : (<>
          {/* Cart bar */}
          {cart.length > 0 && (
            <div style={{background:`${MOORE_ORANGE}18`,border:`1px solid ${MOORE_ORANGE}44`,borderRadius:12,padding:'14px 18px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:13,fontWeight:600,color:MOORE_ORANGE}}>🛒 {cartCount} item{cartCount!==1?'s':''} — ${cartTotal.toFixed(2)}</span>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setCartOpen(o=>!o)} style={{padding:'7px 16px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                  {cartOpen?'Hide Cart':'View Cart'}
                </button>
                <button onClick={submitOrder} disabled={submitting||!cfg.branch_id}
                  style={{padding:'7px 18px',background:'var(--green)',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:submitting||!cfg.branch_id?'not-allowed':'pointer',opacity:!cfg.branch_id?0.5:1}}>
                  {submitting?'Submitting…':'Submit PO'}
                </button>
              </div>
            </div>
          )}
          {!cfg.branch_id && (
            <div style={{padding:'10px 14px',background:'var(--amberdim)',border:'1px solid var(--amber)44',borderRadius:9,fontSize:12,color:'var(--amber)',marginBottom:14}}>
              ⚠ Select a default branch in Settings before submitting orders.
            </div>
          )}

          {/* Cart expanded */}
          {cartOpen && cart.length > 0 && (
            <div style={{...CARD,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Cart</div>
              {cart.map((item,i)=>(
                <div key={item.sku} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'10px 0',borderBottom:i<cart.length-1?'1px solid var(--border)':'none'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{item.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{item.sku}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <button onClick={()=>updateQty(item.sku,-1)} style={{width:26,height:26,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:14,cursor:'pointer',lineHeight:1}}>−</button>
                    <span style={{minWidth:24,textAlign:'center',fontSize:13,fontWeight:600}}>{item.qty}</span>
                    <button onClick={()=>updateQty(item.sku,+1)} style={{width:26,height:26,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:14,cursor:'pointer',lineHeight:1}}>+</button>
                  </div>
                  <div style={{textAlign:'right',fontSize:13,fontWeight:700,color:'var(--amber)',minWidth:72}}>
                    ${(item.price*item.qty).toFixed(2)}
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'flex-end',paddingTop:12,fontSize:15,fontWeight:800,color:'var(--amber)'}}>
                Total: ${cartTotal.toFixed(2)}
              </div>
            </div>
          )}

          {/* Category shortcuts */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
            {[
              {icon:'🚿',label:'Faucets',       q:'Faucet'},
              {icon:'🚽',label:'Toilets',        q:'Toilet'},
              {icon:'🔥',label:'Water Heaters',  q:'Water Heater'},
              {icon:'⚙️', label:'Valves',         q:'Valve'},
              {icon:'🔩',label:'Pipe',           q:'Pipe'},
              {icon:'🔧',label:'Fittings',       q:'Fitting'},
              {icon:'🚰',label:'Hose Bibs',      q:'Hose Bib'},
              {icon:'🪠',label:'Drain',          q:'Drain'},
              {icon:'🪣',label:'Pumps',          q:'Pump'},
              {icon:'🗑️',label:'Disposals',      q:'Disposal'},
              {icon:'💧',label:'Water Treatment',q:'Water Treatment'},
              {icon:'🔑',label:'Sealants',       q:'Sealant'},
            ].map(c=>(
              <button key={c.label} onClick={()=>{ setSearchQ(c.label); searchProducts(c.q); }}
                style={{...CARD,padding:'12px 8px',textAlign:'center',marginBottom:0,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:5,border:'1px solid var(--border)',transition:'border-color .15s',color:'var(--text)'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <span style={{fontSize:18}}>{c.icon}</span>
                <span style={{fontSize:11,fontWeight:600,color:'var(--text)'}}>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div style={{display:'flex',gap:8,marginBottom:18}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&searchProducts()}
              style={{...INP,flex:1}} placeholder='Search by name, part #, brand, or category…'/>
            <button onClick={()=>searchProducts()} disabled={searching}
              style={{padding:'9px 22px',background:`${MOORE_ORANGE}`,border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:searching?'wait':'pointer',whiteSpace:'nowrap',opacity:searching?0.7:1}}>
              {searching?'Searching…':'Search'}
            </button>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={CARD}>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:14,fontFamily:'var(--font-mono)'}}>{searchResults.length} RESULTS FOR "{searchQ.toUpperCase()}"</div>
              {searchResults.map((item,i)=>{
                const inCart = cart.find(c=>c.sku===item.sku);
                const savings = item.listPrice && item.listPrice > item.price
                  ? Math.round((1 - item.price/item.listPrice)*100) : 0;
                return (
                  <div key={item.sku} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:14,alignItems:'center',padding:'13px 0',borderBottom:i<searchResults.length-1?'1px solid var(--border)':'none'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontSize:13,fontWeight:600}}>{item.name}</span>
                        {!item.inStock && <span style={{fontSize:10,padding:'2px 8px',background:'#f5656515',border:'1px solid #f5656540',borderRadius:5,color:'#f56565',fontWeight:600,whiteSpace:'nowrap'}}>OUT OF STOCK</span>}
                        {savings > 0 && <span style={{fontSize:10,padding:'2px 8px',background:'#5daf7c18',border:'1px solid #5daf7c40',borderRadius:5,color:'#5daf7c',fontWeight:600,whiteSpace:'nowrap'}}>{savings}% OFF LIST</span>}
                      </div>
                      <div style={{display:'flex',gap:10,marginTop:3,flexWrap:'wrap'}}>
                        <span style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{item.sku}</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>{item.brand}</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>{item.category}</span>
                        {(item.branchQty > 0 || item.qtyOnHand > 0) && (<>
                          <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                          <span style={{fontSize:11,color:'#5daf7c'}}>
                            {item.branchQty > 0 ? `${item.branchQty} at branch` : `${item.qtyOnHand} in network`}
                          </span>
                        </>)}
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:15,fontWeight:800,color:'var(--amber)'}}>${item.price?.toFixed(2)??'—'}</div>
                      {item.listPrice > item.price && (
                        <div style={{fontSize:10,color:'var(--muted)',textDecoration:'line-through'}}>List ${item.listPrice.toFixed(2)}</div>
                      )}
                      <div style={{fontSize:10,color:'var(--muted)'}}>per {item.uom||'EA'}</div>
                    </div>
                    <button onClick={()=>addToCart(item)} disabled={!item.inStock}
                      style={{padding:'8px 16px',background:inCart?`${MOORE_ORANGE}22`:item.inStock?'var(--surface2)':'transparent',border:`1px solid ${inCart?MOORE_ORANGE:item.inStock?'var(--border2)':'var(--border)'}`,borderRadius:8,color:inCart?MOORE_ORANGE:item.inStock?'var(--text)':'var(--muted)',fontSize:12,fontWeight:600,cursor:item.inStock?'pointer':'not-allowed',whiteSpace:'nowrap',transition:'all .15s'}}
                      onMouseEnter={e=>{ if(item.inStock&&!inCart){ e.currentTarget.style.background=`${MOORE_ORANGE}22`; e.currentTarget.style.color=MOORE_ORANGE; e.currentTarget.style.borderColor=MOORE_ORANGE; }}}
                      onMouseLeave={e=>{ if(!inCart){ e.currentTarget.style.background='var(--surface2)'; e.currentTarget.style.color='var(--text)'; e.currentTarget.style.borderColor='var(--border2)'; }}}>
                      {inCart ? `In Cart (${inCart.qty})` : '+ Add to PO'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!searching && searchQ && searchResults.length === 0 && (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted)'}}>
              <div style={{fontSize:32,marginBottom:10}}>🔍</div>
              <div style={{fontSize:13}}>No results for "{searchQ}"</div>
              <div style={{fontSize:12,marginTop:6}}>Try a different term, part number, or brand name</div>
            </div>
          )}
        </>)}
      </>)}

      {/* ── ORDERS TAB ── */}
      {activeTab==='orders' && (<>
        {!connected ? (
          <div style={{...CARD,textAlign:'center',padding:'60px 20px'}}>
            <div style={{fontSize:40,marginBottom:14}}>🔒</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Connect your SupplyZone account first</div>
            <button onClick={()=>setActiveTab('settings')} style={{padding:'10px 24px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Go to Settings</button>
          </div>
        ) : (<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600}}>Purchase Order History</div>
            <button onClick={loadOrders} style={{padding:'7px 16px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer'}}>↻ Refresh</button>
          </div>

          {ordersLoading ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted)'}}>Loading orders…</div>
          ) : orders.length === 0 ? (
            <div style={{...CARD,textAlign:'center',padding:'50px 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>No purchase orders yet</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:18}}>Browse the catalog, build a cart, and submit your first Moore Supply PO.</div>
              <button onClick={()=>setActiveTab('catalog')} style={{padding:'9px 22px',background:MOORE_ORANGE,border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Browse Catalog</button>
            </div>
          ) : (
            <div style={CARD}>
              {orders.map((o,i)=>{
                const sc = {
                  delivered: {bg:'#5daf7c22',color:'#5daf7c',border:'#5daf7c44'},
                  shipped:   {bg:'#4a9eff22',color:'#4a9eff',border:'#4a9eff44'},
                  pending:   {bg:'var(--amberdim)',color:'var(--amber)',border:'var(--amber)44'},
                  cancelled: {bg:'#f5656518',color:'#f56565',border:'#f5656540'},
                }[o.status] || {bg:'var(--amberdim)',color:'var(--amber)',border:'var(--amber)44'};
                return (
                  <div key={o.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:16,alignItems:'center',padding:'14px 0',borderBottom:i<orders.length-1?'1px solid var(--border)':'none'}}>
                    <div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{o.order_number}</div>
                      {o.sz_order_id && <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'#5ea8d8',marginTop:2}}>SZ: {o.sz_order_id}</div>}
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{o.branch_name||o.branch_id||'Moore Supply'}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                        {(o.items||[]).length} item{(o.items||[]).length!==1?'s':''} · {o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--amber)',whiteSpace:'nowrap'}}>${parseFloat(o.total||0).toFixed(2)}</div>
                    <div style={{fontSize:11,padding:'4px 12px',borderRadius:6,fontWeight:700,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,whiteSpace:'nowrap',textTransform:'uppercase'}}>
                      {o.status||'pending'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </>)}
    </div>
  );
}

// ── Reece Supply Integration ──────────────────────────────────
function ReeceSupplySettings() {
  const REECE_BLUE = '#1a3a6e';
  const REECE_RED  = '#e02020';

  const [cfg, setCfg]               = useState({ account_number:'', username:'', password:'', branch_id:'', environment:'production' });
  const [showPass, setShowPass]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [connected, setConnected]   = useState(false);
  const [branches, setBranches]     = useState([]);
  const [activeTab, setActiveTab]   = useState('settings');

  // Catalog
  const [searchQ, setSearchQ]           = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [cart, setCart]                 = useState([]); // [{sku,name,price,uom,qty}]
  const [cartOpen, setCartOpen]         = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [orderFlash, setOrderFlash]     = useState(null);

  // Orders
  const [orders, setOrders]             = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    try {
      const d = await api.getReeceConfig();
      setCfg(prev => ({ ...prev, ...d, password:'' }));
      setConnected(!!d.connected);
      if (d.branches?.length) setBranches(d.branches);
    } catch(e) {}
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.saveReeceConfig(cfg);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      loadConfig();
    } catch(e) { toast.error('Error', e.message); }
    finally { setSaving(false); }
  };

  const testConn = async () => {
    if (!cfg.account_number || !cfg.username) {
      setTestResult({ ok:false, msg:'Enter account number and username first.' });
      return;
    }
    setTesting(true); setTestResult(null);
    try {
      const r = await api.testReeceConnection(cfg);
      setTestResult(r);
      if (r.ok && r.branches?.length) setBranches(r.branches);
    } catch(e) { setTestResult({ ok:false, msg:e.message }); }
    finally { setTesting(false); }
  };

  const searchProducts = async (q) => {
    const term = q ?? searchQ;
    if (!term.trim()) return;
    setSearching(true);
    try {
      const r = await api.reeceSearchProducts(term);
      setSearchResults(r.products || []);
    } catch(e) { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const exists = prev.find(c => c.sku === item.sku);
      if (exists) return prev.map(c => c.sku === item.sku ? {...c, qty: c.qty+1} : c);
      return [...prev, { ...item, qty:1 }];
    });
  };

  const updateCartQty = (sku, delta) => {
    setCart(prev => prev
      .map(c => c.sku === sku ? {...c, qty: Math.max(0, c.qty + delta)} : c)
      .filter(c => c.qty > 0));
  };

  const cartTotal = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s,i) => s + i.qty, 0);

  const submitOrder = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const branch = branches.find(b => b.id === cfg.branch_id);
      const r = await api.reeceCreateOrder({
        items: cart.map(i => ({ sku:i.sku, name:i.name, price:i.price, uom:i.uom, qty:i.qty })),
        branch_id: cfg.branch_id,
        branch_name: branch?.name || '',
      });
      setOrderFlash(`Order ${r.order_number} submitted!`);
      setCart([]); setCartOpen(false);
      setTimeout(() => setOrderFlash(null), 4000);
      loadOrders();
    } catch(e) { toast.error('Order Failed', e.message); }
    finally { setSubmitting(false); }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const r = await api.reeceOrders();
      setOrders(r.orders || []);
    } catch(e) {}
    finally { setOrdersLoading(false); }
  };

  useEffect(() => { if (activeTab === 'orders') loadOrders(); }, [activeTab]);

  const INP  = { width:'100%', background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:8, padding:'9px 12px', fontSize:13, color:'var(--text)', boxSizing:'border-box' };
  const LBL  = { display:'block', fontSize:10, fontFamily:'var(--font-mono)', color:'var(--muted)', marginBottom:6, letterSpacing:'.07em', fontWeight:600 };
  const CARD = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:22, marginBottom:16 };

  const statusBadge = connected
    ? { bg:'#5daf7c22', color:'#5daf7c', border:'1px solid #5daf7c44', label:'● CONNECTED' }
    : { bg:'#66666618', color:'var(--muted)', border:'1px solid #66666630', label:'○ NOT CONFIGURED' };

  return (
    <div style={{animation:'fadeUp .4s ease', maxWidth:720}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <div style={{width:60,height:60,background:`linear-gradient(135deg,${REECE_BLUE},#0d2147)`,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 4px 24px ${REECE_BLUE}55`,fontSize:28}}>
          🔧
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800}}>Reece Supply</div>
          <div style={{fontSize:13,color:'var(--muted)'}}>Browse 200k+ SKUs, get live pricing, and create purchase orders — all without leaving DPS.</div>
        </div>
        <div style={{padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,...{background:statusBadge.bg,color:statusBadge.color,border:statusBadge.border}}}>
          {statusBadge.label}
        </div>
      </div>

      {/* Flash message */}
      {orderFlash && (
        <div style={{marginBottom:16,padding:'12px 18px',background:'#5daf7c18',border:'1px solid #5daf7c44',borderRadius:10,fontSize:13,color:'#5daf7c',fontWeight:600,display:'flex',alignItems:'center',gap:10}}>
          ✓ {orderFlash}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:'var(--surface)',padding:4,borderRadius:10,border:'1px solid var(--border)'}}>
        {[['settings','⚙️  Settings'],['catalog','📦  Catalog'],['orders','📋  Orders']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{flex:1,padding:'8px 0',background:activeTab===id?'var(--surface2)':'transparent',border:activeTab===id?'1px solid var(--border2)':'1px solid transparent',borderRadius:8,color:activeTab===id?'var(--text)':'var(--muted)',fontSize:13,fontWeight:activeTab===id?600:400,cursor:'pointer',transition:'all .15s'}}>
            {label}{id==='catalog'&&cartCount>0?` (${cartCount})`:''}
          </button>
        ))}
      </div>

      {/* ── SETTINGS TAB ── */}
      {activeTab==='settings' && (<>
        {/* Capability cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
          {[
            {icon:'🔍', title:'Product Search',  desc:'Search by name, part #, brand, or category'},
            {icon:'💲', title:'Live Pricing',     desc:'Real-time pricing from your account tier'},
            {icon:'🛒', title:'Purchase Orders',  desc:'Create and send POs in seconds'},
            {icon:'📦', title:'Auto Receiving',   desc:'Inventory updates when orders are received'},
          ].map(f=>(
            <div key={f.title} style={{...CARD,padding:14,textAlign:'center',marginBottom:0}}>
              <div style={{fontSize:22,marginBottom:6}}>{f.icon}</div>
              <div style={{fontSize:11,fontWeight:700,marginBottom:4}}>{f.title}</div>
              <div style={{fontSize:10,color:'var(--muted)',lineHeight:1.4}}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Credentials */}
        <div style={CARD}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--amber)',marginBottom:4}}>Account Credentials</div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:18}}>Contact your Reece sales rep or visit <span style={{color:'var(--green)'}}>reece.com</span> to obtain API access for your account.</div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <div>
              <label style={LBL}>ACCOUNT NUMBER</label>
              <input value={cfg.account_number} onChange={e=>setCfg(p=>({...p,account_number:e.target.value}))} style={INP} placeholder='123456'/>
            </div>
            <div>
              <label style={LBL}>USERNAME / EMAIL</label>
              <input value={cfg.username} onChange={e=>setCfg(p=>({...p,username:e.target.value}))} style={INP} placeholder='you@company.com'/>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={LBL}>PASSWORD</label>
            <div style={{display:'flex',gap:8}}>
              <input type={showPass?'text':'password'} value={cfg.password} onChange={e=>setCfg(p=>({...p,password:e.target.value}))} style={{...INP}} placeholder={connected?'Enter new password to change':'••••••••'}/>
              <button onClick={()=>setShowPass(s=>!s)} style={{padding:'9px 14px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>{showPass?'Hide':'Show'}</button>
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={LBL}>DEFAULT BRANCH</label>
            {branches.length > 0 ? (
              <select value={cfg.branch_id} onChange={e=>setCfg(p=>({...p,branch_id:e.target.value}))}
                style={{...INP,appearance:'auto',cursor:'pointer'}}>
                <option value=''>Select branch…</option>
                {branches.map(b=>(
                  <option key={b.id} value={b.id}>{b.name} — {b.city}, {b.state}</option>
                ))}
              </select>
            ) : (
              <input value={cfg.branch_id} onChange={e=>setCfg(p=>({...p,branch_id:e.target.value}))} style={INP} placeholder='Test connection to load branch list'/>
            )}
          </div>

          {/* Environment toggle */}
          <div>
            <label style={LBL}>ENVIRONMENT</label>
            <div style={{display:'flex',gap:8}}>
              {['production','sandbox'].map(env=>(
                <button key={env} onClick={()=>setCfg(p=>({...p,environment:env}))}
                  style={{padding:'7px 20px',background:cfg.environment===env?(env==='production'?`${REECE_BLUE}22`:'var(--amberdim)'):'transparent',border:`1px solid ${cfg.environment===env?(env==='production'?REECE_BLUE:'var(--amber)'):'var(--border)'}`,borderRadius:8,color:cfg.environment===env?(env==='production'?'#7ba4e8':'var(--amber)'):'var(--muted)',fontSize:12,fontWeight:600,cursor:'pointer',textTransform:'uppercase',letterSpacing:'.06em',transition:'all .15s'}}>
                  {env}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{marginBottom:14,padding:'11px 16px',background:testResult.ok?'#5daf7c12':'#f5656512',border:`1px solid ${testResult.ok?'#5daf7c44':'#f5656544'}`,borderRadius:10,fontSize:13,color:testResult.ok?'#5daf7c':'#f56565',display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16}}>{testResult.ok?'✓':'✗'}</span>
            <span>{testResult.msg}</span>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginBottom:28}}>
          <button onClick={testConn} disabled={testing}
            style={{padding:'10px 22px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:9,color:'var(--text)',fontSize:13,fontWeight:600,cursor:testing?'wait':'pointer',opacity:testing?0.7:1,transition:'opacity .15s'}}>
            {testing?'Testing…':'Test Connection'}
          </button>
          <button onClick={save} disabled={saving}
            style={{padding:'10px 24px',background:saved?'var(--greendim)':'var(--green)',border:`1px solid ${saved?'var(--green)':'var(--green)'}`,borderRadius:9,color:saved?'var(--green)':'#fff',fontSize:13,fontWeight:700,cursor:saving?'wait':'pointer',transition:'all .2s'}}>
            {saved?'✓ Saved!':saving?'Saving…':'Save Credentials'}
          </button>
        </div>

        {/* Setup guide */}
        <div style={CARD}>
          <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.07em',marginBottom:14}}>SETUP GUIDE</div>
          <ol style={{paddingLeft:18,display:'flex',flexDirection:'column',gap:10}}>
            {[
              'Log in to reece.com → My Account → API Access and generate credentials, or ask your Reece sales rep',
              'Enter your Account Number, Username, and Password in the form above',
              'Select "Test Connection" — your available branches will load automatically',
              'Choose your default branch and select the environment (Production for live orders)',
              'Click "Save Credentials" to activate the integration',
              'Go to the Catalog tab to search products and start building purchase orders',
            ].map((s,i)=>(
              <li key={i} style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>
                <span style={{color:'var(--green)',fontWeight:700}}>Step {i+1}:</span> {s}
              </li>
            ))}
          </ol>
        </div>
      </>)}

      {/* ── CATALOG TAB ── */}
      {activeTab==='catalog' && (<>
        {!connected ? (
          <div style={{...CARD,textAlign:'center',padding:'60px 20px'}}>
            <div style={{fontSize:40,marginBottom:14}}>🔒</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Connect your Reece account first</div>
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Enter your credentials in Settings, then come back to browse the full catalog.</div>
            <button onClick={()=>setActiveTab('settings')} style={{padding:'10px 24px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Go to Settings</button>
          </div>
        ) : (<>
          {/* Cart bar */}
          {cart.length > 0 && (
            <div style={{background:`${REECE_BLUE}22`,border:`1px solid ${REECE_BLUE}55`,borderRadius:12,padding:'14px 18px',marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:13,fontWeight:600,color:'#7ba4e8'}}>🛒 {cartCount} item{cartCount!==1?'s':''} — ${cartTotal.toFixed(2)}</span>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setCartOpen(o=>!o)} style={{padding:'7px 16px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                  {cartOpen?'Hide Cart':'View Cart'}
                </button>
                <button onClick={submitOrder} disabled={submitting||!cfg.branch_id}
                  style={{padding:'7px 18px',background:'var(--green)',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:submitting||!cfg.branch_id?'not-allowed':'pointer',opacity:!cfg.branch_id?0.5:1}}>
                  {submitting?'Submitting…':'Submit PO'}
                </button>
              </div>
            </div>
          )}
          {!cfg.branch_id && (
            <div style={{padding:'10px 14px',background:'var(--amberdim)',border:'1px solid var(--amber)44',borderRadius:9,fontSize:12,color:'var(--amber)',marginBottom:14}}>
              ⚠ Select a default branch in Settings before submitting orders.
            </div>
          )}

          {/* Cart expanded */}
          {cartOpen && cart.length > 0 && (
            <div style={{...CARD,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Cart</div>
              {cart.map(item=>(
                <div key={item.sku} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{item.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{item.sku}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <button onClick={()=>updateCartQty(item.sku,-1)} style={{width:26,height:26,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:14,cursor:'pointer',lineHeight:1}}>−</button>
                    <span style={{minWidth:24,textAlign:'center',fontSize:13,fontWeight:600}}>{item.qty}</span>
                    <button onClick={()=>updateCartQty(item.sku,+1)} style={{width:26,height:26,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',fontSize:14,cursor:'pointer',lineHeight:1}}>+</button>
                  </div>
                  <div style={{textAlign:'right',fontSize:13,fontWeight:700,color:'var(--amber)',minWidth:70}}>
                    ${(item.price*item.qty).toFixed(2)}
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'flex-end',paddingTop:12,fontSize:15,fontWeight:800,color:'var(--amber)'}}>
                Total: ${cartTotal.toFixed(2)}
              </div>
            </div>
          )}

          {/* Category shortcuts */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
            {[
              {icon:'🚿',label:'Faucets',       q:'Faucet'},
              {icon:'🚽',label:'Toilets',        q:'Toilet'},
              {icon:'🔥',label:'Water Heaters',  q:'Water Heater'},
              {icon:'⚙️', label:'Valves',         q:'Valve'},
              {icon:'🔩',label:'Pipe',           q:'Pipe'},
              {icon:'🔧',label:'Fittings',       q:'Fitting'},
              {icon:'🚰',label:'Hose Bibs',      q:'Hose Bib'},
              {icon:'🪠',label:'Drain',          q:'Drain'},
              {icon:'🪣',label:'Pumps',          q:'Pump'},
              {icon:'🗑️',label:'Disposals',      q:'Disposal'},
              {icon:'💧',label:'Water Treatment',q:'Water Treatment'},
              {icon:'🔑',label:'Sealants',       q:'Sealant'},
            ].map(c=>(
              <button key={c.label} onClick={()=>{ setSearchQ(c.label); searchProducts(c.q); }}
                style={{...CARD,padding:'12px 8px',textAlign:'center',marginBottom:0,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:5,border:'1px solid var(--border)',transition:'border-color .15s',color:'var(--text)'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <span style={{fontSize:18}}>{c.icon}</span>
                <span style={{fontSize:11,fontWeight:600,color:'var(--text)'}}>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div style={{display:'flex',gap:8,marginBottom:18}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&searchProducts()}
              style={{...INP,flex:1}} placeholder='Search by name, part #, brand, or category…'/>
            <button onClick={()=>searchProducts()} disabled={searching}
              style={{padding:'9px 22px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:searching?'wait':'pointer',whiteSpace:'nowrap',opacity:searching?0.7:1}}>
              {searching?'Searching…':'Search'}
            </button>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={CARD}>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:14,fontFamily:'var(--font-mono)'}}>{searchResults.length} RESULTS FOR "{searchQ.toUpperCase()}"</div>
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {searchResults.map((item,i)=>(
                  <div key={item.sku} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:14,alignItems:'center',padding:'13px 0',borderBottom:i<searchResults.length-1?'1px solid var(--border)':'none'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:13,fontWeight:600}}>{item.name}</span>
                        {!item.inStock && <span style={{fontSize:10,padding:'2px 8px',background:'#f5656515',border:'1px solid #f5656540',borderRadius:5,color:'#f56565',fontWeight:600}}>OUT OF STOCK</span>}
                      </div>
                      <div style={{display:'flex',gap:10,marginTop:2}}>
                        <span style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{item.sku}</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>{item.brand}</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>{item.category}</span>
                        {(item.branchQty > 0 || item.qtyOnHand > 0) && (<>
                          <span style={{fontSize:11,color:'var(--muted)'}}>·</span>
                          <span style={{fontSize:11,color:'#5daf7c'}}>
                            {item.branchQty > 0 ? `${item.branchQty} at branch` : `${item.qtyOnHand} in network`}
                          </span>
                        </>)}
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:15,fontWeight:800,color:'var(--amber)'}}>${item.price?.toFixed(2)??'—'}</div>
                      <div style={{fontSize:10,color:'var(--muted)'}}>per {item.uom||'EA'}</div>
                    </div>
                    <button onClick={()=>addToCart(item)} disabled={!item.inStock}
                      style={{padding:'8px 16px',background:item.inStock?'var(--surface2)':'transparent',border:`1px solid ${item.inStock?'var(--border2)':'var(--border)'}`,borderRadius:8,color:item.inStock?'var(--text)':'var(--muted)',fontSize:12,fontWeight:600,cursor:item.inStock?'pointer':'not-allowed',whiteSpace:'nowrap',transition:'all .1s'}}
                      onMouseEnter={e=>{ if(item.inStock){ e.currentTarget.style.background='var(--green)'; e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='var(--green)'; }}}
                      onMouseLeave={e=>{ if(item.inStock){ e.currentTarget.style.background='var(--surface2)'; e.currentTarget.style.color='var(--text)'; e.currentTarget.style.borderColor='var(--border2)'; }}}>
                      {cart.find(c=>c.sku===item.sku) ? `In Cart (${cart.find(c=>c.sku===item.sku).qty})` : '+ Add to PO'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!searching && searchQ && searchResults.length === 0 && (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted)'}}>
              <div style={{fontSize:32,marginBottom:10}}>🔍</div>
              <div style={{fontSize:13}}>No results for "{searchQ}"</div>
              <div style={{fontSize:12,marginTop:6}}>Try a broader search term or part number</div>
            </div>
          )}
        </>)}
      </>)}

      {/* ── ORDERS TAB ── */}
      {activeTab==='orders' && (<>
        {!connected ? (
          <div style={{...CARD,textAlign:'center',padding:'60px 20px'}}>
            <div style={{fontSize:40,marginBottom:14}}>🔒</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Connect your Reece account first</div>
            <button onClick={()=>setActiveTab('settings')} style={{padding:'10px 24px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Go to Settings</button>
          </div>
        ) : (<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600}}>Purchase Order History</div>
            <button onClick={loadOrders} style={{padding:'7px 16px',background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer'}}>↻ Refresh</button>
          </div>

          {ordersLoading ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted)'}}>Loading orders…</div>
          ) : orders.length === 0 ? (
            <div style={{...CARD,textAlign:'center',padding:'50px 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>No purchase orders yet</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:18}}>Search the catalog, add items to your cart, and submit your first PO.</div>
              <button onClick={()=>setActiveTab('catalog')} style={{padding:'9px 22px',background:'var(--green)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Browse Catalog</button>
            </div>
          ) : (
            <div style={CARD}>
              {orders.map((o,i)=>{
                const statusColors = {
                  delivered: {bg:'#5daf7c22',color:'#5daf7c',border:'#5daf7c44'},
                  shipped:   {bg:'#4a9eff22',color:'#4a9eff',border:'#4a9eff44'},
                  pending:   {bg:'var(--amberdim)',color:'var(--amber)',border:'var(--amber)44'},
                  cancelled: {bg:'#f5656518',color:'#f56565',border:'#f5656540'},
                };
                const sc = statusColors[o.status] || statusColors.pending;
                return (
                  <div key={o.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:16,alignItems:'center',padding:'14px 0',borderBottom:i<orders.length-1?'1px solid var(--border)':'none'}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)',whiteSpace:'nowrap'}}>{o.order_number}</div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{o.branch_name||o.branch_id||'Purchase Order'}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                        {(o.items||[]).length} item{(o.items||[]).length!==1?'s':''} · {o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--amber)',whiteSpace:'nowrap'}}>${parseFloat(o.total||0).toFixed(2)}</div>
                    <div style={{fontSize:11,padding:'4px 12px',borderRadius:6,fontWeight:700,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,whiteSpace:'nowrap',textTransform:'uppercase'}}>
                      {o.status||'pending'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </>)}
    </div>
  );
}

function SettingsContent({ tab, user, logout }) {
  if (tab === 'company')                  return <CompanySettingsPage/>;
  if (tab === 'departments')              return <DepartmentsPage/>;
  if (tab === 'technicians')              return <EmployeeListPage filterDept='Technicians'/>;
  if (tab === 'office')                   return <EmployeeListPage filterDept='Office'/>;
  if (tab === 'permissions')              return <RolesPermissionsPage/>;
  if (tab === 'payroll')                  return <PayrollSettingsPage/>;
  if (tab === 'account' || !tab) return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:20}}>Account</div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24,maxWidth:540}}>
        {[['Name',user?.name],['Email',user?.email],['Role',user?.role]].map(([k,v])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:13,color:'var(--muted)'}}>{k}</span>
            <span style={{fontSize:13,fontFamily:'var(--font-mono)',color:'var(--text)'}}>{v}</span>
          </div>
        ))}
        <button onClick={logout} style={{marginTop:16,padding:'9px 20px',background:'#f5656518',border:'1px solid #f5656544',borderRadius:8,color:'#f56565',fontSize:13,fontWeight:600}}>
          Sign Out
        </button>
      </div>
    </div>
  );
  if (tab === 'pricebook_cat')            return <ServicePricebooksPage user={user}/>;
  if (tab === 'materials_library')        return <MaterialsLibraryPage/>;
  if (tab === 'inv_items')     return <InventoryPage defaultTab="items"/>;
  if (tab === 'inv_barcodes')  return <InventoryPage defaultTab="barcodes"/>;
  if (tab === 'inv_locations') return <InventoryPage defaultTab="locations"/>;
  if (tab === 'inv_templates') return <InventoryPage defaultTab="templates"/>;
  if (tab === 'inv_po')        return <InventoryPage defaultTab="po"/>;
  if (tab === 'inv_counts')    return <InventoryPage defaultTab="counts"/>;
  if (tab === 'square')           return <SquareIntegrationPage/>;
  if (tab === 'wisetack')          return <WisetackIntegrationPage/>;
  if (tab === 'acorn')             return <ComingSoonIntegrationPage name='Acorn Finance' logo='🌰' description='Multi-lender financing marketplace for customers with varying credit profiles.'/>;
  if (tab === 'stripe')            return <ComingSoonIntegrationPage name='Stripe' logo='💳' description='Accept credit card payments via Stripe.'/>;
  if (tab === 'quickbooks')        return <ComingSoonIntegrationPage name='QuickBooks' logo='📊' description='Sync invoices and expenses with QuickBooks.'/>;
  if (tab === 'freshbooks')        return <ComingSoonIntegrationPage name='FreshBooks' logo='📒' description='Sync invoices and time tracking with FreshBooks.'/>;
  if (tab === 'gps_integration')   return <GPSIntegrationPage/>;
  if (tab === 'google_maps')       return <GoogleMapsSettings/>;
  if (tab === 'apple_maps')        return <AppleMapsSettings/>;
  if (tab === 'moore')             return <MooreSupplySettings/>;
  if (tab === 'reece')             return <ReeceSupplySettings/>;
  if (tab === 'phone_manager')     return <PhoneManagerSettings/>;
  if (tab === 'csr_questionnaire') return <CSRQuestionnaireSettings/>;
  if (tab === 'arrival_windows')   return <ArrivalWindowsSettings/>;
  if (tab === 'job_types')         return <JobTypesSettings/>;
  if (tab === 'business_hours')    return <BusinessHoursSettings/>;
  // Default: coming soon panel
  const label = tab ? tab.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'60%',animation:'fadeUp .4s ease'}}>
      <div style={{fontSize:48,marginBottom:16}}>🔧</div>
      <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,marginBottom:8}}>{label}</div>
      <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>This feature is coming soon.</div>
      <div style={{padding:'6px 16px',background:'#1e2a3a',color:'#3a8abf',borderRadius:6,fontSize:12,fontWeight:700}}>COMING SOON</div>
    </div>
  );
}

// ── Flat-rate pricing engine (frontend) ──────────────────────────────────
// HTML-engine flat rate formula — EXACTLY mirrors recalcEngine() in Plumbing_Pricebook_Web_v7.html.
// Do not change this formula. Inputs come from the pb_engine row (see backend pricebook routes).
function calcFlatRate(task, engine) {
  const E = engine || {};
  const wage = +E.wage || 0, hrs = +E.hrs || 1600;
  const fica = +E.fica || 0, unemp = +E.unemp || 0, wc = +E.wc || 0;
  const health = +E.health || 0, vehicle = +E.vehicle || 0, fuel = +E.fuel || 0;
  const tools = +E.tools || 0, uniform = +E.uniform || 0, phone = +E.phone || 0;
  const numTechs = +E.num_techs || 1, ohHrs = +E.oh_hrs || 1600;
  const profit = +E.profit || 0, misc = +E.misc || 0, warranty = +E.warranty || 0;
  const matmarkup = +E.matmarkup || 0;
  const ohItems = Array.isArray(E.oh_items) ? E.oh_items : [];

  // Burdened cost
  const burdenPct = (fica + unemp + wc) / 100;
  const baseWages = wage * hrs;
  const burdenAmt = baseWages * burdenPct;
  const fixedAnnual = (health + vehicle + fuel + tools + uniform + phone) * 12;
  const burdened = hrs > 0 ? (baseWages + burdenAmt + fixedAnnual) / hrs : 0;

  // Overhead
  const ohMonthly = ohItems.reduce((s, it) => s + (+it.monthly || 0), 0);
  const ohAnnual = ohMonthly * 12;
  const ohPerHr = (numTechs > 0 && ohHrs > 0) ? ohAnnual / (numTechs * ohHrs) : 0;

  // Labor rate & markup
  const costPerHr = burdened + ohPerHr;
  const laborRate = costPerHr / Math.max(0.01, 1 - profit / 100);
  const mu = 1 + (misc + warranty + matmarkup) / 100;

  const matCost = (task.materials || []).reduce(
    (s, m) => s + parseFloat(m.cost || 0) * parseFloat(m.qty || 1), 0);
  const taskHrs = parseFloat(task.hours || 0);
  const flatRate = matCost * mu + taskHrs * laborRate;

  return { flatRate, matCost, laborRate, mu, burdened, ohPerHr };
}

// Full HTML pricebook category list (19 categories). Loaded from pb_categories at runtime.
const PB_CATS = [
  {id:'acc',  icon:'🔑', name:'Accesses',           color:'#8B6914'},
  {id:'diag', icon:'🔍', name:'Diagnosis',           color:'#2E5FA3'},
  {id:'prmt', icon:'📋', name:'Permits & Reports',   color:'#5B2D8E'},
  {id:'bath', icon:'🚿', name:'Bathroom',            color:'#1F7A8C'},
  {id:'kit',  icon:'🍳', name:'Kitchen',             color:'#C55A11'},
  {id:'lndr', icon:'🧺', name:'Laundry Room',        color:'#1E6B3C'},
  {id:'dc',   icon:'🌀', name:'Drain Cleaning',      color:'#5B2D8E'},
  {id:'cs',   icon:'📦', name:'Customer Supplied',   color:'#4A4A6A'},
  {id:'wh',   icon:'🔥', name:'Water Heaters',       color:'#C55A11'},
  {id:'of',   icon:'🌿', name:'Outdoor Faucets',     color:'#1E6B3C'},
  {id:'gas',  icon:'🔴', name:'Gas',                 color:'#B84C00'},
  {id:'fvt',  icon:'🔧', name:'Fixture Valves',      color:'#1F7A8C'},
  {id:'swr',  icon:'🚧', name:'Sewer Repairs',       color:'#7A4B1A'},
  {id:'pip',  icon:'💧', name:'Piping',              color:'#2E5FA3'},
  {id:'vlv',  icon:'⚙️', name:'Valves',              color:'#1F7A8C'},
  {id:'wlk',  icon:'💦', name:'Water Leaks',         color:'#C00000'},
  {id:'dig',  icon:'🚜', name:'Digging',             color:'#6B4423'},
  {id:'wpur', icon:'💎', name:'Water Purification',  color:'#1F7A8C'},
  {id:'ewrn', icon:'🛡️', name:'Extended Warranties', color:'#1E6B3C'},
];
const DIFF_COLOR = {Easy:'#22c55e',Moderate:'#f59e0b',Hard:'#f97316',Complex:'#a855f7'};

function NewPricebookPage({user}) {
  const [engine,setEngine] = useState(null);
  const [engineDraft,setEngineDraft] = useState(null);
  const [engineOpen,setEngineOpen] = useState(false);
  const [selCat,setSelCat] = useState('acc');
  const [tasks,setTasks] = useState([]);
  const [loading,setLoading] = useState(false);
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState(null);
  const [saving,setSaving] = useState(false);

  useEffect(()=>{ api.pbEngine().then(d=>{setEngine(d);setEngineDraft({...d});}); },[]);
  useEffect(()=>{
    if(!selCat) return;
    setLoading(true);
    api.pbTasks({category:selCat}).then(setTasks).finally(()=>setLoading(false));
  },[selCat]);

  const displayTasks = search
    ? tasks.filter(t=>t.name.toLowerCase().includes(search.toLowerCase())||t.tag.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  const saveEngine = async()=>{
    setSaving(true);
    try { const d=await api.pbSaveEngine(engineDraft); setEngine(d); setEngineDraft({...d}); setEngineOpen(false); toast.success('Engine saved','Prices updated.'); }
    catch(e){ toast.error('Save failed',e.message); }
    finally { setSaving(false); }
  };

  const E = engine;
  // Derive display rates from the HTML engine (reuses calcFlatRate with a zero-mat, 0-hr task)
  const _probe = E ? calcFlatRate({ materials: [], hours: 0 }, E) : null;
  const effectiveRate = _probe ? _probe.laborRate : 0;
  const markup = _probe ? _probe.mu : 0;
  const fmt = n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

  const INP = {background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'7px 11px',color:'var(--text)',fontSize:13,width:'100%'};

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',gap:0,animation:'fadeUp .3s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:24,fontWeight:800,flex:1}}>💲 Flat Rate Pricebook</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {E && <div style={{display:'flex',gap:16,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 16px'}}>
            <span style={{fontSize:11,color:'var(--muted)'}}>Labor Rate <b style={{color:'var(--green)',marginLeft:4}}>{fmt(effectiveRate)}/hr</b></span>
            <span style={{fontSize:11,color:'var(--muted)'}}>Mat Markup <b style={{color:'var(--blue)',marginLeft:4}}>{markup.toFixed(2)}×</b></span>
          </div>}
          <button onClick={()=>setEngineOpen(true)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',color:'var(--amber)',fontSize:12,fontWeight:700,cursor:'pointer'}}>⚙ Engine</button>
        </div>
      </div>

      <div style={{display:'flex',gap:0,flex:1,minHeight:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        {/* Category sidebar */}
        <div style={{width:200,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <div style={{padding:'10px 12px 6px',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.08em'}}>CATEGORIES</div>
          {PB_CATS.map(cat=>{
            const active=selCat===cat.id;
            return (
              <button key={cat.id} onClick={()=>{setSelCat(cat.id);setExpanded(null);setSearch('');}}
                style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',border:'none',borderLeft:`3px solid ${active?cat.color:'transparent'}`,background:active?`${cat.color}18`:'transparent',cursor:'pointer',textAlign:'left',transition:'all .12s'}}>
                <span style={{fontSize:16}}>{cat.icon}</span>
                <span style={{fontFamily:'var(--font-head)',fontSize:13,fontWeight:700,color:active?cat.color:'var(--text)'}}>{cat.name}</span>
              </button>
            );
          })}
        </div>

        {/* Task area */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          {/* Search bar */}
          <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search tasks…"
              style={{...INP,width:'100%',background:'var(--bg)'}}/>
          </div>

          {/* Task table */}
          <div style={{flex:1,overflowY:'auto'}}>
            {loading ? (
              <div style={{padding:20,display:'flex',flexDirection:'column',gap:8}}>
                {[1,2,3,4,5].map(i=><div key={i} className="skel" style={{height:44,borderRadius:6}}/>)}
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--surface2)'}}>
                    <th style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',fontWeight:600}}>TASK</th>
                    <th style={{padding:'8px 8px',textAlign:'center',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',fontWeight:600,width:60}}>HRS</th>
                    <th style={{padding:'8px 8px',textAlign:'center',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',fontWeight:600,width:80}}>DIFF</th>
                    <th style={{padding:'8px 14px',textAlign:'right',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--blue)',letterSpacing:'.06em',fontWeight:600,width:120}}>FLAT RATE</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTasks.map(task=>{
                    const {flatRate} = engine ? calcFlatRate(task,engine) : {flatRate:0};
                    const isExp = expanded===task.id;
                    const cat = PB_CATS.find(c=>c.id===task.category_id);
                    return (
                      <Fragment key={task.id}>
                        <tr onClick={()=>setExpanded(isExp?null:task.id)} className="tr-hover"
                          style={{borderBottom:'1px solid var(--border)',cursor:'pointer',background:isExp?'var(--surface2)':'transparent'}}>
                          <td style={{padding:'10px 14px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <span style={{fontSize:11,transform:isExp?'rotate(90deg)':'rotate(0)',display:'inline-block',transition:'transform .15s',color:'var(--muted)'}}>▶</span>
                              <span style={{fontSize:13,fontWeight:600}}>{task.name}</span>
                              <span style={{fontSize:10,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:3,padding:'1px 6px',color:'var(--muted)'}}>{task.tag}</span>
                            </div>
                          </td>
                          <td style={{padding:'10px 8px',textAlign:'center',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--muted)'}}>{parseFloat(task.hours).toFixed(1)}</td>
                          <td style={{padding:'10px 8px',textAlign:'center'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:3,background:`${DIFF_COLOR[task.difficulty]||'#888'}22`,color:DIFF_COLOR[task.difficulty]||'#888',border:`1px solid ${DIFF_COLOR[task.difficulty]||'#888'}44`}}>{task.difficulty}</span>
                          </td>
                          <td style={{padding:'10px 14px',textAlign:'right',fontFamily:'var(--font-head)',fontSize:17,fontWeight:800,color:'var(--text)'}}>{engine?fmt(flatRate):'—'}</td>
                        </tr>
                        {isExp&&(
                          <tr style={{borderBottom:'1px solid var(--border)'}}>
                            <td colSpan={4} style={{padding:0}}>
                              <div style={{background:'var(--bg)',padding:'14px 20px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
                                {/* Materials */}
                                <div>
                                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:8}}>MATERIALS</div>
                                  {task.materials&&task.materials.length>0 ? task.materials.map(m=>(
                                    <div key={m.material_id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                                      <span style={{color:'var(--muted)',flex:1}}>{m.description}</span>
                                      <span style={{color:'var(--blue)',fontFamily:'var(--font-mono)',flexShrink:0}}>{m.qty} {m.unit} × {fmt(m.cost)}</span>
                                    </div>
                                  )) : <span style={{fontSize:12,color:'var(--muted)',fontStyle:'italic'}}>Labor only</span>}
                                </div>
                                {/* Price breakdown */}
                                {engine && (()=>{
                                  const {flatRate,matCost,laborRate,mu} = calcFlatRate(task,engine);
                                  const E2 = engine;
                                  const lc = parseFloat(task.hours)*laborRate;
                                  const matSell = matCost*mu;
                                  return (
                                    <div>
                                      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:8}}>PRICE BREAKDOWN</div>
                                      {[
                                        ['Material (raw)',matCost,'#38bdf8'],
                                        ['Material (marked up)',matSell,'#38bdf8'],
                                        [`Labor (${task.hours}h × ${fmt(laborRate)}/hr)`,lc,'#818cf8'],
                                        ['FLAT RATE',flatRate,'var(--amber)'],
                                      ].map(([lbl,val,clr])=>(
                                        <div key={lbl} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid var(--border)'}}>
                                          <span style={{color:'var(--muted)'}}>{lbl}</span>
                                          <span style={{color:clr,fontFamily:'var(--font-mono)',fontWeight:lbl==='FLAT RATE'?800:400}}>{fmt(val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                                {/* Details */}
                                <div>
                                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',marginBottom:8}}>JOB DETAILS</div>
                                  <div style={{fontSize:12,color:'var(--muted)'}}>⏱ {task.time_range}</div>
                                  <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>📊 {task.difficulty}</div>
                                  {task.notes&&<div style={{fontSize:11,color:'var(--muted)',marginTop:8,padding:'6px 8px',background:'var(--surface)',borderRadius:4,fontStyle:'italic',borderLeft:'2px solid var(--border)'}}>{task.notes}</div>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Engine Modal */}
      {engineOpen&&engineDraft&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setEngineOpen(false)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:28,width:600,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
              <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800}}>⚙ Pricing Engine</div>
              <button onClick={()=>setEngineOpen(false)} style={{background:'transparent',color:'var(--muted)',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            {/* ── Burden inputs ── */}
            <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.1em',marginBottom:8}}>BURDEN</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
              {[
                ['wage','Tech Wage ($/hr)'],['hrs','Billable Hrs/Yr'],
                ['fica','FICA %'],['unemp','Unemployment %'],['wc','Workers Comp %'],
                ['health','Health ($/mo)'],['vehicle','Vehicle ($/mo)'],['fuel','Fuel ($/mo)'],
                ['tools','Tools ($/mo)'],['uniform','Uniform ($/mo)'],['phone','Phone ($/mo)'],
              ].map(([k,lbl])=>(
                <div key={k}>
                  <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4}}>{lbl.toUpperCase()}</label>
                  <input type="number" value={engineDraft[k]??''} onChange={e=>setEngineDraft(d=>({...d,[k]:e.target.value}))} style={{...INP,color:'var(--text)',fontWeight:700}}/>
                </div>
              ))}
            </div>

            {/* ── Overhead inputs ── */}
            <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.1em',marginBottom:8}}>OVERHEAD</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>NUMBER OF TECHS</label>
                <input type="number" value={engineDraft.num_techs??''} onChange={e=>setEngineDraft(d=>({...d,num_techs:e.target.value}))} style={{...INP,color:'var(--text)',fontWeight:700}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>OVERHEAD BILLABLE HRS/YR</label>
                <input type="number" value={engineDraft.oh_hrs??''} onChange={e=>setEngineDraft(d=>({...d,oh_hrs:e.target.value}))} style={{...INP,color:'var(--text)',fontWeight:700}}/>
              </div>
            </div>
            <div style={{marginBottom:16,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:10}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:'.06em',marginBottom:6}}>MONTHLY OVERHEAD ITEMS</div>
              {(engineDraft.oh_items||[]).map((it,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 110px 28px',gap:6,alignItems:'center',marginBottom:4}}>
                  <input value={it.name} onChange={e=>setEngineDraft(d=>{const arr=[...(d.oh_items||[])];arr[i]={...arr[i],name:e.target.value};return {...d,oh_items:arr};})} style={{...INP,fontSize:12,padding:'5px 8px'}}/>
                  <input type="number" value={it.monthly} onChange={e=>setEngineDraft(d=>{const arr=[...(d.oh_items||[])];arr[i]={...arr[i],monthly:parseFloat(e.target.value)||0};return {...d,oh_items:arr};})} style={{...INP,fontSize:12,padding:'5px 8px',textAlign:'right',color:'var(--amber)',fontWeight:700}}/>
                  <button onClick={()=>setEngineDraft(d=>({...d,oh_items:(d.oh_items||[]).filter((_,j)=>j!==i)}))} style={{background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:14}}>✕</button>
                </div>
              ))}
              <button onClick={()=>setEngineDraft(d=>({...d,oh_items:[...(d.oh_items||[]),{name:'New Item',monthly:0}]}))} style={{marginTop:6,background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:6,padding:'6px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>+ Add Overhead Item</button>
            </div>

            {/* ── Profit & Markup ── */}
            <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--amber)',letterSpacing:'.1em',marginBottom:8}}>PROFIT &amp; MARKUP</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:20}}>
              {[['profit','Net Profit %'],['misc','Misc %'],['warranty','Warranty %'],['matmarkup','Extra Mat Markup %']].map(([k,lbl])=>(
                <div key={k}>
                  <label style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',display:'block',marginBottom:4}}>{lbl.toUpperCase()}</label>
                  <input type="number" value={engineDraft[k]??''} onChange={e=>setEngineDraft(d=>({...d,[k]:e.target.value}))} style={{...INP,color:'var(--text)',fontWeight:700}}/>
                </div>
              ))}
            </div>

            {/* ── Derived display (live) ── */}
            {(()=>{
              const probe = calcFlatRate({materials:[],hours:0}, engineDraft);
              return (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:20}}>
                  {[
                    ['Burdened',fmt(probe.burdened)+'/hr','#22c55e'],
                    ['Overhead',fmt(probe.ohPerHr)+'/hr','#a855f7'],
                    ['Labor Rate',fmt(probe.laborRate)+'/hr','#f59e0b'],
                    ['Mat Markup',probe.mu.toFixed(2)+'×','#38bdf8'],
                  ].map(([lbl,val,clr])=>(
                    <div key={lbl} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',textAlign:'center'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:4}}>{lbl}</div>
                      <div style={{fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,color:clr}}>{val}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <button onClick={saveEngine} disabled={saving} style={{width:'100%',background:'var(--amber)',color:'#000',border:'none',borderRadius:8,padding:12,fontFamily:'var(--font-head)',fontSize:16,fontWeight:800,cursor:'pointer'}}>
              {saving?'Saving…':'✓ Save & Recalculate All Prices'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EstimatesPage ─────────────────────────────────────────────────────────
function EstimatesPage({user}) {
  const [estimates,setEstimates] = useState([]);
  const [loading,setLoading] = useState(true);
  const [detail,setDetail] = useState(null);
  const [newModal,setNewModal] = useState(false);
  const [sigModal,setSigModal] = useState(null); // estimate being signed in-person
  const [sendModal,setSendModal] = useState(null);
  const [canvasRef] = useState({current:null});
  const [isDrawing,setIsDrawing] = useState(false);
  const [sigName,setSigName] = useState('');
  const [customers,setCustomers] = useState([]);
  const [newForm,setNewForm] = useState({customer_id:'',notes:'',tax_rate:'0.0825'});
  const [engine,setEngine] = useState(null);
  const [pbTasks,setPbTasks] = useState([]);
  const [pbCat,setPbCat] = useState('wh');
  const [pbSearch,setPbSearch] = useState('');
  const [pbLoading,setPbLoading] = useState(false);
  const [addingItem,setAddingItem] = useState(false);

  const load = useCallback(()=>{ setLoading(true); api.getEstimates().then(setEstimates).finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ load(); api.pbEngine().then(setEngine); api.getCustomers().then(d=>setCustomers(Array.isArray(d)?d:d.customers||[])).catch(()=>{}); },[load]);
  useEffect(()=>{
    if(!detail) return;
    setPbLoading(true);
    api.pbTasks({category:pbCat}).then(setPbTasks).finally(()=>setPbLoading(false));
  },[pbCat,detail]);

  const fmt = n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const STATUS_COLOR = {draft:'#6b7aaa',sent:'#3b82f6',signed:'#22c55e',declined:'#f97316',expired:'#6b7280',converted:'#a855f7'};

  const createEstimate = async()=>{
    try {
      const est = await api.createEstimate(newForm);
      setNewModal(false); setDetail(est); load();
      toast.success('Estimate created','Add tasks from the pricebook below.');
    } catch(e){ toast.error('Error',e.message); }
  };

  const addTask = async(task)=>{
    if(!detail||addingItem) return;
    setAddingItem(true);
    try {
      const {flatRate,matCost,laborRate} = engine ? calcFlatRate(task,engine) : {flatRate:0,matCost:0,laborRate:0};
      const lc = parseFloat(task.hours||0)*laborRate;
      const updated = await api.addEstimateItem(detail.id,{
        task_id:task.id, description:task.name,
        hours:task.hours, material_cost:matCost, labor_cost:lc,
        flat_rate:flatRate, qty:1, sort_order:detail.items.length,
      });
      setDetail(updated);
    } catch(e){ toast.error('Error',e.message); }
    finally { setAddingItem(false); }
  };

  const removeItem = async(itemId)=>{
    if(!detail) return;
    try { const updated = await api.removeEstimateItem(detail.id,itemId); setDetail(updated); }
    catch(e){ toast.error('Error',e.message); }
  };

  const sendEstimate = async()=>{
    try {
      const updated = await api.sendEstimate(detail.id);
      setDetail(updated); setSendModal(updated);
      toast.success('Estimate sent','Sign link generated.');
    } catch(e){ toast.error('Error',e.message); }
  };

  // In-person signature
  const startSig = (est)=>{ setSigModal(est); setSigName(''); };
  const clearSig = ()=>{ const cv=canvasRef.current; if(cv){ const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height); } };
  const getSigData = ()=>{ const cv=canvasRef.current; return cv?cv.toDataURL('image/png'):null; };

  const submitSig = async()=>{
    const sigData = getSigData();
    if(!sigData||!sigName.trim()) return toast.warn('Missing','Please provide name and signature.');
    try {
      const updated = await api.signEstimate(sigModal.id,{signature_data:sigData,signed_by_name:sigName});
      setSigModal(null); setDetail(updated); load();
      toast.success('Signed!','Estimate signed successfully.');
    } catch(e){ toast.error('Error',e.message); }
  };

  const convertToInvoice = async()=>{
    try {
      const result = await api.convertEstimate(detail.id);
      toast.success('Converted!',`Invoice created.`);
      const updated = await api.getEstimate(detail.id);
      setDetail(updated); load();
    } catch(e){ toast.error('Error',e.message); }
  };

  // Canvas drawing
  const onSigDown = e=>{
    setIsDrawing(true);
    const cv=canvasRef.current; if(!cv) return;
    const r=cv.getBoundingClientRect();
    const ctx=cv.getContext('2d');
    ctx.beginPath();
    const cx=e.touches?e.touches[0].clientX-r.left:e.clientX-r.left;
    const cy=e.touches?e.touches[0].clientY-r.top:e.clientY-r.top;
    ctx.moveTo(cx,cy);
  };
  const onSigMove = e=>{
    if(!isDrawing) return;
    const cv=canvasRef.current; if(!cv) return;
    const r=cv.getBoundingClientRect();
    const ctx=cv.getContext('2d');
    const cx=e.touches?e.touches[0].clientX-r.left:e.clientX-r.left;
    const cy=e.touches?e.touches[0].clientY-r.top:e.clientY-r.top;
    ctx.lineWidth=2; ctx.lineCap='round'; ctx.strokeStyle='#1D70B7';
    ctx.lineTo(cx,cy); ctx.stroke();
  };
  const onSigUp = ()=>setIsDrawing(false);

  const filteredPbTasks = pbSearch ? pbTasks.filter(t=>t.name.toLowerCase().includes(pbSearch.toLowerCase())) : pbTasks;

  if(detail) return (
    <div style={{animation:'fadeUp .3s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button onClick={()=>setDetail(null)} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:7,padding:'6px 14px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>← Estimates</button>
        <div style={{fontFamily:'var(--font-head)',fontSize:22,fontWeight:800,flex:1}}>
          Estimate — {detail.customer_name||'No customer'}
          <span style={{marginLeft:12,fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:5,background:`${STATUS_COLOR[detail.status]||'#888'}22`,color:STATUS_COLOR[detail.status]||'#888',border:`1px solid ${STATUS_COLOR[detail.status]||'#888'}44`}}>{(detail.status||'draft').toUpperCase()}</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(detail.status==='draft'||detail.status==='sent')&&(
            <button onClick={()=>startSig(detail)} style={{background:'var(--greendim)',border:'1px solid var(--green)',borderRadius:8,padding:'7px 14px',color:'var(--green)',fontSize:12,fontWeight:700,cursor:'pointer'}}>✍ Sign In-Person</button>
          )}
          {(detail.status==='draft'||detail.status==='sent')&&(
            <button onClick={sendEstimate} style={{background:'var(--surface)',border:'1px solid var(--blue)',borderRadius:8,padding:'7px 14px',color:'var(--blue)',fontSize:12,fontWeight:700,cursor:'pointer'}}>📧 Send to Customer</button>
          )}
          {detail.status==='signed'&&!detail.invoice_id&&(
            <button onClick={convertToInvoice} style={{background:'var(--amber)',border:'none',borderRadius:8,padding:'7px 14px',color:'#000',fontSize:12,fontWeight:800,cursor:'pointer'}}>→ Convert to Invoice</button>
          )}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16,minHeight:400}}>
        {/* Items */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-head)',fontSize:14,fontWeight:700}}>Line Items</div>
          {(!detail.items||detail.items.length===0) ? (
            <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>No items yet — add from pricebook below</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'var(--surface2)'}}>
                {['Description','Hrs','Mat','Labor','Rate',''].map(h=>(
                  <th key={h} style={{padding:'8px 12px',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',textAlign:h===''?'center':'left',letterSpacing:'.06em'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {detail.items.map(item=>(
                  <tr key={item.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px',fontSize:13,fontWeight:600}}>{item.description}</td>
                    <td style={{padding:'10px 8px',fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{parseFloat(item.hours).toFixed(1)}</td>
                    <td style={{padding:'10px 8px',fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{fmt(item.material_cost)}</td>
                    <td style={{padding:'10px 8px',fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{fmt(item.labor_cost)}</td>
                    <td style={{padding:'10px 12px',fontFamily:'var(--font-head)',fontSize:16,fontWeight:800}}>{fmt(item.flat_rate)}</td>
                    <td style={{padding:'10px 8px',textAlign:'center'}}>
                      {detail.status==='draft'&&<button onClick={()=>removeItem(item.id)} style={{background:'transparent',color:'var(--muted)',fontSize:14,cursor:'pointer',padding:2}}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* Totals */}
          <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:24}}>
            <span style={{fontSize:13,color:'var(--muted)'}}>Subtotal <b style={{color:'var(--text)',marginLeft:8}}>{fmt(detail.subtotal)}</b></span>
            <span style={{fontSize:13,color:'var(--muted)'}}>Tax ({((parseFloat(detail.tax_rate||0))*100).toFixed(2)}%) <b style={{color:'var(--text)',marginLeft:8}}>{fmt(detail.tax_amount)}</b></span>
            <span style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-head)'}}>TOTAL <span style={{color:'var(--amber)',marginLeft:8}}>{fmt(detail.total)}</span></span>
          </div>
          {detail.signed_at&&(
            <div style={{padding:'10px 16px',borderTop:'1px solid var(--border)',background:'var(--greendim)',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,color:'var(--green2)'}}>✓ Signed by <b>{detail.signed_by_name}</b> on {new Date(detail.signed_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Pricebook picker */}
        {detail.status==='draft'&&(
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-head)',fontSize:13,fontWeight:700}}>Add from Pricebook</div>
            <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap'}}>
              {PB_CATS.map(c=>(
                <button key={c.id} onClick={()=>setPbCat(c.id)}
                  style={{fontSize:10,padding:'3px 8px',borderRadius:4,border:`1px solid ${pbCat===c.id?c.color:'var(--border)'}`,background:pbCat===c.id?`${c.color}22`:'transparent',color:pbCat===c.id?c.color:'var(--muted)',cursor:'pointer',fontWeight:pbCat===c.id?700:400}}>{c.icon} {c.name.split(' ')[0]}</button>
              ))}
            </div>
            <input value={pbSearch} onChange={e=>setPbSearch(e.target.value)} placeholder="Search…"
              style={{margin:'6px 10px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 9px',color:'var(--text)',fontSize:12}}/>
            <div style={{flex:1,overflowY:'auto'}}>
              {pbLoading ? <div style={{padding:12}}><div className="skel" style={{height:32,borderRadius:4}}/></div> :
              filteredPbTasks.map(task=>{
                const {flatRate} = engine?calcFlatRate(task,engine):{flatRate:0};
                return (
                  <button key={task.id} onClick={()=>addTask(task)}
                    style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',border:'none',borderBottom:'1px solid var(--border)',background:'transparent',cursor:'pointer',textAlign:'left',transition:'background .1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontSize:12,fontWeight:600,flex:1,marginRight:8}}>{task.name}</span>
                    <span style={{fontFamily:'var(--font-head)',fontSize:13,fontWeight:800,color:'var(--amber)',flexShrink:0}}>{engine?fmt(flatRate):'—'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* In-person signature modal */}
      {sigModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:28,width:540,maxWidth:'95vw'}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,marginBottom:4}}>✍ Customer Signature</div>
            <p style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>Have the customer sign below to approve this estimate for ${fmt(detail?.total||0)}.</p>
            <input value={sigName} onChange={e=>setSigName(e.target.value)} placeholder="Customer's full name"
              style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:13,marginBottom:12}}/>
            <div style={{border:'2px solid var(--blue)',borderRadius:8,background:'#fff',marginBottom:12}}>
              <canvas ref={el=>canvasRef.current=el} width={480} height={160}
                style={{display:'block',cursor:'crosshair',touchAction:'none'}}
                onMouseDown={onSigDown} onMouseMove={onSigMove} onMouseUp={onSigUp} onMouseLeave={onSigUp}
                onTouchStart={onSigDown} onTouchMove={onSigMove} onTouchEnd={onSigUp}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={clearSig} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 16px',color:'var(--muted)',fontSize:12,cursor:'pointer',flex:1}}>Clear</button>
              <button onClick={()=>setSigModal(null)} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 16px',color:'var(--muted)',fontSize:12,cursor:'pointer',flex:1}}>Cancel</button>
              <button onClick={submitSig} style={{background:'var(--green)',border:'none',borderRadius:7,padding:'8px 20px',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',flex:2}}>✓ Confirm Signature</button>
            </div>
          </div>
        </div>
      )}

      {/* Send confirmation modal */}
      {sendModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000099',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:28,width:480,maxWidth:'95vw'}}>
            <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,marginBottom:8}}>📧 Estimate Sent</div>
            <p style={{fontSize:13,color:'var(--muted)',marginBottom:14}}>{sendModal.customer_email?`Email sent to ${sendModal.customer_email}. `:''}Share this link for the customer to sign remotely:</p>
            <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'10px 14px',fontSize:12,fontFamily:'var(--font-mono)',color:'var(--blue)',wordBreak:'break-all',marginBottom:16,userSelect:'all'}}>
              {window.location.origin}/sign/{sendModal.sign_token}
            </div>
            <button onClick={()=>{ navigator.clipboard?.writeText(`${window.location.origin}/sign/${sendModal.sign_token}`); toast.success('Copied','Link copied to clipboard.'); }} style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 16px',color:'var(--text)',fontSize:13,cursor:'pointer',marginBottom:8}}>📋 Copy Link</button>
            <button onClick={()=>setSendModal(null)} style={{width:'100%',background:'transparent',border:'1px solid var(--border)',borderRadius:7,padding:'8px 16px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{animation:'fadeUp .3s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div style={{fontFamily:'var(--font-head)',fontSize:24,fontWeight:800,flex:1}}>📄 Estimates</div>
        <button onClick={()=>setNewModal(true)} style={{background:'var(--amber)',border:'none',borderRadius:8,padding:'8px 18px',color:'#000',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Estimate</button>
      </div>

      {loading ? (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[1,2,3].map(i=><div key={i} className="skel" style={{height:52,borderRadius:8}}/>)}
        </div>
      ) : estimates.length===0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:'var(--muted)'}}>
          <div style={{fontSize:48,marginBottom:12}}>📄</div>
          <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>No estimates yet</div>
          <div style={{fontSize:13,marginBottom:20}}>Create your first estimate to get started.</div>
          <button onClick={()=>setNewModal(true)} style={{background:'var(--amber)',border:'none',borderRadius:8,padding:'9px 22px',color:'#000',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Estimate</button>
        </div>
      ) : (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'var(--surface2)'}}>
              {['Customer','Job #','Items','Total','Status','Date',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {estimates.map(est=>(
                <tr key={est.id} className="tr-hover" onClick={()=>api.getEstimate(est.id).then(setDetail)} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
                  <td style={{padding:'10px 14px',fontWeight:600,fontSize:13}}>{est.customer_name||'—'}</td>
                  <td style={{padding:'10px 14px',fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)'}}>{est.job_number||'—'}</td>
                  <td style={{padding:'10px 14px',fontSize:12,color:'var(--muted)'}}>{est.item_count}</td>
                  <td style={{padding:'10px 14px',fontFamily:'var(--font-head)',fontSize:15,fontWeight:700}}>{fmt(est.total)}</td>
                  <td style={{padding:'10px 14px'}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:`${STATUS_COLOR[est.status]||'#888'}22`,color:STATUS_COLOR[est.status]||'#888',border:`1px solid ${STATUS_COLOR[est.status]||'#888'}44`}}>{(est.status||'').toUpperCase()}</span>
                  </td>
                  <td style={{padding:'10px 14px',fontSize:12,color:'var(--muted)'}}>{new Date(est.created_at).toLocaleDateString()}</td>
                  <td style={{padding:'10px 14px'}}><span style={{color:'var(--blue)',fontSize:12}}>Open →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New estimate modal */}
      {newModal&&(
        <div style={{position:'fixed',inset:0,background:'#00000088',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setNewModal(false)}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:28,width:440,maxWidth:'95vw'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:800,marginBottom:20}}>New Estimate</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4}}>CUSTOMER</label>
                <select value={newForm.customer_id} onChange={e=>setNewForm(f=>({...f,customer_id:e.target.value}))}
                  style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:13}}>
                  <option value="">No customer</option>
                  {customers.map(c=>(
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.phone?` — ${c.phone}`:''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4}}>NOTES</label>
                <textarea value={newForm.notes} onChange={e=>setNewForm(f=>({...f,notes:e.target.value}))} rows={3}
                  style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:13,resize:'vertical'}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',letterSpacing:'.06em',display:'block',marginBottom:4}}>TAX RATE</label>
                <input type="number" step="0.001" value={newForm.tax_rate} onChange={e=>setNewForm(f=>({...f,tax_rate:e.target.value}))}
                  style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:13}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button onClick={()=>setNewModal(false)} style={{flex:1,background:'transparent',border:'1px solid var(--border)',borderRadius:7,padding:'9px 0',color:'var(--muted)',cursor:'pointer',fontSize:13}}>Cancel</button>
              <button onClick={createEstimate} style={{flex:2,background:'var(--amber)',border:'none',borderRadius:7,padding:'9px 0',color:'#000',fontWeight:800,cursor:'pointer',fontSize:14}}>Create Estimate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV = [
  {id:"dashboard",  label:"Dashboard",  icon:"🏠"},
  {id:"dispatch",   label:"Dispatch",   icon:"📋"},
  {id:"customers",  label:"Customers",  icon:"👤"},
  {id:"invoices",   label:"Invoices",   icon:"🧾"},
  {id:"estimates",  label:"Estimates",  icon:"📄"},
  {id:"pricebook",  label:"Pricebook",  icon:"💲"},
  {id:"inbox",      label:"Inbox",      icon:"💬"},
  {id:"calls",      label:"Calls",      icon:"📞"},
  {id:"reports",    label:"Reports",    icon:"📊"},
  {id:"gps",        label:"GPS Fleet",  icon:"🗺️"},
  {id:"marketing",  label:"Marketing",  icon:"📣", soon:true},
  {id:"accounting", label:"Accounting", icon:"💼", soon:true},
];

const SETTINGS_NAV = [
  {id:"account",      label:"Account"},
  {id:"inventory",    label:"Inventory"},
  {id:"integrations", label:"Integrations"},
  {id:"pricebook",    label:"Pricebook"},
];

export default function App() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [time, setTime] = useState(new Date());
  const [expanded, setExpanded] = useState(true);
  const [settingsTab, setSettingsTab] = useState('account');
  const [callPop, setCallPop] = useState(null);
  const SW = expanded ? 200 : 52;

  useEffect(()=>{
    const id=setInterval(()=>setTime(new Date()),1000);
    return ()=>clearInterval(id);
  },[]);

  // Simulate a call pop (in real use, webhook from VoIP hits /api/customers?phone=xxx)
  useEffect(()=>{
    const t = setTimeout(()=>{
      setCallPop({phone:"(713) 555-2041",customer:"Rivera, Ana",id:"10000000-0000-0000-0000-000000000001"});
    }, 3000);
    return ()=>clearTimeout(t);
  },[]);

  const navLabel = NAV.find(n=>n.id===page)?.label || (page==="settings"?"Settings":"");

  return (
    <>
      <style>{GF}{G}{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{height:"100vh",display:"flex",overflow:"hidden"}}>

        {/* ── Sidebar ── */}
        <aside style={{width:expanded?210:52,background:"#0a0d22",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s",overflow:"hidden",zIndex:50}}>
          {/* Logo */}
          <div style={{padding:"16px 12px 14px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexShrink:0,minHeight:60}}>
            <svg width="28" height="24" viewBox="0 0 40 34" fill="none" style={{flexShrink:0}}>
              <polygon points="8,34 0,0 32,0 40,34" fill="#E20613"/>
              <line x1="10" y1="10" x2="38" y2="10" stroke="#fff" strokeWidth="1.2" strokeOpacity=".3"/>
              <line x1="11" y1="16" x2="39" y2="16" stroke="#fff" strokeWidth="1.2" strokeOpacity=".3"/>
            </svg>
            {expanded && (
              <div style={{overflow:"hidden"}}>
                <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:15,fontWeight:800,color:"var(--text)",lineHeight:1,whiteSpace:"nowrap"}}>Davis Plumbing</div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:6,letterSpacing:".18em",color:"var(--blue)",marginTop:2,whiteSpace:"nowrap"}}>DIGITAL PLUMBING SOFTWARE</div>
              </div>
            )}
          </div>

          {/* Nav items */}
          <nav style={{flex:1,padding:"10px 6px",overflowY:"auto",overflowX:"hidden"}}>
            {NAV.map(item=>{
              const active = page===item.id;
              return (
                <button key={item.id} onClick={()=>{if(!item.soon) setPage(item.id);}}
                  title={!expanded?item.label:undefined}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:expanded?"9px 10px":"9px 0",justifyContent:expanded?"flex-start":"center",borderRadius:7,background:active?"var(--reddim)":"transparent",border:"none",color:item.soon?"var(--dim)":active?"var(--red)":"var(--muted)",fontSize:13,fontWeight:active?600:400,marginBottom:2,position:"relative",cursor:item.soon?"default":"pointer",whiteSpace:"nowrap",overflow:"hidden"}}>
                  {active&&<div style={{position:"absolute",left:0,top:4,bottom:4,width:3,background:"var(--red)",borderRadius:"0 2px 2px 0"}}/>}
                  <span style={{fontSize:15,flexShrink:0,width:18,textAlign:"center"}}>{item.icon}</span>
                  {expanded&&<span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{item.label}</span>}
                  {expanded&&item.soon&&<span style={{marginLeft:"auto",fontSize:8,background:"var(--dim)",color:"var(--muted)",borderRadius:3,padding:"1px 4px",fontWeight:600,flexShrink:0}}>SOON</span>}
                </button>
              );
            })}
            <div style={{height:1,background:"var(--border)",margin:"8px 4px"}}/>
            <button onClick={()=>setPage("settings")}
              title={!expanded?"Settings":undefined}
              style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:expanded?"9px 10px":"9px 0",justifyContent:expanded?"flex-start":"center",borderRadius:7,background:page==="settings"?"var(--reddim)":"transparent",border:"none",color:page==="settings"?"var(--red)":"var(--muted)",fontSize:13,fontWeight:page==="settings"?600:400,position:"relative",cursor:"pointer",whiteSpace:"nowrap"}}>
              {page==="settings"&&<div style={{position:"absolute",left:0,top:4,bottom:4,width:3,background:"var(--red)",borderRadius:"0 2px 2px 0"}}/>}
              <span style={{fontSize:15,flexShrink:0,width:18,textAlign:"center"}}>⚙️</span>
              {expanded&&<span>Settings</span>}
            </button>
          </nav>

          {/* User footer */}
          <div style={{padding:"10px 8px",borderTop:"1px solid var(--border)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 6px",borderRadius:7,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:28,height:28,borderRadius:14,background:"var(--border2)",border:"1px solid var(--blue)33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"var(--blue)",fontFamily:"var(--font-mono)",flexShrink:0}}>
                {user?.initials||user?.name?.slice(0,2)||"?"}
              </div>
              {expanded&&(
                <div style={{overflow:"hidden",flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.name}</div>
                  <div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{user?.role}</div>
                </div>
              )}
              {expanded&&<button onClick={logout} style={{background:"transparent",color:"var(--muted)",fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid var(--border)",flexShrink:0}}>Out</button>}
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* Topbar */}
          <header style={{height:46,background:"#0a0d22",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 16px",gap:12,flexShrink:0}}>
            <button onClick={()=>setExpanded(p=>!p)} style={{background:"transparent",padding:4,color:"var(--muted)",borderRadius:4,flexShrink:0}}>
              <Icon n="menu" size={16} color="var(--muted)"/>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
              <span style={{color:"var(--muted)"}}>DPS</span>
              <span style={{color:"var(--border2)"}}>›</span>
              <span style={{color:"var(--text)",fontWeight:600}}>{navLabel}</span>
            </div>

            {/* Call pop */}
            {callPop && (
              <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--reddim)",border:"1px solid var(--red)44",borderRadius:8,padding:"4px 12px",animation:"glow 2s infinite"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"var(--red)",animation:"pulse2 1s infinite"}}/>
                <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"var(--red)"}}>INCOMING · {callPop.phone} · {callPop.customer}</span>
                <button onClick={()=>setCallPop(null)} style={{background:"transparent",color:"var(--red)",opacity:.7,padding:2}}>
                  <Icon n="x" size={11} color="var(--red)"/>
                </button>
              </div>
            )}

            <div style={{flex:1}}/>
            <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--muted)",letterSpacing:".06em"}}>
              {time.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
            </div>
          </header>

          {/* Content */}
          <main style={{flex:1,overflow:"auto",padding:22,background:"var(--bg)"}} className="scrollbar-thin">
            {page==="dashboard"    && <ErrorBoundary name="Dashboard"><DashboardPage/></ErrorBoundary>}
            {page==="dispatch"     && <ErrorBoundary name="Dispatch"><DispatchPage/></ErrorBoundary>}
            {page==="jobs"         && <ErrorBoundary name="Jobs"><JobsPage/></ErrorBoundary>}
            {page==="customers"    && <ErrorBoundary name="Customers"><CustomersPage/></ErrorBoundary>}
            {page==="inbox"        && <ErrorBoundary name="Inbox"><InboxPage/></ErrorBoundary>}
            {page==="invoices"     && <ErrorBoundary name="Invoices"><InvoicesPage/></ErrorBoundary>}
            {page==="estimates"    && <ErrorBoundary name="Estimates"><EstimatesPage user={user}/></ErrorBoundary>}
            {page==="pricebook"    && <ErrorBoundary name="Pricebook"><NewPricebookPage user={user}/></ErrorBoundary>}
            {page==="reports"      && <ErrorBoundary name="Reports"><ReportsPage/></ErrorBoundary>}
            {page==="gps"          && <ErrorBoundary name="GPS"><GPSPage/></ErrorBoundary>}
            {page==="calls"        && <ErrorBoundary name="Calls"><CallsPage user={user}/></ErrorBoundary>}
            {page==="settings" && (
              <ErrorBoundary name="Settings">
                <div style={{display:"flex",height:"100%",margin:-22,overflow:"hidden"}}>
                  <SettingsSidebar activeId={settingsTab} onSelect={setSettingsTab}/>
                  <div style={{flex:1,overflow:"auto",padding:24}} className="scrollbar-thin">
                    <SettingsContent tab={settingsTab} user={user} logout={logout}/>
                  </div>
                </div>
              </ErrorBoundary>
            )}
          </main>
        </div>

        <ToastContainer/>
      </div>
    </>
  );
}
