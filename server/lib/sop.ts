// Campaign SOP (Standard Operating Procedure) text — the narrative/structural rules injected
// into the AI prompt for each campaign type. Kept out of the AI prompt-building code so it can
// be edited from Manage > Campaign SOP without a deploy: the business's promo narrative changes
// month to month (a new payday hook angle, a different first-week theme), but the code that
// builds prompts shouldn't need to change with it. These are only the built-in starting values —
// the "settings" table row (key `sop_<type>`) is the actual live value once an admin edits it.

export const SOP_CAMPAIGN_TYPES = ["payday", "first_week", "custom"] as const;
export type SopCampaignType = (typeof SOP_CAMPAIGN_TYPES)[number];

export const DEFAULT_SOP_TEXT: Record<SopCampaignType, string> = {
  payday: `- **PAYDAY SALE CAMPAIGN SOP** (for Payday Sale campaigns):
  * MUST include salary arrival celebration and self-reward messaging, written naturally and culturally appropriate for the target language (do not translate a phrase literally from another language).
  * MUST include flash voucher speed-claim urgency, limited slot alerts, fee waiver / instant savings details, and direct shop links.
  * SLOT PROGRESSION NARRATIVE ARC PER DAY (a guiding principle — spread these beats evenly across however many slots are requested, do not assume exactly 5):
    - Early slots: Salary Arrival Teaser & Self-Reward Hook
    - Mid-day slots: Flash Voucher Speed Release & Claim Alert
    - Afternoon slots: Featured Category / Salary Reward Recommendation
    - Evening slots: Urgency Countdown & Voucher Claims Limit Warning
    - Final slot(s) of the day: Expiry Alert & Last Chance Call`,

  first_week: `- **FIRST WEEK COLLECTION CAMPAIGN SOP** (for First Week Collection campaigns):
  * MUST include "New Month, New Drop" fresh arrivals reveal and seasonal trend highlights.
  * MUST include VIP early-bird privilege callouts, brand quality/craftsmanship storytelling, and first-batch stock reservation calls.
  * SLOT PROGRESSION NARRATIVE ARC PER DAY (a guiding principle — spread these beats evenly across however many slots are requested, do not assume exactly 5):
    - Early slots: "New Month, New Drop" Reveal & Fresh Arrival Hook
    - Mid-day slots: Category Curation & Featured Product Spotlight
    - Afternoon slots: Brand Craftsmanship, Value Proposition & Lifestyle Benefit
    - Evening slots: VIP Early-Bird Privilege & Exclusive Monthly Perk Callout
    - Final slot(s) of the day: First-Batch Stock Reservation & Wishlist Alert`,

  // No mandatory narrative by default — "custom" campaigns are driven entirely by the
  // per-campaign Custom Notes/Guidelines in the wizard unless an admin opts into a house SOP here.
  custom: "",
};
