import React from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { auditLogApi } from "../lib/api";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-950/50 text-emerald-300 border-emerald-800/60",
  update: "bg-sky-950/50 text-sky-300 border-sky-800/60",
  delete: "bg-rose-950/50 text-rose-300 border-rose-800/60",
  approve: "bg-amber-950/50 text-amber-300 border-amber-800/60",
  bulk_approve: "bg-amber-950/50 text-amber-300 border-amber-800/60",
  comment: "bg-slate-800 text-slate-300 border-slate-700",
  reset_password: "bg-indigo-950/50 text-indigo-300 border-indigo-800/60",
};

export const AuditLogViewer: React.FC = () => {
  const auditQuery = useQuery({ queryKey: ["auditLog"], queryFn: () => auditLogApi.list(200) });
  const entries = auditQuery.data || [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100">
      <div className="flex items-center gap-3 p-6 border-b border-slate-800">
        <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Audit Log</h2>
          <p className="text-xs text-slate-400">Recent create/update/delete/approve activity across the team, newest first.</p>
        </div>
      </div>

      <div className="bg-slate-950/40">
        {auditQuery.isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading audit log...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No activity recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-950/60 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-white">{e.username}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          ACTION_COLORS[e.action] || "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {e.action.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">
                      {e.entityType}
                      {e.entityId ? <span className="text-slate-500 font-mono text-[10px]"> #{e.entityId.slice(-8)}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-[11px] max-w-xs truncate">
                      {Object.keys(e.details || {}).length > 0 ? JSON.stringify(e.details) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
