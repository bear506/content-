import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Trash2, Sparkles } from "lucide-react";
import { campaignTemplatesApi, CampaignTemplate } from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface TemplatesPageProps {
  readOnly?: boolean;
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  payday: "Payday Sale",
  first_week: "First Week Collection",
  custom: "Custom Campaign",
};

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ readOnly }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["campaignTemplates"], queryFn: campaignTemplatesApi.list });
  const [deleteTarget, setDeleteTarget] = useState<CampaignTemplate | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignTemplatesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      toast.success("Template deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete template."),
  });

  const templates = templatesQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Templates</h1>
          <p className="text-sm text-slate-400 mt-1">
            Saved campaign setups you can reuse — created from Step 5 of the wizard via "Save as Template".
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/create")}
          className="px-3.5 py-2 text-xs font-extrabold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-md flex items-center gap-1.5"
        >
          <Sparkles className="w-4 h-4" />
          <span>Start Blank Campaign</span>
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <BookmarkPlus className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">
            No saved templates yet. Generate a campaign, then use "Save as Template" on Step 5 to reuse its setup next month.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-3 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-white truncate">{t.name}</h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t)}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors shrink-0"
                    title="Delete template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-bold bg-amber-950/50 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded">
                  {CAMPAIGN_TYPE_LABELS[t.config.campaignType] || t.config.campaignType}
                </span>
                <span className="text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                  {t.config.durationDays}d × {t.config.postsPerDay}/day
                </span>
                <span className="text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                  {t.config.language}
                </span>
              </div>

              <p className="text-xs text-slate-400 line-clamp-2">{t.config.discountDetails}</p>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500">
                  {t.createdBy ? `by ${t.createdBy}` : ""} {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/create?template=${t.id}`)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300"
                >
                  Use Template →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete this template?"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ""}
        confirmLabel="Delete Template"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
