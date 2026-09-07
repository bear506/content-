import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Tag, Copy, Check, Search, Plus, Calendar, Bookmark, Sparkles, Trash2, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { Brand, PromoCodeRecord } from "../types";
import { promoCodesApi, aiApi, PromoCodeSuggestion } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiscountAmountPicker, DiscountType, formatDiscountAmount } from "./DiscountAmountPicker";

function isCodeActive(rec: PromoCodeRecord): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return !rec.validUntil || rec.validUntil >= today;
}

interface PromoCodeTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  promoLibrary: PromoCodeRecord[];
  onAddPromoRecord: (record: PromoCodeRecord) => void;
  onDeletePromoRecord: (id: string) => void;
  activeCampaignCode?: string;
  activeDiscountDetails?: string;
  activeCampaignTitle?: string;
  activeMonthYear?: string;
  /** Render as an inline page section (no backdrop/overlay) instead of a floating modal. */
  embedded?: boolean;
  /** Hide all create/delete controls (viewer role). */
  readOnly?: boolean;
}

export const PromoCodeTracker: React.FC<PromoCodeTrackerProps> = ({
  isOpen,
  onClose,
  brands,
  promoLibrary,
  onAddPromoRecord,
  onDeletePromoRecord,
  activeCampaignCode,
  activeDiscountDetails,
  activeCampaignTitle,
  activeMonthYear,
  embedded = false,
  readOnly = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingRedemptionId, setEditingRedemptionId] = useState<string | null>(null);
  const [redemptionInput, setRedemptionInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PromoCodeRecord | null>(null);

  const queryClient = useQueryClient();
  const updateRedemptionMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => promoCodesApi.updateRedemptionCount(id, count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promoCodes"] }),
  });

  const handleStartEditRedemption = (rec: PromoCodeRecord) => {
    setEditingRedemptionId(rec.id);
    setRedemptionInput(String(rec.redemptionCount || 0));
  };

  const handleSaveRedemption = (id: string) => {
    const count = parseInt(redemptionInput, 10);
    if (!isNaN(count) && count >= 0) {
      updateRedemptionMutation.mutate({ id, count });
    }
    setEditingRedemptionId(null);
  };

  // Form state for adding new code
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignType, setNewCampaignType] = useState<"payday" | "first_week" | "reloan" | "custom">("custom");
  const [newStartDate, setNewStartDate] = useState("2026-08-25");
  const [newMonthYear, setNewMonthYear] = useState("August 2026");
  const [newValidUntil, setNewValidUntil] = useState("");
  const [newDiscountType, setNewDiscountType] = useState<DiscountType>("percentage");
  const [newDiscountValue, setNewDiscountValue] = useState(30);
  const [newDiscountCustomText, setNewDiscountCustomText] = useState("");
  // One brand per code — enforced server-side too (a brand can't have two active codes at once).
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<PromoCodeSuggestion[]>([]);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);
  const [aiGenerateError, setAiGenerateError] = useState<string | null>(null);

  if (!isOpen && !embedded) return null;

  const handleDateChange = (val: string) => {
    setNewStartDate(val);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        setNewMonthYear(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
      }
    }
  };

  const resetForm = () => {
    setNewCode("");
    setNewCampaignTitle("");
    setNewValidUntil("");
    setNewDiscountType("percentage");
    setNewDiscountValue(30);
    setNewDiscountCustomText("");
    setSelectedBrandId("");
    setFormError(null);
    setAiSuggestions([]);
    setAiGenerateError(null);
  };

  const selectedBrand = brands.find((b) => b.id === selectedBrandId);
  const discountDetailsPreview =
    newDiscountType === "custom" ? newDiscountCustomText : formatDiscountAmount(newDiscountType, newDiscountValue);

  const handleGenerateWithAI = async () => {
    if (!selectedBrand) {
      setFormError("Pick a brand first so the AI knows who this code is for.");
      return;
    }
    setIsGeneratingCodes(true);
    setAiGenerateError(null);
    setAiSuggestions([]);
    try {
      const inUseCodes = promoLibrary.map((r) => r.code);
      const { suggestions } = await aiApi.generatePromoCodes({
        campaignType: newCampaignType,
        campaignTitle: newCampaignTitle || `${selectedBrand.name} Promo`,
        monthYear: newMonthYear,
        brandShortCodes: [selectedBrand.shortCode || selectedBrand.name],
        discountDetails: discountDetailsPreview || "Special Discount",
        avoidCodes: inUseCodes,
      });
      setAiSuggestions(suggestions);
    } catch (err: any) {
      setAiGenerateError(err.message || "Failed to generate promo code suggestions.");
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredLibrary = promoLibrary.filter((rec) => {
    const matchesSearch =
      rec.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.campaignTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.monthYear.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.brandShortCodes.some((sc) => sc.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === "all" || rec.campaignType === filterType;
    return matchesSearch && matchesType;
  });

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newCode.trim()) return;
    if (!selectedBrand) {
      setFormError("Select which brand this code belongs to.");
      return;
    }
    if (promoLibrary.some((r) => r.code.toUpperCase() === newCode.trim().toUpperCase())) {
      setFormError(`"${newCode.trim().toUpperCase()}" is already in use — codes must be unique.`);
      return;
    }
    const activeExisting = promoLibrary.find((r) => r.brandIds.includes(selectedBrand.id) && isCodeActive(r));
    if (activeExisting) {
      setFormError(`${selectedBrand.name} already has an active code ("${activeExisting.code}"). Delete it or let it expire first.`);
      return;
    }

    const record: PromoCodeRecord = {
      id: `promo-${Date.now()}`,
      code: newCode.trim().toUpperCase(),
      campaignTitle: newCampaignTitle || `${selectedBrand.name} Promo`,
      campaignType: newCampaignType,
      monthYear: newMonthYear,
      startDate: newStartDate,
      brandIds: [selectedBrand.id],
      brandShortCodes: [selectedBrand.shortCode || selectedBrand.name],
      discountDetails: discountDetailsPreview || "Special Discount",
      discountType: newDiscountType,
      discountValue: newDiscountType === "custom" ? undefined : newDiscountValue,
      validFrom: newStartDate,
      validUntil: newValidUntil,
      createdAt: new Date().toISOString(),
    };

    onAddPromoRecord(record);
    setIsAddingNew(false);
    resetForm();
  };

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
        id="promo-tracker-dialog"
        onClick={embedded ? undefined : (e) => e.stopPropagation()}
        className={
          embedded
            ? "bg-slate-900 border border-slate-800 rounded-2xl w-full text-slate-100 shadow-xl overflow-hidden"
            : "bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl text-slate-100 shadow-2xl overflow-hidden my-6 cursor-default"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Promo Code Library &amp; Campaign History
              </h2>
              <p className="text-xs text-slate-400">
                Track and audit custom promo codes across all 16 brands by campaign name, month, and discount structure
              </p>
            </div>
          </div>
          {!embedded && (
            <button
              id="close-promo-tracker-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-slate-950/40">
          {/* Active Campaign Banner */}
          {activeCampaignCode && (
            <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5 rounded uppercase">
                    Currently Selected Campaign Code
                  </span>
                  {activeMonthYear && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {activeMonthYear}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-mono font-black text-amber-400 tracking-wider">{activeCampaignCode}</span>
                </div>
                {activeCampaignTitle && (
                  <p className="text-xs text-slate-200 font-semibold">{activeCampaignTitle}</p>
                )}
                {activeDiscountDetails && (
                  <p className="text-xs text-slate-400">{activeDiscountDetails}</p>
                )}
              </div>

              <button
                onClick={() => handleCopy(activeCampaignCode)}
                className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl shadow-xs flex items-center gap-1.5 shrink-0"
              >
                {copiedCode === activeCampaignCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode === activeCampaignCode ? "Copied!" : "Copy Active Code"}</span>
              </button>
            </div>
          )}

          {/* Library Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-2xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search promo code, campaign, or brand..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Campaign Types</option>
                <option value="payday">Payday Sale</option>
                <option value="first_week">First Week Collection</option>
                <option value="reloan">Reloan Aggressive</option>
                <option value="custom">Custom / Festive</option>
              </select>

              {!readOnly && (
                <button
                  onClick={() => setIsAddingNew(!isAddingNew)}
                  className="px-3 py-2 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Code</span>
                </button>
              )}
            </div>
          </div>

          {/* Add New Code Form */}
          {isAddingNew && (
            <form onSubmit={handleCreateRecord} className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl space-y-3 shadow-xs">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-slate-300" />
                Register New Promo Code to Library
              </h4>
              <p className="text-[11px] text-slate-500 -mt-2">
                One active code per brand — you'll be blocked from saving if the brand you pick already has one.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-300 mb-1">Brand *</label>
                  <select
                    required
                    value={selectedBrandId}
                    onChange={(e) => setSelectedBrandId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select a brand...</option>
                    {brands.map((b) => {
                      const activeCode = promoLibrary.find((r) => r.brandIds.includes(b.id) && isCodeActive(r));
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name} {activeCode ? `— has active code (${activeCode.code})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-300 mb-1">Campaign Type</label>
                  <select
                    value={newCampaignType}
                    onChange={(e) => setNewCampaignType(e.target.value as "payday" | "first_week" | "reloan" | "custom")}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="payday">Payday Sale</option>
                    <option value="first_week">First Week Collection</option>
                    <option value="reloan">Reloan Aggressive</option>
                    <option value="custom">Custom / Festive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-300 mb-1">Promo Code *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="e.g. SEP2026SPECIAL"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateWithAI}
                    disabled={isGeneratingCodes}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-950 hover:bg-slate-800 text-amber-400 border border-amber-500/30 rounded-lg flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {isGeneratingCodes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Generate with AI</span>
                  </button>
                </div>

                {aiGenerateError && (
                  <p className="text-[11px] text-rose-300 mt-1.5">{aiGenerateError}</p>
                )}

                {aiSuggestions.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {aiSuggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setNewCode(sug.code);
                          setAiSuggestions([]);
                        }}
                        className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/60 rounded-lg text-left transition-colors"
                      >
                        <span className="font-mono font-bold text-xs text-emerald-400 block">{sug.code}</span>
                        <span className="text-[10px] text-slate-400">{sug.tagline}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-300 mb-1">Valid From</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      required
                      value={newStartDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] font-semibold text-slate-200 bg-slate-800 border border-slate-700 px-2 py-1 rounded shrink-0">
                      {newMonthYear}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-300 mb-1">Valid Until (leave blank = no expiry)</label>
                  <input
                    type="date"
                    value={newValidUntil}
                    min={newStartDate}
                    onChange={(e) => setNewValidUntil(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-300 mb-1">Campaign Title</label>
                <input
                  type="text"
                  value={newCampaignTitle}
                  onChange={(e) => setNewCampaignTitle(e.target.value)}
                  placeholder="e.g. September Payday Sale"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-300 mb-1">Discount Amount</label>
                <DiscountAmountPicker
                  type={newDiscountType}
                  value={newDiscountValue}
                  customText={newDiscountCustomText}
                  onChangeType={setNewDiscountType}
                  onChangeValue={setNewDiscountValue}
                  onChangeCustomText={setNewDiscountCustomText}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    resetForm();
                  }}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs"
                >
                  Save Code to Library
                </button>
              </div>
            </form>
          )}

          {/* Promo Library History Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Promo Code History Log ({filteredLibrary.length} Codes)
              </span>
              <span className="text-[11px] text-slate-400">
                Click copy button to use in any campaign
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-950/60 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Promo Code</th>
                    <th className="px-4 py-3">Campaign &amp; Month</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Discount Details</th>
                    <th className="px-4 py-3">Validity</th>
                    <th className="px-4 py-3">Redemptions</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredLibrary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                        No promo codes found matching your query.
                      </td>
                    </tr>
                  ) : (
                    filteredLibrary.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-amber-400">
                          <span className="bg-slate-950 border border-slate-700 px-2 py-1 rounded">
                            {rec.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-white block">{rec.campaignTitle}</span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {rec.monthYear} {rec.startDate ? `(${rec.startDate})` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {rec.brandShortCodes.map((sc, i) => (
                              <span
                                key={i}
                                className="text-[9px] font-mono font-bold bg-slate-950 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded"
                              >
                                {sc}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-[11px]">
                          {rec.discountDetails}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              isCodeActive(rec)
                                ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {isCodeActive(rec) ? "Active" : "Expired"}
                          </span>
                          {rec.validUntil && (
                            <span className="text-[10px] text-slate-500 block mt-1">until {rec.validUntil}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingRedemptionId === rec.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                value={redemptionInput}
                                onChange={(e) => setRedemptionInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRedemption(rec.id);
                                  if (e.key === "Escape") setEditingRedemptionId(null);
                                }}
                                onBlur={() => handleSaveRedemption(rec.id)}
                                className="w-16 bg-slate-950 border border-slate-600 rounded px-1.5 py-1 text-xs font-bold text-white"
                              />
                            </div>
                          ) : !readOnly ? (
                            <button
                              onClick={() => handleStartEditRedemption(rec)}
                              className="flex items-center gap-1 text-xs font-bold text-slate-200 hover:text-emerald-300 hover:bg-emerald-950/40 px-1.5 py-1 rounded"
                              title="Click to update redemption count"
                            >
                              <TrendingUp className="w-3 h-3 text-emerald-400" />
                              {rec.redemptionCount || 0}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-slate-200 px-1.5 py-1">
                              <TrendingUp className="w-3 h-3 text-emerald-400" />
                              {rec.redemptionCount || 0}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopy(rec.code)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-slate-700"
                              title="Copy Promo Code"
                            >
                              {copiedCode === rec.code ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedCode === rec.code ? "Copied" : "Copy"}</span>
                            </button>
                            {!readOnly && (
                            <button
                              onClick={() => setDeleteTarget(rec)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        {!embedded && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            id="close-promo-tracker-footer-btn"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl shadow-xs transition-all"
          >
            Back to Home Page
          </button>
        </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete this promo code record?"
        message={deleteTarget ? `"${deleteTarget.code}" (${deleteTarget.campaignTitle}) will be permanently removed from the library.` : ""}
        confirmLabel="Delete Record"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeletePromoRecord(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
