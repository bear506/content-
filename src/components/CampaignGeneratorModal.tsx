import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Sparkles, Calendar as CalendarIcon, Tag, Layers, Check, Loader2, DollarSign, Gift, Zap, ChevronLeft, ChevronRight, Wand2, Clock, Search, BookmarkPlus, History, AlertCircle } from "lucide-react";
import { Brand, CampaignConfig, CampaignType, PromoCodeRecord } from "../types";
import { campaignTemplatesApi, CampaignTemplate } from "../lib/api";
import { useToast } from "./Toast";

// A promo code counts as usable for a brand if it hasn't passed its valid-until date (no
// validUntil at all means it never expires).
function isBankCodeActive(rec: PromoCodeRecord, todayStr: string): boolean {
  return !rec.validUntil || rec.validUntil >= todayStr;
}

interface CampaignGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  /** The pre-generated Promo Code Bank (Manage → Promo Codes) — codes are looked up per brand
   *  from here, not created inline in this wizard. */
  promoLibrary: PromoCodeRecord[];
  onGenerate: (config: CampaignConfig) => Promise<void>;
  isGenerating: boolean;
  errorMessage?: string | null;
  /** Render as an inline page section (no backdrop/overlay) instead of a floating modal. */
  embedded?: boolean;
  /** Used to scope the draft-autosave localStorage key per user. */
  currentUserId?: string;
  /** Pre-applies this saved template on mount — e.g. arriving here via "Use Template" from the Templates page. */
  initialTemplateId?: string;
}

/** Fields worth restoring from a draft — deliberately excludes anything derived/computed. */
interface WizardDraft {
  currentStep: number;
  campaignType: CampaignType;
  title: string;
  monthYear: string;
  startDate: string;
  durationDays: number;
  postsPerDay: number;
  promoCode: string;
  discountDetails: string;
  selectedPlatforms: string[];
  selectedBrandIds: string[];
  customNotes: string;
  scheduleMode: "consecutive" | "custom_dates";
  customDatesList: string[];
  language: string;
  isNoPromoCode: boolean;
  timeSlots: string[];
  aiProvider: "gemini" | "claude";
  hookVariantCount: number;
  savedAt: string;
}

const PLATFORM_OPTIONS = ["SMS", "Web Push"];

interface AiCodeSuggestion {
  code: string;
  tagline: string;
  recommendedDiscount: string;
}

export const CampaignGeneratorModal: React.FC<CampaignGeneratorModalProps> = ({
  isOpen,
  onClose,
  brands,
  promoLibrary,
  onGenerate,
  isGenerating,
  errorMessage,
  embedded = false,
  currentUserId,
  initialTemplateId,
}) => {
  const draftKey = currentUserId ? `campaignai:wizard-draft:${currentUserId}` : null;
  const toast = useToast();
  const todayStr = new Date().toISOString().slice(0, 10);
  const getBankCodeForBrand = (brandId: string) =>
    promoLibrary.find((r) => r.brandIds.includes(brandId) && isBankCodeActive(r, todayStr));
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [campaignType, setCampaignType] = useState<CampaignType>("payday");
  const [title, setTitle] = useState("Payday Mega Flash Sale Campaign");
  const [monthYear, setMonthYear] = useState("August 2026");
  
  // Date Picker state
  const [startDate, setStartDate] = useState("2026-08-25");
  const [calendarMonth, setCalendarMonth] = useState(7); // 0-indexed: 7 = August
  const [calendarYear, setCalendarYear] = useState(2026);
  
  const [durationDays, setDurationDays] = useState(3);
  const [postsPerDay, setPostsPerDay] = useState(6);
  
  // Custom Discount Mechanics State
  const [discountType, setDiscountType] = useState<"percentage" | "amount" | "cashback" | "custom">("percentage");
  const [discountValue, setDiscountValue] = useState<number>(30);
  const [currencyUnit, setCurrencyUnit] = useState<string>("RM");
  const [minSpend, setMinSpend] = useState<string>("RM50");
  
  const [promoCode, setPromoCode] = useState("PAYDAY30OFF");
  const [discountDetails, setDiscountDetails] = useState("30% OFF Storewide + Free Processing on orders over RM50");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["SMS", "Web Push"]);
  // Starts empty — brand selection is an explicit choice made in Step 2, not a silent default,
  // so the batch-output preview and step gating below both reflect what the user actually picked.
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState("Focus on salary reward sentiment, flash vouchers, and high-converting urgency CTAs.");

  // AI Promo Code Suggestion state
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);
  const [showCodeSuggestionsModal, setShowCodeSuggestionsModal] = useState(false);
  const [aiCodeSuggestions, setAiCodeSuggestions] = useState<any[]>([]);

  const [aiProvider, setAiProvider] = useState<"gemini" | "claude">("gemini");
  const [hookVariantCount, setHookVariantCount] = useState<number>(1);

  // Custom Schedule Mode & Custom Dates State (e.g., 21/8, 25/8, 29/8)
  const [scheduleMode, setScheduleMode] = useState<"consecutive" | "custom_dates">("consecutive");
  const [customDatesList, setCustomDatesList] = useState<string[]>(["2026-08-21", "2026-08-25", "2026-08-29"]);
  const [customDateInput, setCustomDateInput] = useState("");

  // Output Content Language Selection State
  const [language, setLanguage] = useState<string>("English");

  // Organic Campaign / No Promo Code State
  const [isNoPromoCode, setIsNoPromoCode] = useState<boolean>(false);

  // SOP Compliance Verification Rules Checklist State
  const [sopRulesChecked, setSopRulesChecked] = useState<Record<string, boolean>>({
    r1_slots: true,
    r2_sms_limit: true,
    r3_webpush_format: true,
    r4_wording_uniqueness: true,
    r5_unique_brand_promos: true,
    r6_regional_tone: true,
  });

  // Multi-Company Brand Filtering State
  const [brandSearchQuery, setBrandSearchQuery] = useState("");
  const [brandCompanyFilter, setBrandCompanyFilter] = useState<"all" | "WDF" | "WLM" | "WAW">("all");
  const [showCustomNotes, setShowCustomNotes] = useState<boolean>(false);

  // Customizable Daily Time Slots State
  const [timeSlots, setTimeSlots] = useState<string[]>([
    "08:00 AM",
    "11:00 AM",
    "02:00 PM",
    "05:00 PM",
    "08:00 PM",
    "10:00 PM",
  ]);
  const [newSlotInput, setNewSlotInput] = useState("");

  // Draft autosave state
  const [pendingDraft, setPendingDraft] = useState<WizardDraft | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredOrDismissed = useRef(false);

  // Check for a restorable draft once on mount
  useEffect(() => {
    if (!draftKey) {
      hasRestoredOrDismissed.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        setPendingDraft(JSON.parse(raw));
      } else {
        hasRestoredOrDismissed.current = true;
      }
    } catch {
      // Corrupt/old draft — ignore silently.
      hasRestoredOrDismissed.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDraftSnapshot = (): WizardDraft => ({
    currentStep,
    campaignType,
    title,
    monthYear,
    startDate,
    durationDays,
    postsPerDay,
    promoCode,
    discountDetails,
    selectedPlatforms,
    selectedBrandIds,
    customNotes,
    scheduleMode,
    customDatesList,
    language,
    isNoPromoCode,
    timeSlots,
    aiProvider,
    hookVariantCount,
    savedAt: new Date().toISOString(),
  });

  // Debounced autosave — skipped until the user has responded to (or there is no) restore prompt,
  // so we never silently overwrite a draft the user hasn't chosen to discard yet.
  useEffect(() => {
    if (!draftKey || !hasRestoredOrDismissed.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(buildDraftSnapshot()));
    }, 500);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentStep, campaignType, title, monthYear, startDate, durationDays, postsPerDay,
    promoCode, discountDetails, selectedPlatforms, selectedBrandIds, customNotes,
    scheduleMode, customDatesList, language, isNoPromoCode, timeSlots,
    aiProvider, hookVariantCount,
  ]);

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey);
  };

  const handleRestoreDraft = () => {
    if (!pendingDraft) return;
    setCurrentStep(pendingDraft.currentStep);
    setCampaignType(pendingDraft.campaignType);
    setTitle(pendingDraft.title);
    setMonthYear(pendingDraft.monthYear);
    setStartDate(pendingDraft.startDate);
    setDurationDays(pendingDraft.durationDays);
    setPostsPerDay(pendingDraft.postsPerDay);
    setPromoCode(pendingDraft.promoCode);
    setDiscountDetails(pendingDraft.discountDetails);
    setSelectedPlatforms(pendingDraft.selectedPlatforms);
    setSelectedBrandIds(pendingDraft.selectedBrandIds);
    setCustomNotes(pendingDraft.customNotes);
    setScheduleMode(pendingDraft.scheduleMode);
    setCustomDatesList(pendingDraft.customDatesList);
    setLanguage(pendingDraft.language);
    setIsNoPromoCode(pendingDraft.isNoPromoCode);
    setTimeSlots(pendingDraft.timeSlots);
    setAiProvider(pendingDraft.aiProvider);
    setHookVariantCount(pendingDraft.hookVariantCount);
    setPendingDraft(null);
    hasRestoredOrDismissed.current = true;
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setPendingDraft(null);
    hasRestoredOrDismissed.current = true;
  };

  const templatesQuery = useQuery({ queryKey: ["campaignTemplates"], queryFn: campaignTemplatesApi.list });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const handleLoadTemplate = (template: CampaignTemplate) => {
    const c = template.config;
    setCampaignType(c.campaignType as CampaignType);
    setDurationDays(c.durationDays);
    setPostsPerDay(c.postsPerDay);
    setDiscountDetails(c.discountDetails);
    setSelectedPlatforms(c.targetPlatforms);
    setCustomNotes(c.customNotes);
    setLanguage(c.language);
    if (c.timeSlots && c.timeSlots.length > 0) {
      setTimeSlots(c.timeSlots);
    }
  };

  // Arrived here via "Use Template" from the Templates page — apply it once the template list
  // has loaded, instead of making the user re-pick it from the Step 1 dropdown.
  const appliedInitialTemplate = useRef(false);
  useEffect(() => {
    if (appliedInitialTemplate.current || !initialTemplateId || !templatesQuery.data) return;
    const template = templatesQuery.data.find((t) => t.id === initialTemplateId);
    if (template) {
      handleLoadTemplate(template);
      setSelectedTemplateId(template.id);
    }
    appliedInitialTemplate.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, templatesQuery.data]);

  const handleSelectAllBrands = () => {
    setSelectedBrandIds(brands.map((b) => b.id));
  };

  const handleDeselectAllBrands = () => {
    if (brands.length > 0) {
      setSelectedBrandIds([brands[0].id]);
    }
  };

  const handleToggleCompanyGroup = (group: "WDF" | "WLM" | "WAW") => {
    const groupBrandIds = brands.filter((b) => b.categoryGroup === group).map((b) => b.id);
    const allGroupSelected = groupBrandIds.every((id) => selectedBrandIds.includes(id));

    if (allGroupSelected) {
      // Unselect this group except keep at least 1 brand selected overall
      const remaining = selectedBrandIds.filter((id) => !groupBrandIds.includes(id));
      setSelectedBrandIds(remaining.length > 0 ? remaining : [brands[0].id]);
    } else {
      // Add all brands from this group
      const combined = Array.from(new Set([...selectedBrandIds, ...groupBrandIds]));
      setSelectedBrandIds(combined);
    }
  };

  const handleAddTimeSlot = () => {
    if (!newSlotInput.trim()) return;
    const updated = [...timeSlots, newSlotInput.trim()];
    setTimeSlots(updated);
    setNewSlotInput("");
    setPostsPerDay(updated.length);
  };

  const handleAddQuickSlot = (timeStr: string) => {
    if (timeSlots.includes(timeStr)) return;
    const updated = [...timeSlots, timeStr];
    setTimeSlots(updated);
    setPostsPerDay(updated.length);
  };

  const handleRemoveTimeSlot = (index: number) => {
    const updated = timeSlots.filter((_, i) => i !== index);
    setTimeSlots(updated);
    setPostsPerDay(updated.length);
  };

  const handleClearAllTimeSlots = () => {
    setTimeSlots([]);
    setPostsPerDay(0);
  };

  const handlePresetTimeSlots = (count: number) => {
    let presets: string[] = [];
    if (count === 2) presets = ["10:00 AM", "06:00 PM"];
    else if (count === 3) presets = ["09:00 AM", "02:00 PM", "08:00 PM"];
    else if (count === 4) presets = ["09:00 AM", "01:00 PM", "05:00 PM", "09:00 PM"];
    else if (count === 6) presets = ["08:00 AM", "11:00 AM", "02:00 PM", "05:00 PM", "08:00 PM", "10:00 PM"];
    else if (count === 8) presets = ["08:00 AM", "10:00 AM", "12:00 PM", "02:00 PM", "04:00 PM", "06:00 PM", "08:00 PM", "10:00 PM"];

    setTimeSlots(presets);
    setPostsPerDay(count);
  };

  // Helper to sync discountDetails & promoCode when user changes value or type
  const updateCalculatedDiscount = (
    type: "percentage" | "amount" | "cashback" | "custom",
    val: number,
    unit: string,
    spend: string
  ) => {
    let formattedCode = promoCode;
    let formattedDetails = discountDetails;

    if (type === "percentage") {
      formattedCode = `PAYDAY${val}OFF`;
      formattedDetails = `${val}% OFF Storewide ${spend ? `(Min Spend ${spend})` : ""}`;
    } else if (type === "amount") {
      formattedCode = `PAYDAY${unit}${val}`;
      formattedDetails = `${unit}${val} Flat Fee Waiver / Cash Voucher ${spend ? `(Min Spend ${spend})` : ""}`;
    } else if (type === "cashback") {
      formattedCode = `CASHBACK${val}`;
      formattedDetails = `${val}% Instant Cashback Rebate ${spend ? `(Min Spend ${spend})` : ""}`;
    }

    setPromoCode(formattedCode);
    setDiscountDetails(formattedDetails);
  };

  const handleCampaignTypeChange = (type: CampaignType | "organic") => {
    if (type === "organic") {
      setCampaignType("custom");
      setIsNoPromoCode(true);
      setTitle("Organic Brand Launch Campaign");
      setPromoCode("NO PROMO CODE");
      setDiscountDetails("Organic Brand Highlights / Product Drop");
      setCustomNotes("Focus purely on brand storytelling, product collection highlights, lifestyle appeal, and CTA links. No promo code or voucher discount required.");
      return;
    }

    setIsNoPromoCode(false);
    setCampaignType(type);
    if (type === "payday") {
      setTitle("Payday Mega Flash Sale Campaign");
      setDiscountType("percentage");
      setDiscountValue(30);
      setPromoCode("PAYDAY30OFF");
      setDiscountDetails("30% OFF Storewide + Free Processing on orders over RM50");
      setCustomNotes("Emphasize salary reward sentiment, flash vouchers, limited inventory, and countdown urgency.");
    } else if (type === "first_week") {
      setTitle("First Week Collection Drop");
      setDiscountType("percentage");
      setDiscountValue(20);
      setPromoCode("FIRSTLOOK20");
      setDiscountDetails("20% Early Bird Discount on All New Monthly Arrivals");
      setCustomNotes("Highlight fresh monthly styles/products, early bird privileges, trend inspiration, and lifestyle aesthetic.");
    } else {
      setTitle("Custom Promotional Campaign");
      setDiscountType("amount");
      setDiscountValue(50);
      setPromoCode("SPECIALDEAL50");
      setDiscountDetails("RM50 Exclusive Discount Voucher");
      setCustomNotes("Custom campaign requirements and key product spotlights.");
    }
  };

  const toggleBrand = (id: string) => {
    if (selectedBrandIds.includes(id)) {
      if (selectedBrandIds.length === 1) return; // keep at least one
      setSelectedBrandIds(selectedBrandIds.filter((bId) => bId !== id));
    } else {
      setSelectedBrandIds([...selectedBrandIds, id]);
    }
  };

  const togglePlatform = (p: string) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length === 1) return;
      setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  // AI Generate Promo Codes Call
  const handleAiGeneratePromoCodes = async () => {
    setIsGeneratingCodes(true);
    setShowCodeSuggestionsModal(true);
    try {
      const selectedBrandsList = brands.filter((b) => selectedBrandIds.includes(b.id));
      const shortCodes = selectedBrandsList.map((b) => b.shortCode || b.name);

      const response = await fetch("/api/campaign/generate-promocodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType,
          campaignTitle: title,
          monthYear,
          brandShortCodes: shortCodes,
          discountDetails,
        }),
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(resData.error || "Failed to generate promo codes");
      if (resData.success && resData.suggestions) {
        setAiCodeSuggestions(resData.suggestions);
      }
    } catch (err: any) {
      console.error("AI Promo Code generation error:", err);
      toast.error(err.message || "Failed to generate promo code suggestions.");
      setShowCodeSuggestionsModal(false);
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  // Calculate Scheduled Date Strings based on Start Date & Duration or Custom Dates
  const getScheduledDates = () => {
    if (scheduleMode === "custom_dates") {
      return customDatesList;
    }
    const dates: string[] = [];
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return [];

    for (let i = 0; i < durationDays; i++) {
      const nextDate = new Date(start);
      nextDate.setDate(start.getDate() + i);
      dates.push(nextDate.toISOString().split("T")[0]);
    }
    return dates;
  };

  const scheduledDates = getScheduledDates();

  // Mini Calendar Calculations
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonthCount = getDaysInMonth(calendarYear, calendarMonth);
  const firstDayIndex = getFirstDayOfMonth(calendarYear, calendarMonth);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const isDateSelectedOrActive = (day: number) => {
    const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return scheduledDates.includes(dStr);
  };

  const isStartDate = (day: number) => {
    const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return startDate === dStr;
  };

  const handleDayClick = (day: number) => {
    const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (scheduleMode === "custom_dates") {
      if (customDatesList.includes(dStr)) {
        setCustomDatesList(customDatesList.filter((d) => d !== dStr));
      } else {
        setCustomDatesList([...customDatesList, dStr].sort());
      }
    } else {
      setStartDate(dStr);
      setMonthYear(`${monthNames[calendarMonth]} ${calendarYear}`);
    }
  };

  const handleAddCustomDate = () => {
    if (!customDateInput.trim()) return;
    // Split by comma if user pasted e.g. "2026-08-21, 2026-08-25, 2026-08-29"
    const parsed = customDateInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const merged = Array.from(new Set([...customDatesList, ...parsed])).sort();
    setCustomDatesList(merged);
    setCustomDateInput("");
  };

  const handleRemoveCustomDate = (dateToRemove: string) => {
    setCustomDatesList(customDatesList.filter((d) => d !== dateToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate unique voucher code and discount details for each selected brand
    const brandVoucherCodesMap: Record<string, string> = {};
    const brandDiscountDetailsMap: Record<string, string> = {};
    const activeBrandIds = selectedBrandIds.length > 0 ? selectedBrandIds : brands.map((b) => b.id);

    brands
      .filter((b) => activeBrandIds.includes(b.id))
      .forEach((b) => {
        // Codes come from the Promo Code Bank (Manage → Promo Codes), never invented here — a
        // brand with no active bank code just runs organic (no code mentioned) for this campaign.
        const bankCode = getBankCodeForBrand(b.id);
        brandVoucherCodesMap[b.id] = isNoPromoCode ? "NO PROMO CODE" : (bankCode?.code || "NO PROMO CODE");
        brandDiscountDetailsMap[b.id] = bankCode?.discountDetails || discountDetails || "Exclusive Brand Offer";
      });

    const activeDuration = scheduleMode === "custom_dates" ? customDatesList.length : durationDays;

    const config: CampaignConfig = {
      id: `cfg-${Date.now()}`,
      title,
      campaignType,
      monthYear,
      startDate,
      calendarDates: scheduledDates,
      scheduleMode,
      customDates: scheduledDates,
      language,
      timeSlots,
      durationDays: activeDuration,
      postsPerDay,
      promoCode: isNoPromoCode ? "NO PROMO CODE" : (promoCode || "PAYDAY30OFF"),
      discountDetails: discountDetails || "Brand Specific Offers",
      targetPlatforms: selectedPlatforms,
      customNotes,
      selectedBrandIds: activeBrandIds,
      brandVoucherCodes: brandVoucherCodesMap,
      brandDiscountDetails: brandDiscountDetailsMap,
      aiProvider,
      hookVariantCount,
      createdAt: new Date().toISOString(),
    };
    clearDraft();
    onGenerate(config);
  };

  const totalCalculatedPosts = selectedBrandIds.length * durationDays * postsPerDay;

  // Per-step validation — blocks "Next Step" rather than silently letting the user advance
  // to a step whose prerequisites (brands selected, time slots configured, etc.) aren't met.
  const getStepError = (step: number): string | null => {
    if (step === 1) {
      if (!title.trim()) return "Give this campaign a title before continuing.";
      if (!isNoPromoCode && !promoCode.trim()) return "Set a promo code, or switch to Organic (no-code) mode.";
    }
    if (step === 2) {
      if (selectedBrandIds.length === 0) return "Select at least one brand to continue.";
    }
    if (step === 3) {
      if (scheduleMode === "consecutive" && durationDays < 1) return "Duration must be at least 1 day.";
      if (scheduleMode === "custom_dates" && customDatesList.length === 0) return "Pick at least one custom date to continue.";
    }
    return null;
  };
  const currentStepError = getStepError(currentStep);
  // Time slots are configured in Step 5, not gated by "Next" on any earlier step — but an empty
  // slot list would silently generate a 0-post campaign, so the Generate action itself is guarded.
  const noTimeSlotsError = timeSlots.length === 0 ? "Add at least one daily time slot before generating (see Step 5)." : null;
  const canGenerate = !noTimeSlotsError;

  // Furthest step reachable given what's actually been filled in so far — walks forward from
  // Step 1 and stops at the first unmet prerequisite. Steps beyond this are locked in the tab
  // bar, so jumping straight to "5. Quality SOP" before brands/schedule are set is no longer
  // possible (previously every tab was freely clickable regardless of progress).
  let maxUnlockedStep = 5;
  for (let s = 1; s < 5; s++) {
    if (getStepError(s)) {
      maxUnlockedStep = s;
      break;
    }
  }

  if (!isOpen && !embedded) return null;

  return (
    <div
      onClick={(e) => {
        if (!embedded && e.target === e.currentTarget && !isGenerating) {
          onClose();
        }
      }}
      className={
        embedded
          ? "w-full"
          : "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
      }
    >
      <div
        id="campaign-generator-dialog"
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
            <div className="bg-slate-800 p-2.5 rounded-xl text-white font-bold shadow-xs">
              <Sparkles className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Batch Campaign AI Generator
              </h2>
              <p className="text-xs text-slate-400">
                Automate your monthly Payday &amp; First Week content schedule across 16 brands with custom promo codes &amp; guidelines
              </p>
            </div>
          </div>
          <button
            id="close-generator-modal-btn"
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold bg-slate-950 border border-slate-800 px-3"
            title="Close & Return to Home Page"
          >
            <span>Close</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert inside Modal */}
        {errorMessage && (
          <div className="m-6 mb-0 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-3">
            <div>
              <strong className="font-bold text-rose-200">Generation Alert: </strong>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold rounded-lg text-xs"
            >
              Back to Home
            </button>
          </div>
        )}

        {/* Restore-Draft Banner */}
        {pendingDraft && (
          <div className="mx-6 mt-4 p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-indigo-200">
              <History className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                You have an unsaved draft from {new Date(pendingDraft.savedAt).toLocaleString()} ("{pendingDraft.title}"). Restore it?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="px-2.5 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
              >
                Restore Draft
              </button>
            </div>
          </div>
        )}

        {/* Interactive 5-Step Page-by-Page Wizard Header */}
        <div className="px-6 pt-4 bg-slate-950/60">
          <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center justify-between gap-1 shadow-inner overflow-x-auto">
            {[
              { step: 1, name: "1. Basics & Type", icon: "📋" },
              { step: 2, name: "2. Target Brands", icon: "🏢" },
              { step: 3, name: "3. Schedule & Slots", icon: "📅" },
              { step: 4, name: "4. Codes & Offers", icon: "🏷️" },
              { step: 5, name: "5. Quality SOP", icon: "🚀" },
            ].map((s) => {
              const isLocked = s.step > maxUnlockedStep;
              return (
                <button
                  key={s.step}
                  type="button"
                  disabled={isLocked}
                  onClick={() => setCurrentStep(s.step)}
                  title={isLocked ? "Finish the earlier steps first" : undefined}
                  className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    isLocked
                      ? "bg-slate-950/50 text-slate-600 border border-slate-800/60 cursor-not-allowed"
                      : "cursor-pointer " +
                        (currentStep === s.step
                          ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-[1.02]"
                          : currentStep > s.step
                          ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/80"
                          : "bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-slate-200")
                  }`}
                >
                  <span>{isLocked ? "🔒" : s.icon}</span>
                  <span>{s.name}</span>
                  {currentStep > s.step && !isLocked && <span className="text-[10px] text-emerald-400 font-black">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[75vh]">
        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Step 1: Campaign Objective & Core Info */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              {templatesQuery.data && templatesQuery.data.length > 0 && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center gap-2.5">
                  <BookmarkPlus className="w-4 h-4 text-slate-400 shrink-0" />
                  <label className="text-xs font-semibold text-slate-300 shrink-0">Start from a saved template:</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      setSelectedTemplateId(e.target.value);
                      const template = templatesQuery.data?.find((t) => t.id === e.target.value);
                      if (template) handleLoadTemplate(template);
                    }}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="">Blank (default settings)</option>
                    {templatesQuery.data.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
                  Step 1 of 5: Choose Campaign Objective & Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Payday Option */}
              <button
                type="button"
                id="select-payday-type-btn"
                onClick={() => handleCampaignTypeChange("payday")}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  campaignType === "payday" && !isNoPromoCode
                    ? "bg-slate-800 border-amber-500/70 text-white shadow-md ring-1 ring-amber-500/30"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${campaignType === "payday" && !isNoPromoCode ? "bg-slate-800 text-amber-300" : "bg-slate-800 text-slate-300"}`}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                  {campaignType === "payday" && !isNoPromoCode && (
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      SELECTED
                    </span>
                  )}
                </div>
                <h4 className={`text-sm font-bold ${campaignType === "payday" && !isNoPromoCode ? "text-white" : "text-slate-100"}`}>Payday Sale</h4>
                <p className={`text-[11px] mt-1 leading-relaxed ${campaignType === "payday" && !isNoPromoCode ? "text-slate-300" : "text-slate-400"}`}>
                  High urgency salary rewards &amp; flash voucher codes.
                </p>
              </button>

              {/* First Week Collection Option */}
              <button
                type="button"
                id="select-first-week-type-btn"
                onClick={() => handleCampaignTypeChange("first_week")}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  campaignType === "first_week" && !isNoPromoCode
                    ? "bg-slate-800 border-amber-500/70 text-white shadow-md ring-1 ring-amber-500/30"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${campaignType === "first_week" && !isNoPromoCode ? "bg-slate-800 text-violet-300" : "bg-slate-800 text-slate-300"}`}>
                    <Gift className="w-5 h-5" />
                  </div>
                  {campaignType === "first_week" && !isNoPromoCode && (
                    <span className="bg-violet-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      SELECTED
                    </span>
                  )}
                </div>
                <h4 className={`text-sm font-bold ${campaignType === "first_week" && !isNoPromoCode ? "text-white" : "text-slate-100"}`}>First Week Collection</h4>
                <p className={`text-[11px] mt-1 leading-relaxed ${campaignType === "first_week" && !isNoPromoCode ? "text-slate-300" : "text-slate-400"}`}>
                  Monthly product drops &amp; early bird collection previews.
                </p>
              </button>

              {/* Organic Campaign (No Promo Code) Option */}
              <button
                type="button"
                id="select-organic-type-btn"
                onClick={() => handleCampaignTypeChange("organic")}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  isNoPromoCode
                    ? "bg-slate-800 border-amber-500/70 text-white shadow-md ring-1 ring-amber-500/30"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${isNoPromoCode ? "bg-slate-800 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>
                    <Sparkles className="w-5 h-5" />
                  </div>
                  {isNoPromoCode && (
                    <span className="bg-emerald-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      ORGANIC
                    </span>
                  )}
                </div>
                <h4 className={`text-sm font-bold ${isNoPromoCode ? "text-white" : "text-slate-100"}`}>Organic Campaign</h4>
                <p className={`text-[11px] mt-1 leading-relaxed ${isNoPromoCode ? "text-slate-300" : "text-slate-400"}`}>
                  🌿 No promo code required! Pure brand story &amp; CTA links.
                </p>
              </button>

              {/* Custom Campaign Option */}
              <button
                type="button"
                id="select-custom-type-btn"
                onClick={() => handleCampaignTypeChange("custom")}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  campaignType === "custom" && !isNoPromoCode
                    ? "bg-slate-800 border-amber-500/70 text-white shadow-md ring-1 ring-amber-500/30"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${campaignType === "custom" && !isNoPromoCode ? "bg-slate-800 text-sky-300" : "bg-slate-800 text-slate-300"}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  {campaignType === "custom" && !isNoPromoCode && (
                    <span className="bg-sky-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      CUSTOM
                    </span>
                  )}
                </div>
                <h4 className={`text-sm font-bold ${campaignType === "custom" && !isNoPromoCode ? "text-white" : "text-slate-100"}`}>Custom Campaign</h4>
                <p className={`text-[11px] mt-1 leading-relaxed ${campaignType === "custom" && !isNoPromoCode ? "text-slate-300" : "text-slate-400"}`}>
                  Tailored promo mechanics or special holiday spotlights.
                </p>
              </button>
            </div>
          </div>

          {/* Generation Settings — AI provider + A/B hook variants, moved here from the final
              review step since these affect content generation, not SOP compliance. */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400">
              Generation Settings
            </label>

            <div className="bg-slate-900/90 p-3.5 rounded-xl border border-amber-500/30 space-y-2">
              <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider">
                Select AI Generation Model Engine
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiProvider("gemini")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiProvider === "gemini"
                      ? "bg-amber-500/20 border-amber-500 text-white shadow-md"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold">Google Gemini 3.6 Flash</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Default Server Engine • Pre-configured &amp; Built-in</p>
                </button>

                <button
                  type="button"
                  onClick={() => setAiProvider("claude")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiProvider === "claude"
                      ? "bg-purple-500/20 border-purple-500 text-white shadow-md"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold">Anthropic Claude Sonnet 5</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Linked via ANTHROPIC_API_KEY environment variable</p>
                </button>
              </div>

              {aiProvider === "claude" && (
                <div className="bg-purple-950/40 border border-purple-800/60 p-2.5 rounded-lg text-[11px] text-purple-200 space-y-1">
                  <span className="font-bold flex items-center gap-1 text-purple-300">
                    💡 How Claude is linked in this system:
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    When set to <strong>Claude</strong>, backend calls <code className="bg-slate-950 px-1 py-0.5 rounded text-purple-300">https://api.anthropic.com/v1/messages</code> using your <code className="bg-slate-950 px-1 py-0.5 rounded text-purple-300">ANTHROPIC_API_KEY</code> environment variable. If no key is set, the server automatically falls back to Gemini!
                  </p>
                </div>
              )}
            </div>

            {/* A/B HOOK VARIANTS */}
            <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-700/80 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">A/B Hook Variants</h4>
                  <p className="text-[11px] text-slate-400">
                    Generate multiple hook options per slot so you can pick the best one instead of one fixed line.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setHookVariantCount(n)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      hookVariantCount === n
                        ? "bg-indigo-500 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {n === 1 ? "Off (1 hook)" : `${n} variants`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            💡 This campaign type's mandatory narrative/SOP rules are set once for everyone under{" "}
            <strong className="text-slate-300">Manage → Campaign SOP</strong> — no need to re-enter them per campaign.
          </p>
          </div>
          )}

          {/* Step 2: Target Brands Selection (Multi-Company Support) */}
          {currentStep === 2 && (
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-amber-400 block">
                    Step 2 of 5: Select Target Brands across Companies
                  </label>
                <p className="text-[11px] text-slate-400">
                  Select any combination of brands across <strong>WDF</strong>, <strong>WLM</strong>, and <strong>WAW</strong>! ({selectedBrandIds.length} / {brands.length} Selected)
                </p>
              </div>

              {/* Multi-Company Group Toggles */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllBrands}
                  className="px-2.5 py-1 bg-slate-800 text-amber-300 hover:bg-slate-700 rounded-lg font-bold"
                >
                  Select All ({brands.length})
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllBrands}
                  className="px-2.5 py-1 bg-slate-900 text-slate-400 hover:text-white rounded-lg border border-slate-800 font-medium"
                >
                  Clear
                </button>

                <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => handleToggleCompanyGroup("WDF")}
                  className="px-2.5 py-1 bg-amber-950/70 text-amber-400 border border-amber-800/80 hover:bg-amber-900 rounded-lg font-bold flex items-center gap-1"
                >
                  <span>+ WDF Group</span>
                  <span className="text-[10px] opacity-75">({brands.filter((b) => b.categoryGroup === "WDF").length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleCompanyGroup("WLM")}
                  className="px-2.5 py-1 bg-violet-950/70 text-violet-300 border border-violet-800/80 hover:bg-violet-900 rounded-lg font-bold flex items-center gap-1"
                >
                  <span>+ WLM Group</span>
                  <span className="text-[10px] opacity-75">({brands.filter((b) => b.categoryGroup === "WLM").length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleCompanyGroup("WAW")}
                  className="px-2.5 py-1 bg-rose-950/70 text-rose-300 border border-rose-800/80 hover:bg-rose-900 rounded-lg font-bold flex items-center gap-1"
                >
                  <span>+ WAW Group</span>
                  <span className="text-[10px] opacity-75">({brands.filter((b) => b.categoryGroup === "WAW").length})</span>
                </button>
              </div>
            </div>

            {/* Filter Search Bar & Company Filter Chips */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search brand name or shortcode..."
                  value={brandSearchQuery}
                  onChange={(e) => setBrandSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Filter View:</span>
                {(["all", "WDF", "WLM", "WAW"] as const).map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setBrandCompanyFilter(group)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      brandCompanyFilter === group
                        ? "bg-amber-500 text-slate-950 shadow"
                        : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                    }`}
                  >
                    {group === "all" ? "All Companies" : group}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-900/60 rounded-xl border border-slate-800">
              {brands
                .filter((b) => {
                  if (brandCompanyFilter !== "all" && b.categoryGroup !== brandCompanyFilter) return false;
                  if (
                    brandSearchQuery &&
                    !b.name.toLowerCase().includes(brandSearchQuery.toLowerCase()) &&
                    !(b.shortCode && b.shortCode.toLowerCase().includes(brandSearchQuery.toLowerCase()))
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((b) => {
                  const isSelected = selectedBrandIds.includes(b.id);
                  return (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => toggleBrand(b.id)}
                      className={`p-2 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? "bg-slate-800 border-amber-500/80 text-white shadow-md ring-1 ring-amber-500/40"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-sm">{b.logoEmoji}</span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by button click
                          className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                        />
                      </div>
                      <span className="text-xs font-bold truncate block">{b.name}</span>
                      <div className="flex items-center gap-1 mt-1">
                        {b.shortCode && (
                          <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/80 px-1 rounded">
                            {b.shortCode}
                          </span>
                        )}
                        {b.categoryGroup && (
                          <span
                            className={`text-[9px] font-bold px-1 rounded ${
                              b.categoryGroup === "WDF"
                                ? "bg-amber-950/60 text-amber-300"
                                : b.categoryGroup === "WLM"
                                ? "bg-violet-950/60 text-violet-300"
                                : "bg-rose-950/60 text-rose-300"
                            }`}
                          >
                            {b.categoryGroup}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
          )}

          {/* Step 3: Interactive Calendar Schedule & Dates */}
          {currentStep === 3 && (
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-amber-400" />
                3. Schedule Mode & Launch Dates
              </h3>
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setScheduleMode("consecutive")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    scheduleMode === "consecutive"
                      ? "bg-amber-500 text-slate-950 shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Consecutive Days
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode("custom_dates")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    scheduleMode === "custom_dates"
                      ? "bg-emerald-500 text-slate-950 shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Custom Dates (e.g. 21/8, 25/8, 29/8)
                </button>
              </div>
            </div>

            {/* Custom Dates Controls Banner */}
            {scheduleMode === "custom_dates" && (
              <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                  <span>📅 Custom Non-Consecutive Campaign Dates ({customDatesList.length} Selected Dates)</span>
                  <span className="text-[10px] text-emerald-400/80 font-normal">
                    Click calendar dates below or type dates to add/remove
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 2026-08-21, 2026-08-25, 2026-08-29"
                    value={customDateInput}
                    onChange={(e) => setCustomDateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomDate();
                      }
                    }}
                    className="flex-1 bg-slate-950 border border-emerald-700/60 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomDate}
                    className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-emerald-400"
                  >
                    + Add Date(s)
                  </button>
                </div>

                {/* Custom Date Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {customDatesList.map((d, idx) => (
                    <span
                      key={d}
                      className="bg-slate-900 text-emerald-300 border border-emerald-600/60 px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5"
                    >
                      <span>Blast #{idx + 1}: {d}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomDate(d)}
                        className="text-slate-400 hover:text-rose-400 font-bold ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {customDatesList.length === 0 && (
                    <span className="text-xs text-rose-400 italic">No custom dates selected yet. Click dates on the calendar below!</span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Calendar Grid Picker */}
              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonth === 0) {
                        setCalendarMonth(11);
                        setCalendarYear(calendarYear - 1);
                      } else {
                        setCalendarMonth(calendarMonth - 1);
                      }
                    }}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span>
                    {monthNames[calendarMonth]} {calendarYear}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (calendarMonth === 11) {
                        setCalendarMonth(0);
                        setCalendarYear(calendarYear + 1);
                      } else {
                        setCalendarMonth(calendarMonth + 1);
                      }
                    }}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-500">
                  <span>Su</span>
                  <span>Mo</span>
                  <span>Tu</span>
                  <span>We</span>
                  <span>Th</span>
                  <span>Fr</span>
                  <span>Sa</span>
                </div>

                {/* Day Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {/* Empty offsets */}
                  {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`offset-${i}`} />
                  ))}

                  {/* Month Days */}
                  {Array.from({ length: daysInMonthCount }).map((_, i) => {
                    const day = i + 1;
                    const active = isDateSelectedOrActive(day);
                    const isStart = isStartDate(day);

                    return (
                      <button
                        type="button"
                        key={`day-${day}`}
                        onClick={() => handleDayClick(day)}
                        className={`h-7 w-full rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                          isStart
                            ? "bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300"
                            : active
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-mono"
                            : "hover:bg-slate-800 text-slate-300"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scheduled Days Breakdown */}
              <div className="space-y-3">
                {scheduleMode === "consecutive" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Start Date</label>
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Customize Duration (Days)</label>
                      <div className="space-y-1.5">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={durationDays}
                          onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
                          placeholder="e.g. 3, 7, 10, 14, 30"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <div className="flex flex-wrap gap-1">
                          {[1, 3, 5, 7, 10, 14, 30].map((dVal) => (
                            <button
                              key={dVal}
                              type="button"
                              onClick={() => setDurationDays(dVal)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                durationDays === dVal
                                  ? "bg-amber-500 text-slate-950 font-bold"
                                  : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                              }`}
                            >
                              {dVal}d
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-emerald-800/60 text-xs space-y-1">
                    <span className="font-bold text-emerald-400 block">Mode: Custom Non-Consecutive Dates</span>
                    <p className="text-slate-400 text-[11px]">
                      Your campaign will run on the {customDatesList.length} specific dates selected above. Same promo code mechanics apply across all blast dates.
                    </p>
                  </div>
                )}

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Calculated Schedule Range ({scheduledDates.length} Blast Days)
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {scheduledDates.map((dStr, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                        <span className="font-semibold text-slate-200">Blast Date {idx + 1}</span>
                        <span className="font-mono text-emerald-400 font-bold">{dStr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Step 4: Promo Code & Campaign Mechanics */}
          {currentStep === 4 && (
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
              <span>4. Campaign Mechanics & Promo Settings</span>
              {!isNoPromoCode && (
                <button
                  type="button"
                  onClick={handleAiGeneratePromoCodes}
                  className="px-3 py-1 bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow hover:opacity-90"
                >
                  <Wand2 className="w-3.5 h-3.5 fill-slate-950" />
                  <span>✨ AI Generate Promo Codes</span>
                </button>
              )}
            </h3>

            {/* Promo Code Mode Toggle Header */}
            <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white block">Promo Code & Discount Mode</span>
                <span className="text-[11px] text-slate-400">
                  {isNoPromoCode
                    ? "🌿 Organic Mode is Active: No promo code or voucher discount required."
                    : "💰 Promotional Sale Mode: Custom voucher codes and discount calculations enabled."}
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-700 hover:border-amber-500/80 transition-all shrink-0">
                <input
                  type="checkbox"
                  checked={isNoPromoCode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsNoPromoCode(checked);
                    if (checked) {
                      setPromoCode("NO PROMO CODE");
                      setDiscountDetails("No Discount (Organic Launch)");
                    } else {
                      setPromoCode("PAYDAY30OFF");
                      setDiscountDetails("30% OFF Storewide + Free Shipping");
                    }
                  }}
                  className="rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-amber-300">Organic Mode (No Promo / No Discount)</span>
              </label>
            </div>

            {/* Discount Builder Control Box - Only shown if NOT organic */}
            {!isNoPromoCode ? (
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  Discount Calculation & Mechanics Builder:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  {/* Type Selection */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Discount Mode</label>
                    <select
                      value={discountType}
                      onChange={(e) => {
                        const t = e.target.value as any;
                        setDiscountType(t);
                        updateCalculatedDiscount(t, discountValue, currencyUnit, minSpend);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                    >
                      <option value="percentage">% Percentage OFF</option>
                      <option value="amount">Flat Cash / Fee Waiver</option>
                      <option value="cashback">Instant Cashback Rebate</option>
                      <option value="custom">Custom Text</option>
                    </select>
                  </div>

                  {/* Value Input */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {discountType === "percentage" ? "Discount Percentage (%)" : "Discount Value"}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={discountType === "percentage" ? 90 : 10000}
                      value={discountValue}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDiscountValue(v);
                        updateCalculatedDiscount(discountType, v, currencyUnit, minSpend);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Unit / Currency */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Currency / Unit</label>
                    <select
                      value={currencyUnit}
                      onChange={(e) => {
                        const u = e.target.value;
                        setCurrencyUnit(u);
                        updateCalculatedDiscount(discountType, discountValue, u, minSpend);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="RM">RM (Ringgit)</option>
                      <option value="$">$ (USD)</option>
                      <option value="%">% Percent</option>
                      <option value="PTS">Points</option>
                    </select>
                  </div>

                  {/* Min Spend */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Min Spend Threshold</label>
                    <input
                      type="text"
                      value={minSpend}
                      onChange={(e) => {
                        const ms = e.target.value;
                        setMinSpend(ms);
                        updateCalculatedDiscount(discountType, discountValue, currencyUnit, ms);
                      }}
                      placeholder="e.g. RM50"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-800/60 p-3.5 rounded-xl text-xs text-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow">
                <div>
                  <span className="font-bold block text-emerald-300 text-sm">🌿 Organic Campaign Mode (No Discount / No Voucher)</span>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    All generated captions will focus purely on brand storytelling, product highlights, and direct action links. <strong>No promo code or discount text</strong> will appear in the messages.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsNoPromoCode(false);
                    setPromoCode("PAYDAY30OFF");
                    setDiscountDetails("30% OFF Storewide + Free Shipping");
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shrink-0 transition-all"
                >
                  Switch to Voucher Campaign
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Campaign Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Period / Month</label>
                <input
                  type="text"
                  required
                  value={monthYear}
                  onChange={(e) => setMonthYear(e.target.value)}
                  placeholder="e.g. August 2026"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* BRAND PROMO CODES — pulled from the Promo Code Bank, never created here */}
              {!isNoPromoCode && (
                <div className="md:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="border-b border-slate-800 pb-3">
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <Tag className="w-4 h-4 text-amber-400" />
                      Promo Codes for Selected Brands ({selectedBrandIds.length} Selected)
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Pulled automatically from your <strong className="text-slate-300">Promo Code Bank</strong>. To add or change a
                      code, go to <strong className="text-slate-300">Manage → Promo Codes</strong> — not editable here.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                    {brands
                      .filter((b) => selectedBrandIds.includes(b.id))
                      .map((b) => {
                        const bankCode = getBankCodeForBrand(b.id);
                        return (
                          <div
                            key={b.id}
                            className="bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 space-y-2 transition-all shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white truncate">{b.name}</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                  b.categoryGroup === "WDF"
                                    ? "bg-amber-950 text-amber-300 border border-amber-800/60"
                                    : b.categoryGroup === "WLM"
                                    ? "bg-violet-950 text-violet-300 border border-violet-800/60"
                                    : "bg-rose-950 text-rose-300 border border-rose-800/60"
                                }`}
                              >
                                {b.shortCode || b.categoryGroup}
                              </span>
                            </div>

                            {bankCode ? (
                              <div className="space-y-1">
                                <div className="font-mono font-extrabold text-amber-400 text-xs tracking-wider bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                                  {bankCode.code}
                                </div>
                                <div className="text-xs font-semibold text-emerald-300">{bankCode.discountDetails}</div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5 text-[11px] text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-lg px-2.5 py-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>No active code for this brand — add one in Manage → Promo Codes, or it'll run organic.</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Step 5: Quality SOP, Channels & Generation Review */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-fadeIn">
              {/* SOP COMPLIANCE INSPECTION & VERIFICATION CHECKLIST */}
              <div className="md:col-span-2 bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-700/80 flex items-center justify-center text-emerald-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        Campaign SOP &amp; Quality Compliance Inspector
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Automatic verification engine enforcing non-overlapping slots, SMS limits, multi-brand uniqueness &amp; compliance rules.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const allChecked = Object.values(sopRulesChecked).every(Boolean);
                      setSopRulesChecked({
                        r1_slots: !allChecked,
                        r2_sms_limit: !allChecked,
                        r3_webpush_format: !allChecked,
                        r4_wording_uniqueness: !allChecked,
                        r5_unique_brand_promos: !allChecked,
                        r6_regional_tone: !allChecked,
                      });
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-emerald-400 border border-emerald-500/30 rounded-lg transition-all cursor-pointer shrink-0"
                  >
                    {Object.values(sopRulesChecked).every(Boolean) ? "✓ All SOP Rules Active & Verified" : "Verify All Rules"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {[
                    {
                      id: "r1_slots",
                      title: "1. Zero Overlap 6-Slot Protocol",
                      desc: "08:00 AM, 11:00 AM, 02:00 PM, 05:00 PM, 08:00 PM, 10:00 PM non-overlapping blast times.",
                    },
                    {
                      id: "r2_sms_limit",
                      title: "2. SMS GSM Chars Limit (≤160)",
                      desc: "Strict length enforcement, no broken links or overflow text segments.",
                    },
                    {
                      id: "r3_webpush_format",
                      title: "3. Web Push Formatting Rules",
                      desc: "Rich emoji hooks (🔔,⚡,💸), catchy title ≤45 chars, body ≤120 chars, no hashtags.",
                    },
                    {
                      id: "r4_wording_uniqueness",
                      title: "4. Anti-Duplicate Brand Voice",
                      desc: "100% distinct vocabulary & tone per brand so customers never suspect same AI prompt.",
                    },
                    {
                      id: "r5_unique_brand_promos",
                      title: "5. Brand Unique Promo Codes & Offers",
                      desc: "Every brand receives a distinct approved promo code and custom discount mechanics.",
                    },
                    {
                      id: "r6_regional_tone",
                      title: "6. Regional Language & Currency SOP",
                      desc: "Compliant financial phrasing in Bahasa Melayu / English with MYR/RM local currency.",
                    },
                  ].map((rule) => {
                    const isChecked = sopRulesChecked[rule.id];
                    return (
                      <div
                        key={rule.id}
                        onClick={() =>
                          setSopRulesChecked((prev) => ({ ...prev, [rule.id]: !prev[rule.id] }))
                        }
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                          isChecked
                            ? "bg-emerald-950/40 border-emerald-800/60 text-slate-200"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 opacity-60"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded mt-0.5 shrink-0 flex items-center justify-center border text-[10px] font-bold ${
                            isChecked
                              ? "bg-emerald-500 border-emerald-400 text-slate-950"
                              : "border-slate-600 bg-slate-950"
                          }`}
                        >
                          {isChecked && "✓"}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-white">{rule.title}</p>
                          <p className="text-[10px] text-slate-400 leading-tight">{rule.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={isNoPromoCode ? "md:col-span-2" : ""}>
                <label className="block text-xs font-medium text-slate-300 mb-1">Preset Daily Blast Slot Options</label>
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {[2, 3, 4, 6, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePresetTimeSlots(num)}
                      className={`flex-1 py-1 text-xs font-bold rounded ${
                        timeSlots.length === num
                          ? "bg-amber-500 text-slate-950 shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {num} Slots
                    </button>
                  ))}
                </div>
              </div>

              {/* Customizable Daily Blast Time Slots Manager */}
              <div className="md:col-span-2 bg-slate-950/90 p-3.5 rounded-xl border border-amber-500/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Customizable Daily Blast Time Slots ({timeSlots.length} Active Slots/Day)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {timeSlots.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllTimeSlots}
                        className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded-lg border border-rose-800 text-[11px] font-bold transition-all"
                      >
                        🗑️ Clear All Slots (Start Empty)
                      </button>
                    )}
                  </div>
                </div>

                {/* Slot Chips */}
                {timeSlots.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {timeSlots.map((slotTime, idx) => (
                      <span
                        key={idx}
                        className="bg-slate-900 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow"
                      >
                        <span>Slot #{idx + 1}: {slotTime}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTimeSlot(idx)}
                          className="text-slate-400 hover:text-rose-400 font-bold ml-1 text-sm"
                          title="Delete slot"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs text-amber-400 font-medium">
                    ⚠️ No time slots set! Type your desired time below or click a quick time button to add.
                  </div>
                )}

                {/* Quick Add Time Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1">
                  <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Quick Add:</span>
                  {["08:00 AM", "09:00 AM", "11:00 AM", "01:00 PM", "03:00 PM", "05:00 PM", "08:00 PM", "10:00 PM"].map((tStr) => (
                    <button
                      key={tStr}
                      type="button"
                      onClick={() => handleAddQuickSlot(tStr)}
                      className="px-2 py-0.5 bg-slate-900 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/50 rounded text-mono font-semibold"
                    >
                      + {tStr}
                    </button>
                  ))}
                </div>

                {/* Add Custom Time Slot Input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Type custom time (e.g. 09:30 AM, 14:15, 08:45 PM)..."
                    value={newSlotInput}
                    onChange={(e) => setNewSlotInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTimeSlot();
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddTimeSlot}
                    className="px-3.5 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-amber-400 transition-all shrink-0"
                  >
                    + Add Time Slot
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Delivery Channels</label>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORM_OPTIONS.map((p) => {
                    const isChecked = selectedPlatforms.includes(p);
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isChecked
                            ? "bg-amber-500/20 border border-amber-500 text-amber-300 shadow"
                            : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{p === "SMS" ? "📱 SMS Messages" : "🔔 Web Push Notifications"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            {/* Content Output Language Selector */}
            <div className="bg-slate-900/90 p-3.5 rounded-xl border border-sky-500/30 space-y-2">
              <label className="block text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center justify-between">
                <span>🌐 Target Output Language</span>
                <span className="text-[10px] text-slate-400 font-normal">Choose generated content language</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400 font-medium"
              >
                <option value="English">🇬🇧 English (Standard Corporate)</option>
                <option value="Bahasa Melayu">🇲🇾 Bahasa Melayu (Standard / Formal)</option>
                <option value="Chinese">🇨🇳 Chinese (Simplified / Traditional)</option>
                <option value="Manglish">🇲🇾 Manglish / Malaysian Colloquial (High Conversion Bilingual)</option>
                <option value="Spanish">🇪🇸 Spanish (Español)</option>
              </select>
            </div>

            {/* Optional Custom Directives */}
            <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/50 space-y-2">
              <button
                type="button"
                onClick={() => setShowCustomNotes(!showCustomNotes)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white"
              >
                <span className="flex items-center gap-1.5">
                  <span>📝 Optional Custom Directives &amp; Brand Notes</span>
                  <span className="text-[10px] text-slate-500 font-normal">(No need to fill if standard payday/organic)</span>
                </span>
                <span className="text-amber-400 text-xs font-bold">{showCustomNotes ? "Hide ↑" : "Show / Add Notes +"}</span>
              </button>

              {showCustomNotes && (
                <textarea
                  rows={2}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="e.g. Focus on salary advance, flash vouchers, and high converting urgency CTAs."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 mt-2"
                />
              )}
            </div>
          </div>
          )}

          {/* AI Code Suggestions Popover / Modal */}
          {showCodeSuggestionsModal && (
            <div className="bg-slate-950 border border-amber-500/40 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-amber-400" />
                  AI Suggested High-Converting Promo Codes
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCodeSuggestionsModal(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  Close
                </button>
              </div>

              {isGeneratingCodes ? (
                <div className="flex items-center justify-center py-6 gap-2 text-xs text-amber-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gemini AI generating custom promo code ideas...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {aiCodeSuggestions.map((sug, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        setPromoCode(sug.code);
                        if (sug.recommendedDiscount) setDiscountDetails(sug.recommendedDiscount);
                        setShowCodeSuggestionsModal(false);
                      }}
                      className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/60 rounded-xl text-left transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-black text-sm text-emerald-400 group-hover:scale-105 transition-transform">
                          {sug.code}
                        </span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                          1-Click Apply
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium">{sug.tagline}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{sug.recommendedDiscount}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Sticky footer — always visible regardless of scroll position on any step */}
        <div className="p-6 pt-4 space-y-3 border-t border-slate-800 bg-slate-900 shrink-0">
          {/* Batch Summary Callout — only meaningful once brands are actually picked in Step 2 */}
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-violet-950/40 p-4 rounded-xl border border-amber-500/30 flex items-center justify-between">
            {selectedBrandIds.length === 0 ? (
              <div>
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Generation Batch Output</h4>
                <p className="text-sm text-slate-400 mt-0.5">Select your target brands in Step 2 to preview the batch size here.</p>
              </div>
            ) : (
              <>
                <div>
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Generation Batch Output</h4>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {selectedBrandIds.length} Brand(s) × {durationDays} Days ({startDate}) × {timeSlots.length} Slots/Day
                  </p>
                  <p className="text-xs text-slate-400">
                    Gemini will generate <span className="text-amber-400 font-bold">{totalCalculatedPosts} total posts</span> embedded with unique brand promo codes.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-amber-400">{totalCalculatedPosts}</span>
                  <span className="block text-[10px] text-slate-400 font-medium">Content Cards</span>
                </div>
              </>
            )}
          </div>

          {(currentStepError || noTimeSlotsError) && (
            <div className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{currentStepError || noTimeSlotsError}</span>
            </div>
          )}

          {/* Submit / Step Navigation Action */}
          <div className="pt-1 flex items-center justify-between border-t border-slate-800">
            <div>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                  className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous Step ({currentStep - 1}/5)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel / Home
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {currentStep < 5 && (
                <>
                  <button
                    type="button"
                    disabled={!!currentStepError}
                    onClick={() => setCurrentStep((prev) => Math.min(5, prev + 1))}
                    className="px-4 py-2.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Next Step ({currentStep + 1}/5)</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    id="quick-generate-campaign-btn"
                    disabled={isGenerating || !canGenerate}
                    title={noTimeSlotsError || undefined}
                    className="px-5 py-2.5 text-xs font-bold bg-gradient-to-r from-amber-400 via-amber-500 to-rose-500 text-slate-950 hover:from-amber-300 hover:to-rose-400 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                    <span>Generate ({totalCalculatedPosts} Posts)</span>
                  </button>
                </>
              )}

              {currentStep === 5 && (
                <button
                  type="submit"
                  id="submit-generate-campaign-btn"
                  disabled={isGenerating || !canGenerate}
                  title={noTimeSlotsError || undefined}
                  className="px-6 py-2.5 text-xs font-bold bg-gradient-to-r from-amber-400 via-amber-500 to-rose-500 text-slate-950 hover:from-amber-300 hover:to-rose-400 rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50 transition-all transform active:scale-95 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Generating {totalCalculatedPosts} Posts via AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-slate-950" />
                      <span>Generate All {totalCalculatedPosts} Campaign Posts</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
};
