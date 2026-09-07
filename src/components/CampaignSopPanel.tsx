import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Save, RotateCcw } from "lucide-react";
import { settingsApi } from "../lib/api";
import { useToast } from "./Toast";

const TYPES: { id: "payday" | "first_week" | "reloan" | "custom"; label: string }[] = [
  { id: "payday", label: "Payday Sale" },
  { id: "first_week", label: "First Week Collection" },
  { id: "reloan", label: "Reloan Aggressive" },
  { id: "custom", label: "Custom Campaign" },
];

interface CampaignSopPanelProps {
  readOnly?: boolean;
}

export const CampaignSopPanel: React.FC<CampaignSopPanelProps> = ({ readOnly }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sopQuery = useQuery({ queryKey: ["settings", "campaignSop"], queryFn: settingsApi.getCampaignSop });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (sopQuery.data) setDrafts(sopQuery.data.sop);
  }, [sopQuery.data]);

  const saveMutation = useMutation({
    mutationFn: ({ campaignType, text }: { campaignType: string; text: string }) =>
      settingsApi.setCampaignSop(campaignType, text),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "campaignSop"] });
      toast.success(`${TYPES.find((t) => t.id === vars.campaignType)?.label || vars.campaignType} SOP saved.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save SOP."),
  });

  const defaults = sopQuery.data?.defaults || {};

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100">
      <div className="flex items-center gap-3 p-6 border-b border-slate-800">
        <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
          <ListOrdered className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Campaign SOP</h2>
          <p className="text-xs text-slate-400">
            The narrative rules the AI must follow for each campaign type — edit this whenever the monthly angle changes,
            no code change needed. Leave a type blank to skip a mandatory narrative for it.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5 bg-slate-950/40">
        {TYPES.map((t) => {
          const value = drafts[t.id] ?? "";
          const isDirty = sopQuery.data ? value !== sopQuery.data.sop[t.id] : false;
          const isDefault = defaults[t.id] !== undefined && value === defaults[t.id];
          return (
            <div key={t.id} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200">{t.label}</label>
                {isDefault && <span className="text-[10px] text-slate-500 font-medium">Using built-in default</span>}
              </div>
              <textarea
                rows={6}
                disabled={readOnly}
                value={value}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                placeholder="No mandatory SOP — the AI will follow only this campaign's own Custom Notes/Guidelines."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono leading-relaxed disabled:opacity-60"
              />
              {!readOnly && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={!isDirty || saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ campaignType: t.id, text: value })}
                    className="px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    disabled={saveMutation.isPending || value === (defaults[t.id] || "")}
                    onClick={() => setDrafts((prev) => ({ ...prev, [t.id]: defaults[t.id] || "" }))}
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Default</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
