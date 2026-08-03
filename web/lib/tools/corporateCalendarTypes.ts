/** Client-safe types for `/api/tools/corporate-calendar`. */

export type CalendarEventType = "RESULTS" | "ACTION" | "IPO";

export interface CalendarEvent {
  /** ISO, `YYYY-MM-DD`. */
  date: string;
  type: CalendarEventType;
  symbol: string;
  company: string;
  description: string;
  fno: boolean;
}

export interface RecentIpo {
  symbol: string;
  company: string;
  priceLabel: string;
  listingDate: string | null;
}

export interface BlockDeal {
  symbol: string;
  series: string;
  price: number;
  changePct: number;
  volume: number;
  value: number;
  time: string;
}

export interface CorporateCalendarResponse {
  asOf: string;
  events: CalendarEvent[];
  recentIpos: RecentIpo[];
  blockDeals: BlockDeal[];
}
