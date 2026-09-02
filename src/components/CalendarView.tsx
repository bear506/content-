import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Brand, Post } from "../types";

// A post tagged with which campaign it came from — the calendar spans every campaign at once,
// so "which campaign is this from" is meaningful in a way it isn't for a single-campaign view.
export interface CalendarPost extends Post {
  campaignId: string;
  campaignTitle: string;
}

interface CalendarViewProps {
  posts: CalendarPost[];
  brands: Brand[];
  onSelectDate?: (dateStr: string) => void;
}

function getBrandColor(brands: Brand[], brandId: string): string {
  return brands.find((b) => b.id === brandId)?.brandColor || "#6366f1";
}

function getBrandLabel(brands: Brand[], brandId: string): string {
  const b = brands.find((b) => b.id === brandId);
  return b?.shortCode || b?.name || brandId;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ posts, brands, onSelectDate }) => {
  // Per day: which brands and which campaigns are running — NOT a raw post count, which just
  // reflects how many time slots were scheduled and told the reader nothing useful at a glance.
  const daySummaries = useMemo(() => {
    const map = new Map<string, { brandIds: Set<string>; campaignTitles: Set<string> }>();
    for (const p of posts) {
      if (!p.scheduledDate) continue;
      if (!map.has(p.scheduledDate)) map.set(p.scheduledDate, { brandIds: new Set<string>(), campaignTitles: new Set<string>() });
      const entry = map.get(p.scheduledDate)!;
      entry.brandIds.add(p.brandId);
      entry.campaignTitles.add(p.campaignTitle);
    }
    return map;
  }, [posts]);

  const datesWithPosts = useMemo(
    () => Array.from(daySummaries.keys()).filter(Boolean).sort(),
    [daySummaries]
  );

  const initialDate = datesWithPosts.length > 0 ? new Date(datesWithPosts[0] + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed

  if (datesWithPosts.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <p className="text-sm text-slate-400">
          None of your campaigns' posts have a specific scheduled date, so there's nothing to plot on a calendar.
          Campaigns generated with specific blast dates will show up here.
        </p>
      </div>
    );
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const dateKey = (day: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-bold text-white">{monthLabel}</h3>
        <button
          type="button"
          onClick={goNextMonth}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-slate-500 uppercase pb-1">
            {d}
          </div>
        ))}

        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const key = dateKey(day);
          const summary = daySummaries.get(key);
          const brandIds: string[] = summary ? [...summary.brandIds] : [];
          const hasContent = brandIds.length > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => hasContent && onSelectDate?.(key)}
              disabled={!hasContent}
              title={
                hasContent
                  ? `${Array.from(summary!.campaignTitles).join(", ")} — ${brandIds
                      .map((id) => getBrandLabel(brands, id))
                      .join(", ")}`
                  : undefined
              }
              className={`aspect-square rounded-lg border p-1.5 flex flex-col items-start justify-between text-left transition-all ${
                hasContent
                  ? "bg-slate-950 border-amber-800/60 hover:border-amber-500 cursor-pointer"
                  : "bg-slate-950/40 border-slate-800/60 cursor-default"
              }`}
            >
              <span className={`text-[11px] font-bold ${hasContent ? "text-white" : "text-slate-600"}`}>{day}</span>
              {hasContent && (
                <div className="w-full space-y-0.5">
                  <div className="flex flex-wrap gap-0.5">
                    {brandIds.slice(0, 6).map((brandId) => (
                      <span
                        key={brandId}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: getBrandColor(brands, brandId) }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] font-semibold text-amber-400 truncate block">
                    {brandIds.length} brand{brandIds.length > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
