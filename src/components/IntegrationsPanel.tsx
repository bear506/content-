import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook, Save, FlaskConical, Trash2 } from "lucide-react";
import { settingsApi } from "../lib/api";
import { useToast } from "./Toast";

export const IntegrationsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const webhookQuery = useQuery({ queryKey: ["settings", "webhookUrl"], queryFn: settingsApi.getWebhookUrl });

  const [urlInput, setUrlInput] = useState("");

  useEffect(() => {
    if (webhookQuery.data) setUrlInput(webhookQuery.data.url);
  }, [webhookQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (url: string) => settingsApi.setWebhookUrl(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "webhookUrl"] });
      toast.success("Webhook URL saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save webhook URL."),
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testWebhook(),
    onSuccess: () => toast.success("Test notification sent — check your webhook destination."),
    onError: (err: Error) => toast.error(err.message || "Failed to send test notification."),
  });

  const currentUrl = webhookQuery.data?.url || "";
  const isFromEnv = webhookQuery.data?.fromEnv || false;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100">
      <div className="flex items-center gap-3 p-6 border-b border-slate-800">
        <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
          <Webhook className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Integrations</h2>
          <p className="text-xs text-slate-400">
            Send a Slack/Discord/Mattermost-style notification whenever a campaign is generated or a post is approved.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4 bg-slate-950/40">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <label className="block text-xs font-bold text-slate-200">Incoming Webhook URL</label>
          {isFromEnv && !urlInput && (
            <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-lg px-2.5 py-1.5">
              A webhook URL is currently set via the server's environment variable. Saving one here will take precedence over it.
            </p>
          )}
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(urlInput.trim())}
              className="px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            <button
              type="button"
              disabled={!currentUrl || testMutation.isPending}
              onClick={() => testMutation.mutate()}
              className="px-3.5 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
              title={!currentUrl ? "Save a URL first" : "Send a one-off test notification"}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{testMutation.isPending ? "Sending..." : "Send Test"}</span>
            </button>
            {currentUrl && (
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setUrlInput("");
                  saveMutation.mutate("");
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-950/60 border border-rose-800/60 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 leading-relaxed">
          💡 Notifications fire on: a new campaign being generated, a post being approved (individually or in bulk).
        </div>
      </div>
    </div>
  );
};
