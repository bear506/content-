import React, { useState } from "react";
import { Building2, Tag, Users as UsersIcon, History, Webhook, ListOrdered } from "lucide-react";
import { Brand, CampaignResult, PromoCodeRecord } from "../types";
import { Role } from "../lib/api";
import { BrandManagerModal } from "../components/BrandManagerModal";
import { PromoCodeTracker } from "../components/PromoCodeTracker";
import { UsersManager } from "../components/UsersManager";
import { AuditLogViewer } from "../components/AuditLogViewer";
import { IntegrationsPanel } from "../components/IntegrationsPanel";
import { CampaignSopPanel } from "../components/CampaignSopPanel";

type ManageTab = "brands" | "promo_codes" | "campaign_sop" | "users" | "audit_log" | "integrations";

interface ManagePageProps {
  brands: Brand[];
  onSaveBrand: (brand: Brand) => void;
  onDeleteBrand: (brandId: string) => void;
  onResetDefaultBrands: () => void;
  promoLibrary: PromoCodeRecord[];
  onAddPromoRecord: (rec: PromoCodeRecord) => void;
  onDeletePromoRecord: (id: string) => void;
  activeCampaign: CampaignResult | null;
  currentUserRole?: Role;
  currentUserId?: string;
}

export const ManagePage: React.FC<ManagePageProps> = ({
  brands,
  onSaveBrand,
  onDeleteBrand,
  onResetDefaultBrands,
  promoLibrary,
  onAddPromoRecord,
  onDeletePromoRecord,
  activeCampaign,
  currentUserRole,
  currentUserId,
}) => {
  const [tab, setTab] = useState<ManageTab>("brands");
  const isAdmin = currentUserRole === "admin";
  const isReadOnly = currentUserRole === "viewer";

  const tabs: { id: ManageTab; label: string; icon: React.ReactNode }[] = [
    { id: "brands", label: "Brands", icon: <Building2 className="w-4 h-4" /> },
    { id: "promo_codes", label: "Promo Codes", icon: <Tag className="w-4 h-4" /> },
    { id: "campaign_sop", label: "Campaign SOP", icon: <ListOrdered className="w-4 h-4" /> },
    ...(isAdmin
      ? [
          { id: "users" as ManageTab, label: "Users", icon: <UsersIcon className="w-4 h-4" /> },
          { id: "audit_log" as ManageTab, label: "Audit Log", icon: <History className="w-4 h-4" /> },
          { id: "integrations" as ManageTab, label: "Integrations", icon: <Webhook className="w-4 h-4" /> },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-1.5 shadow-xl backdrop-blur-md flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === t.id
                ? "bg-amber-500/10 border border-amber-500/50 text-amber-300 shadow-sm"
                : "bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "brands" && (
        <BrandManagerModal
          isOpen
          embedded
          onClose={() => {}}
          brands={brands}
          onSaveBrand={onSaveBrand}
          onDeleteBrand={onDeleteBrand}
          onResetDefaultBrands={onResetDefaultBrands}
          readOnly={isReadOnly}
        />
      )}

      {tab === "promo_codes" && (
        <PromoCodeTracker
          isOpen
          embedded
          onClose={() => {}}
          brands={brands}
          promoLibrary={promoLibrary}
          onAddPromoRecord={onAddPromoRecord}
          onDeletePromoRecord={onDeletePromoRecord}
          activeCampaignCode={activeCampaign?.config.promoCode || ""}
          activeDiscountDetails={activeCampaign?.config.discountDetails || ""}
          activeCampaignTitle={activeCampaign?.config.title || "No Active Campaign"}
          activeMonthYear={activeCampaign?.config.monthYear || ""}
          readOnly={isReadOnly}
        />
      )}

      {tab === "campaign_sop" && <CampaignSopPanel readOnly={isReadOnly} />}

      {tab === "users" && isAdmin && <UsersManager currentUserId={currentUserId} />}

      {tab === "audit_log" && isAdmin && <AuditLogViewer />}

      {tab === "integrations" && isAdmin && <IntegrationsPanel />}
    </div>
  );
};
