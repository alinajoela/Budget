import { useState, useEffect, useRef, useCallback } from "react"
// ─── CONSTANTS ──────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const INCOME_DEFAULTS = {
  salary: 3147,
  maternity: 4225,
  childBenefit: 160,
  rental: 800,
}
// FIXED COSTS — 50% bucket
const FIXED_DEFAULTS = [
  { id:"loans",      label:"Loans (2,022 + 160)",             icon:"🏦", amount:2182   },
  { id:"hoa",        label:"HOA + utilities (avg)",           icon:"🏠", amount:750    },
  { id:"insurance",  label:"Insurance (life ×2 + P&C)",       icon:"🛡️", amount:218   },
  { id:"car_lease",  label:"Car lease (Coop)",                icon:"🚗", amount:243.48 },
  { id:"fuel",       label:"Fuel",                            icon:"⛽", amount:150    },
  { id:"nanny",      label:"Nanny — Natalja",                 icon:"👶", amount:400    },
  { id:"cleaner",    label:"Cleaner",                         icon:"🧹", amount:100    },
  { id:"activities", label:"Kids (kinder 53 + swimming 120)", icon:"🩰", amount:173    },
  { id:"allowances", label:"Alexa + Leon allowances",         icon:"🎒", amount:160    },
  { id:"subs",       label:"Subscriptions",                   icon:"📱", amount:90     },
]
// VARIABLE WANTS — 30% bucket
const VAR_CATEGORIES = [
  { id:"groceries",     label:"Groceries",              icon:"🛒", budget:700, bucket:"50" },
  { id:"restaurants",   label:"Restaurants + delivery", icon:"🍽️", budget:300, bucket:"30" },
  { id:"shopping",      label:"Shopping — Alina",       icon:"👗", budget:300, bucket:"30" },
  { id:"beauty",        label:"Beauty — Alina",         icon:"💄", budget:200, bucket:"30" },
  { id:"ken_cash",      label:"Ken cash",               icon:"💸", budget:100, bucket:"30" },
  { id:"gifts",         label:"Gifts",                  icon:"🎁", budget:100, bucket:"30" },
  { id:"home_misc",     label:"Home misc",              icon:"🔨", budget:150, bucket:"30" },
  { id:"kids_extra",    label:"Kids extra",             icon:"👧", budget:60,  bucket:"30" },
  { id:"pharmacy",      label:"Pharmacy",               icon:"💊", budget:100, bucket:"30" },
  { id:"entertainment", label:"Entertainment",          icon:"🎬", budget:50,  bucket:"30" },
]
// SAVINGS — 20% bucket
const SAVINGS_DEFAULTS = [
  { id:"travel",  label:"Travel fund (640 rental + 260 salary)", icon:"✈️", amount:900  },
  { id:"wedding", label:"Wedding anniversary fund",              icon:"💍", amount:1050 },
  { id:"alina",   label:"Alina savings",                        icon:"💰", amount:0    },
  { id:"ken",     label:"Ken savings",                          icon:"💰", amount:0    },
  { id:"pension", label:"Pension ×2 (redirected to wedding)",   icon:"🏛️", amount:0   },
]
function monthKey(y, m) { return `budget:${y}-${String(m+1).padStart(2,"0")}` }
function emptyMonthData() {
  const entries = {}
  VAR_CATEGORIES.forEach(c => { entries[c.id] = [] })
  return {
    income: { ...INCOME_DEFAULTS },
    fixed: FIXED_DEFAULTS.map(f => ({ ...f })),
    savings: SAVINGS_DEFAULTS.map(s => ({ ...s })),
    varBudgets: Object.fromEntries(VAR_CATEGORIES.map(c => [c.id, c.budget])),
    entries,
    notes: "",
    oneTime: [],
    updatedAt: null,
  }
}
// Migrate stored data: old format used data.spending = { catId: number },
// new format uses data.entries = { catId: [{ id, amount, label }] }.
function migrateData(d) {
  if (!d) return d
  const entries = {}
  VAR_CATEGORIES.forEach((c, i) => {
    if (d.entries && Array.isArray(d.entries[c.id])) {
      entries[c.id] = d.entries[c.id]
    } else if (d.spending && +d.spending[c.id] > 0) {
      entries[c.id] = [{ id: Date.now() + i, amount: +d.spending[c.id], label: "Previous total" }]
    } else {
      entries[c.id] = []
    }
  })
  const out = { ...d, entries }
  delete out.spending
  return out
}
// ─── STORAGE UTILITY ────────────────────────────────────────────
const storage = {
  get: async (key) => {
    const val = localStorage.getItem(key)
    if (!val) throw new Error(`Key not found: ${key}`)
    return { value: val }
  },
  set: async (key, value) => {
    localStorage.setItem(key, value)
  }
}
// ─── UTILS ──────────────────────────────────────────────────────
function entriesOf(d, catId) { return (d && d.entries && d.entries[catId]) || [] }
function totalOf(d, catId) { return entriesOf(d, catId).reduce((a,e) => a + (+e.amount||0), 0) }
function pct(actual, budget) {
  if (!budget) return 0
  return Math.min((actual / budget) * 100, 100)
}
function trafficLight(actual, budget) {
  if (!budget || budget === 0) return actual > 0 ? "over" : "none"
  const p = actual / budget
  if (p <= 0.75) return "green"
  if (p <= 1.0)  return "yellow"
  return "over"
}
function fmt(n) {
  return new Intl.NumberFormat("et-EE", { minimumFractionDigits:0, maximumFractionDigits:0 }).format(n)
}
function fmtD(n) {
  const abs = Math.abs(n)
  const str = new Intl.NumberFormat("et-EE", { minimumFractionDigits:2, maximumFractionDigits:2 }).format(abs)
  return (n < 0 ? "-" : "") + str
}
// ─── STYLES ─────────────────────────────────────────────────────
const C = {
  bg:      "#FAFAF8",
  surface: "#FFFFFF",
  card:    "#FFFFFF",
  border:  "#EAEAE6",
  text:    "#1C1A16",
  muted:   "#8A8880",
  accent:  "#7C5CBF",
  green:   "#2B7A46",
  yellow:  "#C08820",
  red:     "#C83232",
  dim:     "#D0CCC8",
}
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  input[type=number], input[type=text], textarea {
    background: ${C.bg}; border: 1px solid ${C.border}; color: ${C.text};
    font-family: 'DM Mono', monospace; font-size: 13px; padding: 6px 10px;
    border-radius: 6px; outline: none; width: 100%;
    transition: border-color 0.15s;
  }
  input[type=number]:focus, input[type=text]:focus, textarea:focus { border-color: ${C.accent}; }
  button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 4px; }
  .tab-btn { background: none; border: none; color: ${C.muted}; font-size: 13px; padding: 8px 16px; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab-btn.active { color: ${C.accent}; border-bottom-color: ${C.accent}; }
  .tab-btn:hover:not(.active) { color: ${C.text}; }
`
// ─── SUB-COMPONENTS ─────────────────────────────────────────────
function ProgressBar({ pct, color }) {
  const bg = color === "green" ? C.green : color === "yellow" ? C.yellow : C.red
  return (
    <div style={{ height:4, background:C.border, borderRadius:2, overflow:"hidden", marginTop:4 }}>
      <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:bg, borderRadius:2, transition:"width 0.4s ease" }} />
    </div>
  )
}
function Dot({ color }) {
  const bg = color === "green" ? C.green : color === "yellow" ? C.yellow : color === "over" ? C.red : C.dim
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:bg, flexShrink:0 }} />
}
function Card({ children, style }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px", ...style }}>
      {children}
    </div>
  )
}
function SectionTitle({ children, style }) {
  return (
    <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:C.accent, marginBottom:12, ...style }}>
      {children}
    </div>
  )
}
// Per-category entry-based spending logger
function CategorySpending({ cat, data, update }) {
  const [adding, setAdding] = useState(false)
  const [amt, setAmt] = useState("")
  const [lbl, setLbl] = useState("")
  const entries   = entriesOf(data, cat.id)
  const spent     = entries.reduce((a,e) => a + (+e.amount||0), 0)
  const budget    = +data.varBudgets[cat.id] || 0
  const tl        = trafficLight(spent, budget)
  const remaining = budget - spent
  const confirm = () => {
    if (amt === "" || isNaN(+amt)) return
    const ne = [...entries, { id: Date.now(), amount: +amt, label: lbl.trim() }]
    update({ ...data, entries: { ...data.entries, [cat.id]: ne } })
    setAmt(""); setLbl(""); setAdding(false)
  }
  const del = (id) => {
    const ne = entries.filter(e => e.id !== id)
    update({ ...data, entries: { ...data.entries, [cat.id]: ne } })
  }
  return (
    <Card>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18 }}>{cat.icon}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:500 }}>{cat.label}</div>
            <div style={{ fontSize:11, color: remaining >= 0 ? C.muted : C.red, marginTop:1 }}>
              {remaining >= 0 ? `${fmt(remaining)} € left` : `${fmt(Math.abs(remaining))} € over`}
            </div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end", marginBottom:4 }}>
            <Dot color={tl} />
            <span style={{ fontFamily:"'DM Mono'", fontSize:13, color:C.accent }}>{fmt(spent)} €</span>
          </div>
          <div style={{ fontSize:10, color:C.muted }}>budget {fmt(budget)} €</div>
        </div>
      </div>
      <ProgressBar pct={pct(spent, budget)} color={tl} />
      {/* Entry list */}
      {entries.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:10 }}>
          {entries.map(e => (
            <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:"'DM Mono'", fontSize:13, color:C.text, width:64 }}>{fmtD(+e.amount||0)} €</span>
              <span style={{ fontSize:12, color:C.muted, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {e.label || "—"}
              </span>
              <button onClick={() => del(e.id)}
                style={{ background:"none", border:"none", color:C.red, fontSize:16, padding:"0 4px", lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      {/* Add purchase */}
      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{ background:C.accent+"22", border:"none", color:C.accent, borderRadius:6, padding:"6px 12px", fontSize:12, marginTop:10 }}>
          + Add purchase
        </button>
      ) : (
        <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center" }}>
          <input type="number" min="0" placeholder="€" autoFocus value={amt}
            onChange={e => setAmt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm() }}
            style={{ flex:1, textAlign:"right" }} />
          <input type="text" placeholder="Label (optional)" value={lbl}
            onChange={e => setLbl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm() }}
            style={{ flex:2 }} />
          <button onClick={confirm}
            style={{ background:C.green+"33", border:"none", color:C.green, borderRadius:6, padding:"6px 10px", fontSize:14 }}>✓</button>
          <button onClick={() => { setAmt(""); setLbl(""); setAdding(false) }}
            style={{ background:"none", border:"none", color:C.muted, fontSize:16, padding:"0 4px" }}>×</button>
        </div>
      )}
      {/* Budget editor */}
      <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center" }}>
        <div style={{ fontSize:10, color:C.muted, flex:1 }}>Monthly budget</div>
        <input type="number" min="0" placeholder="0"
          value={data.varBudgets[cat.id]}
          onChange={e => update({ ...data, varBudgets: { ...data.varBudgets, [cat.id]: e.target.value } })}
          style={{ width:90, textAlign:"right" }} />
      </div>
    </Card>
  )
}
// ─── MAIN APP ───────────────────────────────────────────────────
export default function BudgetTracker() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tab,   setTab]   = useState("overview")
  const [data,  setData]  = useState(emptyMonthData())
  const [prevData, setPrevData] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const saveRef = useRef(null)
  // ── Load ──
  useEffect(() => {
    const load = async () => {
      try {
        const r = await storage.get(monthKey(year, month))
        setData(migrateData(JSON.parse(r.value)))
      } catch { setData(emptyMonthData()) }
      // load previous month
      const pm = month === 0 ? 11 : month - 1
      const py = month === 0 ? year - 1 : year
      try {
        const r2 = await storage.get(monthKey(py, pm))
        setPrevData(migrateData(JSON.parse(r2.value)))
      } catch { setPrevData(null) }
      setLoaded(true)
    }
    load()
  }, [year, month])
  // ── Save (debounced) ──
  const save = useCallback((newData) => {
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      try {
        await storage.set(monthKey(year, month), JSON.stringify({ ...newData, updatedAt: Date.now() }))
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      } catch (e) { console.error(e) }
    }, 600)
  }, [year, month])
  const update = (newData) => { setData(newData); save(newData) }
  // ── Derived numbers ──
  const totalIncome    = Object.values(data.income).reduce((a,b) => a + (+b||0), 0)
  const totalFixed     = data.fixed.reduce((a,f) => a + (+f.amount||0), 0)
  const totalSavings   = (data.savings || SAVINGS_DEFAULTS).reduce((a,s) => a + (+s.amount||0), 0)
  const varBudgets     = data.varBudgets
  const wants30cats    = VAR_CATEGORIES.filter(c => c.id !== "groceries")
  const total30spent   = wants30cats.reduce((a,c) => a + totalOf(data, c.id), 0)
  const total30budget  = wants30cats.reduce((a,c) => a + (+varBudgets[c.id]||0), 0)
  const groceriesSpent = totalOf(data, "groceries")
  const totalVarSpent  = VAR_CATEGORIES.reduce((a,c) => a + totalOf(data, c.id), 0)
  const totalVarBudget = VAR_CATEGORIES.reduce((a,c) => a + (+varBudgets[c.id]||0), 0)
  const oneTimeTotal   = data.oneTime.reduce((a,x) => a + (+x.amount||0), 0)
  const totalExpenses  = totalFixed + totalVarSpent + totalSavings + oneTimeTotal
  const freeToSpend    = totalIncome - totalFixed - totalVarSpent - totalSavings - oneTimeTotal
  const budgetedFree   = totalIncome - totalFixed - totalVarBudget - totalSavings
  // ── Month nav ──
  const prevMonth = () => {
    if (month === 0) { setYear(y => y-1); setMonth(11) }
    else setMonth(m => m-1)
    setLoaded(false)
  }
  const nextMonth = () => {
    const nm = month === 11 ? 0 : month + 1
    const ny = month === 11 ? year + 1 : year
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth())) return
    if (month === 11) { setYear(y => y+1); setMonth(0) }
    else setMonth(m => m+1)
    setLoaded(false)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  if (!loaded) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:28 }}>💰</div>
      <div style={{ color:C.muted, fontSize:13 }}>Loading...</div>
    </div>
  )
  return (
    <div style={{ background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto" }}>
      <style>{css}</style>
      {/* ── HEADER ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 }}>
        {/* Month selector */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px 10px" }}>
          <button onClick={prevMonth} style={{ background:"none", border:"none", color:C.muted, fontSize:18, padding:"4px 8px" }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:22, color:C.text }}>{MONTHS[month]} {year}</div>
            {saved && <div style={{ fontSize:10, color:C.green, marginTop:2 }}>✓ saved</div>}
            {!saved && data.updatedAt && <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
              updated {new Date(data.updatedAt).toLocaleDateString("et-EE")}
            </div>}
          </div>
          <button onClick={nextMonth} style={{ background:"none", border:"none", color: isCurrentMonth ? C.dim : C.muted, fontSize:18, padding:"4px 8px" }}>›</button>
        </div>
        {/* FREE TO SPEND hero */}
        <div style={{ padding:"0 20px 14px", textAlign:"center" }}>
          <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.muted, marginBottom:4 }}>Free to spend</div>
          <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:44, fontWeight:400, color: freeToSpend >= 0 ? C.green : C.red, lineHeight:1 }}>
            {freeToSpend >= 0 ? "" : "−"}{fmt(Math.abs(freeToSpend))} €
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
            Budgeted buffer: <span style={{ color: budgetedFree > 0 ? C.accent : C.red }}>{fmt(budgetedFree)} €</span>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${C.border}` }}>
          {[["overview","Overview"],["variable","Spending"],["fixed","Fixed"],["income","Income"],["compare","vs last month"]].map(([id,label]) => (
            <button key={id} className={`tab-btn${tab===id?" active":""}`} onClick={() => setTab(id)} style={{ flex:1, fontSize:11 }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:"16px" }}>
        {/* ══ OVERVIEW TAB ══ */}
        {tab === "overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* 50/30/20 strip */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[
                ["50% Needs", totalFixed + groceriesSpent, totalFixed + 700, C.accent],
                ["30% Wants", total30spent, total30budget, C.yellow],
                ["20% Savings", totalSavings, totalSavings, C.green],
              ].map(([label, val, budget, color]) => {
                const over = val > budget && !label.includes("Savings")
                return (
                  <Card key={label} style={{ padding:"12px" }}>
                    <div style={{ fontSize:9, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</div>
                    <div style={{ fontFamily:"'DM Mono'", fontSize:14, color: over ? C.red : color, fontWeight:500 }}>{fmt(val)}</div>
                    <div style={{ fontSize:9, color:C.dim, marginTop:2 }}>/ {fmt(budget)}</div>
                    <ProgressBar pct={pct(val, budget)} color={label.includes("Savings") ? "green" : trafficLight(val, budget)} />
                  </Card>
                )
              })}
            </div>
            {/* Budget progress overall */}
            <Card>
              <SectionTitle>Variable budget progress</SectionTitle>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:C.muted }}>Spent so far</span>
                <span style={{ fontFamily:"'DM Mono'", fontSize:12, color:C.accent }}>
                  {fmt(totalVarSpent)} / {fmt(totalVarBudget)} €
                </span>
              </div>
              <ProgressBar pct={pct(totalVarSpent, totalVarBudget)} color={trafficLight(totalVarSpent, totalVarBudget)} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
                <span style={{ fontSize:11, color:C.muted }}>Remaining in variable</span>
                <span style={{ fontFamily:"'DM Mono'", fontSize:11, color: totalVarBudget - totalVarSpent >= 0 ? C.green : C.red }}>
                  {fmt(totalVarBudget - totalVarSpent)} €
                </span>
              </div>
            </Card>
            {/* Category overview traffic lights */}
            <Card>
              <SectionTitle>Categories at a glance</SectionTitle>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {VAR_CATEGORIES.map(cat => {
                  const spent = totalOf(data, cat.id)
                  const budget = +varBudgets[cat.id] || 0
                  const tl = trafficLight(spent, budget)
                  if (spent === 0 && budget === 0) return null
                  return (
                    <div key={cat.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <Dot color={tl} />
                      <span style={{ fontSize:13, flex:1 }}>{cat.icon} {cat.label}</span>
                      <span style={{ fontFamily:"'DM Mono'", fontSize:12, color:C.muted }}>
                        {fmt(spent)}<span style={{ color:C.dim }}> / {fmt(budget)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
            {/* One-time expenses */}
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <SectionTitle style={{ marginBottom:0 }}>One-time expenses</SectionTitle>
                <button
                  onClick={() => update({ ...data, oneTime: [...data.oneTime, { id:Date.now(), label:"", amount:"" }] })}
                  style={{ background:C.accent+"22", border:"none", color:C.accent, borderRadius:6, padding:"4px 10px", fontSize:12 }}
                >+ Add</button>
              </div>
              {data.oneTime.length === 0 && (
                <div style={{ color:C.muted, fontSize:12, fontStyle:"italic" }}>No one-time expenses yet</div>
              )}
              {data.oneTime.map((item, i) => (
                <div key={item.id} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
                  <input type="text" placeholder="Label" value={item.label}
                    onChange={e => { const n=[...data.oneTime]; n[i]={...n[i],label:e.target.value}; update({...data,oneTime:n}) }}
                    style={{ flex:2 }} />
                  <input type="number" placeholder="€" value={item.amount}
                    onChange={e => { const n=[...data.oneTime]; n[i]={...n[i],amount:e.target.value}; update({...data,oneTime:n}) }}
                    style={{ flex:1, textAlign:"right" }} />
                  <button onClick={() => { const n=data.oneTime.filter((_,j)=>j!==i); update({...data,oneTime:n}) }}
                    style={{ background:"none", border:"none", color:C.red, fontSize:16, padding:"0 4px" }}>×</button>
                </div>
              ))}
              {data.oneTime.length > 0 && (
                <div style={{ textAlign:"right", fontFamily:"'DM Mono'", fontSize:12, color:C.accent, marginTop:4 }}>
                  Total: {fmt(oneTimeTotal)} €
                </div>
              )}
            </Card>
            {/* Notes */}
            <Card>
              <SectionTitle>Notes</SectionTitle>
              <textarea
                rows={3}
                placeholder="Monthly notes, anomalies, things to remember…"
                value={data.notes}
                onChange={e => update({ ...data, notes: e.target.value })}
                style={{ resize:"vertical", fontSize:12, lineHeight:1.6 }}
              />
            </Card>
          </div>
        )}
        {/* ══ VARIABLE SPENDING TAB ══ */}
        {tab === "variable" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>
              Log each purchase as you go. Category totals add up automatically.
            </div>
            {VAR_CATEGORIES.map(cat => (
              <CategorySpending key={cat.id} cat={cat} data={data} update={update} />
            ))}
          </div>
        )}
        {/* ══ FIXED COSTS TAB ══ */}
        {tab === "fixed" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>
              These repeat every month. Adjust if amounts change.
            </div>
            {data.fixed.map((item, i) => (
              <Card key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px" }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13 }}>{item.label}</div>
                </div>
                <input type="number" value={item.amount}
                  onChange={e => { const n=[...data.fixed]; n[i]={...n[i],amount:e.target.value}; update({...data,fixed:n}) }}
                  style={{ width:90, textAlign:"right", fontFamily:"'DM Mono'", fontSize:13 }}
                />
                <span style={{ color:C.muted, fontSize:12 }}>€</span>
              </Card>
            ))}
            <div style={{ textAlign:"right", padding:"8px 4px" }}>
              <span style={{ fontSize:12, color:C.muted }}>Total fixed: </span>
              <span style={{ fontFamily:"'DM Mono'", fontSize:15, color:C.accent }}>{fmtD(totalFixed)} €</span>
            </div>
            {/* Savings section */}
            <div style={{ marginTop:20, marginBottom:10 }}>
              <SectionTitle>💰 Savings — 20% bucket</SectionTitle>
            </div>
            {(data.savings || SAVINGS_DEFAULTS).map((item, i) => (
              <Card key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", marginBottom:8 }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                <div style={{ flex:1 }}><div style={{ fontSize:13 }}>{item.label}</div></div>
                <input type="number" value={item.amount}
                  onChange={e => { const n=[...(data.savings||SAVINGS_DEFAULTS)]; n[i]={...n[i],amount:e.target.value}; update({...data,savings:n}) }}
                  style={{ width:90, textAlign:"right", fontFamily:"'DM Mono'", fontSize:13 }} />
                <span style={{ color:C.muted, fontSize:12 }}>€</span>
              </Card>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0 16px" }}>
              <span style={{ fontSize:12, color:C.muted }}>Total savings: <b style={{color:C.green}}>{fmt(totalSavings)} €</b></span>
              <span style={{ fontSize:12, color:C.muted }}><b style={{color:C.green}}>{((totalSavings/(totalIncome||1))*100).toFixed(1)}%</b> of income</span>
            </div>
          </div>
        )}
        {/* ══ INCOME TAB ══ */}
        {tab === "income" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[
              ["salary",     "💼", "Ken salary (ALMIC OÜ)"],
              ["maternity",  "🤱", "Alina maternity benefit"],
              ["childBenefit","👶","Child benefit"],
              ["rental",     "🏠", "Rental — Vana-Kalamaja"],
            ].map(([key, icon, label]) => (
              <Card key={key} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13 }}>{label}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>monthly</div>
                </div>
                <input type="number" value={data.income[key]}
                  onChange={e => update({ ...data, income: { ...data.income, [key]: e.target.value } })}
                  style={{ width:100, textAlign:"right", fontFamily:"'DM Mono'", fontSize:14 }}
                />
                <span style={{ color:C.muted, fontSize:12 }}>€</span>
              </Card>
            ))}
            <div style={{ textAlign:"right", padding:"8px 0" }}>
              <span style={{ fontSize:12, color:C.muted }}>Total income: </span>
              <span style={{ fontFamily:"'DM Mono'", fontSize:15, color:C.green }}>{fmtD(totalIncome)} €</span>
            </div>
            {/* Income breakdown bar */}
            <Card>
              <SectionTitle>Income allocation</SectionTitle>
              {[
                ["Fixed costs", totalFixed, C.red+"99"],
                ["Variable budget", totalVarBudget, C.yellow+"99"],
                ["Buffer (budgeted)", budgetedFree, C.green+"99"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12 }}>{label}</span>
                    <span style={{ fontFamily:"'DM Mono'", fontSize:12 }}>{fmt(val)} €</span>
                  </div>
                  <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.max(0, (val/totalIncome)*100)}%`, background:color, borderRadius:3 }} />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
        {/* ══ COMPARE TAB ══ */}
        {tab === "compare" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {!prevData ? (
              <Card>
                <div style={{ color:C.muted, fontSize:13, fontStyle:"italic", textAlign:"center", padding:"20px 0" }}>
                  No data for previous month yet.
                </div>
              </Card>
            ) : (
              <>
                {/* Summary comparison */}
                <Card>
                  <SectionTitle>Month overview</SectionTitle>
                  {[
                    ["Income", totalIncome, Object.values(prevData.income).reduce((a,b)=>a+(+b||0),0)],
                    ["Fixed", totalFixed, prevData.fixed.reduce((a,f)=>a+(+f.amount||0),0)],
                    ["Variable", totalVarSpent, VAR_CATEGORIES.reduce((a,c)=>a+totalOf(prevData, c.id),0)],
                    ["Free to spend", freeToSpend,
                      Object.values(prevData.income).reduce((a,b)=>a+(+b||0),0)
                      - prevData.fixed.reduce((a,f)=>a+(+f.amount||0),0)
                      - VAR_CATEGORIES.reduce((a,c)=>a+totalOf(prevData, c.id),0)
                      - (prevData.savings||SAVINGS_DEFAULTS).reduce((a,s)=>a+(+s.amount||0),0)
                      - prevData.oneTime.reduce((a,x)=>a+(+x.amount||0),0)
                    ],
                  ].map(([label, curr, prev]) => {
                    const diff = curr - prev
                    const pm = month === 0 ? 11 : month - 1
                    return (
                      <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                        <span style={{ fontSize:13, color:C.muted, width:100 }}>{label}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                          <span style={{ fontFamily:"'DM Mono'", fontSize:12, color:C.muted }}>{MONTHS[pm]}: {fmt(prev)}</span>
                          <span style={{ fontFamily:"'DM Mono'", fontSize:13 }}>{MONTHS[month]}: {fmt(curr)}</span>
                          <span style={{ fontFamily:"'DM Mono'", fontSize:11,
                            color: diff === 0 ? C.muted : (label==="Income"||label==="Free to spend") ? (diff>0?C.green:C.red) : (diff>0?C.red:C.green)
                          }}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </Card>
                {/* Per-category comparison */}
                <Card>
                  <SectionTitle>Variable spending by category</SectionTitle>
                  {VAR_CATEGORIES.map(cat => {
                    const curr = totalOf(data, cat.id)
                    const prev = totalOf(prevData, cat.id)
                    if (curr === 0 && prev === 0) return null
                    const diff = curr - prev
                    const pm = month === 0 ? 11 : month - 1
                    return (
                      <div key={cat.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                        <span style={{ fontSize:15, width:22 }}>{cat.icon}</span>
                        <span style={{ fontSize:12, flex:1 }}>{cat.label}</span>
                        <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:C.muted }}>{MONTHS[pm]}: {fmt(prev)}</span>
                        <span style={{ fontFamily:"'DM Mono'", fontSize:12 }}>{fmt(curr)}</span>
                        <span style={{ fontFamily:"'DM Mono'", fontSize:11, width:44, textAlign:"right",
                          color: diff === 0 ? C.muted : diff > 0 ? C.red : C.green
                        }}>
                          {diff > 0 ? "+" : ""}{fmt(diff)}
                        </span>
                      </div>
                    )
                  })}
                </Card>
              </>
            )}
          </div>
        )}
      </div>
      {/* Bottom padding */}
      <div style={{ height:32 }} />
    </div>
  )
}
