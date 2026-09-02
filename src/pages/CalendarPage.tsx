import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarView, CalendarPost } from "../components/CalendarView";
import { Brand, CampaignResult } from "../types";

interface CalendarPageProps {
  brands: Brand[];
  savedCampaigns: CampaignResult[];
  onSelectCampaignId: (id: string) => void;
}

interface CampaignOnDate {
  campaignId: string;
  campaignTitle: string;
  campaignType: string;
  brandIds: string[];
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  payday: "Payday Sale",
  first_week: "First Week Collection",
  custom: "Custom Campaign",
};

export const CalendarPage: React.FC<CalendarPageProps> = ({ brands, savedCampaigns, onSelectCampaignId }) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const allPosts: CalendarPost[] = useMemo(
    () =>
      savedCampaigns.flatMap((c) =>
        c.brandsData.flatMap((bd) =>
          (bd.posts || []).map((p) => ({ ...p, campaignId: c.id, campaignTitle: c.config.title }))
        )
      ),
    [savedCampaigns]
  );

  // What's actually running on the selected date, one row per campaign — not one row per post.
  const campaignsOnSelectedDate: CampaignOnDate[] = useMemo(() => {
    if (!selectedDate) return [];
    const byCampaign = new Map<string, CampaignOnDate>();
    for (const p of allPosts) {
      if (p.scheduledDate !== selectedDate) continue;
      if (!byCampaign.has(p.campaignId)) {
        const campaign = savedCampaigns.find((c) => c.id === p.campaignId);
        byCampaign.set(p.campaignId, {
          campaignId: p.campaignId,
          campaignTitle: p.campaignTitle,
          campaignType: campaign?.config.campaignType || "custom",
          brandIds: [],
        });
      }
      const entry = byCampaign.get(p.campaignId)!;
      if (!entry.brandIds.includes(p.brandId)) entry.brandIds.push(p.brandId);
    }
    return Array.from(byCampaign.values());
  }, [allPosts, selectedDate, savedCampaigns]);

  const getBrand = (brandId: string) => brands.find((b) => b.id === brandId);

  const openInLibrary = (campaignId: string) => {
    onSelectCampaignId(campaignId);
    navigate("/library");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Content Calendar</h1>
        <p className="text-sm text-slate-400 mt-1">Which campaign and which brands are running on any given day.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <CalendarView posts={allPosts} brands={brands} onSelectDate={setSelectedDate} />

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 lg:sticky lg:top-6">
          <h2 className="text-sm font-bold text-white">
            {selectedDate
              ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Select a date"}
          </h2>

          {!selectedDate && <p className="text-xs text-slate-400">Click a day with posts to see what's running.</p>}
          {selectedDate && campaignsOnSelectedDate.length === 0 && (
            <p className="text-xs text-slate-400">Nothing scheduled on this date.</p>
          )}

          <div className="space-y-3">
            {campaignsOnSelectedDate.map((c) => (
              <button
                key={c.campaignId}
                type="button"
                onClick={() => openInLibrary(c.campaignId)}
                className="w-full text-left p-3 bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-white truncate">{c.campaignTitle}</p>
                  <span className="text-[10px] font-bold bg-amber-950/50 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded shrink-0">
                    {CAMPAIGN_TYPE_LABELS[c.campaignType] || c.campaignType}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {c.brandIds.map((brandId) => {
                    const brand = getBrand(brandId);
                    return (
                      <span
                        key={brandId}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: `${brand?.brandColor || "#6366f1"}20`,
                          borderColor: `${brand?.brandColor || "#6366f1"}60`,
                          color: brand?.brandColor || "#6366f1",
                        }}
                      >
                        {brand?.shortCode || brand?.name || brandId}
                      </span>
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
