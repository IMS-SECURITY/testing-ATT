/**
 * CalendarView — A monthly calendar that highlights:
 *   - Sundays (always red)
 *   - Holidays from Firestore (/holidays collection)
 *   - Today
 *
 * Props:
 *   year / month — which month to render
 *   holidays — list of Holiday records (pre-fetched)
 *   onDayClick — called when super admin clicks a day (optional)
 *   readOnly — disables click interaction
 */
import { useMemo } from "react";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { Holiday } from "@/lib/holidays";

interface CalendarViewProps {
  year: number;
  month: number; // 1-12
  holidays: Holiday[];
  onDayClick?: (dateStr: string) => void;
  readOnly?: boolean;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TODAY_STR = format(new Date(), "yyyy-MM-dd");

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function CalendarView({
  year,
  month,
  holidays,
  onDayClick,
  readOnly = true,
}: CalendarViewProps) {
  const holidayMap = useMemo(() => {
    const m: Record<string, Holiday> = {};
    holidays.forEach((h) => { m[h.date] = h; });
    return m;
  }, [holidays]);

  const totalDays = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1))); // 0=Sun

  const cells = useMemo(() => {
    const arr: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) {
      arr.push({ day: d, dateStr: `${year}-${pad(month)}-${pad(d)}` });
    }
    return arr;
  }, [year, month, firstDayOfWeek, totalDays]);

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((wd, i) => (
          <div
            key={wd}
            className={`text-center text-xs font-semibold py-1 ${
              i === 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
            }`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} />;
          }
          const { day, dateStr } = cell;
          const isToday = dateStr === TODAY_STR;
          const holiday = holidayMap[dateStr];
          // Sundays are col 0
          const colIdx = (firstDayOfWeek + day - 1) % 7;
          const isSunday = colIdx === 0;
          const isHoliday = !!holiday;
          const isWeekend = isSunday; // Saturdays handled separately via holiday type

          let dayCls =
            "relative flex flex-col items-center justify-start rounded-lg p-1 min-h-[52px] text-sm transition-colors ";

          if (isToday) {
            dayCls += "ring-2 ring-primary bg-primary/10 ";
          } else if (isHoliday) {
            if (holiday.type === "national") dayCls += "bg-red-50 dark:bg-red-950/40 ";
            else if (holiday.type === "office") dayCls += "bg-amber-50 dark:bg-amber-950/40 ";
            else dayCls += "bg-blue-50 dark:bg-blue-950/30 ";
          } else if (isWeekend) {
            dayCls += "bg-red-50/60 dark:bg-red-950/20 ";
          } else {
            dayCls += "bg-muted/20 hover:bg-muted/50 ";
          }

          if (!readOnly && onDayClick) {
            dayCls += "cursor-pointer ";
          }

          return (
            <div
              key={dateStr}
              className={dayCls}
              onClick={() => !readOnly && onDayClick?.(dateStr)}
              title={holiday?.name ?? (isSunday ? "Sunday" : undefined)}
            >
              <span
                className={`text-xs font-bold ${
                  isSunday || isHoliday
                    ? "text-red-600 dark:text-red-400"
                    : isToday
                    ? "text-primary"
                    : ""
                }`}
              >
                {day}
              </span>
              {holiday && (
                <span className="mt-0.5 w-full text-center text-[9px] leading-tight text-red-700 dark:text-red-300 font-medium line-clamp-2">
                  {holiday.name}
                </span>
              )}
              {!holiday && isSunday && (
                <span className="mt-0.5 text-[9px] text-red-400 dark:text-red-500">Off</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950/60 border border-red-300" />
          National Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300" />
          Office Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-blue-100 dark:bg-blue-950/30 border border-blue-300" />
          Optional Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-primary bg-primary/10" />
          Today
        </span>
      </div>
    </div>
  );
}

interface MonthNavigatorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  const label = format(new Date(year, month - 1, 1), "MMMM yyyy");

  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <button
        onClick={prev}
        className="rounded-md px-3 py-1 text-sm font-medium hover:bg-muted transition-colors"
      >
        ← Prev
      </button>
      <span className="text-base font-semibold">{label}</span>
      <button
        onClick={next}
        className="rounded-md px-3 py-1 text-sm font-medium hover:bg-muted transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

/** Badge for holiday type (used in lists) */
export function HolidayTypeBadge({ type }: { type: Holiday["type"] }) {
  if (type === "national") return <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px]">National</Badge>;
  if (type === "office") return <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px]">Office</Badge>;
  return <Badge variant="outline" className="text-[10px]">Optional</Badge>;
}
