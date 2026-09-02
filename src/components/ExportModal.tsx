import React, { useMemo, useState } from "react";
import { X, Download, Copy, Check, FileSpreadsheet, Table, FileCode } from "lucide-react";
import { Brand, CampaignResult } from "../types";
import { toCsv, downloadCsv } from "../lib/csv";
import { BrandFilterSelect } from "./BrandFilterSelect";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  campaigns: CampaignResult[];
  /** Pre-selects this campaign when the modal opens (e.g. the one currently open in the library). */
  defaultCampaignId?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  brands,
  campaigns,
  defaultCampaignId,
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(defaultCampaignId || "all");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<string>("all");
  const [onlyApproved, setOnlyApproved] = useState<boolean>(false);
  const [copiedTSV, setCopiedTSV] = useState(false);

  // Re-sync to the caller's default campaign each time the modal re-opens (e.g. via export button
  // on a different campaign) instead of sticking on whatever was picked last time it was open.
  React.useEffect(() => {
    if (isOpen) setSelectedCampaignId(defaultCampaignId || "all");
  }, [isOpen, defaultCampaignId]);

  const posts = useMemo(() => {
    const scoped = selectedCampaignId === "all"
      ? campaigns
      : campaigns.filter((c) => c.id === selectedCampaignId);
    return scoped.flatMap((c) => c.brandsData.flatMap((bd) => bd.posts || []));
  }, [campaigns, selectedCampaignId]);

  if (!isOpen) return null;

  const filteredPosts = posts.filter((post) => {
    if (selectedBrandId !== "all" && post.brandId !== selectedBrandId) return false;
    if (selectedPlatformFilter !== "all" && post.platform !== selectedPlatformFilter) return false;
    if (onlyApproved && post.status !== "approved") return false;
    return true;
  });

  // Dedicated Export formatted specifically for SMS Bulk System Gateway Import (Exact 7 Columns)
  const handleExportSMSBulkGatewayExcel = () => {
    // Filter strictly to SMS platform posts only
    const smsOnlyPosts = filteredPosts.filter((p) => (p.platform || "").toLowerCase().includes("sms"));

    // Exact 7 headers as specified for Bulk Import file
    const headers = [
      "Title",
      "Description",
      "Platform",
      "Channel",
      "Content(EN)",
      "Content(ZH)",
      "Content(MS)",
    ];

    const rows = smsOnlyPosts.map((p) => {
      // Create a unique title for every content item (e.g. "Vendox Day 1 - Msg 1")
      const uniqueTitle = `${p.brandName || "Brand"} Day ${p.dayNumber} - Msg ${p.slotIndex + 1} (${p.timeSlot || "Slot"})`;
      return [uniqueTitle, "", "", "Sms", p.caption || "", "", ""];
    });

    downloadCsv(
      `SMS_Bulk_Import_${selectedBrandId !== "all" ? selectedBrandId : "Campaign"}_${Date.now()}.csv`,
      toCsv(headers, rows)
    );
  };

  // Export to Standard Excel CSV File
  const handleExportExcelCSV = () => {
    const headers = [
      "Brand Name",
      "Day Number",
      "Slot Index",
      "Time Slot",
      "Platform",
      "Format",
      "Content Title",
      "Hook Headline",
      "Caption / Message",
      "Promo Code Used",
      "CTA Link / Action",
      "Hashtags",
      "Visual Prompt",
      "Status",
    ];

    const rows = filteredPosts.map((p) => [
      p.brandName || "",
      String(p.dayNumber ?? ""),
      String(p.slotIndex ?? ""),
      p.timeSlot || "",
      p.platform || "",
      p.format || "",
      p.title || "",
      p.hook || "",
      p.caption || "",
      p.promoCodeUsed || "",
      p.cta || "",
      (p.hashtags || []).join(" "),
      p.visualPrompt || "",
      p.status || "",
    ]);

    downloadCsv(`Full_Campaign_Export_${Date.now()}.csv`, toCsv(headers, rows));
  };

  // Copy as TSV (Tab Separated Values) for instant Paste into Excel / Google Sheets
  const handleCopyTSVForExcel = () => {
    const headers = ["Brand", "Day", "Slot", "Time", "Platform", "Title", "Hook", "Content(EN)", "Promo Code", "CTA", "Status"];
    const rows = filteredPosts.map((p) => [
      p.brandName,
      `Day ${p.dayNumber}`,
      `Slot ${p.slotIndex}`,
      p.timeSlot,
      p.platform,
      p.title,
      (p.hook || "").replace(/\n/g, " "),
      (p.caption || "").replace(/\n/g, " "),
      p.promoCodeUsed,
      p.cta,
      p.status,
    ]);

    const tsvContent = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsvContent);
    setCopiedTSV(true);
    setTimeout(() => setCopiedTSV(false), 2500);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
    >
      <div
        id="export-content-dialog"
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl text-slate-100 shadow-2xl overflow-hidden my-6 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Export to Excel / SMS Bulk Gateway</h2>
              <p className="text-xs text-slate-400">
                Download campaign data formatted specifically for Excel or SMS gateway bulk imports
              </p>
            </div>
          </div>
          <button
            id="close-export-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 bg-slate-950/40">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-2xs">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Filter Campaign</label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Campaigns (mixed)</option>
                {[...campaigns]
                  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.config.title} — {c.config.monthYear}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Filter Brand</label>
              <BrandFilterSelect brands={brands} value={selectedBrandId} onChange={setSelectedBrandId} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Platform Filter</label>
              <select
                value={selectedPlatformFilter}
                onChange={(e) => setSelectedPlatformFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Platforms</option>
                <option value="SMS">📱 SMS Messages Only</option>
                <option value="Web Push">🔔 Web Push Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Approval Status</label>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="only-approved-checkbox"
                  checked={onlyApproved}
                  onChange={(e) => setOnlyApproved(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="only-approved-checkbox" className="text-xs text-slate-300 font-medium">
                  Approved Posts Only
                </label>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-center text-xs text-slate-400 shadow-2xs">
            Selected for Export: <span className="text-white font-bold">{filteredPosts.length} post(s)</span>
          </div>

          {/* Excel Export Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SMS Gateway Bulk Import Format */}
            <button
              onClick={handleExportSMSBulkGatewayExcel}
              className="sm:col-span-2 p-5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group shadow-xs"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-white group-hover:scale-105 transition-transform" />
                  <span className="text-sm font-bold text-white">SMS Gateway Bulk Import Excel (.csv)</span>
                </div>
                <span className="text-[10px] font-bold uppercase bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded shadow-2xs">
                  SMS Bulk Format
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Exports strictly <strong className="text-slate-300">SMS messages only</strong> matching your exact bulk import structure (<code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Title</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Description</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Platform</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Channel</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Content(EN)</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Content(ZH)</code>, <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">Content(MS)</code>).
              </p>
            </button>

            {/* Primary Standard Excel Download */}
            <button
              onClick={handleExportExcelCSV}
              className="p-5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group shadow-xs"
            >
              <div className="flex items-center justify-between mb-3">
                <FileSpreadsheet className="w-6 h-6 text-slate-200 group-hover:scale-105 transition-transform" />
                <span className="text-[10px] font-bold uppercase bg-slate-800 text-slate-200 px-2 py-0.5 rounded">
                  Full Report
                </span>
              </div>
              <h4 className="text-sm font-bold text-white">Full Standard Campaign CSV</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Includes all detailed fields: Brand, Day, Time, Platform, Caption, Code &amp; Status.
              </p>
            </button>

            {/* Instant Excel Paste Button */}
            <button
              onClick={handleCopyTSVForExcel}
              className="p-5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group shadow-xs"
            >
              <div className="flex items-center justify-between mb-3">
                <Table className="w-6 h-6 text-slate-200 group-hover:scale-105 transition-transform" />
                {copiedTSV && (
                  <span className="text-[10px] font-bold uppercase bg-emerald-500 text-slate-950 px-2 py-0.5 rounded flex items-center gap-1">
                    <Check className="w-3 h-3" /> Copied!
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-white">
                {copiedTSV ? "Copied to Clipboard!" : "Copy Table for Excel Paste"}
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Copies tab-separated data for direct <kbd className="px-1 py-0.5 bg-slate-950 rounded font-mono text-[10px] text-slate-300">Ctrl+V</kbd> pasting into Excel or Google Sheets.
              </p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            id="close-export-footer-btn"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl shadow-xs transition-all"
          >
            Back to Home Page
          </button>
        </div>
      </div>
    </div>
  );
};

