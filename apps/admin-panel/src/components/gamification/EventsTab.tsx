import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Button, Card, Notice, Num, Text, Toggle, field, fromLocalInput, toLocalInput } from "@/components/monetization/shared";
import { safeArtUrl } from "@/lib/shopArt";
import { CurrencyText } from "@/components/ui/DiamondIcon";

/**
 * Gamification → Events: Special events in the app's Rewards Center (worker
 * lib/rewardEvents.ts, routes/adminEvents.ts). Tasks count server-side from
 * the moment a user joins; each completed task pays its Diamonds once, from the
 * free-rewards budget, under the daily free cap and the event budget.
 */
const METRICS: [string, string][] = [
  ["votes", "Votes in battles"], ["entries", "Battle entries"], ["wins", "Battles won"],
  ["checkins", "Daily check-ins"], ["active_days", "Active days"], ["xp", "XP earned"],
];
const STATUSES = ["draft", "active", "paused", "archived"] as const;
const PHASE_VARIANT: Record<string, any> = { live: "active", scheduled: "info", ended: undefined, paused: "warning", draft: undefined, archived: undefined };
const DAY = 86_400_000;

const blank = () => ({
  id: "", title: "", description: "", bannerUrl: "", status: "draft",
  startsAt: toLocalInput(Date.now() + 3_600_000), endsAt: toLocalInput(Date.now() + 7 * DAY),
  minLevel: 1, minAccountAgeDays: 0, requireVerified: false, totalBudget: "", sort: 0,
  tasks: [{ id: "vote10", title: "Vote in 10 battles", metric: "votes", target: 10, coins: 50 }],
});

export function EventsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const q = useQuery({ queryKey: ["earning-events"], queryFn: api.earning.events });
  const [edit, setEdit] = useState<any>(null);
  const [people, setPeople] = useState<string | null>(null);
  const events: any[] = q.data?.events ?? [];
  return (
    <div className="space-y-5">
      <Card
        title="Special events"
        subtitle="Time-limited earning campaigns in the app's Rewards Center. Users join, complete tasks (counted by the server from when they joined) and claim Diamonds."
        action={<Button onClick={() => setEdit({ ...blank(), _new: true })} disabled={!full}>+ New event</Button>}
      >
        <Notice>Diamonds come from the free-rewards budget and count toward the daily free Diamond cap. Set an event budget to cap the total. Accounts with an open abuse flag cannot claim until reviewed.</Notice>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? <Notice tone="danger">{describeError(q.error)}</Notice> : !events.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No events yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="rounded-xl border border-border p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{e.title}</p>
                    <Badge variant={PHASE_VARIANT[e.phase]}>{e.phase}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{e.id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <CurrencyText>
                      {fmtDateTime(e.startsAt)} → {fmtDateTime(e.endsAt)} · {e.tasks.length} task(s) · up to {fmtNumber(e.tasks.reduce((s: number, t: any) => s + t.coins, 0))} 💎 per user
                      {e.totalBudget != null ? ` · budget ${fmtNumber(e.stats?.diamonds ?? 0)}/${fmtNumber(e.totalBudget)} 💎` : ""}
                    </CurrencyText>
                  </p>
                  <p className="text-xs mt-1"><CurrencyText>{fmtNumber(e.stats?.participants ?? 0)} joined · {fmtNumber(e.stats?.claims ?? 0)} claims · {fmtNumber(e.stats?.diamonds ?? 0)} 💎 paid</CurrencyText></p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setPeople(e.id)}>Participants</Button>
                  <Button onClick={() => setEdit(toDraft(e))} disabled={!full}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && <EventEditor draft={edit} onClose={() => setEdit(null)} onDone={() => qc.invalidateQueries({ queryKey: ["earning-events"] })} />}
      {people && <Participants id={people} onClose={() => setPeople(null)} />}
    </div>
  );
}

function toDraft(e: any) {
  return { ...e, bannerUrl: e.bannerUrl ?? "", startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt), totalBudget: e.totalBudget ?? "", tasks: e.tasks.map((t: any) => ({ ...t })) };
}

function EventEditor({ draft, onClose, onDone }: { draft: any; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<any>(draft);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: any) => setD({ ...d, ...patch });
  const setTask = (i: number, patch: any) => set({ tasks: d.tasks.map((t: any, j: number) => (j === i ? { ...t, ...patch } : t)) });
  const save = useMutation({
    mutationFn: () => api.earning.saveEvent(d.id.trim(), {
      create: !!d._new,
      title: d.title, description: d.description, bannerUrl: d.bannerUrl || null, status: d.status,
      startsAt: fromLocalInput(d.startsAt), endsAt: fromLocalInput(d.endsAt),
      minLevel: Number(d.minLevel), minAccountAgeDays: Number(d.minAccountAgeDays), requireVerified: !!d.requireVerified,
      totalBudget: String(d.totalBudget).trim() === "" ? null : Number(d.totalBudget), sort: Number(d.sort) || 0,
      tasks: d.tasks.map((t: any) => ({ id: String(t.id).trim(), title: t.title, metric: t.metric, target: Number(t.target), coins: Number(t.coins) })),
    }),
    onSuccess: () => { toast.success("Event saved"); onDone(); onClose(); },
    onError: (e) => { const m = describeError(e); setError(m); toast.error(m); },
  });
  const upload = async (file?: File) => {
    if (!file) return;
    setProgress(0);
    try {
      const { publicUrl } = await api.uploadShopBanner(file, setProgress);
      set({ bannerUrl: publicUrl });
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const perUser = d.tasks.reduce((s: number, t: any) => s + (Number(t.coins) || 0), 0);
  const banner = safeArtUrl(d.bannerUrl);
  return (
    <Modal open onClose={onClose} title={d._new ? "New event" : `Edit ${d.title}`} width="max-w-3xl">
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Text label="Title (max 60)" value={d.title} onChange={(v) => set({ title: v })} placeholder="Mega Rewards Event" />
          {d._new ? <Text label="Event id (permanent)" value={d.id} onChange={(v) => set({ id: v.toLowerCase() })} placeholder="mega-diwali" /> : <p className="text-xs text-muted-foreground self-end">id <span className="font-mono">{d.id}</span></p>}
        </div>
        <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Description (max 300)</span>
          <textarea className={field} rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div>
          <span className="text-xs text-muted-foreground mb-1 block">Banner (optional)</span>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          {banner ? <img src={banner} alt="Banner" className="w-full h-32 object-cover rounded-xl border border-border" /> : null}
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={progress !== null}>{progress !== null ? `Uploading ${progress}%` : banner ? "Replace" : "Upload"}</Button>
            {banner ? <Button variant="secondary" onClick={() => set({ bannerUrl: "" })}>Remove</Button> : null}
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Status</span>
            <select className={field} value={d.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Starts</span><input type="datetime-local" className={field} value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Ends (max 90 days)</span><input type="datetime-local" className={field} value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></label>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <Num label="Min level" value={d.minLevel} onChange={(v) => set({ minLevel: v })} />
          <Num label="Min account age (days)" value={d.minAccountAgeDays} onChange={(v) => set({ minAccountAgeDays: v })} />
          <Text label="Event budget 💎 (empty = none)" value={String(d.totalBudget)} onChange={(v) => set({ totalBudget: v })} />
          <Num label="Sort" value={d.sort} onChange={(v) => set({ sort: v })} />
        </div>
        <Toggle label="Require verified email or mobile" checked={!!d.requireVerified} onChange={(v) => set({ requireVerified: v })} hint="Strongly recommended for events with big rewards." />
        <section className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm"><CurrencyText>Tasks ({d.tasks.length}/10) · up to {fmtNumber(perUser)} 💎 per user</CurrencyText></p>
            <Button variant="secondary" onClick={() => set({ tasks: [...d.tasks, { id: `task${d.tasks.length + 1}`, title: "", metric: "votes", target: 5, coins: 20 }] })} disabled={d.tasks.length >= 10}>+ Task</Button>
          </div>
          {d.tasks.map((t: any, i: number) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-[110px_1fr_160px_90px_90px_auto] gap-2 items-end">
              <Text label="Id" value={t.id} onChange={(v) => setTask(i, { id: v.toLowerCase() })} />
              <Text label="Title" value={t.title} onChange={(v) => setTask(i, { title: v })} />
              <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Metric</span>
                <select className={field} value={t.metric} onChange={(e) => setTask(i, { metric: e.target.value })}>{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <Num label="Target" value={t.target} onChange={(v) => setTask(i, { target: v })} />
              <Num label="💎" value={t.coins} onChange={(v) => setTask(i, { coins: v })} />
              <Button variant="danger" onClick={() => set({ tasks: d.tasks.filter((_: any, j: number) => j !== i) })} disabled={d.tasks.length <= 1}>✕</Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">A task that already has claims keeps its metric, target and Diamonds, and cannot be removed.</p>
        </section>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); save.mutate(); }} disabled={save.isPending || !d.title.trim() || !d.id.trim()}>{save.isPending ? "Saving…" : "Save event"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Participants({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["earning-event-people", id], queryFn: () => api.earning.eventParticipants(id) });
  return (
    <Modal open onClose={onClose} title={`Participants · ${id}`} width="max-w-2xl">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !(q.data ?? []).length ? <p className="text-sm text-muted-foreground">Nobody joined yet.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th>User</th><th>Joined</th><th>Claims</th><th><CurrencyText>💎</CurrencyText></th></tr></thead>
          <tbody>{(q.data ?? []).map((r: any) => (
            <tr key={r.uid} className="border-t border-border"><td className="py-1.5">@{r.username ?? r.uid}</td><td>{fmtDateTime(r.joinedAt)}</td><td>{r.claims}</td><td>{fmtNumber(r.diamonds)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}
