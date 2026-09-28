import type { DatePreset } from "@speel/core";

export interface DateRange {
  from: Date;
  to: Date;
}

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Resolve a named preset to a concrete inclusive [from,to] range. `fiscalStart` is 1–12. */
export function resolvePreset(
  preset: DatePreset,
  fiscalStart: number,
  now: Date,
): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "thisWeek": {
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const from = startOfDay(addDays(now, -dow));
      return { from, to: endOfDay(addDays(from, 6)) };
    }
    case "thisMonth":
      return {
        from: new Date(y, m, 1),
        to: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
    case "thisQuarter": {
      const q = Math.floor(m / 3);
      return {
        from: new Date(y, q * 3, 1),
        to: new Date(y, q * 3 + 3, 0, 23, 59, 59, 999),
      };
    }
    case "thisYear":
      return {
        from: new Date(y, 0, 1),
        to: new Date(y, 11, 31, 23, 59, 59, 999),
      };
    case "yearToDate":
      return { from: new Date(y, 0, 1), to: endOfDay(now) };
    case "last7Days":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case "last30Days":
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case "thisFiscalYear":
    case "thisFiscalQuarter": {
      const fy0 = fiscalStart - 1; // 0-based fiscal start month
      const fyStartYear = m < fy0 ? y - 1 : y;
      if (preset === "thisFiscalYear") {
        return {
          from: new Date(fyStartYear, fy0, 1),
          to: new Date(fyStartYear + 1, fy0, 0, 23, 59, 59, 999),
        };
      }
      const monthsSince = (m - fy0 + 12) % 12;
      const qStartAbs = fy0 + Math.floor(monthsSince / 3) * 3;
      const qy = fyStartYear + Math.floor(qStartAbs / 12);
      const qm = qStartAbs % 12;
      return {
        from: new Date(qy, qm, 1),
        to: new Date(qy, qm + 3, 0, 23, 59, 59, 999),
      };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}
