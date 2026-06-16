"use client";

import { useMemo, useState } from "react";
import type { BriefingNote, Draft } from "@/lib/data/briefings";

/**
 * Briefings review surface. Renders held drafts (one card per captured note) and
 * lets the operator edit/keep/approve before anything posts. Mirrors the approved
 * mockup docs/mockups/briefings_review.html. Approving calls /api/briefings/approve;
 * the backend agent posts the kept drafts to Pipedrive/Asana. Nothing posts here.
 */
export default function Briefings({ initial }: { initial: BriefingNote[] }) {
  const [notes, setNotes] = useState<BriefingNote[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const reviewable = useMemo(() => notes.filter((n) => n.status === "planned"), [notes]);
  const open = notes.find((n) => n.id === openId) || null;

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3200);
  }
  function patchDraft(noteId: string, draftId: string, patch: Partial<Draft>) {
    setNotes((ns) =>
      ns.map((n) =>
        n.id !== noteId ? n : { ...n, drafts: n.drafts.map((d) => (d.draft_id === draftId ? { ...d, ...patch } : d)) }
      )
    );
  }
  function dealMissing(n: BriefingNote) {
    return n.drafts.some((d) => d.kind === "deal" && !(d.deal && d.deal.id));
  }
  async function decide(n: BriefingNote, decision: "approve" | "discard") {
    if (decision === "approve" && dealMissing(n)) return flash("Pick a deal first");
    setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, status: decision === "approve" ? "confirmed" : "skipped" } : x)));
    setOpenId(null);
    flash(decision === "approve" ? "✓ Approved — posting to Pipedrive / Asana" : "Discarded — nothing posted");
    try {
      await fetch("/api/briefings/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: n.id, drafts: n.drafts, decision }),
      });
    } catch {
      /* optimistic UI; backend reconciles */
    }
  }

  const tags = (n: BriefingNote) => {
    const t: string[] = [];
    const recap = n.drafts.some((d) => d.recap);
    if (recap) t.push("📝 note");
    if (n.drafts.some((d) => d.interaction)) t.push("📞 logged");
    const fu = n.drafts.reduce((a, d) => a + d.follow_ups.filter((f) => f.keep).length, 0);
    if (fu) t.push(`✅ ${fu} follow-up${fu > 1 ? "s" : ""}`);
    const td = n.drafts.reduce((a, d) => a + (d.todos?.filter((x) => x.keep).length || 0), 0);
    if (td) t.push(`✅ ${td} to-do`);
    if (n.drafts.some((d) => d.capital_update)) t.push("📊 capital");
    return t;
  };

  return (
    <div className="bf">
      <style>{CSS}</style>
      <div className="bf-top">
        <div>
          <h1>Foundry · Briefings</h1>
          <div className="bf-sub">Review what the agent drafted from your voice notes and meetings — nothing posts until you approve</div>
        </div>
      </div>

      <div className="bf-wrap">
        <div className="bf-queue">
          <div className="bf-qhead"><div>Recording</div><div>Deal</div><div>Will file</div><div></div></div>
          {reviewable.length === 0 && <div className="bf-empty">Nothing to review. 🎉</div>}
          {reviewable.map((n) => {
            const deal = n.drafts.find((d) => d.kind === "deal")?.deal;
            const dealCount = n.drafts.filter((d) => d.kind === "deal").length;
            return (
              <div className="bf-row" key={n.id} onClick={() => setOpenId(n.id)}>
                <div>
                  <div className="bf-nt">{n.title || "Briefing"}</div>
                  <div className="bf-nsub">{n.transcript}</div>
                </div>
                <div>
                  {dealCount > 1 ? (
                    <span className="bf-badge ok">{dealCount} deals</span>
                  ) : deal && deal.id ? (
                    <span className="bf-badge ok">{deal.title}</span>
                  ) : deal ? (
                    <span className="bf-badge unk">pick a deal</span>
                  ) : (
                    <span className="bf-badge none">personal</span>
                  )}
                </div>
                <div className="bf-chips">{tags(n).map((x, i) => <span className="bf-tg" key={i}>{x}</span>)}</div>
                <div className="bf-actcell"><button className="bf-mini" onClick={(e) => { e.stopPropagation(); setOpenId(n.id); }}>Review</button></div>
              </div>
            );
          })}
        </div>
        <div className="bf-hint">The agent drops notes with nothing actionable, so junk never reaches your CRM. Click a briefing to review, edit, and approve.</div>
      </div>

      {open && (
        <>
          <div className="bf-scrim" onClick={() => setOpenId(null)} />
          <div className="bf-drawer">
            <div className="bf-dhead">
              <div><div className="bf-dtitle">Review briefing</div><div className="bf-dwhen">{open.title}</div></div>
              <button className="bf-x" onClick={() => setOpenId(null)}>×</button>
            </div>
            <div className="bf-dbody">
              <div className="bf-sect"><h3>You said</h3><div className="bf-transcript">“{open.transcript}”</div></div>
              {open.drafts.map((d) => (
                <DraftBlock key={d.draft_id} note={open} draft={d} onPatch={patchDraft} />
              ))}
            </div>
            <div className="bf-dfoot">
              <div className="bf-willdo">{dealMissing(open) ? "Pick a deal to enable posting." : "On approve → the kept items post to Pipedrive / Asana."}</div>
              <div className="bf-frow">
                <button className="bf-btn danger" onClick={() => decide(open, "discard")}>Discard</button>
                <button className="bf-btn ghost" onClick={() => setOpenId(null)}>Later</button>
                <button className="bf-btn primary" disabled={dealMissing(open)} onClick={() => decide(open, "approve")}>Approve &amp; post →</button>
              </div>
            </div>
          </div>
        </>
      )}
      {toast && <div className="bf-toast">{toast}</div>}
    </div>
  );
}

function DraftBlock({ note, draft, onPatch }: { note: BriefingNote; draft: Draft; onPatch: (n: string, d: string, p: Partial<Draft>) => void }) {
  const d = draft;
  if (d.kind === "personal") {
    return (
      <div className="bf-sect">
        <h3>Your private to-dos <span className="bf-dest as">Asana INTAKE</span></h3>
        {(d.todos || []).map((t, i) => (
          <div className={`bf-item${t.keep ? "" : " dropped"}`} key={i}>
            <input type="checkbox" className="bf-keep" checked={t.keep} onChange={() => {
              const todos = (d.todos || []).map((x, j) => (j === i ? { ...x, keep: !x.keep } : x));
              onPatch(note.id, d.draft_id, { todos });
            }} />
            <div className="bf-ibody"><div className="bf-it">{t.text}</div><div className="bf-meta"><span className="bf-dest as">Asana INTAKE (private)</span></div></div>
          </div>
        ))}
      </div>
    );
  }
  const deal = d.deal;
  return (
    <div className="bf-dealblock">
      <div className="bf-sect">
        <h3>Deal</h3>
        <div className="bf-dealbox">
          {deal && deal.id && deal.confident ? (
            <span className="bf-badge ok">{deal.title}</span>
          ) : (
            <>
              <span className="bf-corr">couldn’t match confidently — pick the deal:</span>
              <select className="bf-dealsel" value={deal?.id ?? ""} onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const cand = deal?.candidates?.find((c) => c.id === id);
                onPatch(note.id, d.draft_id, { deal: { id, title: cand?.title ?? null, confident: !!id, candidates: deal?.candidates } });
              }}>
                <option value="">— pick a deal —</option>
                {(deal?.candidates || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
      <div className="bf-sect">
        <h3>Recap <span className="bf-dest pd">Pipedrive note</span></h3>
        <textarea className="bf-recap" value={d.recap} onChange={(e) => onPatch(note.id, d.draft_id, { recap: e.target.value })} />
      </div>
      {d.interaction && (
        <div className="bf-sect">
          <h3>Log the interaction <span className="bf-dest pd">Pipedrive · done</span></h3>
          <div className="bf-interaction">
            <span className="bf-ic">{d.interaction.type === "call" ? "📞" : d.interaction.type === "meeting" ? "🤝" : "✉️"}</span>
            <div className="bf-ibody"><div className="bf-it">{cap(d.interaction.type)} logged (marked done, dated today)</div><div className="bf-is">Puts it on the timeline / updates “last contacted”.</div></div>
            <input type="checkbox" className="bf-keep" defaultChecked />
          </div>
        </div>
      )}
      {d.follow_ups.length > 0 && (
        <div className="bf-sect">
          <h3>Follow-ups <span className="bf-dest pd">Pipedrive</span><span className="bf-dest as">Asana</span></h3>
          <div className="bf-corr" style={{ margin: "-2px 0 8px" }}>Created <b>open</b> (not complete) — the checkbox just includes it; you tick it off when it’s actually done.</div>
          {d.follow_ups.map((f, i) => (
            <div className={`bf-item${f.keep ? "" : " dropped"}`} key={i}>
              <input type="checkbox" className="bf-keep" checked={f.keep} onChange={() => {
                const follow_ups = d.follow_ups.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x));
                onPatch(note.id, d.draft_id, { follow_ups });
              }} />
              <div className="bf-ibody">
                <div className="bf-it">{f.text}</div>
                <div className="bf-meta">
                  <span className="bf-kind">{f.kind}</span>
                  <span className="bf-due">{f.due ? `due ${f.due}` : "no due date"}</span>
                  <span className="bf-dest open">○ open</span>
                  {f.to_pipedrive && <span className="bf-dest pd">Pipedrive activity</span>}
                  {f.to_asana && <span className="bf-dest as">Asana INTAKE</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {d.capital_update && (
        <div className="bf-sect">
          <h3>Capital update <span className="bf-dest sag">SAG Asana status</span></h3>
          <textarea className="bf-recap" defaultValue={d.capital_update} />
          <div className="bf-corr" style={{ marginTop: 7 }}>⏳ Posts once the Builders Capital Asana is connected (pending admin approval).</div>
        </div>
      )}
      {d.waiting_on.length > 0 && (
        <div className="bf-sect">
          <h3>You’re waiting on</h3>
          <div className="bf-waiting">⏳ {d.waiting_on.join("; ")}</div>
        </div>
      )}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CSS = `
.bf{--navy:#0a2c4e;--blue:#1768a3;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#f1f5f9;--green:#0f9d58;--green-bg:#e8f6ee;--amber:#b7791f;--amber-bg:#fdf3e3;--red:#c0392b;--purple:#6b3fa0;--purple-bg:#efeaf8;font-family:'Poppins',-apple-system,system-ui,sans-serif;color:var(--ink);font-size:14px}
.bf-top{display:flex;align-items:center;gap:14px;background:var(--navy);color:#fff;padding:14px 22px}
.bf-top h1{font-size:16px;margin:0;font-weight:600}.bf-sub{color:#9bb8d4;font-size:12px}
.bf-wrap{max-width:1180px;margin:0 auto;padding:22px}
.bf-queue{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.bf-qhead{display:grid;grid-template-columns:2.6fr 1.5fr 1.7fr 1fr;gap:12px;padding:10px 18px;border-bottom:1px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;font-weight:600;background:#f8fafc}
.bf-row{display:grid;grid-template-columns:2.6fr 1.5fr 1.7fr 1fr;gap:12px;padding:14px 18px;border-bottom:1px solid #f1f5f9;align-items:center;cursor:pointer}
.bf-row:hover{background:#f8fbff}.bf-row:last-child{border-bottom:0}
.bf-nt{font-weight:600}.bf-nsub{color:var(--muted);font-size:12.5px;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
.bf-badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid}
.bf-badge.ok{background:var(--green-bg);color:var(--green);border-color:#bfe6cd}
.bf-badge.unk{background:var(--amber-bg);color:var(--amber);border-color:#f3dcae}
.bf-badge.none{background:#eef2f7;color:#475569;border-color:#e2e8f0}
.bf-chips{display:flex;gap:5px;flex-wrap:wrap}.bf-tg{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;background:#eef2f7;color:#475569}
.bf-actcell{display:flex;justify-content:flex-end}
.bf-mini{background:var(--navy);color:#fff;border:0;border-radius:8px;height:32px;padding:0 16px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.bf-empty{padding:26px 18px;color:#94a3b8;font-size:13.5px}
.bf-hint{font-size:11px;color:#94a3b8;margin-top:10px}
.bf-scrim{position:fixed;inset:0;background:rgba(10,44,78,.32);backdrop-filter:blur(2px)}
.bf-drawer{position:fixed;top:0;right:0;height:100%;width:600px;max-width:96vw;background:#fff;box-shadow:-12px 0 40px rgba(10,44,78,.22);display:flex;flex-direction:column;z-index:60}
.bf-dhead{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start}
.bf-dtitle{font-weight:600;font-size:16px}.bf-dwhen{color:var(--muted);font-size:13px}
.bf-x{border:0;background:none;font-size:22px;color:#94a3b8;cursor:pointer}
.bf-dbody{flex:1;overflow:auto;padding:0 22px 22px}
.bf-dealblock{border-bottom:2px solid #eef2f7}
.bf-sect{padding:16px 0;border-bottom:1px solid #f1f5f9}
.bf-sect h3{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin:0 0 10px;display:flex;align-items:center;gap:8px}
.bf-dest{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:5px}
.bf-dest.pd{background:#eaf1f8;color:var(--blue)}.bf-dest.as{background:var(--green-bg);color:var(--green)}.bf-dest.sag{background:var(--purple-bg);color:var(--purple)}
.bf-dest.open{background:var(--amber-bg);color:var(--amber);border:1px solid #f3dcae}
.bf-transcript{font-size:12.5px;color:var(--muted);background:#f8fafc;border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-style:italic;line-height:1.5}
.bf-recap{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:inherit;font-size:13.5px;line-height:1.5;min-height:78px;resize:vertical}
.bf-dealbox{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.bf-corr{font-size:12px;color:var(--muted)}
.bf-dealsel{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px}
.bf-item{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid #f6f8fb}.bf-item:last-child{border-bottom:0}.bf-item.dropped{opacity:.45}
.bf-keep{width:18px;height:18px;accent-color:var(--green);margin-top:2px}
.bf-ibody{flex:1}.bf-it{font-weight:500;font-size:13.5px}.bf-is{font-size:12px;color:var(--muted);margin-top:2px}
.bf-meta{display:flex;gap:7px;align-items:center;margin-top:5px;flex-wrap:wrap}
.bf-kind{border:1px solid var(--line);border-radius:7px;padding:2px 7px;font-size:11.5px;font-weight:600;color:var(--blue)}
.bf-due{font-size:11.5px;color:var(--muted)}
.bf-interaction{display:flex;align-items:center;gap:10px;background:#f0f7fc;border:1px solid #cfe3f2;border-radius:10px;padding:11px 13px}.bf-ic{font-size:18px}
.bf-waiting{background:var(--amber-bg);border:1px solid #f3dcae;border-radius:10px;padding:11px 13px;font-size:13px;color:#7a5b12}
.bf-dfoot{padding:14px 22px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.bf-willdo{font-size:12px;color:var(--muted)}.bf-frow{display:flex;gap:10px;justify-content:flex-end}
.bf-btn{border:0;border-radius:10px;height:44px;padding:0 22px;min-width:110px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.bf-btn.primary{background:var(--navy);color:#fff}.bf-btn.primary:disabled{opacity:.45;cursor:not-allowed}
.bf-btn.ghost{background:#fff;color:#334155;border:1px solid var(--line)}.bf-btn.danger{background:#fff;color:var(--red);border:1px solid #f2c9c4}
.bf-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--navy);color:#fff;padding:12px 20px;border-radius:10px;font-size:13.5px;font-weight:500;box-shadow:0 12px 30px rgba(10,44,78,.3);z-index:80}
`;
