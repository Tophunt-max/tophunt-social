import { PageHeader } from "@/lib/format";
import { EventsTab } from "@/components/gamification/EventsTab";

/** Earning Management → Special Events. Same editor as Gamification → Events. */
export default function EarningEvents() {
  return (
    <div>
      <PageHeader title="Special Events" subtitle="Limited-time earning events in the app's Rewards Center. Each task pays 💎 Diamonds once, from the free-rewards budget." />
      <EventsTab />
    </div>
  );
}
