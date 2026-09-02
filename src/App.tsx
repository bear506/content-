import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "./components/Sidebar";
import { ExportModal } from "./components/ExportModal";
import { ChatWidget } from "./components/ChatWidget";
import { LoginScreen } from "./components/LoginScreen";
import { HomePage } from "./pages/HomePage";
import { CalendarPage } from "./pages/CalendarPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { LibraryPage } from "./pages/LibraryPage";
import { CreateCampaignPage } from "./pages/CreateCampaignPage";
import { ManagePage } from "./pages/ManagePage";

import { Brand, CampaignConfig, CampaignResult, Post, PromoCodeRecord } from "./types";
import { INITIAL_BRANDS } from "./data/defaultBrands";
import { SAMPLE_CAMPAIGNS } from "./data/sampleCampaigns";
import { authApi, brandsApi, campaignsApi, postsApi, promoCodesApi, campaignTemplatesApi, Role } from "./lib/api";
import { ToastProvider, useToast } from "./components/Toast";
import { Sparkles } from "lucide-react";

interface CurrentUser {
  id: string;
  username: string;
  role: Role;
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  // User Authentication State (backed by the server session, not localStorage)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((data) => {
        if (data.authenticated && data.id && data.username && data.role) {
          setCurrentUser({ id: data.id, username: data.username, role: data.role });
        }
      })
      .catch((e) => console.error("Failed to check session status", e))
      .finally(() => setIsCheckingSession(false));
  }, []);

  const handleLoginSuccess = async () => {
    try {
      const me = await authApi.me();
      if (me.authenticated && me.id && me.username && me.role) {
        setCurrentUser({ id: me.id, username: me.username, role: me.role });
      }
    } catch (e) {
      console.error("Failed to load session after login", e);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      console.error("Failed to log out cleanly", e);
    }
    setCurrentUser(null);
    queryClient.clear();
  };

  // --- Server-backed data (replaces localStorage) ---
  const isAuthed = !!currentUser;

  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: brandsApi.list, enabled: isAuthed });
  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: campaignsApi.list, enabled: isAuthed });
  const promoQuery = useQuery({ queryKey: ["promoCodes"], queryFn: promoCodesApi.list, enabled: isAuthed });

  const brands: Brand[] = brandsQuery.data || [];
  const savedCampaigns: CampaignResult[] = campaignsQuery.data || [];
  const promoLibrary: PromoCodeRecord[] = promoQuery.data || [];

  const saveBrandMutation = useMutation({
    mutationFn: brandsApi.save,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save brand."),
  });
  const deleteBrandMutation = useMutation({
    mutationFn: brandsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete brand."),
  });
  const deleteCampaignMutation = useMutation({
    mutationFn: campaignsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete campaign."),
  });
  const deletePostMutation = useMutation({
    mutationFn: postsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Post deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete post."),
  });
  const updatePostMutation = useMutation({
    mutationFn: (post: Post) => postsApi.update(post.id, post),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
    onError: (err: Error) => toast.error(err.message || "Failed to save post changes."),
  });
  const bulkApproveMutation = useMutation({
    mutationFn: postsApi.bulkApprove,
    onSuccess: (_data, postIds) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(`${postIds.length} post(s) approved.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to bulk-approve posts."),
  });
  const addPromoRecordMutation = useMutation({
    mutationFn: (rec: PromoCodeRecord) => promoCodesApi.create(rec),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promoCodes"] }),
    onError: (err: Error) => toast.error(err.message || "Failed to save promo code."),
  });
  const deletePromoRecordMutation = useMutation({
    mutationFn: promoCodesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promoCodes"] });
      toast.success("Promo code record deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete promo code record."),
  });

  const [activeCampaignId, setActiveCampaignId] = useState<string>("");

  // Keep the active campaign selection valid as the server list changes
  useEffect(() => {
    if (savedCampaigns.length === 0) {
      if (activeCampaignId !== "") setActiveCampaignId("");
      return;
    }
    if (!savedCampaigns.some((c) => c.id === activeCampaignId)) {
      setActiveCampaignId(savedCampaigns[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCampaigns]);

  // Current Active Campaign Result
  const campaignResult = savedCampaigns.find((c) => c.id === activeCampaignId) || savedCampaigns[0] || null;
  const [selectedBrandIdFilter, setSelectedBrandIdFilter] = useState<string>("all");

  // Modal state (Export is the only remaining true overlay modal)
  const [isExportOpen, setIsExportOpen] = useState(false);

  // First-login welcome hint — shown once per user, never again after dismissal
  const [showWelcomeHint, setShowWelcomeHint] = useState(false);
  useEffect(() => {
    if (!currentUser) return;
    if (!localStorage.getItem(`campaignai:welcomed:${currentUser.id}`)) {
      setShowWelcomeHint(true);
    }
  }, [currentUser]);
  const dismissWelcomeHint = () => {
    if (currentUser) localStorage.setItem(`campaignai:welcomed:${currentUser.id}`, "1");
    setShowWelcomeHint(false);
  };

  // Status & Notifications
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoadSampleData = async () => {
    try {
      for (const camp of SAMPLE_CAMPAIGNS) {
        await campaignsApi.create(camp.config, camp.brandsData);
      }
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Sample demo data loaded.");
    } catch (err: any) {
      toast.error(err.message || "Failed to reload sample data.");
    }
  };

  // Handlers
  const handleSaveBrand = (updatedBrand: Brand) => {
    saveBrandMutation.mutate(updatedBrand);
  };

  const handleDeleteBrand = (brandId: string) => {
    if (brands.length <= 1) return;
    deleteBrandMutation.mutate(brandId);
  };

  const handleResetDefaultBrands = async () => {
    try {
      const currentIds = new Set(brands.map((b) => b.id));
      const defaultIds = new Set(INITIAL_BRANDS.map((b) => b.id));

      for (const b of INITIAL_BRANDS) {
        await brandsApi.save(b);
      }
      for (const id of currentIds) {
        if (!defaultIds.has(id)) {
          await brandsApi.remove(id);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Default brands restored.");
    } catch (err: any) {
      toast.error(err.message || "Failed to restore default brands.");
    }
  };

  const handleDeleteCampaign = (campaignId: string) => {
    deleteCampaignMutation.mutate(campaignId);
  };

  const handleDeletePost = (postId: string) => {
    deletePostMutation.mutate(postId);
  };

  const handleUpdatePost = (updatedPost: Post) => {
    updatePostMutation.mutate(updatedPost);
  };

  const handleBulkApprove = (postIds: string[]) => {
    bulkApproveMutation.mutate(postIds);
  };

  const handleSaveAsTemplate = async (name: string) => {
    if (!campaignResult) return;
    const c = campaignResult.config;
    try {
      await campaignTemplatesApi.create(name, {
        campaignType: c.campaignType,
        durationDays: c.durationDays,
        postsPerDay: c.postsPerDay,
        discountType: "custom",
        discountValue: 0,
        currencyUnit: "RM",
        minSpend: "",
        discountDetails: c.discountDetails,
        targetPlatforms: c.targetPlatforms,
        customNotes: c.customNotes,
        language: c.language || "English",
        customGuidelines: c.customGuidelines || "",
        timeSlots: c.timeSlots || [],
      });
      await queryClient.invalidateQueries({ queryKey: ["campaignTemplates"] });
      toast.success(`Saved as template "${name}".`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save campaign as template.");
    }
  };

  const handleAddPromoRecord = (rec: PromoCodeRecord) => {
    addPromoRecordMutation.mutate(rec);
  };

  const handleDeletePromoRecord = (id: string) => {
    deletePromoRecordMutation.mutate(id);
  };

  const handleGenerateCampaign = async (config: CampaignConfig) => {
    setIsGenerating(true);
    setErrorMessage(null);

    const targetBrands = brands
      .filter((b) => config.selectedBrandIds.includes(b.id))
      .map((b) => ({
        ...b,
        brandVoucherCode:
          config.brandVoucherCodes?.[b.id] ||
          (b.shortCode && config.promoCode.toUpperCase().includes(b.shortCode.toUpperCase())
            ? config.promoCode
            : `${config.promoCode}${b.shortCode || b.id.replace('brand-', '').toUpperCase()}`),
      }));

    try {
      const response = await fetch("/api/campaign/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brands: targetBrands,
          campaignType: config.campaignType,
          campaignTitle: config.title,
          monthYear: config.monthYear,
          durationDays: config.durationDays,
          postsPerDay: config.postsPerDay,
          promoCode: config.promoCode,
          discountDetails: config.discountDetails,
          brandVoucherCodes: config.brandVoucherCodes || {},
          brandDiscountDetails: config.brandDiscountDetails || {},
          targetPlatforms: config.targetPlatforms,
          customNotes: config.customNotes,
          aiProvider: config.aiProvider || "gemini",
          scheduleMode: config.scheduleMode || "consecutive",
          customDates: config.calendarDates || [],
          language: config.language || "English",
          timeSlots: config.timeSlots || [],
          customGuidelines: config.customGuidelines || "",
          hookVariantCount: config.hookVariantCount || 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate campaign content.");
      }

      const resData = await response.json();

      if (resData.success && resData.data) {
        const brandsData = resData.data.map((bPlan: any) => {
          const matchedBrand = targetBrands.find(
            (tb) => tb.id === bPlan.brandId || tb.name.toLowerCase() === bPlan.brandName?.toLowerCase()
          );
          const defaultBrandCode = matchedBrand?.brandVoucherCode || `${config.promoCode}-${matchedBrand?.shortCode || 'CODE'}`;

          return {
            ...bPlan,
            brandId: matchedBrand?.id || bPlan.brandId || "brand-1",
            brandName: matchedBrand?.name || bPlan.brandName,
            posts: (bPlan.posts || []).map((p: any, idx: number) => ({
              ...p,
              id: p.id || `post-${matchedBrand?.id || 'b'}-${idx}-${Date.now()}`,
              brandId: matchedBrand?.id || bPlan.brandId || "brand-1",
              brandName: matchedBrand?.name || bPlan.brandName,
              promoCodeUsed: p.promoCodeUsed || defaultBrandCode,
              status: "draft",
            })),
          };
        });

        const configToSave: CampaignConfig = resData.isFallback
          ? { ...config, isFallback: true, fallbackReason: resData.fallbackReason || "AI generation failed." }
          : config;

        const newResult = await campaignsApi.create(configToSave, brandsData);
        await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        setActiveCampaignId(newResult.id);
        navigate("/library");
        const totalPosts = brandsData.reduce((sum: number, bd: any) => sum + (bd.posts?.length || 0), 0);

        if (resData.isFallback) {
          toast.warning(
            `AI generation failed (${resData.fallbackReason || "unknown reason"}) — "${config.title}" was created with template placeholder content instead. Review before sending, or regenerate.`
          );
        } else {
          toast.success(`"${config.title}" generated — ${totalPosts} post(s) across ${brandsData.length} brand(s).`);
        }

        // Auto-add/update Promo Code in Library
        const selectedBrandShortcodes = targetBrands.map((b) => b.shortCode || b.name);
        handleAddPromoRecord({
          id: `promo-${Date.now()}`,
          code: config.promoCode,
          campaignTitle: config.title,
          campaignType: config.campaignType,
          monthYear: config.monthYear,
          startDate: config.startDate,
          brandIds: config.selectedBrandIds,
          brandShortCodes: selectedBrandShortcodes,
          discountDetails: config.discountDetails,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error("Campaign generation error:", err);
      setErrorMessage(err.message || "An unexpected error occurred while generating content.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Replaces a fallback (non-AI) campaign with a fresh AI-generation attempt using the same
  // settings — deletes the old fallback campaign first so the user doesn't end up with a
  // duplicate, then re-runs the normal generate flow (which creates a new campaign + id).
  const handleRegenerateFallback = async () => {
    if (!campaignResult) return;
    const { isFallback, fallbackReason, id, ...rest } = campaignResult.config;
    await deleteCampaignMutation.mutateAsync(campaignResult.id);
    await handleGenerateCampaign({ ...rest, id: `cfg-${Date.now()}` } as CampaignConfig);
  };

  // Returns the AI-refined post without applying it — the caller (PostCard) shows a
  // before/after diff and only calls handleUpdatePost once the user confirms.
  const handleRefinePostWithAI = async (post: Post, instruction: string): Promise<Post> => {
    const response = await fetch("/api/campaign/refine-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post,
        brandName: post.brandName,
        instruction,
      }),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(resData.error || "Failed to refine post with AI");
    }
    if (!resData.success || !resData.updatedPost) {
      throw new Error(resData.error || "AI did not return an updated post");
    }
    return resData.updatedPost;
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (brandsQuery.isLoading || campaignsQuery.isLoading || promoQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 flex font-sans antialiased selection:bg-amber-500/20 selection:text-amber-200 relative overflow-x-hidden">
      {/* Subtle Ambient Background Flares for Main App Canvas */}
      <div className="fixed top-0 left-1/3 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="fixed bottom-0 right-1/3 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none z-0" />

      {/* Left Navigation Rail */}
      <Sidebar onOpenExport={() => setIsExportOpen(true)} username={currentUser.username} onLogout={handleLogout} />

      {/* Main Content — fills the remaining width next to the sidebar, no artificial cap */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
        <main className="space-y-6">
          {showWelcomeHint && (
            <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-indigo-100">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-indigo-200">Welcome to Vendox Content AI!</p>
                  <p className="text-indigo-300/90 leading-relaxed">
                    <strong className="text-indigo-200">Library</strong> is where your team reviews and approves generated posts.{" "}
                    <strong className="text-indigo-200">New Campaign</strong> walks you through a 5-step wizard to generate a fresh batch.{" "}
                    <strong className="text-indigo-200">Manage</strong> handles brands, promo codes, and (for admins) team accounts.
                    Only admins can give final approval on posts — everyone else can draft and submit for review.
                  </p>
                </div>
              </div>
              <button
                onClick={dismissWelcomeHint}
                className="text-xs font-bold text-indigo-400 hover:text-white shrink-0"
              >
                Got it
              </button>
            </div>
          )}

          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route
              path="/home"
              element={
                <HomePage
                  username={currentUser.username}
                  brands={brands}
                  savedCampaigns={savedCampaigns}
                  onSelectCampaignId={setActiveCampaignId}
                />
              }
            />
            <Route
              path="/calendar"
              element={
                <CalendarPage
                  brands={brands}
                  savedCampaigns={savedCampaigns}
                  onSelectCampaignId={setActiveCampaignId}
                />
              }
            />
            <Route
              path="/templates"
              element={<TemplatesPage readOnly={currentUser.role === "viewer"} />}
            />
            <Route
              path="/library"
              element={
                <LibraryPage
                  brands={brands}
                  savedCampaigns={savedCampaigns}
                  activeCampaignId={activeCampaignId}
                  onSelectCampaignId={setActiveCampaignId}
                  onDeleteCampaign={handleDeleteCampaign}
                  campaignBrandsData={campaignResult ? campaignResult.brandsData : []}
                  campaignTitle={campaignResult ? campaignResult.config.title : "No Campaign Active"}
                  promoCode={campaignResult ? campaignResult.config.promoCode : ""}
                  campaignLanguage={campaignResult ? campaignResult.config.language || "English" : "English"}
                  isFallback={campaignResult?.config.isFallback}
                  fallbackReason={campaignResult?.config.fallbackReason}
                  onRegenerateFallback={handleRegenerateFallback}
                  selectedBrandId={selectedBrandIdFilter}
                  onSelectBrandId={setSelectedBrandIdFilter}
                  onUpdatePost={handleUpdatePost}
                  onRefinePostWithAI={handleRefinePostWithAI}
                  onDeletePost={handleDeletePost}
                  onBulkApprove={handleBulkApprove}
                  onLoadSampleData={handleLoadSampleData}
                  onSaveAsTemplate={handleSaveAsTemplate}
                  currentUserRole={currentUser.role}
                  currentUserId={currentUser.id}
                />
              }
            />
            <Route
              path="/create"
              element={
                <CreateCampaignPage
                  brands={brands}
                  promoLibrary={promoLibrary}
                  onGenerate={handleGenerateCampaign}
                  isGenerating={isGenerating}
                  errorMessage={errorMessage}
                  onDismissError={() => setErrorMessage(null)}
                  currentUserId={currentUser.id}
                />
              }
            />
            <Route
              path="/manage"
              element={
                <ManagePage
                  brands={brands}
                  onSaveBrand={handleSaveBrand}
                  onDeleteBrand={handleDeleteBrand}
                  onResetDefaultBrands={handleResetDefaultBrands}
                  promoLibrary={promoLibrary}
                  onAddPromoRecord={handleAddPromoRecord}
                  onDeletePromoRecord={handleDeletePromoRecord}
                  activeCampaign={campaignResult}
                  currentUserRole={currentUser.role}
                  currentUserId={currentUser.id}
                />
              }
            />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </main>
      </div>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        brands={brands}
        campaigns={savedCampaigns}
        defaultCampaignId={campaignResult?.id}
      />

      <ChatWidget brands={brands} savedCampaigns={savedCampaigns} promoLibrary={promoLibrary} />
    </div>
  );
}
