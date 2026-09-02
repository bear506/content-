import React, { useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import { Brand } from "../types";

interface BrandFilterSelectProps {
  brands: Brand[];
  /** Selected brand id, or "all". */
  value: string;
  onChange: (id: string) => void;
}

const GROUPS = ["all", "WDF", "WLM", "WAW"] as const;

// Reusable single-select brand filter — absorbs the search + company-group filtering UX
// from CampaignGeneratorModal's Step 2 brand picker, first used to replace ExportModal's
// bare <select>. ContentMatrixView's brand filter is intentionally NOT migrated to this yet
// (its bidirectional multi-select sync with App.tsx's filter state is a separate, riskier
// refactor — see the plan notes for this phase).
export const BrandFilterSelect: React.FC<BrandFilterSelectProps> = ({ brands, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<(typeof GROUPS)[number]>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedBrand = brands.find((b) => b.id === value);

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      if (groupFilter !== "all" && b.categoryGroup !== groupFilter) return false;
      if (search && !b.name.toLowerCase().includes(search.toLowerCase()) && !(b.shortCode || "").toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [brands, groupFilter, search]);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 flex items-center justify-between gap-2"
      >
        <span className="truncate">
          {value === "all" ? `All Brands (${brands.length})` : `${selectedBrand?.logoEmoji || ""} ${selectedBrand?.name || value}`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand name or shortcode..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupFilter(g)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    groupFilter === g
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {g === "all" ? "All Groups" : g}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange("all");
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-slate-800 ${
                value === "all" ? "text-amber-300 font-bold" : "text-slate-300"
              }`}
            >
              <span>All Brands ({brands.length})</span>
              {value === "all" && <Check className="w-3.5 h-3.5" />}
            </button>
            {filteredBrands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onChange(b.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-slate-800 ${
                  value === b.id ? "text-amber-300 font-bold" : "text-slate-300"
                }`}
              >
                <span className="truncate">
                  {b.logoEmoji} {b.name} {b.shortCode ? `(${b.shortCode})` : ""}
                </span>
                {value === b.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
            {filteredBrands.length === 0 && (
              <div className="px-3 py-4 text-xs text-slate-500 text-center">No brands match your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
