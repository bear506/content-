import React, { useState, useRef } from "react";
import { X, Plus, Trash2, Edit2, Check, Sparkles, Building2, Tag, RefreshCw, Download, Upload } from "lucide-react";
import { Brand } from "../types";
import { toCsv, parseCsv, downloadCsv } from "../lib/csv";
import { ConfirmDialog } from "./ConfirmDialog";

const CSV_HEADERS = [
  "id",
  "name",
  "shortCode",
  "categoryGroup",
  "industry",
  "tone",
  "targetAudience",
  "keyProducts",
  "defaultHashtags",
  "defaultPromoCode",
  "brandColor",
  "logoEmoji",
  "contentGuidelines",
  "bannedWords",
];

interface BrandManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  onSaveBrand: (brand: Brand) => void;
  onDeleteBrand: (brandId: string) => void;
  onResetDefaultBrands?: () => void;
  /** Render as an inline page section (no backdrop/overlay) instead of a floating modal. */
  embedded?: boolean;
  /** Hide all create/edit/delete controls (viewer role). */
  readOnly?: boolean;
}

const COLOR_OPTIONS = [
  "#ec4899", // pink
  "#6366f1", // indigo
  "#0ea5e9", // sky blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ef4444", // red
  "#14b8a6", // teal
];

export const BrandManagerModal: React.FC<BrandManagerModalProps> = ({
  isOpen,
  onClose,
  brands,
  onSaveBrand,
  onDeleteBrand,
  onResetDefaultBrands,
  embedded = false,
  readOnly = false,
}) => {
  const [editingBrand, setEditingBrand] = useState<Partial<Brand> | null>(null);
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen && !embedded) return null;

  const handleStartNew = () => {
    setBannedWordInput("");
    setEditingBrand({
      id: `brand-${Date.now()}`,
      name: "",
      shortCode: "",
      categoryGroup: "WDF",
      brandColor: "#6366f1",
      logoEmoji: "✨",
      contentGuidelines: "",
      bannedWords: [],
    });
  };

  const handleAddBannedWord = () => {
    if (!bannedWordInput.trim() || !editingBrand) return;
    const existing = editingBrand.bannedWords || [];
    if (existing.includes(bannedWordInput.trim())) {
      setBannedWordInput("");
      return;
    }
    setEditingBrand({ ...editingBrand, bannedWords: [...existing, bannedWordInput.trim()] });
    setBannedWordInput("");
  };

  const handleRemoveBannedWord = (word: string) => {
    if (!editingBrand) return;
    setEditingBrand({ ...editingBrand, bannedWords: (editingBrand.bannedWords || []).filter((w) => w !== word) });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrand || !editingBrand.name) return;

    const shortCode =
      editingBrand.shortCode ||
      editingBrand.name.substring(0, 3).toUpperCase();

    // Only fall back to generic placeholders for brand-new brands — editing an existing
    // brand must preserve its real industry/tone/audience/etc. rather than overwrite them.
    onSaveBrand({
      ...editingBrand,
      shortCode,
      categoryGroup: editingBrand.categoryGroup || "WDF",
      industry: editingBrand.industry || `${editingBrand.categoryGroup || "WDF"} Brand`,
      tone: editingBrand.tone || "Friendly & Engaging",
      targetAudience: editingBrand.targetAudience || "General Audience",
      keyProducts: editingBrand.keyProducts || editingBrand.name,
      defaultHashtags: editingBrand.defaultHashtags || `#${editingBrand.name.replace(/\s+/g, "")}`,
      defaultPromoCode: editingBrand.defaultPromoCode || "PROMO2026",
      brandColor: editingBrand.brandColor || "#6366f1",
      logoEmoji: editingBrand.logoEmoji || "✨",
      contentGuidelines: editingBrand.contentGuidelines || "",
      bannedWords: editingBrand.bannedWords || [],
    } as Brand);
    setEditingBrand(null);
    setBannedWordInput("");
  };

  const handleExportCSV = () => {
    const rows = brands.map((b) => [
      b.id,
      b.name,
      b.shortCode,
      b.categoryGroup,
      b.industry,
      b.tone,
      b.targetAudience,
      b.keyProducts,
      b.defaultHashtags,
      b.defaultPromoCode,
      b.brandColor,
      b.logoEmoji,
      b.contentGuidelines || "",
      (b.bannedWords || []).join(";"),
    ]);
    downloadCsv(`campaignai_brands_${Date.now()}.csv`, toCsv(CSV_HEADERS, rows));
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const allRows = parseCsv(text);
        if (allRows.length < 2) {
          setImportSummary("CSV file has no data rows.");
          return;
        }

        const header = allRows[0].map((h) => h.trim());
        const colIndex = (name: string) => header.indexOf(name);
        const idxId = colIndex("id");
        const idxName = colIndex("name");

        if (idxName === -1) {
          setImportSummary('CSV is missing a required "name" column.');
          return;
        }

        let imported = 0;
        for (const row of allRows.slice(1)) {
          const name = row[idxName]?.trim();
          if (!name) continue;

          const get = (col: string, fallback = "") => {
            const idx = colIndex(col);
            return idx >= 0 && row[idx] !== undefined ? row[idx] : fallback;
          };

          const existingId = idxId >= 0 ? row[idxId]?.trim() : "";
          const id = existingId || `brand-${Date.now()}-${imported}`;
          const bannedWordsRaw = get("bannedWords", "");

          onSaveBrand({
            id,
            name,
            shortCode: get("shortCode") || name.substring(0, 3).toUpperCase(),
            categoryGroup: get("categoryGroup", "WDF"),
            industry: get("industry", `${get("categoryGroup", "WDF")} Brand`),
            tone: get("tone", "Friendly & Engaging"),
            targetAudience: get("targetAudience", "General Audience"),
            keyProducts: get("keyProducts", name),
            defaultHashtags: get("defaultHashtags", `#${name.replace(/\s+/g, "")}`),
            defaultPromoCode: get("defaultPromoCode", "PROMO2026"),
            brandColor: get("brandColor", "#6366f1"),
            logoEmoji: get("logoEmoji", "✨"),
            contentGuidelines: get("contentGuidelines", ""),
            bannedWords: bannedWordsRaw ? bannedWordsRaw.split(";").map((w) => w.trim()).filter(Boolean) : [],
          } as Brand);
          imported++;
        }

        setImportSummary(`Imported/updated ${imported} brand(s).`);
      } catch (err: any) {
        setImportSummary(`Failed to parse CSV: ${err.message || "unknown error"}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
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
        id="brand-manager-dialog"
        onClick={embedded ? undefined : (e) => e.stopPropagation()}
        className={
          embedded
            ? "bg-slate-900 border border-slate-800 rounded-2xl w-full text-slate-100 shadow-xl overflow-hidden"
            : "bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl text-slate-100 shadow-2xl overflow-hidden my-8 cursor-default"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Brand Portfolio Manager</h2>
              <p className="text-xs text-slate-400">
                Manage your brand identities, company groups, default promo codes, and hashtags
              </p>
            </div>
          </div>
          {!embedded && (
            <button
              id="close-brand-manager-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
              title="Close & Return to Home Page"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto bg-slate-950/40">
          {editingBrand ? (
            /* Edit / Create Form */
            <form onSubmit={handleSave} className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>{editingBrand.id ? "Edit Brand Details" : "Add New Brand"}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => { setEditingBrand(null); setBannedWordInput(""); }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Brand Name *</label>
                  <input
                    type="text"
                    required
                    value={editingBrand.name || ""}
                    onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                    placeholder="e.g. Winbox, Joker, Playlaju"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Company Group *</label>
                    <select
                      value={editingBrand.categoryGroup || "WDF"}
                      onChange={(e) => setEditingBrand({ ...editingBrand, categoryGroup: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="WDF">WDF Company Group</option>
                      <option value="WLM">WLM Company Group</option>
                      <option value="WAW">WAW Company Group</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Shortcode (Optional)</label>
                    <input
                      type="text"
                      value={editingBrand.shortCode || ""}
                      onChange={(e) => setEditingBrand({ ...editingBrand, shortCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. WB, JK, PL"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Brand Color Accent</label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto p-1">
                      {COLOR_OPTIONS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setEditingBrand({ ...editingBrand, brandColor: col })}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            editingBrand.brandColor === col ? "scale-110 border-white shadow-md" : "border-transparent opacity-80 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Persisted Content Guidelines / SOP
                  </label>
                  <p className="text-[10px] text-slate-500 mb-1.5">
                    Auto-prefilled into the campaign wizard's guidelines step for this brand — still editable per-campaign, not forced.
                  </p>
                  <textarea
                    rows={3}
                    value={editingBrand.contentGuidelines || ""}
                    onChange={(e) => setEditingBrand({ ...editingBrand, contentGuidelines: e.target.value })}
                    placeholder="e.g. Always mention 15-minute approval speed. Keep tone urgent but reassuring. Never use the word 'debt'."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Banned Words / Phrases</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {(editingBrand.bannedWords || []).map((word) => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-rose-950/60 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded-full"
                      >
                        {word}
                        <button
                          type="button"
                          onClick={() => handleRemoveBannedWord(word)}
                          className="hover:text-rose-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={bannedWordInput}
                      onChange={(e) => setBannedWordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddBannedWord();
                        }
                      }}
                      placeholder="Type a word/phrase and press Enter"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddBannedWord}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setEditingBrand(null); setBannedWordInput(""); }}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Brand</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs text-slate-400">
                You have <span className="text-white font-semibold">{brands.length} active brands</span> configured across WDF, WLM, and WAW.
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 shadow-xs"
                  title="Export the full brand roster as a CSV file"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Export CSV</span>
                </button>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 shadow-xs"
                      title="Bulk import/update brands from a CSV file"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      <span>Import CSV</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleImportCSV}
                      className="hidden"
                    />
                    {onResetDefaultBrands && (
                      <button
                        type="button"
                        onClick={onResetDefaultBrands}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 shadow-xs"
                        title="Reset to official 16 WDF/WLM/WAW brands"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Restore Default 16 Brands</span>
                      </button>
                    )}
                    <button
                      id="add-new-brand-btn"
                      onClick={handleStartNew}
                      className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Brand</span>
                    </button>
                  </>
                )}
              </div>
              {importSummary && (
                <div className="w-full flex items-center justify-between gap-2 bg-indigo-950/50 border border-indigo-800/60 rounded-lg px-3 py-2 text-xs text-indigo-300">
                  <span>{importSummary}</span>
                  <button type="button" onClick={() => setImportSummary(null)} className="text-indigo-400 hover:text-indigo-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Brands Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {brands.map((b) => (
              <div
                key={b.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 pl-3 pr-3.5 py-4 rounded-xl flex items-center justify-between group transition-all shadow-2xs"
                style={{ borderLeftWidth: 4, borderLeftColor: b.brandColor || "#6366f1" }}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-extrabold text-white truncate">{b.name}</h4>
                      {b.shortCode && (
                        <span className="text-xs font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700 px-1.5 py-0.5 rounded shrink-0">
                          {b.shortCode}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mt-1">
                      Company: {b.categoryGroup || "WDF"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!readOnly && (
                  <button
                    id={`edit-brand-${b.id}-btn`}
                    onClick={() => { setEditingBrand(b); setBannedWordInput(""); }}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    title="Edit Brand"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  )}
                  {!readOnly && brands.length > 1 && (
                    <button
                      id={`delete-brand-${b.id}-btn`}
                      onClick={() => setDeleteTarget(b)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Delete Brand"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        {!embedded && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            id="close-brand-manager-footer-btn"
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
        title="Delete this brand?"
        message={deleteTarget ? `"${deleteTarget.name}" and its saved guidelines will be permanently removed. This cannot be undone.` : ""}
        confirmLabel="Delete Brand"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteBrand(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
