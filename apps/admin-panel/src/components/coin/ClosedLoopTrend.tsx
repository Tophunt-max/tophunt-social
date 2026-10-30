import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { api } from "@/lib/api";

/**
 * Earning vs Shopping, per day (worker GET /admin/monetization/daily).
 * Replaced the old "Deposits vs Withdrawals" chart: no ₹ moves in or out now.
 */
export function ClosedLoopTrend({ days = 14, title = "Earning vs Shopping" }: { days?: number; title?: string }) {
  const q = useQuery({ queryKey: ["monetization-daily", days], queryFn: () => api.monetization.daily(days), refetchInterval: 5 * 60_000 });
  const data = (q.data ?? []).map((d: any) => ({ ...d, day: String(d.date).slice(5) }));
  const empty = data.every((d: any) => !d.diamondsEarned && !d.dpCoinWon && !d.dpCoinSpent);
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        💎 Diamonds earned (free) · 🪙 DP coin won in contests · 🪙 DP coin spent on gifts, digital items and the shop (last {days} days)
      </p>
      <div className="h-64">
        {q.isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : empty ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No earning or shopping yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220 9% 46%)" allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="diamondsEarned" name="Diamonds earned" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dpCoinWon" name="DP coin won" fill="#7C3AED" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dpCoinSpent" name="DP coin spent" fill="#F97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
