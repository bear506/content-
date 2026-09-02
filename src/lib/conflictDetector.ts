import { Post } from "../types";

export interface SlotConflictGroup {
  key: string;
  dateLabel: string;
  timeSlot: string;
  platform: string;
  posts: Post[];
}

// Flags when two or more different brands are scheduled to send on the exact same
// date + time slot + platform — this can look coordinated/spammy to anyone who follows
// more than one of the brands, and is worth a human double-checking before it goes out.
export function findSlotConflicts(posts: Post[]): SlotConflictGroup[] {
  const map = new Map<string, Post[]>();

  for (const p of posts) {
    const dateKey = p.scheduledDate || `day-${p.dayNumber}`;
    const key = `${dateKey}|${p.timeSlot}|${p.platform}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  const conflicts: SlotConflictGroup[] = [];
  for (const [key, group] of map) {
    const uniqueBrands = new Set(group.map((p) => p.brandId));
    if (uniqueBrands.size > 1) {
      const [dateLabel] = key.split("|");
      conflicts.push({
        key,
        dateLabel: group[0].scheduledDate || `Day ${group[0].dayNumber}`,
        timeSlot: group[0].timeSlot,
        platform: group[0].platform,
        posts: group,
      });
    }
  }

  return conflicts.sort((a, b) => a.key.localeCompare(b.key));
}
