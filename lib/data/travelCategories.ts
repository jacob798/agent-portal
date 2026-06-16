/**
 * Travel expense categories — the calendar's own buckets. Client-safe: NO server imports, so both
 * the server data layer (lib/data/travel.ts) and the client component (components/travel/Travel.tsx)
 * can import these without pulling next/headers into the client bundle.
 */

// Display order for the grouped trip-expense view.
export const CALENDAR_CATEGORIES = ["Flights", "Trains", "Lodging", "Cars", "Rides", "Dining", "Other"] as const;

export const CALENDAR_CAT_ICON: Record<string, string> = {
  Flights: "✈️", Trains: "🚆", Lodging: "🏨", Cars: "🚗", Rides: "🚕", Dining: "🍽️", Other: "🧾",
};

// Roll the worker's fine-grained category (Flight / Hotel / Car rental / Ride / Meal …) up to one
// of the calendar buckets above.
export function calendarCategory(raw: string | null | undefined): string {
  const c = (raw ?? "").toLowerCase();
  if (c.includes("flight") || c.includes("airfare") || c.includes("air ")) return "Flights";
  if (c.includes("train") || c.includes("rail")) return "Trains";
  if (c.includes("hotel") || c.includes("lodging") || c.includes("airbnb")) return "Lodging";
  if (c.includes("car")) return "Cars";
  if (c.includes("ride") || c.includes("ground") || c.includes("transport") ||
      c.includes("uber") || c.includes("lyft") || c.includes("taxi")) return "Rides";
  if (c.includes("meal") || c.includes("dining") || c.includes("food")) return "Dining";
  return "Other";
}
