import { ReactNode } from "react";

export const field =
  "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Num({ label, value, onChange, hint, min, max }: { label: string; value: number | string; onChange: (v: number) => void; hint?: string; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input type="number" className={field} value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="text-[11px] text-muted-foreground mt-1 block">{hint}</span>}
    </label>
  );
}

export function Text({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input className={field} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="text-[11px] text-muted-foreground mt-1 block">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function Button({ children, onClick, disabled, variant = "primary" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  const cls =
    variant === "primary"
      ? "gradient-purple text-white"
      : variant === "danger"
        ? "bg-red-600 text-white"
        : "bg-secondary text-foreground";
  return (
    <button onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: ReactNode }) {
  const cls = tone === "danger" ? "bg-red-50 text-red-700 border-red-200" : tone === "warning" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-50 text-blue-800 border-blue-200";
  return <div className={`text-xs rounded-xl border px-3 py-2 ${cls}`}>{children}</div>;
}

export const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
export const money = (n: number, currency: string) => `${currency} ${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;

/** yyyy-mm-ddThh:mm in local time, for <input type="datetime-local">. */
export function toLocalInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): number | null => (v ? new Date(v).getTime() : null);

export interface Range {
  from: number;
  to: number;
}
