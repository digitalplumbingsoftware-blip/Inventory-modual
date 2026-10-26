// ─── ServiceCore Pro brand ───────────────────────────────────
export const BRAND = {
  name: "ServiceCore Pro",
  tagline: "FIELD SERVICE PLATFORM",
  blue: "#5b9cf0",
  orange: "#e07a3f",
  green: "#4fae7e",
  navy: "#0d1527",
};

export function ServiceCoreMark({size=36}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{flexShrink:0}} aria-hidden="true">
      <polygon points="30,8 52.5,21 52.5,47 30,60 7.5,47 7.5,21" fill="#1a2744" stroke="#2a3f66" strokeWidth="1.5"/>
      <polygon points="30,13.5 47.7,23.7 47.7,44.3 30,54.5 12.3,44.3 12.3,23.7" stroke="#3b5a8c" strokeWidth="1" strokeOpacity=".7"/>
      <polygon points="17,32 30,21 43,32" fill={BRAND.blue}/>
      <rect x="20" y="32" width="20" height="12" fill="#24365a"/>
      <rect x="22.5" y="34.5" width="4.5" height="3" fill={BRAND.blue}/>
      <rect x="33" y="34.5" width="4.5" height="3" fill={BRAND.blue}/>
      <rect x="28" y="37" width="4" height="7" fill="#101a30"/>
      <rect x="16" y="45" width="28" height="3" rx="1.5" fill={BRAND.green}/>
      <rect x="19" y="49.5" width="22" height="2.5" rx="1.25" fill={BRAND.green} fillOpacity=".45"/>
      <circle cx="50" cy="14" r="8" stroke={BRAND.orange} strokeWidth="2.6"/>
      <circle cx="50" cy="14" r="3.6" fill={BRAND.orange}/>
      <path d="M50 3v4M50 21v4M39 14h4M57 14h4" stroke={BRAND.orange} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

// Full lockup. `size` is the mark size; text scales from it.
export function ServiceCoreLogo({size=36, expanded=true, tagline=true}) {
  const fs = Math.round(size * 0.5);
  return (
    <div style={{display:"flex",alignItems:"center",gap:Math.round(size*0.28),overflow:"hidden"}}>
      <ServiceCoreMark size={size}/>
      {expanded && (
        <div style={{minWidth:0}}>
          <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",fontSize:fs,fontWeight:800,lineHeight:1,letterSpacing:"-.02em",whiteSpace:"nowrap"}}>
            <span style={{color:"#fff"}}>Service</span><span style={{color:BRAND.blue}}>Core</span>
          </div>
          {tagline && (
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:Math.max(3,Math.round(size*0.1)),whiteSpace:"nowrap"}}>
              <span style={{background:BRAND.orange,color:"#fff",fontFamily:"'DM Sans',system-ui,sans-serif",fontWeight:800,fontSize:Math.max(7,Math.round(fs*0.42)),letterSpacing:".12em",padding:"1px 6px",borderRadius:999,lineHeight:1.4}}>PRO</span>
              <span style={{color:BRAND.green,fontFamily:"'DM Sans',system-ui,sans-serif",fontSize:Math.max(6,Math.round(fs*0.36)),letterSpacing:".2em"}}>• {BRAND.tagline}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

