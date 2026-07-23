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
// ─── INVESTMENTS ────────────────────────────────────────────────
// Portfolio + savings goals. Stored under a single rolling key (not
// per-month). Balances are the only thing entered by hand each month;
// everything else auto-calculates.
const INVEST_KEY = "invest:v1"
const PLATFORM_GROUPS = {
  safety:  "Safety nets",
  growth:  "Growth investments",
  pension: "Pension (locked)",
  ken:     "Ken — separate",
}
const INVEST_DEFAULTS = {
  platforms: [
    { id:"wise",       label:"Wise",              balance:1500,  group:"safety",  note:"Peace of mind, instant liquidity" },
    { id:"bondora",    label:"Bondora Go & Grow", balance:7983,  group:"safety",  note:"Emergency fund · 6% APY" },
    { id:"lightyear",  label:"Lightyear",         balance:5776,  group:"growth",  note:"S&P 500 + Robotics ETF" },
    { id:"ibkr",       label:"IBKR",              balance:12243, group:"growth",  note:"Nasdaq-100, Nvidia, Nordic ETF" },
    { id:"varad",      label:"Varad",             balance:6865,  group:"growth",  note:"Bonds (Liven/Arco/Apollo) + crypto" },
    { id:"pension2",   label:"Pension II",        balance:19949, group:"pension", note:"Locked · automatic" },
    { id:"pension3",   label:"Pension III",       balance:38923, group:"pension", note:"Locked · automatic (LHV)" },
    { id:"kraken",     label:"Kraken",            balance:1541,  group:"ken",     note:"Ken crypto · down 49%, holding" },
    { id:"ken_travel", label:"Ken travel fund",   balance:1000,  group:"ken",     note:"Ken's separate travel savings" },
  ],
  goals: [
    { id:"peace",     label:"Peace of Mind Fund", icon:"🛟", target:3500,    monthly:450,  returnPct:0, targetDate:"2026-10", linked:["wise"] },
    { id:"emergency", label:"Emergency Fund",     icon:"🛡️", target:15000,  monthly:450,  returnPct:6, targetDate:"2028-12", linked:["bondora"] },
    { id:"million",   label:"Path to €1 Million", icon:"🚀", target:1000000, monthly:1600, returnPct:5, targetDate:"",        linked:["lightyear","ibkr","varad"] },
  ],
  includePension: false,
  updatedAt: null,
}
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
// ─── JUNE 2026 SEED ─────────────────────────────────────────────
// Real June 2026 actuals. Seeded into localStorage once on first load,
// and only when no data already exists for the month (never overwrites).
// Keeping this means the month repopulates on any device/browser where
// it is missing (e.g. Safari), but leaves existing edits untouched.
const JUNE_2026_KEY = "budget:2026-06"
const JUNE_2026 = {
  income: { ...INCOME_DEFAULTS },
  // Fuel is a fixed cost in this app (single amount, no entry list), so the
  // itemized fuel purchases are summed into the fixed "Fuel" line (€213.20).
  fixed: FIXED_DEFAULTS.map(f => f.id === "fuel" ? { ...f, amount: 213.20 } : { ...f }),
  savings: SAVINGS_DEFAULTS.map(s => ({ ...s })),
  varBudgets: Object.fromEntries(VAR_CATEGORIES.map(c => [c.id, c.budget])),
  entries: {
    groceries: [
      { id:1, amount:112.64, label:"Tondi Selver" },
      { id:2, amount:2.59,   label:"Rimi Sopruse" },
      { id:3, amount:4.94,   label:"Lidl" },
      { id:4, amount:25.34,  label:"Rimi Sopruse" },
      { id:5, amount:1.91,   label:"Tondi Selver" },
      { id:6, amount:11.53,  label:"Balti-Jaama turg" },
      { id:7, amount:19.72,  label:"Estonian Food Products" },
      { id:8, amount:4.20,   label:"Rocca Bio market" },
      { id:9, amount:67.13,  label:"Rimi Sopruse" },
      { id:10, amount:23.95, label:"Milvi Zubova market" },
      { id:11, amount:62.91, label:"Maxima" },
      { id:12, amount:9.11,  label:"Tondi Selver" },
      { id:13, amount:73.67, label:"Rimi online" },
      { id:14, amount:9.44,  label:"Sopruse Rimi pakiautomaat" },
      { id:15, amount:26.46, label:"IKEA food market" },
      { id:16, amount:11.50, label:"Balti-Jaama turg" },
      { id:17, amount:23.53, label:"Milvi Zubova" },
      { id:18, amount:7.27,  label:"Rimi Telliskivi" },
      { id:19, amount:5.53,  label:"Balti Jaama Bio" },
      { id:20, amount:22.93, label:"Rimi Sopruse" },
      { id:21, amount:55.40, label:"Lidl" },
      { id:22, amount:16.00, label:"Uku Sööt — toit" },
      { id:23, amount:8.00,  label:"NYX AardePagarO" },
      { id:24, amount:66.97, label:"Rimi online" },
      { id:25, amount:46.78, label:"Rimi online" },
      { id:26, amount:-7.76, label:"Rimi refund" },
      { id:27, amount:32.87, label:"Rimi Ülemiste" },
      { id:28, amount:31.31, label:"Milvi Zubova" },
      { id:29, amount:10.80, label:"Lidl" },
      { id:30, amount:34.85, label:"Rimi Sopruse" },
      { id:31, amount:6.20,  label:"Kristiine Kvaliteetliha" },
    ],
    restaurants: [
      { id:1, amount:20.00, label:"Pōhjala Tap Room" },
      { id:2, amount:9.00,  label:"La Muu Kohvik" },
      { id:3, amount:8.90,  label:"Nunne Caffeine" },
      { id:4, amount:24.00, label:"Marymaris" },
      { id:5, amount:2.10,  label:"Marymaris" },
      { id:6, amount:2.79,  label:"No Bananas Kristiine" },
      { id:7, amount:7.50,  label:"Haaberstikohvik" },
      { id:8, amount:9.68,  label:"IKEA restaurant" },
      { id:9, amount:9.00,  label:"Balti Jaama Söbralt" },
      { id:10, amount:17.00, label:"Fotografiska restaurant" },
      { id:11, amount:16.70, label:"Gelateria" },
      { id:12, amount:14.30, label:"Crustum bakery" },
      { id:13, amount:15.00, label:"Saba" },
      { id:20, amount:15.72, label:"Wolt (delivery)" },
      { id:21, amount:16.52, label:"Wolt (delivery)" },
      { id:22, amount:23.42, label:"Bolt Food (delivery)" },
      { id:23, amount:23.87, label:"Wolt (delivery)" },
      { id:24, amount:33.59, label:"Bolt Food (delivery)" },
      { id:25, amount:30.79, label:"Bolt Food (delivery)" },
    ],
    shopping: [
      { id:1, amount:29.00,  label:"Vakhula Style Chat" },
      { id:2, amount:31.91,  label:"sin-say.com" },
      { id:3, amount:12.99,  label:"H&M Kristiine" },
      { id:4, amount:62.98,  label:"H&M Stockholm" },
      { id:5, amount:32.95,  label:"Zara" },
      { id:6, amount:17.99,  label:"Vinted ×2" },
      { id:7, amount:5.83,   label:"Vinted" },
      { id:8, amount:35.23,  label:"Mango/Viru" },
      { id:9, amount:28.90,  label:"Zara/Viru" },
      { id:10, amount:46.93, label:"H&M Stockholm" },
      { id:11, amount:100.00, label:"Zara_EE (keeping ~100, rest returned)" },
      { id:12, amount:0,     label:"Mango.com — returned" },
    ],
    beauty: [
      { id:1, amount:12.00, label:"Viktoriia Isakova" },
      { id:2, amount:35.00, label:"Glow Beauty Studio" },
      { id:3, amount:50.00, label:"B.E. Studio" },
      { id:4, amount:40.00, label:"B.E. Studio" },
      { id:5, amount:81.00, label:"Jekaterina Skromnova — cream + procedure" },
    ],
    ken_cash: [
      { id:1, amount:100.00, label:"Ken Revolut cash" },
    ],
    gifts: [
      { id:1, amount:60.00,  label:"Matkasport — gift" },
      { id:2, amount:50.00,  label:"Zara Home — gift" },
      { id:3, amount:27.57,  label:"XS Kristiine — gift portion" },
      { id:4, amount:7.00,   label:"Marina Dorosenko" },
      { id:5, amount:103.18, label:"Temu — Marina bachelorette" },
      { id:6, amount:42.47,  label:"EVP xsmanguasjad — gift" },
    ],
    home_misc: [
      { id:1, amount:39.99, label:"JYSK" },
      { id:2, amount:8.68,  label:"Bauhof" },
      { id:3, amount:99.78, label:"IKEA furniture" },
      { id:4, amount:60.00, label:"Matkasport (home half)" },
    ],
    kids_extra: [
      { id:1, amount:28.00, label:"Tiger Ülemiste" },
      { id:2, amount:22.50, label:"Pepco" },
      { id:3, amount:2.50,  label:"MINISO" },
      { id:4, amount:17.00, label:"XS Kristiine — Alexa" },
    ],
    pharmacy: [
      { id:1, amount:36.99, label:"Haabersti Tervisekesku — vaccine" },
      { id:2, amount:6.15,  label:"Sopruse Rimi Südameapt" },
      { id:3, amount:7.44,  label:"Tallinna Linnaapteek" },
      { id:4, amount:42.57, label:"Pharmamint" },
    ],
    entertainment: [
      { id:1, amount:12.05, label:"Apollo Kino" },
      { id:2, amount:26.79, label:"Apollo Kino ×2" },
      { id:3, amount:2.72,  label:"Apollo Kino" },
      { id:4, amount:0.90,  label:"Mustamäe Elamusspa" },
      { id:5, amount:1.69,  label:"Mustamäe Elamusspa" },
    ],
    // Itemized fuel purchases kept for the record (summed into fixed "Fuel").
    fuel: [
      { id:1, amount:91.00, label:"Fuel — Ken (Kute)" },
      { id:2, amount:86.78, label:"Olerex — carry to July" },
      { id:3, amount:13.01, label:"Uber" },
      { id:4, amount:14.00, label:"Uber split" },
      { id:5, amount:4.41,  label:"Bolt taxi" },
      { id:6, amount:4.00,  label:"Europark" },
    ],
  },
  notes: "Heavy month: Alexa birthday, bachelorette boat, Crete flights booked, lots of gifts.\nMango return pending ~176 EUR. Zara return pending ~209 EUR.\nOlerex 86.78 carry-over to July fuel budget.\nWedding decor from Thai/anniversary budget.",
  oneTime: [
    { id:1, label:"Pärnu apartment (Kristina)", amount:407.06 },
    { id:2, label:"Wedding decor — Temu", amount:49.26 },
    { id:3, label:"Wedding decor — Temu order 2", amount:62.47 },
    { id:4, label:"Credit card repayment May", amount:804.00 },
    { id:5, label:"Crete flights LY-KC82KRN", amount:2040.00 },
    { id:6, label:"Google One subscription", amount:21.99 },
    { id:7, label:"Claude.ai subscription", amount:22.32 },
    { id:8, label:"Books — Mnogo Knig", amount:10.58 },
    { id:9, label:"Car govt fee", amount:5.00 },
  ],
  updatedAt: null,
}
function seedJune2026() {
  if (typeof window === "undefined" || !window.localStorage) return
  try {
    if (localStorage.getItem(JUNE_2026_KEY)) return
    const data = { ...emptyMonthData(), ...JUNE_2026, updatedAt: Date.now() }
    storage.set(JUNE_2026_KEY, JSON.stringify(data))
  } catch (e) { console.error(e) }
}
seedJune2026()
// ─── UTILS ──────────────────────────────────────────────────────
// Whole months from (fromY, fromM 0-indexed) to a "YYYY-MM" target.
function monthsUntil(fromY, fromM, toStr) {
  if (!toStr) return null
  const [ty, tm] = toStr.split("-").map(Number)
  return (ty - fromY) * 12 + ((tm - 1) - fromM)
}
// Future value of a starting balance plus fixed monthly contributions,
// compounded monthly at an annual percentage rate.
function futureValue(current, monthly, annualPct, months) {
  const i = annualPct / 100 / 12
  if (i === 0) return current + monthly * months
  return current * Math.pow(1 + i, months) + monthly * ((Math.pow(1 + i, months) - 1) / i)
}
// Months of contributions needed to reach a target (null if > 1000 months).
function monthsToReach(current, monthly, annualPct, target) {
  if (current >= target) return 0
  if (monthly <= 0 && annualPct <= 0) return null
  const i = annualPct / 100 / 12
  let bal = current, m = 0
  while (bal < target && m < 1200) { bal = bal * (1 + i) + monthly; m++ }
  return m >= 1200 ? null : m
}
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
// ─── INVESTMENTS TAB ────────────────────────────────────────────
function Investments() {
  const now = new Date()
  const [inv, setInv] = useState(INVEST_DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveRef = useRef(null)
  useEffect(() => {
    const load = async () => {
      try {
        const r = await storage.get(INVEST_KEY)
        const parsed = JSON.parse(r.value)
        // Merge so newly-added default platforms/goals appear for old saves.
        setInv({ ...INVEST_DEFAULTS, ...parsed })
      } catch { setInv(INVEST_DEFAULTS) }
      setLoaded(true)
    }
    load()
  }, [])
  const save = useCallback((next) => {
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      try {
        await storage.set(INVEST_KEY, JSON.stringify({ ...next, updatedAt: Date.now() }))
        setSaved(true); setTimeout(() => setSaved(false), 1500)
      } catch (e) { console.error(e) }
    }, 600)
  }, [])
  const update = (next) => { setInv(next); save(next) }
  const setPlatformField = (id, field, val) => {
    const platforms = inv.platforms.map(p => p.id === id ? { ...p, [field]: val } : p)
    update({ ...inv, platforms })
  }
  const addPlatform = () => {
    const p = { id:"p"+Date.now(), label:"New account", balance:0, group:"growth", note:"" }
    update({ ...inv, platforms:[...inv.platforms, p] })
  }
  const delPlatform = (id) => {
    const platforms = inv.platforms.filter(p => p.id !== id)
    const goals = inv.goals.map(g => ({ ...g, linked: g.linked.filter(l => l !== id) }))
    update({ ...inv, platforms, goals })
  }
  const setGoalField = (id, field, val) => {
    const goals = inv.goals.map(g => g.id === id ? { ...g, [field]: val } : g)
    update({ ...inv, goals })
  }
  const toggleLink = (goalId, platId) => {
    const goals = inv.goals.map(g => {
      if (g.id !== goalId) return g
      const linked = g.linked.includes(platId) ? g.linked.filter(l => l !== platId) : [...g.linked, platId]
      return { ...g, linked }
    })
    update({ ...inv, goals })
  }
  const addGoal = () => {
    const g = { id:"g"+Date.now(), label:"New goal", icon:"🎯", target:0, monthly:0, returnPct:0, targetDate:"", linked:[] }
    update({ ...inv, goals:[...inv.goals, g] })
  }
  const delGoal = (id) => update({ ...inv, goals: inv.goals.filter(g => g.id !== id) })
  if (!loaded) return (
    <div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:"30px 0" }}>Loading…</div>
  )
  const selectStyle = { background:C.bg, border:`1px solid ${C.border}`, color:C.text, fontFamily:"'DM Mono', monospace", fontSize:13, padding:"6px 8px", borderRadius:6, outline:"none" }
  const balOf = (id) => { const p = inv.platforms.find(x => x.id === id); return p ? (+p.balance||0) : 0 }
  const groupTotal = (g) => inv.platforms.filter(p => p.group === g).reduce((a,p) => a + (+p.balance||0), 0)
  const pensionTotal = groupTotal("pension")
  const personalNet = groupTotal("safety") + groupTotal("growth") + (inv.includePension ? pensionTotal : 0)
  const kenTotal = groupTotal("ken")
  const goalCurrent = (g) => g.linked.reduce((a, id) => a + balOf(id), 0)
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Net worth hero */}
      <Card style={{ textAlign:"center", padding:"18px 16px" }}>
        <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.muted, marginBottom:4 }}>
          Net worth{inv.includePension ? " (incl. pension)" : ""}
        </div>
        <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:38, color:C.text, lineHeight:1 }}>
          {fmt(personalNet)} €
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:C.muted }}>Safety <b style={{ color:C.text }}>{fmt(groupTotal("safety"))} €</b></span>
          <span style={{ fontSize:11, color:C.muted }}>Growth <b style={{ color:C.text }}>{fmt(groupTotal("growth"))} €</b></span>
          <span style={{ fontSize:11, color:C.muted }}>Pension <b style={{ color:C.text }}>{fmt(pensionTotal)} €</b></span>
        </div>
        {saved && <div style={{ fontSize:10, color:C.green, marginTop:8 }}>✓ saved</div>}
      </Card>
      {/* Settings */}
      <Card style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px" }}>
        <div>
          <div style={{ fontSize:13 }}>Include pension in totals</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>Pension is locked & automatic — off by default</div>
        </div>
        <button
          onClick={() => update({ ...inv, includePension: !inv.includePension })}
          style={{
            width:44, height:24, borderRadius:12, border:"none", position:"relative", flexShrink:0,
            background: inv.includePension ? C.accent : C.dim, transition:"background 0.15s",
          }}>
          <span style={{
            position:"absolute", top:2, left: inv.includePension ? 22 : 2, width:20, height:20,
            borderRadius:"50%", background:"#fff", transition:"left 0.15s",
          }} />
        </button>
      </Card>
      {/* Goals */}
      <SectionTitle style={{ marginBottom:0, marginTop:4 }}>Savings goals</SectionTitle>
      {inv.goals.map(g => {
        const current = goalCurrent(g)
        const target = +g.target || 0
        const monthly = +g.monthly || 0
        const ret = +g.returnPct || 0
        const p = target > 0 ? Math.min((current / target) * 100, 100) : 0
        const remaining = Math.max(target - current, 0)
        const mUntil = monthsUntil(now.getFullYear(), now.getMonth(), g.targetDate)
        const mToReach = monthsToReach(current, monthly, ret, target)
        const projAtDate = mUntil != null && mUntil > 0 ? futureValue(current, monthly, ret, mUntil) : null
        const onTrack = projAtDate != null ? projAtDate >= target : null
        const tl = p >= 100 ? "green" : onTrack === false ? "over" : onTrack === true ? "green" : "yellow"
        return (
          <Card key={g.id}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <input type="text" value={g.icon} onChange={e => setGoalField(g.id, "icon", e.target.value)}
                style={{ width:38, textAlign:"center", fontSize:18, padding:"4px 2px" }} />
              <input type="text" value={g.label} onChange={e => setGoalField(g.id, "label", e.target.value)}
                style={{ flex:1, fontSize:14, fontFamily:"'DM Sans', sans-serif" }} />
              <button onClick={() => delGoal(g.id)} title="Delete goal"
                style={{ background:"none", border:"none", color:C.red, fontSize:18, padding:"0 4px", lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
              <span style={{ fontSize:11, color:C.muted }}>{fmt(current)} € of {fmt(target)} €</span>
              <div style={{ textAlign:"right" }}>
                <span style={{ fontFamily:"'DM Mono'", fontSize:16, color:C.accent }}>{p.toFixed(0)}%</span>
                {remaining > 0
                  ? <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>{fmt(remaining)} € to go</span>
                  : <span style={{ fontSize:10, color:C.green, marginLeft:8 }}>reached ✓</span>}
              </div>
            </div>
            <ProgressBar pct={p} color={tl} />
            {/* Status line */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:10, alignItems:"center" }}>
              {g.targetDate && mUntil != null && (
                <span style={{ fontSize:11, color:C.muted }}>
                  Target {g.targetDate} · {mUntil > 0 ? `${mUntil} mo left` : "due"}
                </span>
              )}
              {remaining > 0 && mToReach != null && (
                <span style={{ fontSize:11, color:C.muted }}>
                  At {fmt(monthly)} €/mo{ret ? ` · ${ret}%` : ""}: ~{mToReach} mo
                  {mToReach >= 24 ? ` (${(mToReach/12).toFixed(1)} yr)` : ""}
                </span>
              )}
              {onTrack !== null && remaining > 0 && (
                <span style={{
                  fontSize:10, fontWeight:500, padding:"2px 8px", borderRadius:10,
                  color: onTrack ? C.green : C.red, background: (onTrack ? C.green : C.red) + "22",
                }}>
                  {onTrack ? "On track" : "Behind"}
                </span>
              )}
            </div>
            {/* Assumptions */}
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <label style={{ flex:1 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Target €</div>
                <input type="number" value={g.target}
                  onChange={e => setGoalField(g.id, "target", e.target.value)} style={{ textAlign:"right" }} />
              </label>
              <label style={{ flex:1 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>€ / month</div>
                <input type="number" value={g.monthly}
                  onChange={e => setGoalField(g.id, "monthly", e.target.value)} style={{ textAlign:"right" }} />
              </label>
              <label style={{ flex:1 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Return %</div>
                <input type="number" value={g.returnPct}
                  onChange={e => setGoalField(g.id, "returnPct", e.target.value)} style={{ textAlign:"right" }} />
              </label>
              <label style={{ flex:1.3 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Target date</div>
                <input type="text" placeholder="YYYY-MM" value={g.targetDate}
                  onChange={e => setGoalField(g.id, "targetDate", e.target.value)} style={{ textAlign:"right" }} />
              </label>
            </div>
            {/* Linked accounts — which balances count toward this goal */}
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>Counts these accounts</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {inv.platforms.map(pl => {
                  const on = g.linked.includes(pl.id)
                  return (
                    <button key={pl.id} onClick={() => toggleLink(g.id, pl.id)}
                      style={{
                        fontSize:11, padding:"4px 9px", borderRadius:12, border:`1px solid ${on ? C.accent : C.border}`,
                        background: on ? C.accent+"22" : "transparent", color: on ? C.accent : C.muted,
                      }}>
                      {on ? "✓ " : ""}{pl.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* 5-year forecast */}
            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:C.muted }}>Projected in 5 years</span>
              <span style={{ fontFamily:"'DM Mono'", fontSize:12, color:C.text }}>
                {fmt(futureValue(current, monthly, ret, 60))} €
              </span>
            </div>
          </Card>
        )
      })}
      <button onClick={addGoal}
        style={{ background:C.accent+"22", border:"none", color:C.accent, borderRadius:8, padding:"8px 12px", fontSize:12, alignSelf:"flex-start" }}>
        + Add goal
      </button>
      {/* Platform balances */}
      <SectionTitle style={{ marginBottom:0, marginTop:8 }}>Accounts & balances</SectionTitle>
      <div style={{ fontSize:11, color:C.muted, marginTop:-4 }}>
        Everything here is editable — name, note, group, balance. Totals above recalculate automatically.
      </div>
      {Object.keys(PLATFORM_GROUPS).map(group => {
        const rows = inv.platforms.filter(p => p.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", margin:"6px 2px 6px" }}>
              <span style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>{PLATFORM_GROUPS[group]}</span>
              <span style={{ fontFamily:"'DM Mono'", fontSize:12, color: group === "ken" ? C.muted : C.accent }}>{fmt(groupTotal(group))} €</span>
            </div>
            {rows.map(p => (
              <Card key={p.id} style={{ padding:"10px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <input type="text" value={p.label} onChange={e => setPlatformField(p.id, "label", e.target.value)}
                    style={{ flex:1, fontSize:13, fontFamily:"'DM Sans', sans-serif" }} />
                  <input type="number" value={p.balance} onChange={e => setPlatformField(p.id, "balance", e.target.value)}
                    style={{ width:96, textAlign:"right", fontFamily:"'DM Mono'", fontSize:13 }} />
                  <span style={{ color:C.muted, fontSize:12 }}>€</span>
                  <button onClick={() => delPlatform(p.id)} title="Delete account"
                    style={{ background:"none", border:"none", color:C.red, fontSize:18, padding:"0 2px", lineHeight:1 }}>×</button>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
                  <select value={p.group} onChange={e => setPlatformField(p.id, "group", e.target.value)} style={selectStyle}>
                    {Object.keys(PLATFORM_GROUPS).map(gk => <option key={gk} value={gk}>{PLATFORM_GROUPS[gk]}</option>)}
                  </select>
                  <input type="text" placeholder="Note" value={p.note} onChange={e => setPlatformField(p.id, "note", e.target.value)}
                    style={{ flex:1, fontSize:12 }} />
                </div>
              </Card>
            ))}
          </div>
        )
      })}
      <button onClick={addPlatform}
        style={{ background:C.accent+"22", border:"none", color:C.accent, borderRadius:8, padding:"8px 12px", fontSize:12, alignSelf:"flex-start" }}>
        + Add account
      </button>
      {kenTotal > 0 && (
        <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", padding:"0 2px 4px" }}>
          Ken's separate accounts are shown for reference and excluded from your net worth and goals.
        </div>
      )}
    </div>
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
    if (month === 11) { setYear(y => y+1); setMonth(0) }
    else setMonth(m => m+1)
    setLoaded(false)
  }
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
        {tab !== "invest" ? (
          <>
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
              <button onClick={nextMonth} style={{ background:"none", border:"none", color:C.muted, fontSize:18, padding:"4px 8px" }}>›</button>
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
          </>
        ) : (
          <div style={{ textAlign:"center", padding:"18px 20px 14px" }}>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:26, color:C.text }}>Investments</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Portfolio & savings goals</div>
          </div>
        )}
        {/* Tabs */}
        <div style={{ display:"flex", borderTop:`1px solid ${C.border}` }}>
          {[["overview","Overview"],["variable","Spending"],["fixed","Fixed"],["income","Income"],["compare","vs last"],["invest","Invest"]].map(([id,label]) => (
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
        {/* ══ INVESTMENTS TAB ══ */}
        {tab === "invest" && <Investments />}
      </div>
      {/* Bottom padding */}
      <div style={{ height:32 }} />
    </div>
  )
}
