import { useEffect, useState } from 'react';

/** Wall clock that updates once a minute: enough for "is this bundle still on sale" checks. */
export function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
