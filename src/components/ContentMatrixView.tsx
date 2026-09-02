import React, { useState } from "react";
import { Search, Filter, LayoutList, Calendar, CheckCircle2, Clock, Building2, Tag, ArrowUpDown, RefreshCw, Layers, ListOrdered, Sparkles, Copy, Check, Trash2, ShieldCheck, AlertTriangle, BookmarkPlus, X } from "lucide-react";
import { Brand, BrandContentPlan, Post, PostStatus } from "../types";
import type { Role } from "../lib/api";
import { PostCard } from "./PostCard";
import { findDuplicateHooks } from "../lib/duplicateDetector";
import { findSlotConflicts } from "../lib/conflictDetector";
import { ConfirmDialog } from "./ConfirmDialog";
import { Tooltip } from "./Tooltip";
import { BrandChipFilter } from "./BrandChipFilter";

interface ContentMatrixViewProps {
  brands: Brand[];
  brandsData: BrandContentPlan[];
  selectedBrandId: string;
  onSelectBrandId: (id: string) => void;
  onUpdatePost: (updatedPost: Post) => void;
  onRefinePostWithAI: (post: Post, instruction: string) => Promise<Post>;
  campaignTitle?: string;
  promoCode?: string;
  campaignLanguage?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  onRegenerateFallback?: () => void;
  activeCampaignId?: string;
  onDeleteCampaign?: (id: string) => void;
  onDeletePost?: (postId: string) => void;
  onBulkApprove?: (postIds: string[]) => void;
  onOpenNewCampaign?: () => void;
  onLoadSampleData?: () => void;
  onSaveAsTemplate?: (name: string) => Promise<void>;
  currentUserRole?: Role;
  currentUserId?: string;
}

export const ContentMatrixView: React.FC<ContentMatrixViewProps> = ({
  brands,
  brandsData,
  selectedBrandId,
  onSelectBrandId,
  onUpdatePost,
  onRefinePostWithAI,
  campaignTitle = "Payday Sale Campaign",
  promoCode = "PAYDAY30OFF",
  campaignLanguage = "English",
  isFallback,
  fallbackReason,
  onRegenerateFallback,
  activeCampaignId,
  onDeleteCampaign,
  onDeletePost,
  onBulkApprove,
  onOpenNewCampaign,
  onLoadSampleData,
  onSaveAsTemplate,
  currentUserRole,
  currentUserId,
}) => {
  const canWrite = currentUserRole !== "viewer";
  const isAdmin = currentUserRole === "admin";
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | "all">("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDuplicatesPanel, setShowDuplicatesPanel] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [isRunningQA, setIsRunningQA] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaResults, setQaResults] = useState<{ id: string; issue: string }[] | null>(null);
  const [qaMeta, setQaMeta] = useState<{ checkedCount: number; truncated: boolean } | null>(null);
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [confirmBulkDeleteCount, setConfirmBulkDeleteCount] = useState<number | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);

  // Multi-brand selection state
  const [selectedMultiBrandIds, setSelectedMultiBrandIds] = useState<string[]>([]);

  // Synchronize when parent changes selectedBrandId to a real literal brand id or "all".
  // "group_X" and "custom_multi" are sentinels only ever produced by this component's own
  // toggleMultiBrand/selectGroupBrands below, which already set selectedMultiBrandIds
  // correctly themselves — re-decoding the sentinel here would clobber that real array with
  // a bogus single-item list (e.g. ["group_WLM"], which matches no real post and silently
  // breaks group filtering), so those two cases are explicitly no-ops.
  React.useEffect(() => {
    if (selectedBrandId === "all") {
      setSelectedMultiBrandIds([]);
    } else if (selectedBrandId === "custom_multi" || selectedBrandId.startsWith("group_")) {
      return;
    } else {
      setSelectedMultiBrandIds([selectedBrandId]);
    }
  }, [selectedBrandId]);

  // Restore the last brand filter this user chose, so it survives reload —
  // previously it reset to "all" on every page load.
  const brandFilterKey = currentUserId ? `campaignai:library-brand-filter:${currentUserId}` : null;
  const hasRestoredPrefs = React.useRef(false);

  React.useEffect(() => {
    if (hasRestoredPrefs.current) return;
    hasRestoredPrefs.current = true;
    if (brandFilterKey) {
      const stored = localStorage.getItem(brandFilterKey);
      if (stored) {
        try {
          const ids: string[] = JSON.parse(stored);
          // Restore via the actual resolved brand-id list (not the "group_X"/"custom_multi"
          // sentinel string) — the sentinel is only decoded by toggleMultiBrand/selectGroupBrands
          // themselves, not by the generic selectedBrandId-prop sync effect above.
          if (Array.isArray(ids) && ids.length > 0) {
            setSelectedMultiBrandIds(ids);
            onSelectBrandId(ids.length === 1 ? ids[0] : "custom_multi");
          }
        } catch {
          // Corrupt/old value — ignore, default filter stays "all".
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!brandFilterKey || !hasRestoredPrefs.current) return;
    localStorage.setItem(brandFilterKey, JSON.stringify(selectedMultiBrandIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMultiBrandIds, brandFilterKey]);

  const toggleMultiBrand = (brandId: string) => {
    if (selectedMultiBrandIds.includes(brandId)) {
      const next = selectedMultiBrandIds.filter((id) => id !== brandId);
      setSelectedMultiBrandIds(next);
      if (next.length === 0) onSelectBrandId("all");
    } else {
      const next = [...selectedMultiBrandIds, brandId];
      setSelectedMultiBrandIds(next);
      onSelectBrandId(next.length === 1 ? next[0] : "custom_multi");
    }
  };

  const selectGroupBrands = (group: "ALL" | "WDF" | "WLM" | "WAW") => {
    if (group === "ALL") {
      setSelectedMultiBrandIds([]);
      onSelectBrandId("all");
    } else {
      const matched = brands.filter((b) => (b.categoryGroup || "WDF") === group).map((b) => b.id);
      setSelectedMultiBrandIds(matched);
      onSelectBrandId("group_" + group);
    }
  };

  // Flatten all posts
  const allPosts: Post[] = brandsData.flatMap((b) => b.posts || []);

  // Compute available days
  const availableDays = Array.from(new Set(allPosts.map((p) => p.dayNumber))).sort((a, b) => a - b);

  // Filter posts
  const filteredPosts = allPosts.filter((post) => {
    if (selectedMultiBrandIds.length > 0 && !selectedMultiBrandIds.includes(post.brandId)) return false;
    if (selectedDay !== "all" && post.dayNumber !== selectedDay) return false;
    if (selectedSlotIndex !== "all" && post.slotIndex !== selectedSlotIndex) return false;
    if (selectedPlatform !== "all" && post.platform !== selectedPlatform) return false;
    if (selectedStatus !== "all" && post.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${post.title} ${post.hook} ${post.caption} ${post.brandName} ${post.promoCodeUsed}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  // Campaign-wide total (used only in the "Generated X messages..." summary sentence — always
  // describes the whole campaign, regardless of the filters below).
  const campaignTotalCount = allPosts.length;

  // Quick stats reflect the CURRENTLY FILTERED view — previously these always showed the whole
  // campaign's totals even while a brand/day/platform filter was active, which made filtering
  // look broken (the numbers never moved).
  const totalCount = filteredPosts.length;
  const approvedCount = filteredPosts.filter((p) => p.status === "approved").length;
  const pendingReviewCount = filteredPosts.filter((p) => p.status === "pending_review").length;
  const draftCount = filteredPosts.filter((p) => p.status === "draft").length;

  const duplicateGroups = React.useMemo(() => findDuplicateHooks(allPosts), [allPosts]);
  const slotConflicts = React.useMemo(() => findSlotConflicts(allPosts), [allPosts]);

  const getBrandColor = (bId: string) => {
    const found = brands.find((b) => b.id === bId);
    return found?.brandColor || "#6366f1";
  };

  const handleRegenerateFallback = async () => {
    if (!onRegenerateFallback) return;
    setIsRegenerating(true);
    try {
      await onRegenerateFallback();
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRunLanguageQA = async () => {
    setIsRunningQA(true);
    setQaError(null);
    try {
      const response = await fetch("/api/campaign/qa-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: allPosts, language: campaignLanguage }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to run language QA check.");
      }
      const data = await response.json();
      setQaResults(data.issues || []);
      setQaMeta({ checkedCount: data.checkedCount, truncated: data.truncated });
    } catch (err: any) {
      setQaError(err.message || "Failed to run language QA check.");
    } finally {
      setIsRunningQA(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !onSaveAsTemplate) return;
    setIsSavingTemplate(true);
    try {
      await onSaveAsTemplate(templateName.trim());
      setTemplateName("");
      setShowTemplateInput(false);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <div id="content-matrix-container" className="space-y-6">
      {/* Top Banner & Stats Overview */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 text-slate-100 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-slate-800 text-amber-400 font-mono text-xs font-bold px-2.5 py-1 rounded-md border border-slate-700">
                ACTIVE CAMPAIGN HUB
              </span>

              {(!promoCode || promoCode === "NO PROMO CODE" || promoCode === "ORGANIC" || promoCode.includes("ORGANIC")) ? (
                <span className="bg-emerald-950/80 text-emerald-400 font-mono text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-800/80 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> 🌿 Organic Campaign (No Code)
                </span>
              ) : (
                <span className="bg-emerald-950/80 text-emerald-400 font-mono text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-800/80 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" /> Code: {promoCode}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-white">{campaignTitle}</h2>
              {totalCount > 0 && (
                <Tooltip text="Ask AI to review this campaign's copy for language/translation quality issues">
                  <button
                    type="button"
                    onClick={handleRunLanguageQA}
                    disabled={isRunningQA}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 rounded-lg text-xs font-bold border border-slate-800 hover:border-indigo-800 flex items-center gap-1 transition-colors shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isRunningQA ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isRunningQA ? "Checking..." : "Run Language QA"}</span>
                  </button>
                </Tooltip>
              )}
              {canWrite && onSaveAsTemplate && !showTemplateInput && (
                <Tooltip text="Save this campaign's settings (type, duration, platforms, guidelines) as a reusable template">
                  <button
                    type="button"
                    onClick={() => setShowTemplateInput(true)}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-emerald-950 text-emerald-300 hover:text-emerald-200 rounded-lg text-xs font-bold border border-slate-800 hover:border-emerald-800 flex items-center gap-1 transition-colors shrink-0 shadow-xs cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Save as Template</span>
                  </button>
                </Tooltip>
              )}
              {showTemplateInput && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && templateName.trim()) handleSaveTemplate();
                      if (e.key === "Escape") setShowTemplateInput(false);
                    }}
                    placeholder="Template name..."
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 w-40"
                  />
                  <button
                    type="button"
                    disabled={!templateName.trim() || isSavingTemplate}
                    onClick={handleSaveTemplate}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-40 cursor-pointer"
                  >
                    {isSavingTemplate ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTemplateInput(false)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {onDeleteCampaign && activeCampaignId && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCampaign(true)}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-rose-950 text-rose-400 hover:text-rose-300 rounded-lg text-xs font-bold border border-slate-800 hover:border-rose-800 flex items-center gap-1 transition-colors shrink-0 shadow-xs cursor-pointer"
                  title="Delete this campaign permanently"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Campaign</span>
                </button>
              )}
            </div>

            {(qaResults || qaError) && (
              <div className="mt-3 bg-slate-950/80 border border-indigo-900/60 rounded-xl p-3 space-y-2 max-w-2xl">
                {qaError ? (
                  <p className="text-xs text-rose-300">{qaError}</p>
                ) : qaResults!.length === 0 ? (
                  <p className="text-xs text-emerald-300">
                    ✓ No language quality issues found in the {qaMeta?.checkedCount ?? 0} messages checked.
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-indigo-300">
                      {qaResults!.length} potential issue{qaResults!.length > 1 ? "s" : ""} found
                      {qaMeta?.truncated ? ` (checked first ${qaMeta.checkedCount} messages)` : ""}:
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {qaResults!.map((issue, idx) => {
                        const p = allPosts.find((x) => x.id === issue.id);
                        return (
                          <div key={idx} className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-lg p-2">
                            {p && <span className="font-bold text-white">{p.brandName}: </span>}
                            {p && <span className="italic">"{p.hook}"</span>}
                            <p className="text-indigo-300 mt-0.5">{issue.issue}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setQaResults(null);
                    setQaError(null);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Dismiss
                </button>
              </div>
            )}

            {isFallback && (
              <div className="mt-3 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2 text-xs text-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300">Template Fallback — not real AI content</p>
                    <p className="text-amber-200/90 mt-0.5">
                      AI generation failed{fallbackReason ? ` (${fallbackReason})` : ""} — these posts are generic placeholder copy. Review carefully before sending, or regenerate.
                    </p>
                  </div>
                </div>
                {onRegenerateFallback && (
                  <button
                    type="button"
                    onClick={handleRegenerateFallback}
                    disabled={isRegenerating}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isRegenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isRegenerating ? "Regenerating..." : "Regenerate with AI"}</span>
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-1">
              Generated <span className="text-amber-400 font-bold">{campaignTotalCount} messages</span> across{" "}
              <span className="text-white font-bold">{brandsData.length} brands</span> with 6 daily frequency slots.
            </p>
          </div>

          {/* Quick Metrics — reflect the active filters below, not the whole campaign */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center min-w-[90px] shadow-inner">
              <span className="text-xs text-slate-400 font-medium block">{totalCount !== campaignTotalCount ? "Filtered Posts" : "Total Posts"}</span>
              <span className="text-lg font-bold text-white">{totalCount}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center min-w-[90px] shadow-inner">
              <span className="text-xs text-emerald-400 font-medium block">Approved</span>
              <span className="text-lg font-bold text-emerald-400">{approvedCount}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center min-w-[90px] shadow-inner">
              <span className="text-xs text-amber-400 font-medium block">Pending Review</span>
              <span className="text-lg font-bold text-amber-400">{pendingReviewCount}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center min-w-[90px] shadow-inner">
              <span className="text-xs text-slate-400 font-medium block">In Draft</span>
              <span className="text-lg font-bold text-slate-300">{draftCount}</span>
            </div>
          </div>
        </div>

        {/* Direct, always-visible brand filter — one click per brand, no dropdown */}
        <div className="pt-2">
          <BrandChipFilter
            brands={brands}
            selectedIds={selectedMultiBrandIds}
            onToggle={toggleMultiBrand}
            onSelectGroup={selectGroupBrands}
          />
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
              {filteredPosts.length > 0 && canWrite && onDeletePost && (
                <button
                  type="button"
                  onClick={() => setConfirmBulkDeleteCount(filteredPosts.length)}
                  className="text-[11px] font-bold text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  title="Delete all currently visible/filtered posts"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete {filteredPosts.length} Post(s)</span>
                </button>
              )}

              {filteredPosts.some((p) => p.status !== "approved") && isAdmin && onBulkApprove && (
                <button
                  type="button"
                  onClick={() => {
                    const ids = filteredPosts.filter((p) => p.status !== "approved").map((p) => p.id);
                    onBulkApprove(ids);
                  }}
                  className="text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  title="Approve all currently visible/filtered posts"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Approve {filteredPosts.filter((p) => p.status !== "approved").length} Post(s)</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search captions, hooks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/80"
              />
            </div>

            {/* Day Filter Pills */}
            <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800">
              <button
                onClick={() => setSelectedDay("all")}
                className={`px-2 py-0.5 text-xs font-medium rounded cursor-pointer ${
                  selectedDay === "all" ? "bg-amber-500 text-slate-950 font-extrabold" : "text-slate-400 hover:text-white"
                }`}
              >
                All Days
              </button>
              {availableDays.map((d) => {
                const samplePost = allPosts.find((p) => p.dayNumber === d);
                const dateLabel = samplePost?.scheduledDate ? samplePost.scheduledDate : `Day ${d}`;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`px-2 py-0.5 text-xs font-medium rounded cursor-pointer ${
                      selectedDay === d ? "bg-amber-500 text-slate-950 font-extrabold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {dateLabel}
                  </button>
                );
              })}
            </div>

            {/* Slot Filter */}
            <select
              value={selectedSlotIndex}
              onChange={(e) => setSelectedSlotIndex(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/80 cursor-pointer"
            >
              <option value="all">All Time Slots</option>
              <option value={1}>Slot 1 (Morning)</option>
              <option value={2}>Slot 2 (Mid-Morning)</option>
              <option value={3}>Slot 3 (Afternoon)</option>
              <option value={4}>Slot 4 (Late Afternoon)</option>
              <option value={5}>Slot 5 (Evening)</option>
              <option value={6}>Slot 6 (Night)</option>
              <option value={7}>Slot 7 (Late Night)</option>
              <option value={8}>Slot 8 (Midnight)</option>
            </select>

            {/* Platform Filter */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/80 cursor-pointer"
            >
              <option value="all">All Platforms (SMS &amp; Web Push)</option>
              <option value="SMS">📱 SMS Messages</option>
              <option value="Web Push">🔔 Web Push Notifications</option>
            </select>
          </div>
        </div>

      {/* Cross-Brand Duplicate Hook Warning */}
      {duplicateGroups.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDuplicatesPanel(!showDuplicatesPanel)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Copy className="w-4 h-4" />
              <span>
                {duplicateGroups.length} potential duplicate hook{duplicateGroups.length > 1 ? "s" : ""} found across brands
              </span>
            </span>
            <span className="text-[10px] text-amber-400 font-mono">{showDuplicatesPanel ? "Hide" : "Show"}</span>
          </button>
          {showDuplicatesPanel && (
            <div className="px-4 pb-4 space-y-3">
              {duplicateGroups.map((group, idx) => (
                <div key={idx} className="bg-slate-950/60 border border-amber-900/50 rounded-xl p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-amber-500">
                    ~{Math.round(group.similarity * 100)}% similar wording across {group.posts.length} brands
                  </div>
                  {group.posts.map((p) => (
                    <div key={p.id} className="text-xs text-slate-300 flex items-start gap-2">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                        style={{ backgroundColor: getBrandColor(p.brandId), color: "#0f172a" }}
                      >
                        {p.brandName}
                      </span>
                      <span className="italic">"{p.hook}"</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Same-Slot Cross-Brand Conflict Warning */}
      {slotConflicts.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowConflictsPanel(!showConflictsPanel)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4" />
              <span>
                {slotConflicts.length} scheduling conflict{slotConflicts.length > 1 ? "s" : ""} — multiple brands sending at the exact same time
              </span>
            </span>
            <span className="text-[10px] text-rose-400 font-mono">{showConflictsPanel ? "Hide" : "Show"}</span>
          </button>
          {showConflictsPanel && (
            <div className="px-4 pb-4 space-y-3">
              {slotConflicts.map((group) => (
                <div key={group.key} className="bg-slate-950/60 border border-rose-900/50 rounded-xl p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-rose-400">
                    {group.dateLabel} • {group.timeSlot} • {group.platform}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.posts.map((p) => (
                      <span
                        key={p.id}
                        className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: getBrandColor(p.brandId), color: "#0f172a" }}
                      >
                        {p.brandName}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Display Section */}
      {allPosts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <Layers className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Campaigns or Messages in System</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            All campaigns have been removed. You can generate a brand-new multi-brand campaign or reload sample demo data anytime.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onOpenNewCampaign && (
              <button
                type="button"
                onClick={onOpenNewCampaign}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>+ Generate New Campaign</span>
              </button>
            )}
            {onLoadSampleData && (
              <button
                type="button"
                onClick={onLoadSampleData}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Reload Sample Demo Data</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Posts Match Selected Filters</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try adjusting your brand, day, time slot, or platform filters above to display posts.
          </p>
        </div>
      ) : (
        /* Matrix View: Organized by Day and Slot Index 1 to 6 */
        <div className="space-y-8">
          {availableDays
            .filter((day) => selectedDay === "all" || selectedDay === day)
            .map((dayNum) => {
              const dayPosts = filteredPosts.filter((p) => p.dayNumber === dayNum);
              if (dayPosts.length === 0) return null;

              return (
                <div key={dayNum} className="space-y-4">
                  {/* Day Divider Header */}
                  <div className="flex items-center gap-3 bg-slate-900/90 border-y border-slate-800 py-3 px-4 rounded-xl sticky top-16 z-20 backdrop-blur-md">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">
                      CAMPAIGN DAY {dayNum} CONTENT MATRIX
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      ({dayPosts.length} posts scheduled for Day {dayNum})
                    </span>
                  </div>

                  {/* 6 Time Slots Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        brandColor={getBrandColor(post.brandId)}
                        onUpdatePost={onUpdatePost}
                        onRefinePostWithAI={onRefinePostWithAI}
                        onDeletePost={onDeletePost}
                        currentUserRole={currentUserRole}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDeleteCampaign}
        title="Delete this campaign?"
        message={`"${campaignTitle}" and all of its posts will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete Campaign"
        onCancel={() => setConfirmDeleteCampaign(false)}
        onConfirm={() => {
          if (activeCampaignId) onDeleteCampaign?.(activeCampaignId);
          setConfirmDeleteCampaign(false);
        }}
      />

      <ConfirmDialog
        isOpen={confirmBulkDeleteCount !== null}
        title="Delete filtered posts?"
        message={`${confirmBulkDeleteCount ?? 0} post(s) matching your current filters will be permanently removed.`}
        confirmLabel={`Delete ${confirmBulkDeleteCount ?? 0} Post(s)`}
        onCancel={() => setConfirmBulkDeleteCount(null)}
        onConfirm={() => {
          filteredPosts.forEach((p) => onDeletePost?.(p.id));
          setConfirmBulkDeleteCount(null);
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmDeletePostId}
        title="Delete this post?"
        message="This message will be permanently removed."
        confirmLabel="Delete Post"
        onCancel={() => setConfirmDeletePostId(null)}
        onConfirm={() => {
          if (confirmDeletePostId) onDeletePost?.(confirmDeletePostId);
          setConfirmDeletePostId(null);
        }}
      />
    </div>
  );
};

