// GSM 03.38 default alphabet (basic set) — characters an SMS can encode as 7-bit GSM-7.
const GSM_7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extended GSM-7 characters — each costs 2 characters worth of budget (escape + char).
const GSM_7_EXTENDED = "^{}\\[~]|€";

function isGsm7Basic(ch: string): boolean {
  return GSM_7_BASIC.includes(ch);
}

function isGsm7Extended(ch: string): boolean {
  return GSM_7_EXTENDED.includes(ch);
}

export interface SmsSegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  effectiveLength: number; // GSM-7 extended chars count double
  segments: number;
  singleSegmentLimit: number;
  perSegmentLimit: number; // limit per segment once a message spans multiple segments
  isMultiSegment: boolean;
}

// Determines the SMS encoding, effective character budget, and segment count for a message.
// Falls back to UCS-2 (70/67 chars) the moment any character isn't in the GSM-7 alphabet —
// this includes common "smart" punctuation like em dashes, curly quotes, and any emoji.
export function analyzeSmsSegments(text: string): SmsSegmentInfo {
  let effectiveLength = 0;
  let isGsm7 = true;

  for (const ch of text) {
    if (isGsm7Basic(ch)) {
      effectiveLength += 1;
    } else if (isGsm7Extended(ch)) {
      effectiveLength += 2;
    } else {
      isGsm7 = false;
      break;
    }
  }

  if (!isGsm7) {
    // UCS-2: each character (including surrogate-pair emoji) counts toward a 70/67 char budget.
    effectiveLength = Array.from(text).length;
  }

  const singleSegmentLimit = isGsm7 ? 160 : 70;
  const perSegmentLimit = isGsm7 ? 153 : 67;
  const segments = effectiveLength === 0 ? 0 : effectiveLength <= singleSegmentLimit ? 1 : Math.ceil(effectiveLength / perSegmentLimit);

  return {
    encoding: isGsm7 ? "GSM-7" : "UCS-2",
    effectiveLength,
    segments,
    singleSegmentLimit,
    perSegmentLimit,
    isMultiSegment: segments > 1,
  };
}
