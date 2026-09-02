import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Brand, CampaignConfig, PromoCodeRecord } from "../types";
import { CampaignGeneratorModal } from "../components/CampaignGeneratorModal";

interface CreateCampaignPageProps {
  brands: Brand[];
  promoLibrary: PromoCodeRecord[];
  onGenerate: (config: CampaignConfig) => Promise<void>;
  isGenerating: boolean;
  errorMessage?: string | null;
  onDismissError: () => void;
  currentUserId?: string;
}

export const CreateCampaignPage: React.FC<CreateCampaignPageProps> = ({
  brands,
  promoLibrary,
  onGenerate,
  isGenerating,
  errorMessage,
  onDismissError,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template") || undefined;

  return (
    <CampaignGeneratorModal
      isOpen
      embedded
      onClose={() => {
        onDismissError();
        navigate("/library");
      }}
      brands={brands}
      promoLibrary={promoLibrary}
      onGenerate={async (config) => {
        await onGenerate(config);
      }}
      isGenerating={isGenerating}
      errorMessage={errorMessage}
      currentUserId={currentUserId}
      initialTemplateId={templateId}
    />
  );
};
