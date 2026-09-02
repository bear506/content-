import React from "react";

export type DiscountType = "percentage" | "amount" | "cashback" | "custom";

// Turns a structured type+value into display text — so the caller only ever needs to store the
// number, not hand-type the sentence ("30% Off", "RM50 Off", "20% Cashback").
export function formatDiscountAmount(type: DiscountType, value: number, currencyUnit: string = "RM"): string {
  if (type === "percentage") return `${value}% Off`;
  if (type === "amount") return `${currencyUnit}${value} Off`;
  if (type === "cashback") return `${value}% Cashback`;
  return "";
}

interface DiscountAmountPickerProps {
  type: DiscountType;
  value: number;
  customText: string;
  currencyUnit?: string;
  onChangeType: (type: DiscountType) => void;
  onChangeValue: (value: number) => void;
  onChangeCustomText: (text: string) => void;
}

// A type dropdown (% off / currency off / cashback / custom text) + number input, so setting a
// discount amount is a number field instead of hand-typing a full offer sentence every time.
export const DiscountAmountPicker: React.FC<DiscountAmountPickerProps> = ({
  type,
  value,
  customText,
  currencyUnit = "RM",
  onChangeType,
  onChangeValue,
  onChangeCustomText,
}) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={type}
          onChange={(e) => onChangeType(e.target.value as DiscountType)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="percentage">% Off</option>
          <option value="amount">{currencyUnit} Off</option>
          <option value="cashback">% Cashback</option>
          <option value="custom">Custom Text</option>
        </select>

        {type !== "custom" && (
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => onChangeValue(Number(e.target.value) || 0)}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-300 focus:outline-none focus:border-amber-500"
          />
        )}
      </div>

      {type === "custom" ? (
        <input
          type="text"
          value={customText}
          onChange={(e) => onChangeCustomText(e.target.value)}
          placeholder="e.g. 30% Cash Rebate + Zero Interest"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
        />
      ) : (
        <div className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-300">
          {formatDiscountAmount(type, value, currencyUnit)}
        </div>
      )}
    </div>
  );
};
