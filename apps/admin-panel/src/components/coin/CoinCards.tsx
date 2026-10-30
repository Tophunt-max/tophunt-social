
import { Lock, Save } from "lucide-react";

/**
 * Coin settings cards (free rewards are always Diamonds).
 *
 * Shared by the Coin Economy hub (their home) and kept out of App Control so
 * there is exactly ONE editor for each coin setting. Each card posts only its
 * own appConfig key; the Worker merges, validates and audits it.
 */
export const field =
  "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const label = "text-xs text-muted-foreground mb-1 block";

export type CardProps = {
  data: any;
  pending: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  confirm?: (o: any) => Promise<boolean>;
};

/**
 * Free rewards are always Diamonds (worker lib/rewardLocking.ts refuses DP coin).
 */
const REWARD_LOCK_ROWS: { key: string; label: string }[] = [
  { key: "verification", label: "Signup bonus (turant + email/mobile verify)" },
  { key: "referral", label: "Referral bonus (dono ko)" },
  { key: "daily", label: "Daily login reward" },
  { key: "ads", label: "Rewarded ads" },
  { key: "tasks", label: "Daily tasks" },
];

export function RewardLockingCard(_props: CardProps) {
  // Closed loop: free rewards are always Diamonds (the server refuses DP coin).
  return (
    <Card icon={Lock} title="Free rewards: hamesha 💎 Diamond" tint="text-cyan-500">
      <p className="text-xs text-muted-foreground">
        Check-in, tasks, referral, verification, ads aur XP conversion ke reward sirf Diamond mein milte hain. Diamond se contest
        khelte hain; 🪙 DP coin sirf contest jeetne par milta hai aur Shopping mein kharch hota hai.
      </p>
      <ul className="mt-2 text-xs list-disc pl-5">
        {REWARD_LOCK_ROWS.map((r) => <li key={r.key}>{r.label}: Diamond</li>)}
      </ul>
    </Card>
  );
}

// -------------------------------------------------------------------- shared
export function Card({ icon: Icon, title, tint, children, onSave, pending }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Icon size={16} className={tint} /> {title}
        </h3>
        {onSave && (
          <button
            onClick={onSave}
            disabled={pending}
            className="flex items-center gap-1.5 gradient-purple text-white text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50"
          >
            <Save size={13} /> Save
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between w-full py-1.5 text-left" type="button">
      <span className="text-sm text-foreground">{label}</span>
      <span className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-violet-500" : "bg-secondary"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
