import React, { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Brand } from "../types";

interface BrandChipFilterProps {
  brands: Brand[];
  selectedIds: string[];
  onToggle: (brandId: string) => void;
  onSelectGroup: (group: "ALL" | "WDF" | "WLM" | "WAW") => void;
}

const GROUPS = ["ALL", "WDF", "WLM", "WAW"] as const;

// Always-visible, one-click brand filter — replaces the old <select> dropdown (open, scroll,
// click) with the same direct-tap tile pattern already proven in CampaignGeneratorModal's
// Step 2 brand picker. Collapsed by default (search + group chips only) so it doesn't dominate
// the page; expand to see/click individual brand tiles.
export const BrandChipFilter: React.FC<BrandChipFilterProps> = ({ brands, selectedIds, onToggle, onSelectGroup }) => {
  const [search, setSearch] = useState("");
  // Expanded by default — individual per-brand filtering needs to be immediately visible,
  // not hidden behind an extra click, since it's the primary way to isolate one brand's content.
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredBrands = useMemo(() => {
    if (!search) return brands;
    const q = search.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(q) || (b.shortCode || "").toLowerCase().includes(q));
  }, [brands, search]);

  const activeGroup = useMemo(() => {
    if (selectedIds.length === 0) return "ALL" as const;
    for (const g of ["WDF", "WLM", "WAW"] as const) {
      const groupIds = brands.filter((b) => (b.categoryGroup || "WDF") === g).map((b) => b.id);
      if (groupIds.length > 0 && groupIds.length === selectedIds.length && groupIds.every((id) => selectedIds.includes(id))) {
        return g;
      }
    }
    return null;
  }, [brands, selectedIds]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onSelectGroup(g)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              activeGroup === g
                ? "bg-amber-500 text-slate-950 shadow"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            {g === "ALL" ? "All Brands" : g}
          </button>
        ))}

        {selectedIds.length > 0 && !activeGroup && (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {selectedIds.length} Selected
          </span>
        )}

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="ml-auto px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 text-slate-400 border border-slate-800 hover:text-white flex items-center gap-1 cursor-pointer"
        >
          <span>{isExpanded ? "Hide Brand List" : "Choose Individual Brands"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand name or shortcode..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto">
            {filteredBrands.map((b) => {
              const isSelected = selectedIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onToggle(b.id)}
                  className={`p-2 rounded-lg border text-left transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-slate-800 border-amber-500/80 text-white shadow-sm"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <span className="text-sm shrink-0">{b.logoEmoji || "🏷️"}</span>
                  <span className="text-[11px] font-bold truncate">{b.shortCode || b.name}</span>
                </button>
              );
            })}
            {filteredBrands.length === 0 && (
              <div className="col-span-full text-center text-xs text-slate-500 py-3">No brands match your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
