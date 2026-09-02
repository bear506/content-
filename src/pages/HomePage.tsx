import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Plus, Settings, Building2, FileClock, CheckCircle2, Sparkles } from "lucide-react";
import { Brand, CampaignResult } from "../types";

interface HomePageProps {
  username: string;
  brands: Brand[];
  savedCampaigns: CampaignResult[];
  onSelectCampaignId: (id: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ username, brands, savedCampaigns, onSelectCampaignId }) => {
  const navigate = useNavigate();

  const allPosts = savedCampaigns.flatMap((c) => c.brandsData.flatMap((bd) => bd.posts || []));
  const pendingCount = allPosts.filter((p) => p.status === "pending_review").length;
  const approvedCount = allPosts.filter((p) => p.status === "approved").length;

  const recentCampaigns = [...savedCampaigns]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 5);

  const openCampaign = (id: string) => {
    onSelectCampaignId(id);
    navigate("/library");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Welcome back, {username}</h1>
        <p className="text-sm text-slate-400 mt-1">Here's what's going on across your campaigns.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => navigate("/create")}
          className="text-left p-5 bg-gradient-to-br from-amber-500/15 to-amber-500/5 border border-amber-500/40 hover:border-amber-400 rounded-2xl transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 mb-3 group-hover:scale-105 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">New Campaign</h3>
          <p className="text-xs text-slate-400 mt-1">Generate a fresh batch of SMS &amp; Web Push content.</p>
        </button>

        <button
          type="button"
          onClick={() => navigate("/library")}
          className="text-left p-5 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 mb-3 group-hover:scale-105 transition-transform">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">Content Library</h3>
          <p className="text-xs text-slate-400 mt-1">Review, filter, and approve generated posts.</p>
        </button>

        <button
          type="button"
          onClick={() => navigate("/manage")}
          className="text-left p-5 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 mb-3 group-hover:scale-105 transition-transform">
            <Settings className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">Manage</h3>
          <p className="text-xs text-slate-400 mt-1">Brands, promo codes, campaign SOP, and team access.</p>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Campaigns
          </div>
          <span className="text-2xl font-extrabold text-white block mt-1">{savedCampaigns.length}</span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" /> Brands
          </div>
          <span className="text-2xl font-extrabold text-white block mt-1">{brands.length}</span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <FileClock className="w-3.5 h-3.5" /> Pending Review
          </div>
          <span className="text-2xl font-extrabold text-amber-300 block mt-1">{pendingCount}</span>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </div>
          <span className="text-2xl font-extrabold text-emerald-300 block mt-1">{approvedCount}</span>
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Recent Campaigns</h2>
          <button type="button" onClick={() => navigate("/library")} className="text-xs font-bold text-amber-400 hover:text-amber-300">
            View all →
          </button>
        </div>
        {recentCampaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No campaigns yet — <button type="button" onClick={() => navigate("/create")} className="text-amber-400 hover:text-amber-300 font-bold">generate your first one</button>.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentCampaigns.map((c) => {
              const postCount = c.brandsData.flatMap((bd) => bd.posts || []).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCampaign(c.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.config.title}</p>
                    <p className="text-xs text-slate-400">
                      {c.config.monthYear} · {c.brandsData.length} brand(s) · {postCount} posts
                    </p>
                  </div>
                  <span className="text-xs font-bold text-amber-400 shrink-0">Open →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
