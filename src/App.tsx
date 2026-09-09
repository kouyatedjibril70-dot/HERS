import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, CircleMarker, ZoomControl, useMap } from "react-leaflet";
import { Search, SlidersHorizontal, Map as MapIcon, BarChart3, Users, Globe, X, ChevronRight, RotateCcw, MapPin, ArrowUpDown, ArrowUp, ArrowDown, FileText } from "lucide-react";
import communities from "./data/communities.json";
// Identifiant stable, indépendant du rang/score (le rang change à chaque pondération — s'en servir
// comme clé React forçait Leaflet à détruire/recréer ~1300 marqueurs à chaque glissement de curseur).
const communitiesIndexed = (communities as any[]).map((r, i) => ({ ...r, _srcId: `row#${i}` }));
import Spatial, { accessScore, agriScore, indiceSpatial, roadAccessScore, BASEMAPS } from "./Spatial";
import { LANG_COLORS, ZONE_COLORS } from "./palette";
import { withPrcc } from "./Prcc";
import Method from "./Method";

export type Community = Record<string, any> & {score:number;rank:number;selected:boolean;coverage:number;scores:Record<string,number|null>};
const reduceMotion=typeof window!=="undefined"&&!!window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// POPULATION est un champ partiellement manquant (valeur `null`) — Number(null)===0 est un nombre "fini",
// donc un simple Number.isFinite(Number(...)) traiterait à tort "population inconnue" comme "population = 0".
const hasPop=(r:any)=>r.POPULATION!==null&&r.POPULATION!==undefined&&r.POPULATION!==""&&Number.isFinite(Number(r.POPULATION));

// --- Synchronisation de l'état avec l'URL (?vue=…&pays=…&p=…) : un rechargement ou un lien
//     partagé rouvre la plateforme exactement dans le même onglet, les mêmes filtres, la même pondération.
type Tab="dashboard"|"communities"|"spatial"|"method";
const DEFAULT_WEIGHTS={pop:0,dist:45,dens:20,recent:35};
const TAB_TO_PARAM:Record<Tab,string>={dashboard:"",communities:"communities",spatial:"spatial",method:"methode"};
const PARAM_TO_TAB:Record<string,Tab>={communities:"communities",spatial:"spatial",methode:"method"};
const PAYS_TO_PARAM:Record<string,string>={"Tous":"","Sénégal":"sn","Gambie":"gm"};
const PARAM_TO_PAYS:Record<string,string>={sn:"Sénégal",gm:"Gambie"};
function readUrlState(){
 const q=new URLSearchParams(window.location.search);
 let weights={...DEFAULT_WEIGHTS};
 const p=q.get("p");
 if(p&&/^\d+-\d+-\d+-\d+$/.test(p)){const[pop,dist,dens,recent]=p.split("-").map(Number);weights={pop,dist,dens,recent};}
 return {
  tab:PARAM_TO_TAB[q.get("vue")||""]||"dashboard" as Tab,
  country:PARAM_TO_PAYS[q.get("pays")||""]||"Tous",
  region:q.get("region")||"Toutes",
  lang:q.get("langue")||"Toutes",
  bureau:q.get("bureau")||"Tous",
  query:q.get("q")||"",
  only:q.get("sel")==="1",
  weights,
 };
}
function writeUrlState(s:{tab:Tab;country:string;region:string;lang:string;bureau:string;query:string;only:boolean;weights:typeof DEFAULT_WEIGHTS}){
 const q=new URLSearchParams();
 if(s.tab!=="dashboard")q.set("vue",TAB_TO_PARAM[s.tab]);
 if(s.country!=="Tous")q.set("pays",PAYS_TO_PARAM[s.country]||"");
 if(s.region!=="Toutes")q.set("region",s.region);
 if(s.lang!=="Toutes")q.set("langue",s.lang);
 if(s.bureau!=="Tous")q.set("bureau",s.bureau);
 if(s.query)q.set("q",s.query);
 if(s.only)q.set("sel","1");
 const w=s.weights;
 if(w.pop!==DEFAULT_WEIGHTS.pop||w.dist!==DEFAULT_WEIGHTS.dist||w.dens!==DEFAULT_WEIGHTS.dens||w.recent!==DEFAULT_WEIGHTS.recent)q.set("p",`${w.pop}-${w.dist}-${w.dens}-${w.recent}`);
 const qs=q.toString();
 window.history.replaceState(null,"",window.location.pathname+(qs?"?"+qs:"")+window.location.hash);
}

// Lecture en clair de la sélection courante — recalculée sur l'ensemble VISIBLE (filtres + pondération).
// Renvoie 3 paragraphes ; leur formulation s'adapte à la part réelle de communautés éloignées.
function lectureSelection(rows:Community[]):{paras:string[]}|null{
 const sel=rows.filter(r=>r.selected);
 if(!sel.length)return null;
 const n=rows.length;
 const taux=sel.length/n*100;
 const dists=sel.map(r=>Number(r["Distance bureau (km)"])).filter(Number.isFinite);
 const distMoy=dists.length?dists.reduce((a,b)=>a+b,0)/dists.length:0;
 const eloignees=sel.filter(r=>Number(r["Distance bureau (km)"])>100).length;
 const part=sel.length?eloignees/sel.length*100:0;
 const p0=taux>=99.5
  ?`La vue est filtrée sur les seules communautés retenues (**${sel.length}**). Leur distance moyenne à un bureau de coordination est de **${distMoy.toFixed(0)} km**.`
  :`**${sel.length} communautés** sont retenues dans la vue courante, soit **${taux.toFixed(0)} %** des **${n.toLocaleString("fr-FR")}** communautés affichées. Leur distance moyenne à un bureau de coordination est de **${distMoy.toFixed(0)} km**.`;
 const p1=part<10
  ?`La proximité d'un bureau se retrouve nettement dans la sélection : seules **${part.toFixed(0)} %** des communautés retenues (**${eloignees}**) sont à plus de 100 km. La contrainte d'accessibilité géographique est donc peu structurante ici.`
  :`La proximité d'un bureau n'explique pas à elle seule la sélection : **${part.toFixed(0)} %** des communautés retenues (**${eloignees}**) sont à plus de 100 km. Elles ont été retenues malgré cette contrainte d'accessibilité, du fait de leur rang. Le classement est établi séparément pour le Sénégal et la Gambie.`;
 const p2=part<10
  ?`Pour aller plus loin (comparaison retenues / non-retenues, concentration par bureau, communautés éloignées), voir l'onglet Analyse spatiale.`
  :part<25
   ?`L'enjeu opérationnel porte surtout sur ces communautés éloignées : concentration par bureau, répartition régionale et poids dans la charge de supervision sont à examiner avant validation. L'onglet Analyse spatiale (« Communautés éloignées », « Par bureau / région », comparaison retenues / non-retenues) permet d'aller plus loin.`
   :`Une part importante de la sélection est éloignée d'un bureau : la logistique de supervision (concentration par bureau, répartition régionale, charge de déplacement) doit être cadrée dès la planification. Voir l'onglet Analyse spatiale (« Communautés éloignées », « Par bureau / région »).`;
 return {paras:[p0,p1,p2]};
}
// Rend un texte avec **gras** en fragments React.
function boldParts(t:string){return t.split(/\*\*(.+?)\*\*/).map((s,i)=>i%2?<b key={i}>{s}</b>:s);}
function CountUp({value,dur=650}:{value:number;dur?:number}){
 const [n,setN]=useState(reduceMotion?value:0);const prev=useRef(reduceMotion?value:0);
 useEffect(()=>{const from=prev.current,to=value;prev.current=value;if(from===to||reduceMotion){setN(to);return;}
  let raf=0;const t0=performance.now();
  const tick=(t:number)=>{const p=Math.min(1,(t-t0)/dur);setN(Math.round(from+(to-from)*(1-Math.pow(1-p,3))));if(p<1)raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(raf);},[value,dur]);
 return <>{n.toLocaleString("fr-FR")}</>;
}
// Rang percentile d'une valeur DANS UN TABLEAU DÉJÀ TRIÉ (recherche binaire).
// scoreAll appelle ceci une fois par ligne et par critère (≈5 × 1372 fois) : trier le tableau
// à chaque appel (ancienne version) coûtait O(n² log n) et faisait "caler" l'appli à chaque
// glissement de curseur de pondération. Trier une fois par critère, puis chercher, est en O(n log n).
function rankOf(sorted:number[],value:number,higher=true){
  if(!sorted.length) return 0;
  let lo=0,hi=sorted.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid]>=value)hi=mid;else lo=mid+1;}
  const p=lo/(sorted.length-1||1);
  return (higher?p:1-p)*100;
}
function scoreAll(rows:Record<string,any>[],w:{pop:number;dist:number;dens:number;recent:number}){
 return (["Sénégal","Gambie"] as const).flatMap(country=>{const base=rows.filter(r=>r.Pays===country);
  const nums=(k:string)=>base.map(r=>Number(r[k])).filter(Number.isFinite).sort((a,b)=>a-b);
  const pop=base.filter(hasPop).map(r=>Number(r.POPULATION)).sort((a,b)=>a-b),dist=nums("Distance bureau (km)"),dens=nums("Autres communautés dans 25 km"),fin=nums("Année Fin PRCC");
  return base.map(r=>{const items=[
    ["pop",hasPop(r)?rankOf(pop,Number(r.POPULATION),true):undefined,w.pop],
    ["dist",Number.isFinite(Number(r["Distance bureau (km)"]))?rankOf(dist,Number(r["Distance bureau (km)"]),false):undefined,w.dist],
    ["dens",Number.isFinite(Number(r["Autres communautés dans 25 km"]))?rankOf(dens,Number(r["Autres communautés dans 25 km"]),true):undefined,w.dens],
    ["recent",Number.isFinite(Number(r["Année Fin PRCC"]))?rankOf(fin,Number(r["Année Fin PRCC"]),true):undefined,w.recent]
  ] as [string,number|undefined,number][];
  const avail=items.filter(x=>x[1]!==undefined),den=avail.reduce((s,x)=>s+x[2],0),totalW=items.reduce((s,x)=>s+x[2],0),score=den?avail.reduce((s,x)=>s+(x[1]!/100*x[2]),0)/den*100:0;
  return {...r,score,coverage:totalW?Math.round(den/totalW*100):0,scores:Object.fromEntries(items.map(x=>[x[0],x[1]===undefined?null:x[1]/100*x[2]]))};
 }).sort((a,b)=>b.score-a.score).map((r,i)=>({...r,rank:i+1} as Community));
 }) as Community[];
}
function Stats({data,targets}:{data:Community[];targets:{Sénégal:number;Gambie:number}}){
 const selected=data.filter(r=>r.selected).length;
 const snN=data.filter(r=>r.Pays==="Sénégal").length,gmN=data.filter(r=>r.Pays==="Gambie").length;
 const kpis:[string,string,number,string,number|null][]=[
  ["base","Base",data.length,"communautés",null],
  ["sn","Sénégal",targets.Sénégal,"consultations",snN?targets.Sénégal/snN*100:0],
  ["gm","Gambie",targets.Gambie,"consultations",gmN?targets.Gambie/gmN*100:0],
  ["sel","Sélection",selected,"retenues / "+data.length,data.length?selected/data.length*100:0],
 ];
 return <section className="stats">
  {kpis.map(([k,label,val,sub,pct],i)=><div className={"stat stat--"+k} key={k} style={{animationDelay:`${i*60}ms`}}>
   <span>{label}</span><strong><CountUp value={val}/></strong><small>{sub}</small>
   {pct!==null&&<div className="kpi-prog"><i style={{width:`${Math.min(100,pct)}%`}}/></div>}
  </div>)}
 </section>;
}
function LangsPanel({data}:{data:Community[]}){
 const selected=data.filter(r=>r.selected);
 const langs=Object.entries(selected.reduce<Record<string,number>>((a,r)=>{const k=r["Langue normalisée"]||"Non renseignée";a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
 const max=Math.max(1,...langs.map(x=>x[1]));
 return <div className="chart-card langs-card">
  <div className="card-title"><Globe size={16}/> Langues sélectionnées</div>
  {langs.map(([k,v],i)=>{const c=LANG_COLORS[k]||"#94a3b8";const p=Math.round(v/(selected.length||1)*100);return <div className={"barrow"+(i===0?" barrow--top":"")} key={k}>
   <span><i className="ldot" style={{background:c}}/>{k}</span>
   <div><i style={{width:`${v/max*100}%`,background:`linear-gradient(90deg, ${c} 0%, color-mix(in srgb, ${c} 72%, #fff) 100%)`}}/></div>
   <b><CountUp value={v}/> <em>{p}%</em></b>
  </div>;})}
 </div>;
}
function Recenter({center}:{center:[number,number]}){const map=useMap();useEffect(()=>{map.setView(center,6)},[map,center[0],center[1]]);return null}
function Table({rows,onSelect}:{rows:Community[];onSelect:(r:Community)=>void}){return <div className="table-scroll"><table><thead><tr><th>Rang</th><th>Communauté</th><th>Pays</th><th>Région</th><th>Langue</th><th>{withPrcc("PRCC")}</th><th>Distance</th><th>Score</th><th>Statut</th></tr></thead><tbody>{rows.map(r=><tr key={r._id} onClick={()=>onSelect(r)}><td>#{r.rank}</td><td className="name">{r.Communauté}</td><td>{r.Pays}</td><td>{r.Région}</td><td>{r["Langue normalisée"]}</td><td>{r["Année Début PRCC"]} à {r["Année Fin PRCC"]}</td><td>{Number(r["Distance bureau (km)"]).toFixed(0)} km</td><td><b>{r.score.toFixed(1)}</b></td><td><span className={r.selected?"tag yes":"tag"}>{r.selected?"Sélectionnée":"Hors sélection"}</span></td></tr>)}</tbody></table></div>}

// Tableau complet de la page « Communautés » : en-têtes triables + ligne de filtres par colonne.
type CCol = { key: string; label: string; kind: "text" | "num" | "pill-pays" | "prcc" | "score" | "pill-statut"; filter: "text" | "select" | null; get: (r: Community) => string | number; options?: string[]; w: string };
function CommunitiesTable({ rows, onSelect, preset }: { rows: Community[]; onSelect: (r: Community) => void; preset?: Record<string, string> }) {
  const [sortKey, setSortKey] = useState("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [flt, setFlt] = useState<Record<string, string>>(() => ({ ...preset }));
  // Applique un préréglage venu d'ailleurs (ex. clic sur « Par bureau » dans Analyse spatiale).
  const presetSig = JSON.stringify(preset ?? {});
  useEffect(() => { setFlt((p) => ({ ...p, ...JSON.parse(presetSig) })); }, [presetSig]);
  const langOptions = useMemo(() => Array.from(new Set(rows.map((r) => r["Langue normalisée"]).filter(Boolean) as string[])).sort(), [rows]);

  const cols: CCol[] = [
    { key: "Communauté", label: "Communauté", kind: "text", filter: "text", w: "15%", get: (r) => r.Communauté ?? "" },
    { key: "Pays", label: "Pays", kind: "pill-pays", filter: "select", options: ["Sénégal", "Gambie"], w: "7%", get: (r) => r.Pays ?? "" },
    { key: "Région", label: "Région", kind: "text", filter: "text", w: "10%", get: (r) => r.Région ?? "" },
    { key: "Niveau2", label: "Département", kind: "text", filter: "text", w: "10%", get: (r) => r.Niveau2 ?? "" },
    { key: "Commune", label: "Commune", kind: "text", filter: "text", w: "10%", get: (r) => r.Commune ?? "" },
    { key: "Bureau", label: "Bureau", kind: "text", filter: "select", options: ["Kolda", "Thiès", "Tambacounda", "Ourossogui", "Basse"], w: "9%", get: (r) => r.Bureau ?? "" },
    { key: "Langue normalisée", label: "Langue", kind: "text", filter: "select", options: langOptions, w: "8%", get: (r) => r["Langue normalisée"] ?? "" },
    { key: "Année Fin PRCC", label: "Fin PRCC", kind: "prcc", filter: null, w: "8%", get: (r) => Number(r["Année Fin PRCC"]) || 0 },
    { key: "Distance bureau (km)", label: "Distance", kind: "num", filter: null, w: "6%", get: (r) => Number(r["Distance bureau (km)"]) || 0 },
    { key: "score", label: "Score", kind: "score", filter: null, w: "9%", get: (r) => r.score },
    { key: "selected", label: "Statut", kind: "pill-statut", filter: "select", options: ["Sélectionnée", "Hors sélection"], w: "8%", get: (r) => (r.selected ? "Sélectionnée" : "Hors sélection") },
  ];

  const view = useMemo(() => {
    let out = rows;
    for (const c of cols) {
      const v = flt[c.key];
      if (!v) continue;
      if (c.filter === "text") out = out.filter((r) => String(c.get(r)).toLowerCase().includes(v.toLowerCase()));
      else if (c.filter === "select") out = out.filter((r) => String(c.get(r)) === v);
    }
    const c = cols.find((x) => x.key === sortKey);
    const cmp = (a: Community, b: Community): number => {
      if (!c) return a.rank - b.rank;
      const va = c.get(a), vb = c.get(b);
      const n = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr");
      return sortDir === "asc" ? n : -n;
    };
    return [...out].sort(cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, flt, sortKey, sortDir, langOptions]);

  const clickHead = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const SortIc = ({ k }: { k: string }) => sortKey !== k ? <ArrowUpDown size={12} className="sort-ic" /> : sortDir === "asc" ? <ArrowUp size={12} className="sort-ic on" /> : <ArrowDown size={12} className="sort-ic on" />;

  const shown = view.slice(0, 300);
  return (
    <div className="ctable-wrap">
      <table className="ctable">
        <colgroup>{cols.map((c) => <col key={c.key} style={{ width: c.w }} />)}</colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={sortKey === c.key ? "sorted" : ""} onClick={() => clickHead(c.key)}>
                {withPrcc(c.label)}<SortIc k={c.key} />
              </th>
            ))}
          </tr>
          <tr className="filters">
            {cols.map((c) => (
              <th key={c.key}>
                {c.filter === "text" && <input placeholder="Filtrer…" value={flt[c.key] ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => setFlt((p) => ({ ...p, [c.key]: e.target.value }))} />}
                {c.filter === "select" && (
                  <select value={flt[c.key] ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => setFlt((p) => ({ ...p, [c.key]: e.target.value }))}>
                    <option value="">Tous</option>
                    {(c.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r._id} onClick={() => onSelect(r)}>
              {cols.map((c) => {
                const val = c.get(r);
                if (c.key === "Communauté") return <td key={c.key} className="c-name">{r.Communauté}</td>;
                if (c.kind === "pill-pays") return <td key={c.key}><span className="c-pill" style={{ background: r.Pays === "Sénégal" ? "#dcfce7" : "#dbeafe", color: r.Pays === "Sénégal" ? "#15803d" : "#1e40af" }}>{r.Pays}</span></td>;
                if (c.kind === "pill-statut") return <td key={c.key}><span className="c-pill" style={{ background: r.selected ? "#dcfce7" : "#f1f5f9", color: r.selected ? "#15803d" : "#64748b" }}>{r.selected ? "Sélectionnée" : "Hors sélection"}</span></td>;
                if (c.kind === "prcc") return <td key={c.key}>{r["Année Début PRCC"]} → {r["Année Fin PRCC"]}</td>;
                if (c.kind === "num") return <td key={c.key}>{Number(val).toFixed(0)} km</td>;
                if (c.kind === "score") return <td key={c.key}><div className="c-score"><div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, r.score))}%` }} /></div><b>{r.score.toFixed(0)}</b></div></td>;
                return <td key={c.key}>{String(val)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote" style={{ padding: "8px 12px 0" }}>{view.length} résultat(s) · 300 lignes affichées au maximum. Cliquez une en-tête pour trier, utilisez les champs sous les titres pour filtrer.</p>
    </div>
  );
}
export default function App(){
 const [urlInit]=useState(readUrlState);
 const [country,setCountry]=useState(urlInit.country),[region,setRegion]=useState(urlInit.region),[lang,setLang]=useState(urlInit.lang),[bureau,setBureau]=useState(urlInit.bureau),[query,setQuery]=useState(urlInit.query),[only,setOnly]=useState(urlInit.only),[showSel,setShowSel]=useState(true),[showUnsel,setShowUnsel]=useState(true),[tab,setTab]=useState<"dashboard"|"communities"|"spatial"|"method">(urlInit.tab),[drawer,setDrawer]=useState<Community|null>(null);
 const [targets,setTargets]=useState({Sénégal:642,Gambie:161}),[weights,setWeights]=useState(urlInit.weights);
 const [toast,setToast]=useState(false);const firstW=useRef(true);
 useEffect(()=>{if(firstW.current){firstW.current=false;return;}setToast(true);const id=window.setTimeout(()=>setToast(false),1600);return ()=>window.clearTimeout(id);},[weights]);
 useEffect(()=>{writeUrlState({tab,country,region,lang,bureau,query,only,weights});},[tab,country,region,lang,bureau,query,only,weights]);
 useEffect(()=>{if(tab==="spatial"){setRegion("Toutes");setLang("Toutes");setBureau("Tous");}},[tab]);
 const base=useMemo(()=>scoreAll(communitiesIndexed,weights),[weights]);
 const data=useMemo(()=>base.map(r=>{const t=targets[r.Pays as "Sénégal"|"Gambie"];return {...r,selected:r.rank<=t,_id:r._srcId} as Community}),[base,targets]);
 const regions=Array.from(new Set(data.filter(r=>country==="Tous"||r.Pays===country).map(r=>r.Région))).sort(),langs=Array.from(new Set(data.map(r=>r["Langue normalisée"]))).sort();
 const filtered=data.filter(r=>(country==="Tous"||r.Pays===country)&&(region==="Toutes"||r.Région===region)&&(lang==="Toutes"||r["Langue normalisée"]===lang)&&(bureau==="Tous"||r.Bureau===bureau)&&(!only||r.selected)&&(!query||String(r.Communauté).toLowerCase().includes(query.toLowerCase())||String(r["code communaute"]).toLowerCase().includes(query.toLowerCase())));
 const mapRows=filtered.filter(r=>r.selected?showSel:showUnsel);
 const center:[number,number]=country==="Gambie"?[13.45,-15.2]:[14.2,-14.7];
 return <div className="app"><div className="chrome"><div className="topbar"><div className="brand"><div className="logo">H</div><div><b>HERS · Sélection des communautés pilotes</b><span>Tableau de bord géospatial · Sénégal &amp; Gambie</span><span className="brand-meta">{base.length} communautés · 5 bureaux</span></div></div><nav className="tabstrip"><button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}><BarChart3 size={18}/>Vue d'ensemble</button><button className={tab==="communities"?"active":""} onClick={()=>setTab("communities")}><Users size={18}/>Communautés</button><button className={tab==="spatial"?"active":""} onClick={()=>setTab("spatial")}><MapIcon size={18}/>Analyse spatiale</button><button className={tab==="method"?"active":""} onClick={()=>setTab("method")}><FileText size={18}/>Méthode</button></nav><div className="topbar-actions"><div className="consult-pill"><span>Consultations</span><strong><CountUp value={targets.Sénégal+targets.Gambie}/></strong><small>{targets.Sénégal} Sénégal · {targets.Gambie} Gambie</small></div></div></div></div>
 <main>
 {tab!=="spatial"&&tab!=="method"&&<Stats data={data} targets={targets}/>}
 {tab!=="communities"&&tab!=="method"&&<>
 <p className="section-eyebrow">{tab==="spatial"?"Filtres qui affinent la carte analytique":"Filtres"}</p>
 <div className="toolbar"><div className="search"><Search size={18}/><input placeholder="Rechercher une communauté…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="chip-group">{([["Tous","Tous",data.length,""],["Sénégal","Sénégal",data.filter(r=>r.Pays==="Sénégal").length,"sn"],["Gambie","Gambie",data.filter(r=>r.Pays==="Gambie").length,"gm"]] as [string,string,number,string][]).map(([v,lbl,n,mod])=><button key={v} className={"chip"+(mod?" chip--"+mod:"")+(country===v?" on":"")} onClick={()=>{setCountry(v);setRegion("Toutes")}}>{mod&&<i className="chip-dot"/>}{lbl}<b>{n}</b></button>)}</div>
 {tab!=="spatial"&&<><select value={region} onChange={e=>setRegion(e.target.value)}><option>Toutes</option>{regions.map(r=><option key={r}>{r}</option>)}</select><select value={lang} onChange={e=>setLang(e.target.value)}><option>Toutes</option>{langs.map(l=><option key={l}>{l}</option>)}</select><select value={bureau} onChange={e=>setBureau(e.target.value)}><option value="Tous">Tous les bureaux</option>{["Kolda","Thiès","Tambacounda","Ourossogui","Basse"].map(b=><option key={b}>{b}</option>)}</select></>}
 <button className="ghost reset-r" title="Réinitialiser les filtres" onClick={()=>{setCountry("Tous");setRegion("Toutes");setLang("Toutes");setBureau("Tous");setQuery("");setOnly(false);setShowSel(true);setShowUnsel(true)}}><RotateCcw size={16}/></button></div>
 </>}
 {tab==="method"?<Method onGoDashboard={()=>{setTab("dashboard");window.scrollTo({top:0,behavior:"smooth"})}}/>:tab==="spatial"?<Spatial all={data} rows={filtered} onSelect={setDrawer} onBureau={b=>{setBureau(b);setTab("communities");window.scrollTo({top:0,behavior:"smooth"})}}/>:tab==="dashboard"?<section className="grid2"><div className="grid2-main"><div className="map-card"><div className="card-head"><div><h2><MapPin size={15}/> Carte des communautés</h2><div className="head-meta"><span className="cnt-badge">{mapRows.length} visibles</span><span className="status-live"><i/>Données à jour</span></div></div></div><div className="map-wrap"><MapContainer center={center} zoom={6} scrollWheelZoom zoomControl={false}><ZoomControl position="topright"/><Recenter center={center}/><LayersControl position="topright">{BASEMAPS.map((b,i)=><LayersControl.BaseLayer key={b.name} name={b.name} checked={i===0}><TileLayer url={b.url} attribution={b.attribution} subdomains={b.subdomains??"abc"} maxNativeZoom={b.maxNativeZoom}/></LayersControl.BaseLayer>)}</LayersControl>{mapRows.filter(r=>Number.isFinite(Number(r["Latitude référence"]))).map(r=>{const zc=r.selected?ZONE_COLORS.selection:ZONE_COLORS.Sénégal;return <CircleMarker key={r._id} center={[Number(r["Latitude référence"]),Number(r["Longitude référence"])]} radius={r.selected?6:3.5} pathOptions={{color:zc,fillColor:zc,weight:r.selected?1.5:1,fillOpacity:r.selected?.9:.4,className:r.selected?"pmk":""}} eventHandlers={{click:()=>setDrawer(r)}}/>;})}</MapContainer><div className="map-legend"><button type="button" className={showSel?"":"off"} onClick={()=>setShowSel(v=>!v)}><i style={{background:ZONE_COLORS.selection}}/>Sélectionnée</button><button type="button" className={showUnsel?"":"off"} onClick={()=>setShowUnsel(v=>!v)}><i style={{background:ZONE_COLORS.Sénégal}}/>Non sélectionnée</button></div></div></div>{(()=>{const l=lectureSelection(filtered);return <div className="side-card lecture-card"><div className="card-title"><FileText size={16}/> Lecture de la sélection</div>{l?l.paras.map((p,i)=><p key={i} className={i===2?"lecture-txt lecture-sub":"lecture-txt"}>{boldParts(p)}</p>):<p className="muted">Aucune communauté retenue dans la vue actuelle. Ajustez les filtres.</p>}</div>;})()}</div>
 <div className="rail">
 <div className="hint-panel"><MapPin size={20}/><div><b>Explorer la carte</b><span>Cliquez sur une communauté pour afficher son profil détaillé.</span></div></div>
 <LangsPanel data={data}/>
 <div className="side-card weight-card"><div className="card-title"><SlidersHorizontal size={17}/> Pondération du score</div><p className="muted">Testez différents scénarios. Le score est recalculé automatiquement.</p>{([["pop","Population","Nombre d'habitants de la communauté"],["dist","Distance bureau","Distance au bureau de coordination le plus proche"],["dens","Densité / proximité","Nombre d'autres communautés dans un rayon de 25 km"],["recent","Récence PRCC","Ancienneté de la fin du PRCC : plus c'est récent, mieux c'est"]] as [string,string,string][]).map(([k,l,tip])=>{const v=(weights as any)[k];const p=v/50*100;return <div className="weight" key={k}><span className="wlabel" data-tip={tip}>{withPrcc(l)}</span><input type="range" min={0} max={50} step={5} value={v} style={{background:`linear-gradient(90deg,#60a5fa 0 ${p}%,#e2e8f0 ${p}% 100%)`}} onChange={e=>setWeights({...weights,[k]:Number(e.target.value)})}/><b className="wval">{v}</b></div>;})}<div className="weight-total"><span>Total</span><b>{Object.values(weights).reduce((a,b)=>a+b,0)}</b><small>/ 100</small><div className="wprog"><i style={{width:`${Math.min(100,Object.values(weights).reduce((a,b)=>a+b,0))}%`}}/></div></div><button className="linkbtn" onClick={()=>setWeights({pop:0,dist:45,dens:20,recent:35})}>Réinitialiser</button><button className="linkbtn" onClick={()=>{setTab("method");window.scrollTo({top:0,behavior:"smooth"})}}>Comment ce score est-il calculé ? → Méthode</button><div className="callout"><b>Langue</b><span>La langue n'influence pas le score, mais on vérifie qu'aucune langue n'est mise de côté par les autres critères. Utile pour anticiper les besoins en animateurs par langue.</span></div><div className="callout warn"><b>Population Gambie</b><span>Non disponible dans la base actuelle.</span></div></div>
 <div className="table-card"><div className="card-head"><div><h2>Top communautés</h2><span>Classement par score</span></div><button onClick={()=>setTab("communities")}>Voir tout <ChevronRight size={16}/></button></div><Table rows={filtered.slice(0,12)} onSelect={setDrawer}/></div>
 </div></section>
 :<section className="table-card full"><div className="card-head"><div><h2>Toutes les communautés</h2><span>Tri et filtres dans les en-têtes du tableau</span></div></div><CommunitiesTable rows={data} onSelect={setDrawer} preset={{Bureau: bureau!=="Tous"?bureau:"", Pays: country!=="Tous"?country:""}}/></section>}
 </main>
 {toast&&<div className="toast" role="status">Score recalculé ✓</div>}
 {drawer&&<div className="drawer-backdrop" onClick={()=>setDrawer(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setDrawer(null)}><X/></button><span className="rank">RANG #{drawer.rank}</span><h2>{drawer.Communauté}</h2><div className="score-big">{drawer.score.toFixed(1)}<small>/100</small></div><div className={drawer.selected?"status":"status off"}>{drawer.selected?"Sélectionnée pour consultation":"Hors sélection"}</div><div className="details">{[["Pays",drawer.Pays],["Région",drawer.Région],["Commune",drawer.Commune],["Langue",drawer["Langue normalisée"]],["PRCC",`${drawer["Année Début PRCC"]} → ${drawer["Année Fin PRCC"]}`],["Bureau",drawer.Bureau],["Distance",`${Number(drawer["Distance bureau (km)"]).toFixed(1)} km`],["Population",drawer.POPULATION?Number(drawer.POPULATION).toLocaleString("fr-FR"):"Non disponible"],["Coordonnées",`${Number(drawer["Latitude référence"]).toFixed(5)}, ${Number(drawer["Longitude référence"]).toFixed(5)}`]].map(x=><div key={x[0]}><span>{withPrcc(x[0])}</span><b>{x[1]}</b></div>)}</div><h3>Détail du score</h3>{Object.entries({pop:"Population",dist:"Distance",dens:"Densité",recent:"Récence PRCC"}).map(([k,l])=><div className="score-row" key={k}><span>{withPrcc(l)}</span><b>{drawer.scores[k]===null?"n/d":`${drawer.scores[k]!.toFixed(1)} pts`}</b></div>)}<div className="coverage">Score calculé sur <b>{drawer.coverage}%</b> des critères disponibles pour cette communauté. Les données manquantes ne pénalisent pas le classement.</div>
<div className="callout" style={{marginTop:12}}><b>Contexte spatial</b><span>Indicateurs mesurés qui n'entrent pas dans le score de sélection. Distances à vol d'oiseau (OpenStreetMap).</span></div>
<h3>Contexte spatial</h3>
{([["Accessibilité (distance au bureau)",accessScore(drawer)],["Accès route",roadAccessScore(drawer)],["Potentiel agricole (5 km)",agriScore(drawer)]] as [string,number][]).map(([label,val])=><div className="score-row" key={label}><span>{label}</span><b>{val.toFixed(0)}/100</b></div>)}
{([["Ville la plus proche","dist_ville_km"],["Marché le plus proche","dist_marche_osm_km"],["Point d'eau le plus proche","dist_eau_osm_km"]] as [string,string][]).map(([label,field])=><div className="score-row" key={label}><span>{label}</span><b>{Number.isFinite(Number(drawer[field]))?`${Number(drawer[field]).toFixed(1)} km`:"n/d"}</b></div>)}
<div className="coverage">Indice de potentiel spatial : <b>{indiceSpatial(drawer).toFixed(0)}/100</b><br/><small>{indiceSpatial(drawer)>=60?"Potentiel élevé":indiceSpatial(drawer)>=40?"Potentiel moyen":"Potentiel limité"} · combine accessibilité, potentiel agricole et densité locale</small></div></aside></div>}
 </div>
}