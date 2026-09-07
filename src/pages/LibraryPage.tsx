import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Archive } from "lucide-react";
import { Brand, BrandContentPlan, CampaignResult, Post } from "../types";
import type { Role } from "../lib/api";
import { ContentMatrixView } from "../components/ContentMatrixView";
import { CampaignHistoryModal } from "../components/CampaignHistoryModal";

type LibraryTab = "matrix" | "archive";

interface LibraryPageProps {
  brands: Brand[];
  savedCampaigns: CampaignResult[];
  activeCampaignId: string;
  onSelectCampaignId: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  campaignBrandsData: BrandContentPlan[];
  campaignTitle: string;
  promoCode: string;
  campaignLanguage?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  onRegenerateFallback?: () => void;
  selectedBrandId: string;
  onSelectBrandId: (id: string) => void;
  onUpdatePost: (post: Post) => void;
  onRefinePostWithAI: (post: Post, instruction: string) => Promise<Post>;
  onDeletePost: (postId: string) => void;
  onBulkApprove: (postIds: string[]) => void;
  onLoadSampleData: () => void;
  onSaveAsTemplate: (name: string) => Promise<void>;
  currentUserRole?: Role;
  currentUserId?: string;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  brands,
  savedCampaigns,
  activeCampaignId,
  onSelectCampaignId,
  onDeleteCampaign,
  campaignBrandsData,
  campaignTitle,
  promoCode,
  campaignLanguage,
  isFallback,
  fallbackReason,
  onRegenerateFallback,
  selectedBrandId,
  onSelectBrandId,
  onUpdatePost,
  onRefinePostWithAI,
  onDeletePost,
  onBulkApprove,
  onLoadSampleData,
  onSaveAsTemplate,
  currentUserRole,
  currentUserId,
}) => {
  const [tab, setTab] = useState<LibraryTab>("matrix");
  const navigate = useNavigate();

  const totalPostsCount = campaignBrandsData.flatMap((b) => b.posts || []).length;

  const tabs: { id: LibraryTab; label: string; icon: React.ReactNode; badge: string | number }[] = [
    { id: "matrix", label: "Content Matrix", icon: <LayoutGrid className="w-4 h-4" />, badge: totalPostsCount },
    { id: "archive", label: "Archive", icon: <Archive className="w-4 h-4" />, badge: savedCampaigns.length },
  ];

  return (
    <div className="space-y-6">
      {/* Library Sub-Navigation */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-1.5 shadow-xl backdrop-blur-md flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[160px] flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === t.id
                ? "bg-amber-500/10 border border-amber-500/50 text-amber-300 shadow-sm"
                : "bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800"
            }`}
          >
            <span className="flex items-center gap-2">
              {t.icon}
              <span>{t.label}</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                tab === t.id ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-900 text-slate-400 border-slate-800"
              }`}
            >
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {tab === "matrix" && (
        <ContentMatrixView
          brands={brands}
          brandsData={campaignBrandsData}
          savedCampaigns={savedCampaigns}
          selectedBrandId={selectedBrandId}
          onSelectBrandId={onSelectBrandId}
          onUpdatePost={onUpdatePost}
          onRefinePostWithAI={onRefinePostWithAI}
          campaignTitle={campaignTitle}
          promoCode={promoCode}
          campaignLanguage={campaignLanguage}
          isFallback={isFallback}
          fallbackReason={fallbackReason}
          onRegenerateFallback={onRegenerateFallback}
          activeCampaignId={activeCampaignId}
          onDeleteCampaign={onDeleteCampaign}
          onDeletePost={onDeletePost}
          onBulkApprove={onBulkApprove}
          onOpenNewCampaign={() => navigate("/create")}
          onLoadSampleData={onLoadSampleData}
          onSaveAsTemplate={onSaveAsTemplate}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
        />
      )}

      {tab === "archive" && (
        <CampaignHistoryModal
          isOpen
          embedded
          onClose={() => {}}
          savedCampaigns={savedCampaigns}
          activeCampaignId={activeCampaignId}
          onSelectCampaign={(id) => {
            onSelectCampaignId(id);
            setTab("matrix");
          }}
          onDeleteCampaign={onDeleteCampaign}
          onOpenNewCampaign={() => navigate("/create")}
        />
      )}
    </div>
  );
};
