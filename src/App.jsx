import React, { useState, useEffect, useMemo } from "react";

/* ---------- palette ---------- */
const C = {
  paper: "#EFF2ED",
  card: "#FAFCF8",
  ink: "#1C2B27",
  muted: "#6B7B74",
  line: "#D3DCD2",
  green: "#3F6B4F",
  amber: "#B0722B",
  red: "#9A3B2D",
};
const NUM = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ---------- dates ---------- */
const iso = (d) => {
  const z = new Date(d);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
};
const today = () => iso(new Date());
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const pretty = (s) =>
  parse(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- defaults ---------- */
const BLANK = {
  currency: "CHF",
  balance: 0,
  bufferPct: 10,
  lastUntil: null,
  inflows: [],
  commitments: [],
  ledger: [],
  onboarded: false,
};

/* ---------- the calculation ---------- */
function compute(s) {
  const t = today();
  const spentToday = s.ledger
    .filter((e) => e.date === t)
    .reduce((a, e) => a + e.amount, 0);

  const nextInflow = s.inflows
    .filter((i) => i.date > t)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const horizon = nextInflow?.date || s.lastUntil || addDays(t, 30);
  const days = Math.max(1, diffDays(t, horizon));

  // commitment occurrences falling in [today, horizon)
  const due = [];
  s.commitments.forEach((c) => {
    for (let k = 0; k <= 14; k++) {
      const d = parse(t);
      d.setDate(1);
      d.setMonth(d.getMonth() + k);
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(c.day, dim));
      const ds = iso(d);
      if (ds >= t && ds < horizon) due.push({ ...c, date: ds });
      if (ds >= horizon) break;
    }
  });
  const committed = due.reduce((a, c) => a + c.amount, 0);

  const startOfDay = s.balance + spentToday;
  const buffer = Math.max(0, (startOfDay * s.bufferPct) / 100);
  const spendable = startOfDay - committed - buffer;
  const daily = spendable / days;
  const remaining = daily - spentToday;

  return {
    t, horizon, days, due, committed, buffer, spendable,
    daily, remaining, spentToday, nextInflow, short: spendable < 0,
  };
}

/* ---------- small pieces ---------- */
const money = (n, cur) =>
  `${cur} ${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: C.muted, display: "block", marginBottom: 5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px",
  border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 16,
  background: "#fff", color: C.ink, fontFamily: SANS,
};
function Btn({ children, onClick, tone = "solid", type = "button" }) {
  const solid = tone === "solid";
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        padding: "11px 16px", borderRadius: 8, fontSize: 15, cursor: "pointer",
        fontFamily: SANS, fontWeight: 500,
        border: `1px solid ${solid ? C.ink : C.line}`,
        background: solid ? C.ink : "transparent",
        color: solid ? C.card : C.ink,
      }}
    >
      {children}
    </button>
  );
}

/* ---------- runway strip ---------- */
function Runway({ calc }) {
  const marks = [];
  const n = Math.min(calc.days, 92);
  const dueSet = new Set(calc.due.map((d) => d.date));
  for (let i = 0; i < n; i++) {
    const d = addDays(calc.t, i);
    marks.push(
      <div key={i} title={d}
        style={{
          flex: 1, minWidth: 2, height: dueSet.has(d) ? 20 : 11,
          background: dueSet.has(d) ? C.amber : i === 0 ? C.ink : C.line,
          borderRadius: 1, alignSelf: "flex-end",
        }} />
    );
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 22 }}>{marks}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 12, color: C.muted }}>
        <span>today</span>
        <span>{calc.days} days to {pretty(calc.horizon)}</span>
      </div>
    </div>
  );
}

/* ---------- screens ---------- */
function Today({ s, calc, set }) {
  const [quick, setQuick] = useState("");
  const [note, setNote] = useState("");

  const log = () => {
    const amt = parseFloat(quick);
    if (!amt || amt <= 0) return;
    set({
      ...s,
      balance: s.balance - amt,
      ledger: [{ id: uid(), amount: amt, note: note || "spending", date: today() }, ...s.ledger],
    });
    setQuick(""); setNote("");
  };

  if (calc.short) {
    const gap = Math.abs(calc.spendable);
    return (
      <div>
        <p style={{ fontSize: 14, color: C.muted, margin: "0 0 6px" }}>
          Your money doesn't reach {pretty(calc.horizon)}.
        </p>
        <div style={{ fontFamily: NUM, fontSize: 52, color: C.red, lineHeight: 1.05 }}>
          {money(gap, s.currency)}
        </div>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>short over {calc.days} days</p>
        <div style={{ marginTop: 22, padding: 16, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 15 }}>Ways to close it</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: C.ink }}>
            <li>Cut or pause {money(gap, s.currency)} of commitments before {pretty(calc.horizon)}</li>
            <li>Earn it: roughly {Math.ceil(gap / 25)} hours of work at 25/hr</li>
            <li>Ask your university about hardship or emergency grants — most have a fund and most students never apply</li>
            <li>Move the horizon: if money arrives sooner than {pretty(calc.horizon)}, update it under Plan</li>
          </ul>
        </div>
      </div>
    );
  }

  const tone = calc.remaining < 0 ? C.red : calc.remaining < calc.daily * 0.25 ? C.amber : C.green;
  return (
    <div>
      <p style={{ fontSize: 14, color: C.muted, margin: "0 0 4px" }}>Safe to spend today</p>
      <div style={{ fontFamily: NUM, fontSize: 60, color: tone, lineHeight: 1 }}>
        {money(calc.remaining, s.currency)}
      </div>
      <p style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
        {money(calc.daily, s.currency)} a day until {pretty(calc.horizon)}
        {calc.spentToday > 0 && ` · ${money(calc.spentToday, s.currency)} logged today`}
        <br />
        {money(s.balance, s.currency)} on hand, keeping {money(calc.buffer, s.currency)} back
      </p>

      <div style={{ margin: "26px 0" }}><Runway calc={calc} /></div>

      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...inputStyle, flex: "0 0 110px" }} inputMode="decimal"
          placeholder="Amount" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <input style={{ ...inputStyle, flex: 1 }} placeholder="What for?"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn onClick={log}>Log</Btn>
      </div>
    </div>
  );
}

function Log({ s, set }) {
  const undo = (id) => {
    const e = s.ledger.find((x) => x.id === id);
    set({ ...s, balance: s.balance + e.amount, ledger: s.ledger.filter((x) => x.id !== id) });
  };
  if (!s.ledger.length)
    return <p style={{ color: C.muted, fontSize: 15 }}>Nothing logged yet. Every entry you add makes tomorrow's number more accurate.</p>;

  const byDay = {};
  s.ledger.forEach((e) => (byDay[e.date] = byDay[e.date] || []).push(e));

  return (
    <div>
      {Object.keys(byDay).sort().reverse().map((d) => (
        <div key={d} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
            {d === today() ? "Today" : pretty(d)} · {money(byDay[d].reduce((a, e) => a + e.amount, 0), s.currency)}
          </div>
          {byDay[d].map((e) => (
            <div key={e.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", background: C.card, border: `1px solid ${C.line}`,
              borderRadius: 8, marginBottom: 6, fontSize: 15,
            }}>
              <span>{e.note}</span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontFamily: NUM }}>{money(e.amount, s.currency)}</span>
                <button onClick={() => undo(e.id)} style={{
                  border: "none", background: "none", color: C.muted,
                  cursor: "pointer", fontSize: 13, textDecoration: "underline",
                }}>undo</button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Plan({ s, set, calc }) {
  const [inf, setInf] = useState({ label: "", amount: "", date: "" });
  const [com, setCom] = useState({ label: "", amount: "", day: "" });

  const addInflow = () => {
    if (!inf.amount || !inf.date) return;
    set({ ...s, inflows: [...s.inflows, { id: uid(), label: inf.label || "Money in", amount: parseFloat(inf.amount), date: inf.date }] });
    setInf({ label: "", amount: "", date: "" });
  };
  const addCom = () => {
    if (!com.amount || !com.day) return;
    set({ ...s, commitments: [...s.commitments, { id: uid(), label: com.label || "Commitment", amount: parseFloat(com.amount), day: Math.min(28, Math.max(1, parseInt(com.day))) }] });
    setCom({ label: "", amount: "", day: "" });
  };
  const row = (item, onDel, right) => (
    <div key={item.id} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 12px", background: C.card, border: `1px solid ${C.line}`,
      borderRadius: 8, marginBottom: 6, fontSize: 15,
    }}>
      <span>{item.label}<span style={{ color: C.muted, fontSize: 13 }}> · {right}</span></span>
      <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontFamily: NUM }}>{money(item.amount, s.currency)}</span>
        <button onClick={onDel} style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>remove</button>
      </span>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>Money on hand</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 10px" }}>
        Correct this whenever it drifts from your real balance.
      </p>
      <input style={inputStyle} inputMode="decimal" value={s.balance}
        onChange={(e) => set({ ...s, balance: parseFloat(e.target.value) || 0 })} />

      <h3 style={{ fontSize: 16, margin: "26px 0 4px" }}>Money coming in</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 10px" }}>
        Loans, pay, transfers from home. The next one sets your horizon.
      </p>
      {s.inflows.filter((i) => i.date >= today()).sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((i) => row(i, () => set({ ...s, inflows: s.inflows.filter((x) => x.id !== i.id) }), pretty(i.date)))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="Label" value={inf.label}
          onChange={(e) => setInf({ ...inf, label: e.target.value })} />
        <input style={{ ...inputStyle, width: 90 }} inputMode="decimal" placeholder="Amount"
          value={inf.amount} onChange={(e) => setInf({ ...inf, amount: e.target.value })} />
        <input style={{ ...inputStyle, width: 140 }} type="date" value={inf.date}
          onChange={(e) => setInf({ ...inf, date: e.target.value })} />
        <Btn onClick={addInflow}>Add</Btn>
      </div>

      <h3 style={{ fontSize: 16, margin: "26px 0 4px" }}>Commitments</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 10px" }}>
        Rent, phone, transport pass, subscriptions. These are taken out before anything is divided.
      </p>
      {s.commitments.map((c) => row(c, () => set({ ...s, commitments: s.commitments.filter((x) => x.id !== c.id) }), `monthly on the ${c.day}`))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="Label" value={com.label}
          onChange={(e) => setCom({ ...com, label: e.target.value })} />
        <input style={{ ...inputStyle, width: 90 }} inputMode="decimal" placeholder="Amount"
          value={com.amount} onChange={(e) => setCom({ ...com, amount: e.target.value })} />
        <input style={{ ...inputStyle, width: 70 }} inputMode="numeric" placeholder="Day"
          value={com.day} onChange={(e) => setCom({ ...com, day: e.target.value })} />
        <Btn onClick={addCom}>Add</Btn>
      </div>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>
        {money(calc.committed, s.currency)} of commitments fall due before {pretty(calc.horizon)}.
      </p>

      <h3 style={{ fontSize: 16, margin: "26px 0 4px" }}>Safety buffer</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 10px" }}>
        Held back for the costs you haven't thought of. Currently {money(calc.buffer, s.currency)}.
      </p>
      <input type="range" min="0" max="30" value={s.bufferPct} style={{ width: "100%" }}
        onChange={(e) => set({ ...s, bufferPct: parseInt(e.target.value) })} />
      <div style={{ fontSize: 13, color: C.muted }}>{s.bufferPct}% of your balance</div>
    </div>
  );
}

function Check({ s, calc }) {
  const [amt, setAmt] = useState("");
  const v = parseFloat(amt) || 0;
  const after = (calc.spendable - v) / calc.days;
  const ok = calc.spendable - v >= 0;
  return (
    <div>
      <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>Can I afford this?</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 14px" }}>
        See what a one-off purchase does to every day between now and {pretty(calc.horizon)}.
      </p>
      <input style={{ ...inputStyle, fontSize: 20, fontFamily: NUM }} inputMode="decimal"
        placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
      {v > 0 && (
        <div style={{ marginTop: 20, padding: 16, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>
            Your daily amount goes from{" "}
            <span style={{ fontFamily: NUM }}>{money(calc.daily, s.currency)}</span> to{" "}
            <span style={{ fontFamily: NUM, color: ok ? C.green : C.red }}>{money(after, s.currency)}</span>{" "}
            for the next {calc.days} days.
          </div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 10 }}>
            {ok
              ? `That's ${money(calc.daily - after, s.currency)} less each day. Your buffer of ${money(calc.buffer, s.currency)} stays untouched.`
              : `This goes past your buffer. You'd be ${money(Math.abs(calc.spendable - v), s.currency)} short before ${pretty(calc.horizon)}.`}
          </div>
        </div>
      )}
    </div>
  );
}

function Onboard({ set }) {
  const [f, setF] = useState({ currency: "CHF", balance: "", amount: "", date: "" });
  const go = () => {
    if (!f.balance) return;
    set({
      ...BLANK, onboarded: true, currency: f.currency,
      balance: parseFloat(f.balance),
      inflows: f.date && f.amount
        ? [{ id: uid(), label: "Next money in", amount: parseFloat(f.amount), date: f.date }]
        : [],
      lastUntil: f.date && !f.amount ? f.date : null,
    });
  };
  return (
    <div style={{ padding: "40px 22px", maxWidth: 440, margin: "0 auto", fontFamily: SANS, color: C.ink }}>
      <h1 style={{ fontFamily: NUM, fontSize: 30, lineHeight: 1.2, margin: "0 0 10px", fontWeight: 400 }}>
        How much can you spend today?
      </h1>
      <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, margin: "0 0 28px" }}>
        Three answers and you'll have a number. It recalculates every morning, so an expensive night
        out costs you a little each day rather than blowing up the month.
      </p>
      <Field label="Currency">
        <select style={inputStyle} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
          {["CHF", "€", "£", "$"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="What's in your accounts right now?">
        <input style={inputStyle} inputMode="decimal" placeholder="0.00"
          value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} />
      </Field>
      <Field label="When does money next arrive?">
        <input style={inputStyle} type="date" value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label="How much (leave blank if you don't know)">
        <input style={inputStyle} inputMode="decimal" placeholder="0.00"
          value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      </Field>
      <Btn onClick={go}>Show my number</Btn>
    </div>
  );
}

/* ---------- shell ---------- */
export default function App() {
  const [s, setS] = useState(null);
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("ds:state", false);
        setS(r ? JSON.parse(r.value) : BLANK);
      } catch {
        setS(BLANK);
      }
      setLoading(false);
    })();
  }, []);

  const set = (next) => {
    setS(next);
    window.storage.set("ds:state", JSON.stringify(next), false).catch(() => {});
  };

  const calc = useMemo(() => (s ? compute(s) : null), [s]);

  if (loading)
    return <div style={{ padding: 40, fontFamily: SANS, color: C.muted }}>Loading your numbers…</div>;
  if (!s.onboarded) return <Onboard set={set} />;

  const tabs = [
    ["today", "Today"], ["log", "Log"], ["plan", "Plan"], ["check", "Check"],
  ];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: SANS, color: C.ink }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "28px 22px 96px" }}>
        {tab === "today" && <Today s={s} calc={calc} set={set} />}
        {tab === "log" && <Log s={s} set={set} />}
        {tab === "plan" && <Plan s={s} set={set} calc={calc} />}
        {tab === "check" && <Check s={s} calc={calc} />}

        {tab === "plan" && (
          <button onClick={() => set({ ...BLANK })}
            style={{ marginTop: 40, border: "none", background: "none", color: C.muted, fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            Start over
          </button>
        )}
      </div>

      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: C.card,
        borderTop: `1px solid ${C.line}`, display: "flex",
      }}>
        <div style={{ display: "flex", maxWidth: 440, margin: "0 auto", width: "100%" }}>
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                flex: 1, padding: "16px 0 20px", border: "none", background: "none",
                cursor: "pointer", fontFamily: SANS, fontSize: 14,
                color: tab === k ? C.ink : C.muted,
                fontWeight: tab === k ? 600 : 400,
                borderTop: `2px solid ${tab === k ? C.ink : "transparent"}`,
                marginTop: -1,
              }}>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}