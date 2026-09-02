import React, { useState } from "react";
import { X, Calendar, Layers, Trash2, CheckCircle2, ArrowRight, Download, Plus, Copy, Tag, Sparkles } from "lucide-react";
import { CampaignResult } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

interface CampaignHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedCampaigns: CampaignResult[];
  activeCampaignId: string;
  onSelectCampaign: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  onOpenNewCampaign: () => void;
  /** Render as an inline page section (no backdrop/overlay) instead of a floating modal. */
  embedded?: boolean;
}

export const CampaignHistoryModal: React.FC<CampaignHistoryModalProps> = ({
  isOpen,
  onClose,
  savedCampaigns,
  activeCampaignId,
  onSelectCampaign,
  onDeleteCampaign,
  onOpenNewCampaign,
  embedded = false,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<CampaignResult | null>(null);

  if (!isOpen && !embedded) return null;

  return (
    <div
      onClick={(e) => {
        if (!embedded && e.target === e.currentTarget) onClose();
      }}
      className={
        embedded
          ? "w-full"
          : "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
      }
    >
      <div
        id="campaign-history-dialog"
        onClick={embedded ? undefined : (e) => e.stopPropagation()}
        className={
          embedded
            ? "bg-slate-900 border border-slate-800 rounded-2xl w-full text-slate-100 shadow-xl overflow-hidden"
            : "bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl text-slate-100 shadow-2xl overflow-hidden my-6 cursor-default"
        }
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Campaign Storage &amp; History Archive
              </h2>
              <p className="text-xs text-slate-400">
                You have <span className="text-white font-bold">{savedCampaigns.length} campaign(s)</span> saved. Switch or review past schedules anytime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenNewCampaign();
              }}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Campaign</span>
            </button>
            {!embedded && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Campaign List */}
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto bg-slate-950/40">
          {savedCampaigns.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <p className="text-sm font-bold text-slate-300">No Saved Campaigns in Archive</p>
              <p className="text-xs text-slate-500">All campaign archives have been removed.</p>
            </div>
          ) : (
            savedCampaigns.map((camp) => {
              const isActive = camp.id === activeCampaignId;
              const totalPosts = camp.brandsData.flatMap((b) => b.posts || []).length;
              const brandCount = camp.brandsData.length;

              return (
                <div
                  key={camp.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? "bg-slate-800 border-amber-500/70 shadow-md ring-1 ring-amber-500/30"
                      : "bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-2xs"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-white">{camp.config.title}</h3>
                        {isActive && (
                          <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> ACTIVE VIEW
                          </span>
                        )}
                        <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono px-2 py-0.5 rounded font-semibold">
                          {camp.config.monthYear}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap pt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          Start: <strong className="text-slate-200">{camp.config.startDate || "N/A"}</strong> ({camp.config.durationDays} Days)
                        </span>
                        <span className="flex items-center gap-1 font-mono text-emerald-300 font-bold bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded">
                          <Tag className="w-3 h-3 text-emerald-400" />
                          {camp.config.promoCode}
                        </span>
                        <span>
                          <strong className="text-slate-200">{brandCount} Brands</strong> ({totalPosts} Messages)
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        {camp.config.discountDetails}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectCampaign(camp.id);
                            onClose();
                          }}
                          className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg flex items-center gap-1 transition-all"
                        >
                          <span>View Matrix</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(camp)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors border border-transparent hover:border-rose-800/60 cursor-pointer"
                        title="Delete campaign archive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>All campaigns are saved to the shared team library for instant switching.</span>
          {!embedded && (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all"
            >
              Back to Home Page
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete this campaign archive?"
        message={deleteTarget ? `"${deleteTarget.config.title}" and all of its posts will be permanently removed. This cannot be undone.` : ""}
        confirmLabel="Delete Campaign"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteCampaign(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
