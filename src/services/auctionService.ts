import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  Auction,
  CategoryConfig,
  Participant,
  PlayerSlot,
  CompletedPlayerEntry,
  TaggedRosterEntry
} from "../types";
import { buildPlayerQueue } from "../utils/players";

const START_TIMER_MS = 60000;
const ACTIVE_BID_TIMER_MS = 15000;

const getActiveSlot = (auction: Auction, queue: PlayerSlot[]) => {
  if (auction.manualPlayer) {
    return { slot: auction.manualPlayer, isManual: true };
  }
  return { slot: queue[auction.currentPlayerIndex] ?? null, isManual: false };
};

const participantCanCoverBid = (participant: Participant, amount: number) =>
  participant.budgetRemaining >= amount;

export interface CategoryInput {
  id: string;
  label: CategoryConfig["label"];
  basePrice: number;
  players: string[];
}

export interface CreateAuctionInput {
  auctionName: string;
  adminName: string;
  clientId: string;
  maxParticipants: number;
  playersPerTeam: number;
  budgetPerPlayer: number;
  visibility: "public" | "private";
  password: string;
  categories: CategoryInput[];
}

export const createAuction = async (input: CreateAuctionInput) => {
  const trimmedName = input.auctionName.trim();
  if (!trimmedName) {
    throw new Error("Auction name is required.");
  }

  const nameLower = trimmedName.toLowerCase();
  const dupe = await getDocs(
    query(collection(db, "auctions"), where("nameLower", "==", nameLower), limit(1))
  );
  if (!dupe.empty) {
    throw new Error("Auction name already exists, try a different one.");
  }

  const normalizedCategories = input.categories
    .map((category) => ({
      ...category,
      players: category.players
        .map((player) => player.trim())
        .filter((player) => Boolean(player))
    }))
    .filter((category) => category.players.length);

  if (!normalizedCategories.length) {
    throw new Error("Add at least one player to create an auction.");
  }

  const totalPlayers = normalizedCategories.reduce(
    (acc, category) => acc + category.players.length,
    0
  );

  const docRef = await addDoc(collection(db, "auctions"), {
    name: trimmedName,
    nameLower,
    visibility: input.visibility,
    password: input.password,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    adminId: input.clientId,
    adminName: input.adminName.trim() || "Admin",
    maxParticipants: input.maxParticipants,
    participantCount: 1,
    playersPerTeam: input.playersPerTeam,
    budgetPerPlayer: input.budgetPerPlayer,
    categories: normalizedCategories,
    status: "lobby",
    currentPlayerIndex: -1,
    countdownEndsAt: null,
    countdownDuration: START_TIMER_MS,
    activeBid: null,
    skipVotes: [],
    isPaused: false,
    pausedRemainingMs: null,
    manualPlayer: null,
    manualSourceId: null,
    finalizationOpen: false,
    totalPlayers,
    completedPlayers: [],
    results: []
  });

  const participantRef = doc(collection(docRef, "participants"), input.clientId);
  await setDoc(participantRef, {
    name: input.adminName.trim().slice(0, 10) || "Admin",
    role: "admin",
    joinedAt: serverTimestamp(),
    budgetRemaining: input.budgetPerPlayer,
    playersNeeded: input.playersPerTeam,
    roster: [],
    hasSubmittedTeam: false,
    rankingSubmitted: false,
    rankings: {}
  });

  return docRef.id;
};

export const findAuctionByName = async (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const snapshot = await getDocs(
    query(collection(db, "auctions"), where("nameLower", "==", normalized), limit(1))
  );
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, data: docSnap.data() as Auction };
};

interface JoinAuctionInput {
  auctionId: string;
  password: string;
  clientId: string;
  displayName: string;
}

export const joinAuction = async (input: JoinAuctionInput) => {
  const { auctionId, password, clientId, displayName } = input;
  const auctionRef = doc(db, "auctions", auctionId);
  const participantRef = doc(collection(auctionRef, "participants"), clientId);

  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) {
      throw new Error("Auction not found.");
    }

    const auction = auctionSnap.data() as Auction;
    if (auction.password !== password) {
      throw new Error("Incorrect password.");
    }

    const participantSnap = await trx.get(participantRef);
    const safeName = displayName.trim().slice(0, 10);

    if (!participantSnap.exists()) {
      if (auction.participantCount >= auction.maxParticipants) {
        throw new Error("Auction is full.");
      }

      trx.update(auctionRef, {
        participantCount: auction.participantCount + 1,
        updatedAt: serverTimestamp()
      });

      trx.set(participantRef, {
        name: safeName,
        role: "player",
        joinedAt: serverTimestamp(),
        budgetRemaining: auction.budgetPerPlayer,
        playersNeeded: auction.playersPerTeam,
        roster: [],
        hasSubmittedTeam: false,
        rankingSubmitted: false,
        rankings: {}
      });
      return;
    }

    const existing = participantSnap.data() as Participant;
    trx.set(
      participantRef,
      {
        ...existing,
        name: safeName || existing.name,
        rankings: existing.rankings ?? {}
      },
      { merge: true }
    );
  });
};

export const startAuction = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  await runTransaction(db, async (trx) => {
    const snapshot = await trx.get(auctionRef);
    if (!snapshot.exists()) throw new Error("Auction not found.");
    const auction = snapshot.data() as Auction;
    if (auction.status !== "lobby") throw new Error("Auction already started.");

    const queue = buildPlayerQueue(auction.categories);
    if (!queue.length) throw new Error("No players to start the auction.");

    const nextEndsAt = Timestamp.fromMillis(Date.now() + START_TIMER_MS);
    trx.update(auctionRef, {
      status: "live",
      currentPlayerIndex: 0,
      countdownEndsAt: nextEndsAt,
      countdownDuration: START_TIMER_MS,
      activeBid: null,
      skipVotes: [],
      isPaused: false,
      pausedRemainingMs: null,
      manualPlayer: null,
      manualSourceId: null,
      finalizationOpen: false,
      updatedAt: serverTimestamp()
    });
  });
};

interface BidInput {
  auctionId: string;
  clientId: string;
  bidderName: string;
  amount: number;
}

export const placeBid = async (input: BidInput) => {
  const { auctionId, clientId, bidderName, amount } = input;
  const auctionRef = doc(db, "auctions", auctionId);
  const participantRef = doc(collection(auctionRef, "participants"), clientId);

  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    if (auction.status !== "live") {
      throw new Error("Auction is not live.");
    }
    if (auction.isPaused) {
      throw new Error("Auction is paused.");
    }

    const queue = buildPlayerQueue(auction.categories);
    const { slot: currentPlayer } = getActiveSlot(auction, queue);
    if (!currentPlayer) throw new Error("No active player.");

    const participantSnap = await trx.get(participantRef);
    if (!participantSnap.exists()) throw new Error("Participant missing.");
    const participant = participantSnap.data() as Participant;

    const minimumBid = Math.max(
      currentPlayer.basePrice,
      auction.activeBid ? auction.activeBid.amount + 1 : currentPlayer.basePrice
    );
    if (amount < minimumBid) {
      throw new Error(`Bid must be at least ${minimumBid}.`);
    }

    if (amount > participant.budgetRemaining) {
      throw new Error("Bid exceeds your remaining budget.");
    }

    const nextEndsAt = Timestamp.fromMillis(Date.now() + ACTIVE_BID_TIMER_MS);
    trx.update(auctionRef, {
      activeBid: {
        amount,
        bidderId: clientId,
        bidderName,
        startedAt: serverTimestamp()
      },
      countdownEndsAt: nextEndsAt,
      countdownDuration: ACTIVE_BID_TIMER_MS,
      skipVotes: [],
      updatedAt: serverTimestamp()
    });
  });

  await maybeResolveLockedAuction(auctionId);
};

interface SkipInput {
  auctionId: string;
  clientId: string;
}

export const skipPlayer = async (input: SkipInput) => {
  const { auctionId, clientId } = input;
  const auctionRef = doc(db, "auctions", auctionId);

  const result = await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    if (auction.status !== "live" || auction.isPaused) {
      return { resolve: false, forceUnsold: false };
    }

    const votes = new Set(auction.skipVotes ?? []);
    votes.add(clientId);
    const skipVotes = Array.from(votes);
    trx.update(auctionRef, {
      skipVotes,
      updatedAt: serverTimestamp()
    });

    const activeBid = auction.activeBid;
    if (activeBid) {
      const passes = skipVotes.filter((id) => id !== activeBid.bidderId).length;
      const required = Math.max(auction.participantCount - 1, 1);
      return {
        resolve: passes >= required,
        forceUnsold: false
      };
    }

    return {
      resolve: skipVotes.length >= auction.participantCount,
      forceUnsold: true
    };
  });

  if (result.resolve) {
    await finalizeCurrentPlayer({ auctionId, forceUnsold: result.forceUnsold });
  } else {
    await maybeResolveLockedAuction(auctionId);
  }
};

export const pauseAuction = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    if (auction.status !== "live" || auction.isPaused) {
      return;
    }
    const remaining = auction.countdownEndsAt
      ? Math.max(auction.countdownEndsAt.toMillis() - Date.now(), 0)
      : auction.countdownDuration ?? START_TIMER_MS;
    trx.update(auctionRef, {
      isPaused: true,
      pausedRemainingMs: remaining,
      countdownEndsAt: null,
      updatedAt: serverTimestamp()
    });
  });
};

export const resumeAuction = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    if (auction.status !== "live" || !auction.isPaused) {
      return;
    }
    const ms = auction.pausedRemainingMs ?? auction.countdownDuration ?? START_TIMER_MS;
    trx.update(auctionRef, {
      isPaused: false,
      pausedRemainingMs: null,
      countdownEndsAt: Timestamp.fromMillis(Date.now() + ms),
      countdownDuration: ms,
      updatedAt: serverTimestamp()
    });
  });
};

interface FinalizeInput {
  auctionId: string;
  forceUnsold?: boolean;
}

const resolveNextPlayer = (auction: Auction, queue: PlayerSlot[]) => {
  const nextIndex = auction.currentPlayerIndex + 1;
  const hasNext = nextIndex < queue.length;
  if (!hasNext) {
    return {
      updates: {
        status: "ended",
        currentPlayerIndex: nextIndex,
        countdownEndsAt: null,
        countdownDuration: null,
        activeBid: null,
        skipVotes: [],
        isPaused: false,
        pausedRemainingMs: null,
        finalizationOpen: false,
        updatedAt: serverTimestamp()
      }
    };
  }

  return {
    updates: {
      currentPlayerIndex: nextIndex,
      countdownEndsAt: Timestamp.fromMillis(Date.now() + START_TIMER_MS),
      countdownDuration: START_TIMER_MS,
      activeBid: null,
      skipVotes: [],
      isPaused: false,
      pausedRemainingMs: null,
      finalizationOpen: auction.finalizationOpen ?? false,
      updatedAt: serverTimestamp()
    }
  };
};

export const finalizeCurrentPlayer = async (input: FinalizeInput) => {
  const { auctionId, forceUnsold = false } = input;
  const auctionRef = doc(db, "auctions", auctionId);

  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    if (auction.status !== "live") return;

    const queue = buildPlayerQueue(auction.categories);
    const { slot: currentPlayer, isManual } = getActiveSlot(auction, queue);
    if (!currentPlayer) {
      trx.update(auctionRef, {
        status: "ended",
        countdownEndsAt: null,
        countdownDuration: null,
        activeBid: null,
        skipVotes: [],
        finalizationOpen: false,
        updatedAt: serverTimestamp()
      });
      return;
    }

    const activeBid = auction.activeBid;
    const shouldSell = Boolean(activeBid) && !forceUnsold;
    let completedEntry: CompletedPlayerEntry = {
      id: currentPlayer.key,
      playerName: currentPlayer.name,
      categoryLabel: currentPlayer.categoryLabel,
      basePrice: currentPlayer.basePrice,
      result: "unsold",
      resolvedAt: Timestamp.fromMillis(Date.now())
    };

    if (shouldSell && activeBid) {
      const participantRef = doc(
        collection(auctionRef, "participants"),
        activeBid.bidderId
      );
      const participantSnap = await trx.get(participantRef);
      if (!participantSnap.exists()) {
        throw new Error("Winning bidder left the lobby.");
      }

      const participant = participantSnap.data() as Participant;
      const updatedRoster = [
        ...(participant.roster ?? []),
        {
          playerName: currentPlayer.name,
          categoryLabel: currentPlayer.categoryLabel,
          price: activeBid.amount
        }
      ];

      trx.update(participantRef, {
        roster: updatedRoster,
        budgetRemaining: participant.budgetRemaining - activeBid.amount,
        playersNeeded: Math.max(participant.playersNeeded - 1, 0)
      });

      completedEntry = {
        ...completedEntry,
        result: "sold",
        winnerId: activeBid.bidderId,
        winnerName: activeBid.bidderName,
        finalBid: activeBid.amount
      };
    }

    let history = [...(auction.completedPlayers ?? [])];
    if (isManual && auction.manualSourceId) {
      history = history.map((entry) =>
        entry.id === auction.manualSourceId ? { ...completedEntry, id: entry.id } : entry
      );
    } else {
      history = [...history, completedEntry];
    }

    const queueComplete = auction.currentPlayerIndex >= queue.length - 1;
    const next = isManual
      ? {
          updates: {
            manualPlayer: null,
            manualSourceId: null,
            countdownEndsAt: null,
            countdownDuration: null,
            activeBid: null,
            skipVotes: [],
            isPaused: false,
            pausedRemainingMs: null,
            status: queueComplete ? "ended" : auction.status,
            finalizationOpen: queueComplete ? false : auction.finalizationOpen ?? false,
            updatedAt: serverTimestamp()
          }
        }
      : resolveNextPlayer(auction, queue);

    trx.update(auctionRef, {
      completedPlayers: history,
      ...next.updates
    });
  });
};

interface SubmitTeamInput {
  auctionId: string;
  clientId: string;
  finalRoster: TaggedRosterEntry[];
  sport: "cricket" | "soccer";
  formationCode?: string;
  formationLabel?: string;
}

export const submitTeam = async (input: SubmitTeamInput) => {
  const { auctionId, clientId, finalRoster, sport, formationCode, formationLabel } = input;
  const participantRef = doc(
    collection(doc(db, "auctions", auctionId), "participants"),
    clientId
  );
  await updateDoc(participantRef, {
    hasSubmittedTeam: true,
    finalRoster,
    finalRosterSport: sport,
    finalRosterFormation:
      sport === "soccer"
        ? {
            code: formationCode ?? "custom",
            label: formationLabel ?? formationCode ?? "Custom formation"
          }
        : null
  });
};

export const openFinalizationPhase = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  await runTransaction(db, async (trx) => {
    const snapshot = await trx.get(auctionRef);
    if (!snapshot.exists()) throw new Error("Auction not found.");
    const auction = snapshot.data() as Auction;
    if (auction.status !== "ended") {
      throw new Error("Finish the auction before opening final teams.");
    }
    if (auction.finalizationOpen) {
      return;
    }
    trx.update(auctionRef, {
      finalizationOpen: true,
      updatedAt: serverTimestamp()
    });
  });
};

const maybeResolveLockedAuction = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  const auctionSnap = await getDoc(auctionRef);
  if (!auctionSnap.exists()) return;
  const auction = auctionSnap.data() as Auction;
  if (auction.status !== "live" || auction.isPaused || !auction.activeBid) return;

  const queue = buildPlayerQueue(auction.categories);
  const { slot: currentPlayer } = getActiveSlot(auction, queue);
  if (!currentPlayer) return;

  const minimumBid = Math.max(currentPlayer.basePrice, auction.activeBid.amount + 1);
  const participantsSnap = await getDocs(collection(auctionRef, "participants"));
  const contenders = participantsSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Participant, "id">)
    }))
    .filter((participant) => participant.id !== auction.activeBid?.bidderId)
    .some((participant) => participantCanCoverBid(participant, minimumBid));

  if (!contenders) {
    await finalizeCurrentPlayer({ auctionId });
  }
};

interface RelistInput {
  auctionId: string;
  completedPlayerId: string;
}

export const relistUnsoldPlayer = async (input: RelistInput) => {
  const { auctionId, completedPlayerId } = input;
  const auctionRef = doc(db, "auctions", auctionId);
  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    const entry = (auction.completedPlayers ?? []).find(
      (player) => player.id === completedPlayerId
    );
    if (!entry || entry.result !== "unsold") {
      throw new Error("Player not available for re-auction.");
    }

    trx.update(auctionRef, {
      status: "live",
      manualPlayer: {
        key: `manual-${entry.id}-${Date.now()}`,
        name: entry.playerName,
        categoryLabel: entry.categoryLabel,
        basePrice: entry.basePrice,
        sourceId: entry.id
      },
      manualSourceId: entry.id,
      countdownEndsAt: Timestamp.fromMillis(Date.now() + START_TIMER_MS),
      countdownDuration: START_TIMER_MS,
      activeBid: null,
      skipVotes: [],
      isPaused: false,
      pausedRemainingMs: null,
      updatedAt: serverTimestamp()
    });
  });
};

interface RankingInput {
  auctionId: string;
  clientId: string;
  rankingOrder: string[];
}

export const submitRanking = async (input: RankingInput) => {
  const { auctionId, clientId, rankingOrder } = input;
  const auctionRef = doc(db, "auctions", auctionId);
  const participantRef = doc(collection(auctionRef, "participants"), clientId);

  await runTransaction(db, async (trx) => {
    const auctionSnap = await trx.get(auctionRef);
    if (!auctionSnap.exists()) throw new Error("Auction not found.");
    const auction = auctionSnap.data() as Auction;
    const totalPlayers = auction.participantCount;

    const maxPoints = Math.max(totalPlayers - 1, 1);
    const rankings: Record<string, number> = {};
    rankingOrder.forEach((participantId, index) => {
      rankings[participantId] = Math.max(maxPoints - index, 1);
    });

    trx.update(participantRef, {
      rankings,
      rankingSubmitted: true
    });
  });
};

export const finalizeResults = async (auctionId: string) => {
  const auctionRef = doc(db, "auctions", auctionId);
  const auctionSnap = await getDoc(auctionRef);
  if (!auctionSnap.exists()) throw new Error("Auction not found.");
  const auction = auctionSnap.data() as Auction;
  if (auction.status !== "ranking") {
    return;
  }

  const participantsSnap = await getDocs(collection(auctionRef, "participants"));
  const participants: Participant[] = participantsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Participant, "id">)
  }));

  const scoreBoard: Record<string, number> = {};
  participants.forEach((participant) => {
    if (!participant.rankings) return;
    Object.entries(participant.rankings).forEach(([targetId, points]) => {
      scoreBoard[targetId] = (scoreBoard[targetId] ?? 0) + points;
    });
  });

  const results = participants
    .map((participant) => ({
      participantId: participant.id,
      name: participant.name,
      points: scoreBoard[participant.id] ?? 0,
      rosterCount: participant.finalRoster?.length ?? participant.roster?.length ?? 0,
      budgetRemaining: participant.budgetRemaining
    }))
    .sort((a, b) => b.points - a.points)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  await updateDoc(auctionRef, {
    status: "results",
    results,
    updatedAt: serverTimestamp()
  });
};

export const markAuctionAsRanking = async (auctionId: string) => {
  await updateDoc(doc(db, "auctions", auctionId), {
    status: "ranking",
    finalizationOpen: false,
    updatedAt: serverTimestamp()
  });
};
