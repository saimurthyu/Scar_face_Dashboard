import { useState, useEffect, useRef, useCallback } from "react";

const GROQ_MODEL  = "llama-3.3-70b-versatile";
const FINNHUB_KEY = "d73p731r01qjjol3r9q0d73p731r01qjjol3r9qg";
const PROXY       = "https://api.allorigins.win/raw?url=";
let   _groqKey    = "";

const ASSETS = [
  { id:"OIL",  label:"WTI CRUDE",  emoji:"🛢",  color:"#f97316", glow:"rgba(249,115,22,0.15)" },
  { id:"GOLD", label:"XAU/USD",    emoji:"🥇",  color:"#eab308", glow:"rgba(234,179,8,0.15)"  },
  { id:"NQ",   label:"NASDAQ 100", emoji:"📡",  color:"#3b82f6", glow:"rgba(59,130,246,0.15)" },
];

const ASSET_KILLZONES = {
  OIL: [
    { name:"LONDON", start:2,   end:5,   color:"#3b82f6", label:"London Open", note:"Primary — energy market opens, big displacement candles" },
    { name:"NY_AM",  start:7,   end:10,  color:"#22c55e", label:"NY AM",       note:"EIA/inventory data window, London continuation" },
    { name:"ASIAN",  start:20,  end:24,  color:"#8b5cf6", label:"Asian",       note:"Low liquidity — avoid unless news catalyst" },
  ],
  GOLD: [
    { name:"LONDON", start:2,   end:5,   color:"#3b82f6", label:"London Open", note:"Primary — institutional positioning, DXY correlation" },
    { name:"NY_AM",  start:7,   end:10,  color:"#22c55e", label:"NY AM",       note:"CPI/NFP reaction, continuation setups" },
    { name:"NY_PM",  start:13,  end:15,  color:"#eab308", label:"NY PM",       note:"Low probability — macro catalyst only" },
  ],
  NQ: [
    { name:"NY_OPEN", start:9.5, end:11,  color:"#22c55e", label:"NY Open",    note:"Primary — first 90min RTH, highest volume" },
    { name:"NY_PM",   start:13,  end:15,  color:"#eab308", label:"NY PM",      note:"Afternoon reversal, VWAP retest setups" },
    { name:"PRE",     start:8,   end:9.5, color:"#8b5cf6", label:"Pre-Market", note:"Futures gap fill — wait for RTH open" },
  ],
};

const REGIME_COLORS = {
  "RISK-ON":     { bg:"rgba(34,197,94,0.08)",   border:"#22c55e", text:"#4ade80", icon:"🟢" },
  "RISK-OFF":    { bg:"rgba(239,68,68,0.08)",   border:"#ef4444", text:"#f87171", icon:"🔴" },
  "STAGFLATION": { bg:"rgba(249,115,22,0.08)",  border:"#f97316", text:"#fb923c", icon:"🟠" },
  "UNCERTAINTY": { bg:"rgba(168,85,247,0.08)",  border:"#a855f7", text:"#c084fc", icon:"🟣" },
  "NEUTRAL":     { bg:"rgba(100,116,139,0.08)", border:"#64748b", text:"#94a3b8", icon:"⚪" },
};

const BIAS_META = {
  Bullish: { color:"#22c55e", bg:"rgba(34,197,94,0.1)",  border:"rgba(34,197,94,0.4)",  icon:"▲" },
  Bearish: { color:"#ef4444", bg:"rgba(239,68,68,0.1)",  border:"rgba(239,68,68,0.4)",  icon:"▼" },
  Neutral: { color:"#eab308", bg:"rgba(234,179,8,0.1)",  border:"rgba(234,179,8,0.4)",  icon:"◆" },
  Trap:    { color:"#f97316", bg:"rgba(249,115,22,0.1)", border:"rgba(249,115,22,0.4)", icon:"⚡" },
};

const NEWS_IMPACT = {
  high:   { color:"#ef4444", bg:"rgba(239,68,68,0.07)",   border:"rgba(239,68,68,0.2)",   label:"HIGH" },
  medium: { color:"#eab308", bg:"rgba(234,179,8,0.07)",   border:"rgba(234,179,8,0.2)",   label:"MED"  },
  low:    { color:"#64748b", bg:"rgba(100,116,139,0.05)", border:"rgba(100,116,139,0.12)",label:"LOW"  },
};

const TV_LINKS = {
  OIL:  "https://www.tradingview.com/chart/?symbol=NYMEX%3ACL1%21",
  GOLD: "https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD",
  NQ:   "https://www.tradingview.com/chart/?symbol=CME_MINI%3ANQ1%21",
};

const F  = "'JetBrains Mono',monospace";
const FB = "'Bebas Neue',sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Bebas+Neue&display=swap');
@keyframes spin   { to{transform:rotate(360deg)} }
@keyframes pdot   { 0%,100%{opacity:1}50%{opacity:.2} }
@keyframes fadeup { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
@keyframes scanl  { 0%{top:-2px}100%{top:100vh} }
@keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.3)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)} }
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{overscroll-behavior:none;background:#030407}
input,button,select{font-family:'JetBrains Mono',monospace;outline:none;-webkit-appearance:none}
::-webkit-scrollbar{width:0;height:0}
`;

const store = {
  get:(k)=>{ try{ return localStorage.getItem(k)||""; }catch{ return ""; } },
  set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch{} },
  del:(k)=>{ try{ localStorage.removeItem(k); }catch{} },
};

function getNYDecimal(){
  const d=new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"}));
  return d.getHours()+d.getMinutes()/60;
}
function getNYTime(){
  const s=new Date().toLocaleTimeString("en-US",{timeZone:"America/New_York",hour12:false,hour:"2-digit",minute:"2-digit"});
  return s.startsWith("24")?"00"+s.slice(2):s;
}
function fmtHour(h){
  const half=h%1!==0,hr=Math.floor(h);
  const suf=hr>=12?"PM":"AM",h12=hr>12?hr-12:hr===0?12:hr;
  return half?`${h12}:30${suf}`:`${h12}${suf}`;
}
function getKZStatus(assetId){
  const dec=getNYDecimal(),zones=ASSET_KILLZONES[assetId]||[];
  for(const z of zones)if(dec>=z.start&&dec<z.end)return{active:z,minutesLeft:Math.round((z.end-dec)*60)};
  let next=null,minUntil=9999;
  for(const z of zones){let d=z.start-dec;if(d<=0)d+=24;if(d<minUntil){minUntil=d;next=z;}}
  return{active:null,next,minutesUntil:Math.round(minUntil*60)};
}
function isZonePast(z,dec){return z.end<=20&&dec>z.end;}
function getDateStr(off=0){const d=new Date();d.setDate(d.getDate()+off);return d.toISOString().split("T")[0];}
function safeParsePubDate(str){if(!str)return null;const d=new Date(str);return isNaN(d.getTime())?null:d;}
async function fetchJSON(url,opts={},ms=9000){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),ms);
  try{const r=await fetch(url,{...opts,signal:ctrl.signal});clearTimeout(id);return r;}
  catch(e){clearTimeout(id);throw e;}
}

function resolveEffectiveBias(aiBias, priceData){
  const hasPrice = (priceData?.live||priceData?.cached) && priceData?.trend!=null;
  const ohlcStr  = priceData?.ohlcStructure;
  const hasOHLC  = ohlcStr && ohlcStr!=="Unknown" && ohlcStr!=="Neutral";
  const moveStrong = Math.abs(priceData?.change||0)>=1.5;

  const signals = [];
  if(hasOHLC) signals.push({type:"OHLC", value:ohlcStr});
  if(aiBias && aiBias!=="Neutral") signals.push({type:"AI", value:aiBias});
  if(hasPrice && moveStrong) signals.push({type:"PRICE", value:priceData.trend==="bullish"?"Bullish":"Bearish"});

  let finalBias = null;
  let source    = "none";
  if(hasOHLC){ finalBias=ohlcStr; source="ohlc"; }
  else if(hasPrice && moveStrong){ finalBias=priceData.trend==="bullish"?"Bullish":"Bearish"; source="live"; }
  else if(aiBias && aiBias!=="Neutral"){ finalBias=aiBias; source="ai"; }

  if(!finalBias) return{bias:null,overridden:false,source:"none",confidence:"LOW",conflict:false,signals:[]};

  const bullish = signals.filter(s=>s.value==="Bullish").length;
  const bearish = signals.filter(s=>s.value==="Bearish").length;
  const total   = signals.length;
  const majority= Math.max(bullish,bearish);
  let confidence="LOW";
  if(total>=3 && majority===3) confidence="HIGH";
  else if(total>=2 && majority===total) confidence="HIGH";
  else if(total>=2 && majority>=2) confidence="MEDIUM";
  else confidence="LOW";

  const conflict   = signals.length>1 && signals.some(s=>s.value!==finalBias);
  const overridden = aiBias && aiBias!=="Neutral" && finalBias!==aiBias;

  return{bias:finalBias,overridden,source,confidence,conflict,signals};
}

const CACHE_TTL = 5*60*1000;
const _cache    = {};

async function fetchLivePrices(){
  const now=Date.now();
  try{
    const r=await fetchJSON("/api/prices",{},8000);
    if(r.ok){
      const data=await r.json();
      const allLive=["OIL","GOLD","NQ"].every(a=>data[a]?.live);
      if(allLive){
        for(const a of ["OIL","GOLD","NQ"]) _cache[a]={...data[a],fetchedAt:now};
        return data;
      }
    }
  }catch{}
  try{
    const today=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${_groqKey}`},
      body:JSON.stringify({
        model:GROQ_MODEL,temperature:0,max_tokens:200,
        response_format:{type:"json_object"},
        messages:[
          {role:"system",content:`Financial assistant. Today is ${today}. Return ONLY valid JSON.`},
          {role:"user",content:`Current approximate prices for WTI Crude Oil (CL), Gold (GC), Nasdaq 100 (NQ) futures? Return ONLY: {"OIL":{"price":100.93,"change":-0.23},"GOLD":{"price":4547.0,"change":2.59},"NQ":{"price":23132.0,"change":-1.93}}`},
        ],
      }),
    });
    if(r.ok){
      const body=await r.json();
      const raw=body?.choices?.[0]?.message?.content||"";
      const match=raw.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
      if(match){
        const parsed=JSON.parse(match[0]);
        const out={};
        for(const a of ["OIL","GOLD","NQ"]){
          const d=parsed[a];
          if(d?.price!=null&&d?.change!=null){
            const chg=parseFloat(d.change);
            out[a]={price:+parseFloat(d.price).toFixed(2),change:+chg.toFixed(2),trend:chg>=0?"bullish":"bearish",live:true,fetchedAt:now};
            _cache[a]=out[a];
          }
        }
        if(Object.keys(out).length===3)return out;
      }
    }
  }catch{}
  const out={};
  for(const a of ["OIL","GOLD","NQ"]){
    const c=_cache[a];
    out[a]=c&&(now-c.fetchedAt)<CACHE_TTL?{...c,live:false,cached:true}:{price:null,change:null,trend:null,live:false};
  }
  return out;
}

function fgLabel(v){
  if(v<=24)return"Extreme Fear";
  if(v<=44)return"Fear";
  if(v<=55)return"Neutral";
  if(v<=74)return"Greed";
  return"Extreme Greed";
}
async function fetchFearGreed(){
  try{
    const r=await fetchJSON(PROXY+encodeURIComponent("https://feargreedmeter.com/api/v1/fgi/now"),{},6000);
    const d=await r.json();
    const v=parseInt(d?.fgi?.now?.value??d?.value??d?.score);
    if(!isNaN(v)&&v>=0&&v<=100)return{value:v,label:fgLabel(v),live:true,source:"FearGreedMeter"};
  }catch{}
  try{
    const r=await fetchJSON(PROXY+encodeURIComponent("https://production.dataviz.cnn.io/index/fearandgreed/graphdata"),{},7000);
    const d=await r.json();
    const v=Math.round(d?.fear_and_greed?.score??d?.score);
    if(!isNaN(v)&&v>=0&&v<=100)return{value:v,label:d?.fear_and_greed?.rating??fgLabel(v),live:true,source:"CNN"};
  }catch{}
  try{
    const r=await fetchJSON("https://api.alternative.me/fng/?limit=1",{},6000);
    const d=await r.json();
    const v=parseInt(d?.data?.[0]?.value);
    if(!isNaN(v)&&v>=0&&v<=100)return{value:v,label:d.data[0].value_classification,live:true,source:"AltMe"};
  }catch{}
  return{value:10,label:"Extreme Fear",live:false,source:"fallback"};
}

function deriveMomentum(prices){
  const out={};
  for(const a of ASSETS){
    const p=prices?.[a.id];
    if(!p?.live||p.change===null){out[a.id]={change:null,trend:"neutral",strength:"—",live:false};continue;}
    const str=Math.abs(p.change)>=1.5?"STRONG":Math.abs(p.change)>=0.5?"MOD":"WEAK";
    out[a.id]={change:p.change,trend:p.change>=0?"rising":"falling",strength:str,live:true};
  }
  return{data:out,live:Object.values(out).some(x=>x.live)};
}

async function fetchNews(){
  if(FINNHUB_KEY&&FINNHUB_KEY!=="your_finnhub_key_here"){
    try{
      const allNews=[];
      await Promise.allSettled([
        `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,
        `https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_KEY}`,
        `https://finnhub.io/api/v1/company-news?symbol=USO&from=${getDateStr(-3)}&to=${getDateStr()}&token=${FINNHUB_KEY}`,
        `https://finnhub.io/api/v1/company-news?symbol=GLD&from=${getDateStr(-3)}&to=${getDateStr()}&token=${FINNHUB_KEY}`,
        `https://finnhub.io/api/v1/company-news?symbol=QQQ&from=${getDateStr(-3)}&to=${getDateStr()}&token=${FINNHUB_KEY}`,
      ].map(async url=>{
        try{const r=await fetchJSON(url,{},8000);if(r.ok){const d=await r.json();if(Array.isArray(d))allNews.push(...d);}}catch{}
      }));
      const seen=new Set();
      const unique=allNews
        .filter(a=>{if(seen.has(a.headline))return false;seen.add(a.headline);return true;})
        .sort((a,b)=>b.datetime-a.datetime)
        .slice(0,25);
      if(unique.length>2){
        const news=unique.map(a=>({
          title:a.headline||"",link:a.url||"",
          pubDate:new Date(a.datetime*1000).toISOString(),
          description:a.summary||"",source:"Finnhub",
        })).filter(h=>h.title.length>5);
        if(news.length>2)return{news,live:true,fetchedAt:new Date()};
      }
    }catch{}
  }
  const RSS=[
    {url:"https://feeds.bbci.co.uk/news/business/rss.xml",source:"BBC"},
    {url:"https://feeds.marketwatch.com/marketwatch/realtimeheadlines/",source:"MarketWatch"},
    {url:"https://feeds.reuters.com/reuters/businessNews",source:"Reuters"},
    {url:"https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F,CL=F,NQ=F&region=US&lang=en-US",source:"Yahoo"},
    {url:"https://www.investing.com/rss/news_285.rss",source:"Investing"},
  ];
  try{
    const all=[];
    await Promise.allSettled(RSS.map(async feed=>{
      try{
        const r=await fetchJSON(PROXY+encodeURIComponent(feed.url),{},8000);
        if(!r.ok)return;
        const xml=new DOMParser().parseFromString(await r.text(),"text/xml");
        const items=[...xml.querySelectorAll("item")].slice(0,10).map(i=>({
          title:i.querySelector("title")?.textContent?.trim()||"",
          link:i.querySelector("link")?.textContent?.trim()||"",
          pubDate:i.querySelector("pubDate")?.textContent?.trim()||"",
          description:i.querySelector("description")?.textContent?.replace(/<[^>]*>/g,"")?.trim()||"",
          source:feed.source,
        })).filter(h=>h.title.length>5);
        all.push(...items);
      }catch{}
    }));
    if(all.length>0){
      const seen=new Set();
      const unique=all
        .filter(h=>{const k=h.title.slice(0,40).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;})
        .sort((a,b)=>{
          const da=safeParsePubDate(b.pubDate),db=safeParsePubDate(a.pubDate);
          if(!da&&!db)return 0;if(!da)return 1;if(!db)return-1;return da-db;
        }).slice(0,25);
      if(unique.length>0)return{news:unique,live:true,fetchedAt:new Date()};
    }
  }catch{}
  return{news:[],live:false,fetchedAt:new Date()};
}

async function groqAPI(apiKey,messages,max_tokens=1800){
  const r=await fetchJSON("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
    body:JSON.stringify({model:GROQ_MODEL,temperature:0.1,max_tokens,response_format:{type:"json_object"},messages}),
  },32000);
  const body=await r.json();
  if(!r.ok)throw new Error(`Groq ${r.status}: ${body?.error?.message||"unknown"}`);
  const raw=body?.choices?.[0]?.message?.content||"";
  try{return JSON.parse(raw);}
  catch{const m=raw.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);throw new Error("JSON parse failed");}
}

async function analyzeMarket({fg,momentum,news,apiKey,prices}){
  const newsText=news.slice(0,6).map((h,i)=>`${i+1}. ${h.title}`).join("\n");
  const momText=Object.entries(momentum).map(([k,v])=>
    `${k}: ${v.change!==null?(v.change>0?"+":"")+v.change+"% today":"no data"} (${v.trend}, ${v.strength})`
  ).join(", ");

  const priceContext=ASSETS.map(a=>{
    const p=prices?.[a.id];
    if(!p?.price)return`${a.id}: price unknown`;
    const ohlc=p.ohlcStructure?` | OHLC structure: ${p.ohlcStructure}`:"";
    return`${a.id}: $${p.price} (${p.change>0?"+":""}${p.change}% — ${Math.abs(p.change||0)<1.5?"noise":"STRONG"})${ohlc}`;
  }).join("\n");

  const strongConstraints=ASSETS.map(a=>{
    const p=prices?.[a.id];
    if((!p?.live&&!p?.cached)||p.trend==null)return null;
    if(Math.abs(p.change||0)<1.5)return null;
    return`${a.id} strong move ${p.change>0?"+":""}${p.change}% — bias MUST be "${p.trend==="bullish"?"Bullish":"Bearish"}"`;
  }).filter(Boolean);

  const hardRule=strongConstraints.length>0
    ?`\n\nHARD OVERRIDE (strong moves >1.5% only):\n${strongConstraints.join("\n")}\n`:"";

  const ohlcHint=id=>{
    const p=prices?.[id];
    if(p?.ohlcStructure&&p.ohlcStructure!=="Unknown")return p.ohlcStructure;
    if((p?.live||p?.cached)&&Math.abs(p.change||0)>=1.5)return p.trend==="bullish"?"Bullish":"Bearish";
    return"Bearish";
  };

  return groqAPI(apiKey,[
    {role:"system",content:`You are an ICT trading analyst. Use MARKET STRUCTURE and SMART MONEY context to determine bias. Small moves <1.5% are noise — ignore for bias. Return ONLY valid JSON. No markdown.`},
    {role:"user",content:`Analyze OIL, GOLD, NQ futures.${hardRule}\n\nPrices and OHLC structure:\n${priceContext}\n\nFear & Greed: ${fg.value}/100 (${fg.label})\nMomentum: ${momText}\nNews:\n${newsText}\n\nKILLZONES: OIL/GOLD=London 2-5AM or NY AM 7-10AM EST | NQ=NY Open 9:30-11AM or NY PM 1-3PM EST\n\nReturn JSON (real values, no placeholders):\n{"regime":"<RISK-ON|RISK-OFF|STAGFLATION|UNCERTAINTY|NEUTRAL>","regime_reason":"<sentence>","correlation_warning":"<sentence or null>","dxy_bias":"<Bullish|Bearish|Neutral>","dxy_reason":"<sentence>","session_note":"<sentence>","smart_money_note":"<sentence>","assets":{"OIL":{"bias":"${ohlcHint("OIL")}","confidence":"<High|Medium|Low>","structure":"<real structure description>","move_type":"<3-5 words>","approach":"<specific entry stop target>","sentiment_edge":"<Bullish|Bearish>","crowd_vs_smart":"<With crowd|Against crowd>","smt_signal":"<Confirming|Diverging|Neutral>","smt_note":"<sentence>","dxy_impact":"<Headwind|Tailwind|Neutral>","killzone_edge":"<session>","key_level_bull":"<price near current>","key_level_bear":"<price near current>","bullish_real_pct":60,"bullish_trap_pct":40,"bearish_real_pct":65,"bearish_trap_pct":35},"GOLD":{"bias":"${ohlcHint("GOLD")}","confidence":"<High|Medium|Low>","structure":"<sentence>","move_type":"<3-5 words>","approach":"<sentence>","sentiment_edge":"<Bullish|Bearish>","crowd_vs_smart":"<With crowd|Against crowd>","smt_signal":"<Confirming|Diverging|Neutral>","smt_note":"<sentence>","dxy_impact":"<Headwind|Tailwind|Neutral>","killzone_edge":"<session>","key_level_bull":"<price>","key_level_bear":"<price>","bullish_real_pct":65,"bullish_trap_pct":35,"bearish_real_pct":30,"bearish_trap_pct":70},"NQ":{"bias":"${ohlcHint("NQ")}","confidence":"<High|Medium|Low>","structure":"<sentence>","move_type":"<3-5 words>","approach":"<sentence>","sentiment_edge":"<Bullish|Bearish>","crowd_vs_smart":"<With crowd|Against crowd>","smt_signal":"<Confirming|Diverging|Neutral>","smt_note":"<sentence>","dxy_impact":"<Headwind|Tailwind|Neutral>","killzone_edge":"<session>","key_level_bull":"<price>","key_level_bear":"<price>","bullish_real_pct":25,"bullish_trap_pct":75,"bearish_real_pct":75,"bearish_trap_pct":25}},"pair_trade":"<sentence>","risk_event":"<sentence>","macro_summary":"<two sentences>"}`},
  ],2000);
}

async function analyzeNews({news,apiKey}){
  const newsText=news.map((h,i)=>`${i+1}. TITLE: ${h.title}\nDESC: ${h.description||"N/A"}`).join("\n\n");
  return groqAPI(apiKey,[
    {role:"system",content:"ICT futures analyst. Return ONLY valid JSON."},
    {role:"user",content:`Analyze headlines for OIL, GOLD, NQ impact.\nHeadlines:\n${newsText}\nJSON: {"analyzed":[{"title":"","impact_level":"high","assets":["OIL"],"direction":{"OIL":"bullish","GOLD":"neutral","NQ":"neutral"},"reason":"","category":"geopolitical"}],"market_summary":"2 sentences","top_risk":"sentence","top_opportunity":"sentence"}`},
  ],2200);
}

function useMarket(apiKey){
  const [state,setState]=useState({
    status:"idle",market:null,news:[],momentum:{},prices:{},
    fg:{value:10,label:"Extreme Fear",live:false,source:""},
    newsLive:false,momentumLive:false,fgLive:false,pricesLive:false,
    lastMarketUpdate:null,lastNewsUpdate:null,error:null,log:[],
  });
  const timerRef=useRef(null);

  const addLog=useCallback(msg=>setState(s=>({...s,log:[...s.log.slice(-12),`${getNYTime()} ${msg}`]})),[]);

  const refreshNews=useCallback(async()=>{
    addLog("📡 Fetching news...");
    try{
      const{news,live,fetchedAt}=await fetchNews();
      addLog(`News: ${news.length} — ${live?"live":"fallback"}`);
      setState(s=>({...s,news,newsLive:live,lastNewsUpdate:fetchedAt}));
      return news;
    }catch(e){addLog(`❌ News: ${e.message}`);return[];}
  },[addLog]);

  const refreshPricesOnly=useCallback(async()=>{
    if(!apiKey||apiKey.length<20)return;
    try{
      const prices=await fetchLivePrices();
      const anyLive=Object.values(prices).some(p=>p.live||p.cached);
      if(!anyLive)return;
      const{data:momentum,live:momentumLive}=deriveMomentum(prices);
      setState(s=>{
        if(!s.market)return{...s,prices,momentum,momentumLive,pricesLive:true};
        const fixed={...s.market,assets:{...s.market.assets}};
        for(const a of ASSETS){
          const asset=fixed.assets?.[a.id];if(!asset)continue;
          const p=prices[a.id];if(!p?.live&&!p?.cached)continue;
          const{bias:newBias}=resolveEffectiveBias(asset.bias,p);
          if(newBias&&asset.bias!==newBias)fixed.assets[a.id]={...asset,bias:newBias};
        }
        return{...s,prices,momentum,momentumLive,pricesLive:true,market:fixed};
      });
    }catch{}
  },[apiKey]);

  const refresh=useCallback(async()=>{
    if(!apiKey||apiKey.length<20)return;
    setState(s=>({...s,status:"fetching",error:null}));
    try{
      addLog("📡 Fetching Fear & Greed...");
      const fg=await fetchFearGreed();
      addLog(`F&G: ${fg.value} (${fg.label}) — ${fg.source}`);

      addLog("📡 Fetching prices + OHLC...");
      const prices=await fetchLivePrices();
      const pLog=ASSETS.map(a=>{const p=prices[a.id];return`${a.id}:${p?.live?p.change+"%":p?.cached?"CACHE":"FAIL"}${p?.ohlcStructure?" ["+p.ohlcStructure+"]":""}`;}).join(" ");
      addLog(`Prices: ${pLog}`);

      const{data:momentum,live:momentumLive}=deriveMomentum(prices);

      addLog("📡 Fetching news...");
      const{news,live:newsLive,fetchedAt}=await fetchNews();
      addLog(`News: ${news.length} — ${newsLive?"live":"fallback"}`);

      setState(s=>({...s,fg,momentum,prices,news,newsLive,momentumLive,
        fgLive:fg.live,pricesLive:Object.values(prices).some(p=>p.live),
        status:"analyzing",lastNewsUpdate:fetchedAt}));

      addLog("🤖 Running ICT analysis...");
      const market=await analyzeMarket({fg,momentum,news,apiKey,prices});
      addLog("✅ Done.");

      setState(s=>({...s,market,prices,status:"live",lastMarketUpdate:new Date(),error:null}));

      clearInterval(timerRef.current);
      timerRef.current=setInterval(()=>refreshPricesOnly(),5*60*1000);

    }catch(e){
      const msg=e?.message||String(e);
      addLog(`❌ ERROR: ${msg}`);
      setState(s=>({...s,status:"error",error:msg}));
    }
  },[apiKey,addLog,refreshPricesOnly]);

  useEffect(()=>{
    if(!apiKey||apiKey.length<=20)return;
    refresh();
    return()=>clearInterval(timerRef.current);
  },[apiKey]); // eslint-disable-line

  return{...state,refresh,refreshNews};
}

const Dot=({color,pulse,size=7})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:color,boxShadow:`0 0 ${size+2}px ${color}`,flexShrink:0,animation:pulse?"pdot 1.8s ease-in-out infinite":"none"}}/>
);
const Bar=({pct,color,h=5})=>{
  const w=Math.min(Math.max(pct,0),100);
  return(
    <div style={{height:h,background:"rgba(255,255,255,0.05)",borderRadius:h,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${w}%`,background:`linear-gradient(90deg,${color}55,${color})`,borderRadius:h,transition:"width 1.2s ease"}}/>
    </div>
  );
};
const Spinner=({size=18})=>(
  <div style={{width:size,height:size,border:"2px solid rgba(255,255,255,0.08)",borderTop:"2px solid #3b82f6",borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>
);
const ImpactDot=({level})=>{
  const c=level==="high"?"#ef4444":level==="medium"?"#eab308":"#64748b";
  return <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}`,flexShrink:0}}/>;
};

function KZBadge({assetId}){
  const[kz,setKz]=useState(()=>getKZStatus(assetId));
  useEffect(()=>{const t=setInterval(()=>setKz(getKZStatus(assetId)),20000);return()=>clearInterval(t);},[assetId]);
  const a=kz.active;
  return a?(
    <div style={{display:"flex",alignItems:"center",gap:5,background:`${a.color}12`,border:`1px solid ${a.color}35`,borderRadius:8,padding:"4px 10px"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:a.color,animation:"pdot 1.5s ease-in-out infinite"}}/>
      <span style={{fontFamily:F,fontSize:10,color:a.color,letterSpacing:1}}>{a.label} ACTIVE — {kz.minutesLeft}m</span>
    </div>
  ):(
    <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(100,116,139,0.07)",border:"1px solid rgba(100,116,139,0.15)",borderRadius:8,padding:"4px 10px"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:"#475569"}}/>
      <span style={{fontFamily:F,fontSize:10,color:"#64748b",letterSpacing:1}}>Dead Zone — {kz.next?.label} in {kz.minutesUntil}m</span>
    </div>
  );
}

function KZCard({asset}){
  const[kz,setKz]=useState(()=>getKZStatus(asset.id));
  const[ny,setNy]=useState(getNYTime);
  useEffect(()=>{const t=setInterval(()=>{setKz(getKZStatus(asset.id));setNy(getNYTime());},20000);return()=>clearInterval(t);},[asset.id]);
  const a=kz.active,zones=ASSET_KILLZONES[asset.id]||[],dec=getNYDecimal();
  return(
    <div style={{background:"rgba(5,7,15,0.98)",border:`1px solid ${asset.color}20`,borderTop:`3px solid ${asset.color}`,borderRadius:16,padding:16,boxShadow:`0 4px 20px ${asset.glow}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>{asset.emoji}</span>
          <div>
            <div style={{fontFamily:FB,fontSize:24,letterSpacing:4,color:"#fff",lineHeight:1}}>{asset.id}</div>
            <div style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.2)"}}>{asset.label}</div>
          </div>
        </div>
        <div style={{fontFamily:FB,fontSize:18,color:"rgba(255,255,255,0.35)",letterSpacing:2}}>{ny}</div>
      </div>
      {a?(
        <div style={{background:`${a.color}10`,border:`1px solid ${a.color}40`,borderRadius:12,padding:"13px 15px",marginBottom:12,animation:"glow 2.5s ease-in-out infinite"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:a.color,animation:"pdot 1.4s ease-in-out infinite"}}/>
                <span style={{fontFamily:F,fontSize:11,letterSpacing:2,color:a.color}}>ACTIVE NOW</span>
              </div>
              <div style={{fontFamily:FB,fontSize:26,color:a.color,letterSpacing:3,lineHeight:1}}>{a.label.toUpperCase()}</div>
              <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:5,lineHeight:1.5}}>{a.note}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
              <div style={{fontFamily:FB,fontSize:38,color:a.color,lineHeight:1}}>{kz.minutesLeft}</div>
              <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.2)"}}>min left</div>
            </div>
          </div>
        </div>
      ):(
        <div style={{background:"rgba(100,116,139,0.06)",border:"1px solid rgba(100,116,139,0.15)",borderRadius:12,padding:"13px 15px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:FB,fontSize:22,color:"#64748b",letterSpacing:3}}>DEAD ZONE</div>
            <div style={{fontFamily:F,fontSize:10,color:"rgba(100,116,139,0.45)",marginTop:4}}>Avoid trading {asset.id} now</div>
            <div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.28)",marginTop:5}}>Next: <span style={{color:kz.next?.color||"#94a3b8"}}>{kz.next?.label}</span></div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
            <div style={{fontFamily:FB,fontSize:32,color:"#475569",lineHeight:1}}>{kz.minutesUntil}</div>
            <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.18)"}}>min away</div>
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {zones.map(z=>{
          const isActive=a?.name===z.name,past=!isActive&&isZonePast(z,dec);
          return(
            <div key={z.name} style={{display:"flex",alignItems:"center",gap:10,background:isActive?`${z.color}10`:"rgba(255,255,255,0.015)",border:`1px solid ${isActive?z.color+"40":"rgba(255,255,255,0.05)"}`,borderRadius:9,padding:"9px 12px",opacity:past?0.35:1}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:isActive?z.color:`${z.color}45`,boxShadow:isActive?`0 0 8px ${z.color}`:"none",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:F,fontSize:11,color:isActive?z.color:"rgba(255,255,255,0.38)",letterSpacing:1}}>{z.label}</span>
                  <span style={{fontFamily:FB,fontSize:14,color:isActive?z.color:"rgba(255,255,255,0.22)"}}>{fmtHour(z.start)}–{fmtHour(z.end)}</span>
                </div>
                {isActive&&<div style={{fontFamily:F,fontSize:9,color:`${z.color}75`,marginTop:3,lineHeight:1.4}}>{z.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FearGauge({value,label,live,source}){
  const pct=Math.max(0,Math.min(100,value??10));
  const ang=(pct/100)*180,rad=(ang-90)*Math.PI/180;
  const cx=75,cy=68,r=52,ex=cx+r*Math.cos(rad),ey=cy+r*Math.sin(rad);
  const color=pct<25?"#ef4444":pct<45?"#f97316":pct<55?"#eab308":pct<75?"#22c55e":"#16a34a";
  return(
    <div style={{background:"rgba(6,8,16,0.97)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:18}}>
      <svg width="148" height="80" viewBox="0 0 150 80">
        <path d={`M14,74 A${r},${r} 0 0,1 ${cx*2-14},74`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="13" strokeLinecap="round"/>
        {["#ef4444","#f97316","#eab308","#22c55e","#16a34a"].map((c,i)=>{
          const sa=(i*36-90)*Math.PI/180,ea=(i*36+33-90)*Math.PI/180;
          return<path key={i} d={`M${cx+r*Math.cos(sa)},${cy+r*Math.sin(sa)} A${r},${r} 0 0,1 ${cx+r*Math.cos(ea)},${cy+r*Math.sin(ea)}`} fill="none" stroke={c} strokeWidth="13" opacity="0.2"/>;
        })}
        <path d={`M14,74 A${r},${r} 0 ${pct>50?1:0},1 ${ex},${ey}`} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" style={{filter:`drop-shadow(0 0 6px ${color})`}}/>
        <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={color} strokeWidth="3" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="5" fill={color}/>
      </svg>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
          <Dot color={live?"#22c55e":"#475569"} pulse={live} size={6}/>
          <span style={{fontFamily:F,fontSize:10,letterSpacing:2,color:"rgba(255,255,255,0.22)"}}>FEAR & GREED</span>
          {source&&<span style={{fontFamily:F,fontSize:8,color:"rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:4,padding:"1px 5px",letterSpacing:1}}>{source.toUpperCase()}</span>}
        </div>
        <div style={{fontFamily:FB,fontSize:52,color,lineHeight:1}}>{value}</div>
        <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.3)",letterSpacing:1,marginTop:3}}>{(label||"").toUpperCase()}</div>
      </div>
    </div>
  );
}

function DXYStrip({data}){
  if(!data?.dxy_bias)return null;
  const b=data.dxy_bias;
  const color=b==="Bullish"?"#22c55e":b==="Bearish"?"#ef4444":"#eab308";
  return(
    <div style={{background:"rgba(6,8,16,0.97)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:14}}>
      <span style={{fontFamily:F,fontSize:10,letterSpacing:2,color:"rgba(255,255,255,0.25)",flexShrink:0}}>DXY</span>
      <span style={{fontFamily:FB,fontSize:20,color,flexShrink:0}}>{b==="Bullish"?"▲":b==="Bearish"?"▼":"◆"} {b.toUpperCase()}</span>
      <div style={{width:1,height:20,background:"rgba(255,255,255,0.08)",flexShrink:0}}/>
      <span style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.38)",lineHeight:1.55,flex:1}}>{data.dxy_reason}</span>
    </div>
  );
}

function RegimeBanner({data}){
  if(!data?.regime)return null;
  const c=REGIME_COLORS[data.regime]||REGIME_COLORS["NEUTRAL"];
  return(
    <div style={{background:c.bg,border:`1px solid ${c.border}30`,borderLeft:`4px solid ${c.border}`,borderRadius:14,padding:"14px 16px",animation:"fadeup .4s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
        <span style={{fontSize:18}}>{c.icon}</span>
        <span style={{fontFamily:F,fontSize:13,letterSpacing:3,color:c.text}}>{data.regime}</span>
      </div>
      <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.45)",lineHeight:1.65}}>{data.regime_reason}</div>
      {data.smart_money_note&&<div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.3)",borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:9,marginTop:9,lineHeight:1.6}}>💼 {data.smart_money_note}</div>}
    </div>
  );
}

function MomentumStrip({momentum,live}){
  return(
    <div style={{background:"rgba(6,8,16,0.97)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
        <Dot color={live?"#22c55e":"#475569"} pulse={live} size={6}/>
        <span style={{fontFamily:F,fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.2)"}}>MOMENTUM</span>
      </div>
      {ASSETS.map(a=>{
        const d=momentum[a.id];
        if(!d?.live)return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:4,opacity:0.35}}><span style={{fontSize:12}}>{a.emoji}</span><span style={{fontFamily:F,fontSize:10,color:"#64748b"}}>—</span></div>);
        const up=d.trend==="rising";
        const col=d.strength==="STRONG"?(up?"#22c55e":"#ef4444"):d.strength==="MOD"?(up?"#4ade80":"#f87171"):"#94a3b8";
        return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:12}}>{a.emoji}</span><span style={{fontFamily:F,fontSize:10,color:col}}>{up?"▲":"▼"}{Math.abs(d.change)}%</span><span style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.18)"}}>{d.strength}</span></div>);
      })}
    </div>
  );
}

function AssetCard({asset,data,price}){
  const[open,setOpen]=useState(false);
  const{bias:effectiveBias,overridden,source,confidence,conflict,signals}=resolveEffectiveBias(data?.bias,price);
  const displayBias=effectiveBias||(price?.live||price?.cached?(price.trend==="bullish"?"Bullish":"Bearish"):null);
  const bm=BIAS_META[displayBias]||BIAS_META.Neutral;
  const smtC=data?.smt_signal==="Diverging"?"#f97316":data?.smt_signal==="Confirming"?"#22c55e":"#64748b";
  const priceColor=(price?.live||price?.cached)?(price.trend==="bullish"?"#22c55e":"#ef4444"):"#94a3b8";
  const confColor=confidence==="HIGH"?"#22c55e":confidence==="MEDIUM"?"#eab308":"#ef4444";

  return(
    <div style={{background:"rgba(5,7,15,0.98)",border:"1px solid rgba(255,255,255,0.06)",borderTop:`3px solid ${asset.color}`,borderRadius:16,overflow:"hidden",boxShadow:`0 4px 24px ${asset.glow}`,animation:"fadeup .35s ease"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:16,textAlign:"left"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>{asset.emoji}</span>
            <div>
              <div style={{fontFamily:FB,fontSize:26,letterSpacing:4,color:"#fff",lineHeight:1}}>{asset.id}</div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:3}}>
                <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.2)"}}>{asset.label}</span>
                {(price?.live||price?.cached)&&(
                  <span style={{fontFamily:F,fontSize:10,color:priceColor}}>
                    {price.trend==="bullish"?"▲":"▼"}{price.change>0?"+":""}{price.change}%
                    {price.cached&&<span style={{fontSize:8,opacity:0.5}}> ↺</span>}
                  </span>
                )}
                {price?.price&&(
                  <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.3)"}}>
                    ${price.price.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          {displayBias&&(
            <div style={{background:bm.bg,border:`1px solid ${bm.border}`,borderRadius:8,padding:"5px 12px",flexShrink:0,maxWidth:180}}>
              <div style={{fontFamily:F,fontSize:11,letterSpacing:1,color:bm.color}}>
                {bm.icon} {source==="ohlc"?"OHLC":source==="live"||source==="cached"?"LIVE":"AI"}: {displayBias}
              </div>
              {overridden&&data?.bias&&<div style={{fontFamily:F,fontSize:9,color:"#f97316",marginTop:2}}>AI was {data.bias} ↺</div>}
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,flexWrap:"wrap"}}>
          <KZBadge assetId={asset.id}/>
          {confidence&&(
            <div style={{background:`${confColor}12`,border:`1px solid ${confColor}30`,borderRadius:7,padding:"3px 9px"}}>
              <span style={{fontFamily:F,fontSize:9,color:confColor,letterSpacing:1}}>
                {confidence==="HIGH"?"✅ HIGH":confidence==="MEDIUM"?"⚠️ MEDIUM":"🔴 LOW"} CONF
              </span>
            </div>
          )}
        </div>
        {conflict&&(
          <div style={{marginTop:8,background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"7px 11px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{color:"#ef4444",flexShrink:0,fontSize:13}}>⚠</span>
            <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.5)",lineHeight:1.6}}>
              <span style={{color:"#f87171"}}>SIGNAL CONFLICT — WAIT FOR ALIGNMENT: </span>
              {signals.map(s=>s.type+"="+s.value).join(" · ")}
            </div>
          </div>
        )}
        {data&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
            <span style={{fontFamily:F,fontSize:12,color:asset.color}}>{data.move_type}</span>
            <span style={{fontSize:18,color:"rgba(255,255,255,0.18)"}}>{open?"▲":"▼"}</span>
          </div>
        )}
      </button>

      {open&&(
        <div style={{padding:"0 16px 18px",display:"flex",flexDirection:"column",gap:12,animation:"fadeup .22s ease"}}>
          <a href={TV_LINKS[asset.id]} target="_blank" rel="noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:10,padding:"10px 14px",textDecoration:"none",color:"#60a5fa",fontFamily:F,fontSize:11,letterSpacing:1}}>
            📈 Open Live {asset.id} Chart on TradingView ↗
          </a>
          {price?.ohlcStructure&&price.ohlcStructure!=="Unknown"&&(
            <div style={{background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",borderLeft:"3px solid #3b82f6",borderRadius:10,padding:"10px 13px"}}>
              <div style={{fontFamily:F,fontSize:9,color:"#60a5fa",letterSpacing:2,marginBottom:4}}>📐 REAL OHLC STRUCTURE</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontFamily:F,fontSize:13,fontWeight:700,color:price.ohlcStructure==="Bullish"?"#22c55e":price.ohlcStructure==="Bearish"?"#ef4444":"#eab308"}}>
                  {price.ohlcStructure==="Bullish"?"▲ BULLISH":price.ohlcStructure==="Bearish"?"▼ BEARISH":"◆ NEUTRAL"} STRUCTURE
                </span>
              </div>
              {price.structureDetail&&<div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.5)",lineHeight:1.6}}>{price.structureDetail}</div>}
              {price.rangeHigh&&price.rangeLow&&(
                <div style={{display:"flex",gap:12,marginTop:8}}>
                  <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.3)"}}>High: <span style={{color:"#22c55e"}}>${price.rangeHigh.toLocaleString()}</span></span>
                  <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.3)"}}>Low: <span style={{color:"#ef4444"}}>${price.rangeLow.toLocaleString()}</span></span>
                </div>
              )}
            </div>
          )}
          {signals&&signals.length>0&&(
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 13px"}}>
              <div style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:2,marginBottom:8}}>SIGNAL BREAKDOWN</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {signals.map((s,i)=>{
                  const sc=s.value==="Bullish"?"#22c55e":s.value==="Bearish"?"#ef4444":"#eab308";
                  const label=s.type==="OHLC"?"📐 Real OHLC":s.type==="AI"?"🤖 AI":"📊 Momentum";
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.45)"}}>{label}</span>
                      <span style={{fontFamily:F,fontSize:11,color:sc,background:`${sc}15`,border:`1px solid ${sc}30`,borderRadius:5,padding:"2px 8px"}}>
                        {s.value==="Bullish"?"▲":"▼"} {s.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[{l:"SENTIMENT",v:data.sentiment_edge},{l:"VS CROWD",v:data.crowd_vs_smart},{l:"BULL LEVEL",v:data.key_level_bull},{l:"BEAR LEVEL",v:data.key_level_bear}].map(f=>{
                  const c=f.v?.includes("Bull")||f.v?.includes("With")?"#22c55e":f.v?.includes("Bear")||f.v?.includes("Against")?"#ef4444":"#eab308";
                  return(
                    <div key={f.l} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.2)",marginBottom:4}}>{f.l}</div>
                      <div style={{fontFamily:F,fontSize:13,color:c||"rgba(255,255,255,0.7)"}}>{f.v}</div>
                    </div>
                  );
                })}
              </div>
              {data.smt_note&&(
                <div style={{background:`${smtC}08`,border:`1px solid ${smtC}25`,borderRadius:10,padding:"11px 13px"}}>
                  <div style={{fontFamily:F,fontSize:10,color:smtC,marginBottom:4}}>SMT — {data.smt_signal?.toUpperCase()}</div>
                  <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.5)",lineHeight:1.65}}>{data.smt_note}</div>
                </div>
              )}
              <div style={{background:`linear-gradient(135deg,${bm.bg},transparent)`,border:`1px solid ${bm.border}`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontFamily:F,fontSize:10,color:bm.color,letterSpacing:2,marginBottom:6}}>APPROACH</div>
                <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.7}}>{data.approach}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewsTab({rawNews,newsLive,lastUpdate,apiKey,onRefreshNews}){
  const[analysis,setAnalysis]=useState({status:"idle",data:null,error:null});
  const[filter,setFilter]=useState("ALL");
  const[refreshing,setRefreshing]=useState(false);

  const handleRefresh=async()=>{
    setRefreshing(true);
    await onRefreshNews();
    setRefreshing(false);
    if(analysis.status==="done")setAnalysis({status:"idle",data:null,error:null});
  };
  const handleScan=async()=>{
    if(!rawNews?.length)return;
    setAnalysis({status:"loading",data:null,error:null});
    try{const data=await analyzeNews({news:rawNews,apiKey});setAnalysis({status:"done",data,error:null});}
    catch(e){setAnalysis({status:"error",data:null,error:e.message});}
  };

  const filters=["ALL","OIL","GOLD","NQ","🔴 HIGH"];
  const analyzed=analysis.data?.analyzed||[];
  const filtered=analyzed.filter(h=>{
    if(filter==="ALL")return true;
    if(filter==="🔴 HIGH")return h.impact_level==="high";
    return h.assets?.includes(filter);
  });
  const catColor={geopolitical:"#ef4444",central_bank:"#8b5cf6",economic_data:"#3b82f6",earnings:"#22c55e",energy:"#f97316",inflation:"#eab308",currency:"#06b6d4",other:"#64748b"};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:"rgba(5,7,15,0.98)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:FB,fontSize:24,letterSpacing:4,color:"#fff",lineHeight:1}}>NEWS SCANNER</div>
            <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:4}}>
              {lastUpdate?`Updated ${lastUpdate.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})} EST`:"Not yet loaded"}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Dot color={newsLive?"#22c55e":"#475569"} pulse={newsLive} size={6}/>
            <span style={{fontFamily:F,fontSize:9,color:newsLive?"#22c55e":"#64748b",letterSpacing:1}}>{newsLive?"LIVE":"DEMO"}</span>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:10,padding:"12px",color:refreshing?"rgba(255,255,255,0.2)":"#60a5fa",fontFamily:FB,fontSize:16,letterSpacing:2,cursor:refreshing?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {refreshing?<><Spinner size={14}/> LOADING</>:"🔄 REFRESH"}
          </button>
          <button onClick={handleScan} disabled={analysis.status==="loading"||!rawNews?.length}
            style={{background:analysis.status==="loading"?"rgba(255,255,255,0.04)":"linear-gradient(135deg,#f97316,#eab308)",border:"none",borderRadius:10,padding:"12px",color:analysis.status==="loading"?"rgba(255,255,255,0.2)":"#000",fontFamily:FB,fontSize:16,letterSpacing:2,cursor:(analysis.status==="loading"||!rawNews?.length)?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {analysis.status==="loading"?<><Spinner size={14}/> SCANNING</>:"📡 AI SCAN"}
          </button>
        </div>
        {analysis.error&&<div style={{fontFamily:F,fontSize:11,color:"#f87171",background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:8,padding:"8px 12px"}}>{analysis.error}</div>}
      </div>

      <div style={{background:"rgba(6,8,16,0.97)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontFamily:F,fontSize:10,letterSpacing:2,color:"rgba(255,255,255,0.25)"}}>📰 HEADLINES ({rawNews?.length||0})</div>
        {!rawNews?.length&&<div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.25)",textAlign:"center",padding:"12px 0"}}>Tap REFRESH to load headlines</div>}
        {(rawNews||[]).map((h,i)=>{
          const pd=safeParsePubDate(h.pubDate);
          return(
            <div key={i} style={{paddingLeft:12,borderLeft:"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.5}}>{h.title}</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {pd&&<span style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.18)"}}>{pd.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",timeZone:"America/New_York"})} EST</span>}
                {h.source&&<span style={{fontFamily:F,fontSize:8,color:"rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:4,padding:"1px 5px",letterSpacing:1}}>{h.source.toUpperCase()}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {analysis.status==="done"&&analysis.data&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeup .3s ease"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontFamily:F,fontSize:9,letterSpacing:2,color:"#ef4444",marginBottom:6}}>🎯 TOP RISK</div>
              <div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.55)",lineHeight:1.6}}>{analysis.data.top_risk}</div>
            </div>
            <div style={{background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.15)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontFamily:F,fontSize:9,letterSpacing:2,color:"#22c55e",marginBottom:6}}>⚡ TOP SETUP</div>
              <div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.55)",lineHeight:1.6}}>{analysis.data.top_opportunity}</div>
            </div>
          </div>
          <div style={{background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.15)",borderLeft:"3px solid #3b82f6",borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontFamily:F,fontSize:9,letterSpacing:2,color:"#60a5fa",marginBottom:6}}>📡 MARKET READ</div>
            <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.5)",lineHeight:1.7}}>{analysis.data.market_summary}</div>
          </div>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
            {filters.map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{background:filter===f?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${filter===f?"rgba(59,130,246,0.4)":"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"7px 14px",color:filter===f?"#60a5fa":"rgba(255,255,255,0.3)",fontFamily:F,fontSize:10,letterSpacing:1,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                {f}
              </button>
            ))}
          </div>
          {filtered.map((h,i)=>{
            const imp=NEWS_IMPACT[h.impact_level]||NEWS_IMPACT.low;
            const cc=catColor[h.category]||"#64748b";
            return(
              <div key={i} style={{background:imp.bg,border:`1px solid ${imp.border}`,borderRadius:14,padding:14,display:"flex",flexDirection:"column",gap:10,animation:"fadeup .25s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <ImpactDot level={h.impact_level}/>
                    <span style={{fontFamily:F,fontSize:9,letterSpacing:2,color:imp.color}}>{imp.label} IMPACT</span>
                  </div>
                  <span style={{background:`${cc}12`,border:`1px solid ${cc}25`,borderRadius:5,padding:"2px 7px",fontFamily:F,fontSize:8,color:cc,letterSpacing:1}}>{(h.category||"").replace("_"," ").toUpperCase()}</span>
                </div>
                <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.75)",lineHeight:1.55}}>{h.title}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {(h.assets||[]).map(id=>{
                    const ast=ASSETS.find(a=>a.id===id);
                    const dir=h.direction?.[id];
                    const dc=dir==="bullish"?"#22c55e":dir==="bearish"?"#ef4444":"#64748b";
                    return(
                      <div key={id} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:6,padding:"3px 8px"}}>
                        <span style={{fontSize:11}}>{ast?.emoji}</span>
                        <span style={{fontFamily:F,fontSize:9,color:dc}}>{dir==="bullish"?"▲":dir==="bearish"?"▼":"→"} {id}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.42)",lineHeight:1.6,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:8}}>💡 {h.reason}</div>
              </div>
            );
          })}
          {filtered.length===0&&<div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.25)",textAlign:"center",padding:"16px 0"}}>No headlines match.</div>}
        </div>
      )}
      {analysis.status==="idle"&&rawNews?.length>0&&(
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"22px 16px",textAlign:"center",display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
          <div style={{fontSize:30}}>📡</div>
          <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.3)",lineHeight:1.7}}>Tap <span style={{color:"#f97316"}}>AI SCAN</span> to analyze headlines.</div>
        </div>
      )}
    </div>
  );
}

function confIcon(c){ return c==="HIGH"?"✅":c==="MEDIUM"?"⚠️":"🔴"; }

function BiasTab({market,prices}){
  const[userBias,setUserBias]=useState({OIL:null,GOLD:null,NQ:null});
  if(!market)return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"28px 16px",textAlign:"center",fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.3)",lineHeight:1.7}}>
      Tap ↻ on the Intel tab to load analysis first.
    </div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {ASSETS.map(a=>{
        const d=market?.assets?.[a.id],ub=userBias[a.id],p=prices?.[a.id];
        const{bias:effectiveBias,overridden,source,confidence,conflict,signals}=resolveEffectiveBias(d?.bias,p);
        const displayBias=p?.live||p?.cached?(Math.abs(p.change||0)>=1.5?(p.trend==="bullish"?"Bullish":"Bearish"):effectiveBias):effectiveBias;
        const ebm=BIAS_META[displayBias]||BIAS_META.Neutral;
        const priceColor=p?.trend==="bullish"?"#22c55e":"#ef4444";
        const confColor=confidence==="HIGH"?"#22c55e":confidence==="MEDIUM"?"#eab308":"#ef4444";

        let realPct=null,trapPct=null;
        if(ub&&d){
          const rv=d[ub==="Bullish"?"bullish_real_pct":"bearish_real_pct"];
          const tv=d[ub==="Bullish"?"bullish_trap_pct":"bearish_trap_pct"];
          if(typeof rv==="number"&&typeof tv==="number"){
            const total=rv+tv;
            realPct=total>0?Math.round((rv/total)*100):50;
            trapPct=100-realPct;
          }
        }
        const hasPcts=realPct!==null,isReal=hasPcts&&realPct>=trapPct;
        const showAlign=ub!==null&&(displayBias==="Bullish"||displayBias==="Bearish");

        return(
          <div key={a.id} style={{background:"rgba(5,7,15,0.98)",border:"1px solid rgba(255,255,255,0.06)",borderTop:`3px solid ${a.color}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:14,boxShadow:`0 4px 24px ${a.glow}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{a.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:FB,fontSize:26,letterSpacing:4,color:"#fff",lineHeight:1}}>{a.id}</div>
                <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.2)"}}>{a.label}</div>
                {(p?.live||p?.cached)&&(
                  <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
                    <span style={{fontFamily:F,fontSize:11,color:priceColor,background:`${priceColor}12`,border:`1px solid ${priceColor}30`,borderRadius:6,padding:"2px 8px"}}>
                      {p.trend==="bullish"?"▲":"▼"} {p.cached?"CACHED":"LIVE"} {p.change>0?"+":""}{p.change}%
                    </span>
                    {p?.price&&<span style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.05)",borderRadius:6,padding:"2px 8px"}}>${p.price.toLocaleString()}</span>}
                    <span style={{fontFamily:F,fontSize:9,color:confColor,background:`${confColor}12`,border:`1px solid ${confColor}25`,borderRadius:6,padding:"2px 8px"}}>
                      {confIcon(confidence)} {confidence} CONF
                    </span>
                  </div>
                )}
              </div>
              {displayBias&&(
                <div style={{marginLeft:"auto",background:ebm.bg,border:`1px solid ${ebm.border}`,borderRadius:8,padding:"4px 10px",flexShrink:0,maxWidth:165}}>
                  <div style={{fontFamily:F,fontSize:10,color:ebm.color}}>{ebm.icon} {source==="ohlc"?"OHLC":source==="live"||source==="cached"?"LIVE":"AI"}: {displayBias}</div>
                  {overridden&&d?.bias&&<div style={{fontFamily:F,fontSize:9,color:"#f97316",marginTop:1}}>AI: {d.bias} ↺</div>}
                </div>
              )}
            </div>

            <KZBadge assetId={a.id}/>

            {p?.ohlcStructure&&p.ohlcStructure!=="Unknown"&&(
              <div style={{background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",borderLeft:"3px solid #3b82f6",borderRadius:8,padding:"8px 11px"}}>
                <div style={{fontFamily:F,fontSize:9,color:"#60a5fa",marginBottom:3}}>📐 REAL OHLC STRUCTURE</div>
                <div style={{fontFamily:F,fontSize:11,color:p.ohlcStructure==="Bullish"?"#22c55e":p.ohlcStructure==="Bearish"?"#ef4444":"#eab308",fontWeight:700,marginBottom:3}}>
                  {p.ohlcStructure==="Bullish"?"▲ BULLISH":p.ohlcStructure==="Bearish"?"▼ BEARISH":"◆ NEUTRAL"}
                </div>
                <div style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.45)",lineHeight:1.5}}>{p.structureDetail}</div>
              </div>
            )}

            {conflict&&(
              <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"8px 12px"}}>
                <div style={{fontFamily:F,fontSize:10,color:"#f87171",lineHeight:1.6}}>
                  ⚠ SIGNAL CONFLICT — WAIT: {signals.map(s=>s.type+"="+s.value).join(" vs ")}
                </div>
              </div>
            )}

            {signals&&signals.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {signals.map((s,i)=>{
                  const sc=s.value==="Bullish"?"#22c55e":s.value==="Bearish"?"#ef4444":"#eab308";
                  const label=s.type==="OHLC"?"📐 OHLC":s.type==="AI"?"🤖 AI":"📊 Price";
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:7,padding:"6px 10px"}}>
                      <span style={{fontFamily:F,fontSize:10,color:"rgba(255,255,255,0.4)"}}>{label}</span>
                      <span style={{fontFamily:F,fontSize:11,color:sc,background:`${sc}12`,border:`1px solid ${sc}25`,borderRadius:5,padding:"2px 8px"}}>{s.value==="Bullish"?"▲":"▼"} {s.value}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {["Bullish","Bearish"].map(opt=>{
                const sel=ub===opt,col=opt==="Bullish"?"#22c55e":"#ef4444";
                return(
                  <button key={opt} onClick={()=>setUserBias(prev=>({...prev,[a.id]:sel?null:opt}))}
                    style={{background:sel?`${col}18`:"rgba(255,255,255,0.03)",border:`1.5px solid ${sel?col:"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:15,color:sel?col:"rgba(255,255,255,0.28)",fontFamily:F,fontSize:13,letterSpacing:2,cursor:"pointer",transition:"all .18s",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    {opt==="Bullish"?"▲":"▼"} {opt.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {ub&&(
              <div style={{display:"flex",flexDirection:"column",gap:10,animation:"fadeup .25s ease"}}>
                {!hasPcts?(
                  <div style={{background:"rgba(100,116,139,0.07)",border:"1px solid rgba(100,116,139,0.18)",borderRadius:10,padding:"12px 14px",fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.35)",textAlign:"center"}}>
                    No probability data — tap ↻ to refresh.
                  </div>
                ):(
                  <>
                    {[{label:"✅ REAL MOVE",pct:realPct,color:"#22c55e"},{label:"⚡ TRAP RISK",pct:trapPct,color:"#f97316"}].map(b=>(
                      <div key={b.label}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <span style={{fontFamily:F,fontSize:11,letterSpacing:2,color:b.color}}>{b.label}</span>
                          <span style={{fontFamily:FB,fontSize:32,color:b.color,lineHeight:1}}>{b.pct}%</span>
                        </div>
                        <Bar pct={b.pct} color={b.color} h={7}/>
                      </div>
                    ))}
                    <div style={{background:isReal?"rgba(34,197,94,0.07)":"rgba(249,115,22,0.07)",border:`1px solid ${isReal?"rgba(34,197,94,0.2)":"rgba(249,115,22,0.2)"}`,borderRadius:10,padding:"12px 14px",fontFamily:F,fontSize:12,color:isReal?"#4ade80":"#fb923c",lineHeight:1.7,textAlign:"center"}}>
                      {isReal?`${ub} looks REAL — ${realPct}% real vs ${trapPct}% trap.`:`${ub} looks like a TRAP — ${trapPct}% trap risk. Wait.`}
                    </div>
                    {showAlign&&(
                      <div style={{background:ub===displayBias?"rgba(34,197,94,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${ub===displayBias?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)"}`,borderRadius:10,padding:"10px 13px",fontFamily:F,fontSize:11,color:ub===displayBias?"#4ade80":"#f87171",lineHeight:1.6}}>
                        {ub===displayBias
                          ?`✅ Aligns with ${source==="ohlc"?"real OHLC":source==="live"||source==="cached"?"live price":"AI"} (${displayBias}).`
                          :`⚠ Your bias (${ub}) conflicts with ${source==="ohlc"?"real OHLC":source==="live"||source==="cached"?"live price":"AI"} (${displayBias}). High-risk.`}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {!ub&&<div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.15)",textAlign:"center",letterSpacing:1}}>TAP ABOVE TO CHECK YOUR BIAS</div>}
          </div>
        );
      })}
    </div>
  );
}

function DiagPanel({log,onClose}){
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(4,5,8,0.99)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:"18px 18px 0 0",padding:"22px 18px 36px",zIndex:400,maxHeight:"55dvh",overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontFamily:F,fontSize:12,letterSpacing:2,color:"#60a5fa"}}>LIVE LOG</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:22,padding:"4px 8px"}}>✕</button>
      </div>
      {(log||[]).slice().reverse().map((l,i)=>(
        <div key={i} style={{fontFamily:F,fontSize:11,color:l.includes("❌")?"#f87171":l.includes("✅")?"#4ade80":l.includes("🤖")?"#a78bfa":"rgba(255,255,255,0.35)",lineHeight:2}}>{l}</div>
      ))}
      {!log?.length&&<div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.18)"}}>No entries yet.</div>}
    </div>
  );
}

function KeyScreen({onSubmit}){
  const[key,setKey]=useState("");
  return(
    <div style={{minHeight:"100dvh",background:"#030407",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 20px",gap:32}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:FB,fontSize:56,letterSpacing:10,background:"linear-gradient(130deg,#fff 20%,rgba(255,255,255,0.15))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>SCAR FACE</div>
        <div style={{fontFamily:F,fontSize:11,letterSpacing:3,color:"rgba(255,255,255,0.18)",marginTop:8}}>ICT · OIL · GOLD · NQ · FULLY DYNAMIC</div>
      </div>
      <div style={{width:"100%",maxWidth:440,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:22,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontFamily:F,fontSize:11,letterSpacing:2,color:"rgba(255,255,255,0.3)"}}>GROQ API KEY</div>
          <input type="password" placeholder="gsk_..." value={key} onChange={e=>setKey(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&key.length>10&&onSubmit(key)}
            style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"15px 16px",color:"#fff",fontSize:15,width:"100%"}}/>
          <button onClick={()=>key.length>10&&onSubmit(key)}
            style={{background:key.length>10?"linear-gradient(135deg,#3b82f6,#6366f1)":"rgba(255,255,255,0.04)",border:"none",borderRadius:12,padding:16,color:key.length>10?"#fff":"rgba(255,255,255,0.12)",fontFamily:FB,fontSize:22,letterSpacing:4,cursor:key.length>10?"pointer":"not-allowed",transition:"all .2s"}}>
            ENTER THE MARKET
          </button>
        </div>
        <div style={{background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.15)",borderRadius:14,padding:18}}>
          <div style={{fontFamily:F,fontSize:11,letterSpacing:2,color:"#60a5fa",marginBottom:8}}>GET FREE KEY</div>
          <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.35)",lineHeight:2}}>
            console.groq.com → Sign up → API Keys<br/>
            <span style={{color:"#22c55e"}}>✓ Free · Fast · 14,400 calls/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({log}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(3,4,7,0.97)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22,padding:28}}>
      <div style={{fontFamily:FB,fontSize:46,letterSpacing:10,color:"rgba(255,255,255,0.04)"}}>SCAR FACE</div>
      <Spinner size={30}/>
      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center",width:"100%",maxWidth:340}}>
        {(log||[]).slice(-4).map((l,i,arr)=>(
          <div key={i} style={{fontFamily:F,fontSize:11,color:i===arr.length-1?"#60a5fa":"rgba(255,255,255,0.15)",letterSpacing:1,textAlign:"center"}}>{l}</div>
        ))}
      </div>
    </div>
  );
}

export default function App(){
  const[apiKey,setApiKey]=useState(()=>{const k=store.get("sf_key");_groqKey=k;return k;});
  const[submitted,setSubmitted]=useState(()=>!!store.get("sf_key"));
  const[tab,setTab]=useState("intel");
  const[showDiag,setShowDiag]=useState(false);

  const{status,market,news,momentum,fg,prices,
    newsLive,momentumLive,fgLive,
    lastNewsUpdate,log,error,refresh,refreshNews}
    =useMarket(submitted?apiKey:"");

  const isLoading=["fetching","analyzing"].includes(status);
  const ny=getNYTime();
  const stMap={
    idle:     {t:"STANDBY",  c:"#64748b"},
    fetching: {t:"FETCHING", c:"#8b5cf6"},
    analyzing:{t:"ANALYZING",c:"#f59e0b"},
    live:     {t:"LIVE",     c:"#22c55e"},
    error:    {t:"ERROR",    c:"#f97316"},
  };
  const{t:stLabel,c:stColor}=stMap[status]||stMap.idle;

  if(!submitted)return(
    <><style>{CSS}</style>
    <KeyScreen onSubmit={k=>{store.set("sf_key",k);setApiKey(k);_groqKey=k;setSubmitted(true);}}/></>
  );

  const TABS=[
    {id:"intel",label:"📊 INTEL"},
    {id:"news", label:"📰 NEWS"},
    {id:"bias", label:"⚡ BIAS"},
    {id:"kz",   label:"🕐 KZ"},
  ];

  return(
    <div style={{minHeight:"100dvh",background:"#030407",position:"relative"}}>
      <style>{CSS}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(59,130,246,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.012) 1px,transparent 1px)",backgroundSize:"44px 44px"}}/>
      <div style={{position:"fixed",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(59,130,246,0.07),transparent)",animation:"scanl 10s linear infinite",pointerEvents:"none",zIndex:50}}/>

      {isLoading&&<LoadingScreen log={log}/>}

      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",minHeight:"100dvh"}}>
        <div style={{padding:"16px 16px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontFamily:FB,fontSize:40,letterSpacing:8,background:"linear-gradient(130deg,#fff 30%,rgba(255,255,255,0.15))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>SCAR FACE</div>
          <div style={{fontFamily:F,fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.14)",marginTop:4}}>ICT · OIL · GOLD · NQ · LIVE DATA · GROQ AI</div>
        </div>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Dot color={stColor} pulse={["live","fetching","analyzing"].includes(status)} size={7}/>
            <span style={{fontFamily:F,fontSize:11,letterSpacing:2,color:stColor}}>{stLabel}</span>
            {status==="live"&&<span style={{fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.2)",marginLeft:2}}>tap ↻ to refresh</span>}
          </div>
          <span style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.22)"}}>{ny} EST</span>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setShowDiag(v=>!v)} style={{background:"rgba(100,116,139,0.08)",border:"1px solid rgba(100,116,139,0.2)",color:"#64748b",fontSize:11,padding:"7px 11px",borderRadius:8,cursor:"pointer",fontFamily:F}}>LOG</button>
            <button onClick={()=>{store.del("sf_key");setApiKey("");setSubmitted(false);}} style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.18)",color:"#f87171",fontSize:11,padding:"7px 11px",borderRadius:8,cursor:"pointer",fontFamily:F}}>KEY</button>
            <button onClick={refresh} disabled={isLoading} style={{background:"rgba(59,130,246,0.09)",border:"1px solid rgba(59,130,246,0.22)",color:isLoading?"rgba(255,255,255,0.15)":"#60a5fa",fontSize:16,padding:"7px 13px",borderRadius:8,cursor:isLoading?"not-allowed":"pointer"}}>↻</button>
          </div>
        </div>

        <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,background:tab===t.id?"rgba(59,130,246,0.09)":"transparent",border:"none",borderBottom:tab===t.id?"2.5px solid #3b82f6":"2.5px solid transparent",padding:"13px 2px",color:tab===t.id?"#60a5fa":"rgba(255,255,255,0.28)",fontFamily:F,fontSize:10,letterSpacing:.5,cursor:"pointer",transition:"all .18s"}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 14px 40px",display:"flex",flexDirection:"column",gap:14}}>
          {tab==="intel"&&(
            <>
              <FearGauge value={fg.value} label={fg.label} live={fgLive} source={fg.source}/>
              <MomentumStrip momentum={momentum||{}} live={momentumLive}/>
              <DXYStrip data={market}/>
              <RegimeBanner data={market}/>
              {market?(
                <>
                  {ASSETS.map(a=>(<AssetCard key={a.id} asset={a} data={market.assets?.[a.id]} price={prices?.[a.id]}/>))}
                  {[
                    {icon:"⚡",label:"PAIR TRADE",text:market.pair_trade,   color:"#a855f7"},
                    {icon:"🎯",label:"RISK EVENT",text:market.risk_event,   color:"#ef4444"},
                    {icon:"📡",label:"MACRO",     text:market.macro_summary,color:"#3b82f6"},
                  ].map(c=>c.text&&(
                    <div key={c.label} style={{background:"rgba(5,7,15,0.98)",border:`1px solid ${c.color}15`,borderLeft:`3px solid ${c.color}`,borderRadius:14,padding:"14px 16px"}}>
                      <div style={{fontFamily:F,fontSize:11,letterSpacing:2,color:c.color,marginBottom:7}}>{c.icon} {c.label}</div>
                      <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.45)",lineHeight:1.7}}>{c.text}</div>
                    </div>
                  ))}
                  {market.correlation_warning&&market.correlation_warning!=="null"&&market.correlation_warning!==null&&(
                    <div style={{background:"rgba(249,115,22,0.05)",border:"1px solid rgba(249,115,22,0.18)",borderRadius:14,padding:"12px 16px",display:"flex",gap:10}}>
                      <span style={{color:"#f97316",flexShrink:0}}>⚠</span>
                      <div style={{fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.42)",lineHeight:1.7}}>
                        <span style={{color:"#fb923c"}}>CORRELATION TRAP: </span>{market.correlation_warning}
                      </div>
                    </div>
                  )}
                </>
              ):!isLoading&&(
                <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"24px 16px",textAlign:"center",fontFamily:F,fontSize:12,color:"rgba(255,255,255,0.3)",lineHeight:1.7}}>
                  {error?`Error: ${error}`:"Tap ↻ to load live analysis"}
                </div>
              )}
            </>
          )}
          {tab==="news"&&<NewsTab rawNews={news} newsLive={newsLive} lastUpdate={lastNewsUpdate} apiKey={apiKey} onRefreshNews={refreshNews}/>}
          {tab==="bias"&&<BiasTab market={market} prices={prices}/>}
          {tab==="kz"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.15)",borderLeft:"3px solid #3b82f6",borderRadius:14,padding:"12px 16px"}}>
                <div style={{fontFamily:F,fontSize:10,letterSpacing:2,color:"#60a5fa",marginBottom:5}}>ℹ️ PER-ASSET KILLZONES</div>
                <div style={{fontFamily:F,fontSize:11,color:"rgba(255,255,255,0.38)",lineHeight:1.7}}>OIL & GOLD → London Open. NQ → NY Open. Each asset has its own optimal trading window.</div>
              </div>
              {ASSETS.map(a=>(<KZCard key={a.id} asset={a}/>))}
            </div>
          )}
        </div>

        <div style={{padding:"10px 16px 24px",textAlign:"center",fontFamily:F,fontSize:9,color:"rgba(255,255,255,0.07)",letterSpacing:1,lineHeight:2,borderTop:"1px solid rgba(255,255,255,0.04)"}}>
          FINNHUB · FEAR & GREED API · GROQ LLAMA 3.3 70B<br/>MANUAL REFRESH · ⚠ NOT FINANCIAL ADVICE
        </div>
      </div>

      {showDiag&&<DiagPanel log={log} onClose={()=>setShowDiag(false)}/>}
    </div>
  );
}
