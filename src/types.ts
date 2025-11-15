import type { Timestamp } from "firebase/firestore";

export type Visibility = "public" | "private";

export type AuctionStatus = "lobby" | "live" | "ended" | "ranking" | "results";

export interface CategoryConfig {
  id: string;
  label: "A" | "B" | "C" | "D" | "E";
  basePrice: number;
  players: string[];
}

export interface PlayerSlot {
  key: string;
  name: string;
  categoryLabel: CategoryConfig["label"];
  basePrice: number;
}

export interface ActiveBid {
  amount: number;
  bidderId: string;
  bidderName: string;
  startedAt?: Timestamp;
}

export interface CompletedPlayerEntry {
  id: string;
  playerName: string;
  categoryLabel: CategoryConfig["label"];
  basePrice: number;
  result: "sold" | "unsold";
  winnerId?: string;
  winnerName?: string;
  finalBid?: number;
  resolvedAt?: Timestamp;
}

export interface Auction {
  id: string;
  name: string;
  nameLower: string;
  visibility: Visibility;
  password: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  adminId: string;
  adminName: string;
  maxParticipants: number;
  participantCount: number;
  playersPerTeam: number;
  budgetPerPlayer: number;
  totalPlayers: number;
  categories: CategoryConfig[];
  status: AuctionStatus;
  currentPlayerIndex: number;
  countdownEndsAt?: Timestamp | null;
  countdownDuration?: number;
  activeBid?: ActiveBid | null;
  skipVotes?: string[];
  isPaused?: boolean;
  pausedRemainingMs?: number | null;
  completedPlayers?: CompletedPlayerEntry[];
  results?: {
    participantId: string;
    name: string;
    points: number;
    rank: number;
    rosterCount: number;
    budgetRemaining: number;
  }[];
}

export interface RosterEntry {
  playerName: string;
  categoryLabel: CategoryConfig["label"];
  price: number;
}

export interface Participant {
  id: string;
  name: string;
  role: "admin" | "player";
  joinedAt?: Timestamp;
  budgetRemaining: number;
  playersNeeded: number;
  roster: RosterEntry[];
  hasSubmittedTeam: boolean;
  rankingSubmitted: boolean;
  rankings?: Record<string, number>;
}
