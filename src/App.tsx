import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from "firebase/firestore";
import { db } from "./firebase";
import { useClientId } from "./hooks/useClientId";
import { useAuctionData } from "./hooks/useAuctionData";
import { useCountdown } from "./hooks/useCountdown";
import { formatCurrency, formatTimer } from "./utils/format";
import { buildPlayerQueue } from "./utils/players";
import type { Auction, Participant, CompletedPlayerEntry } from "./types";
import {
  createAuction,
  finalizeCurrentPlayer,
  finalizeResults,
  findAuctionByName,
  joinAuction,
  markAuctionAsRanking,
  pauseAuction,
  placeBid,
  relistUnsoldPlayer,
  resumeAuction,
  skipPlayer,
  startAuction,
  submitRanking,
  submitTeam
} from "./services/auctionService";

type ViewMode =
  | "landing"
  | "create"
  | "join"
  | "lobby"
  | "auction"
  | "post"
  | "ranking"
  | "results";

interface ToastState {
  type: "success" | "error";
  text: string;
}

interface CategoryFormState {
  id: string;
  label: "A" | "B" | "C" | "D" | "E";
  basePrice: number;
  playersText: string;
}

const CATEGORY_LABELS: CategoryFormState["label"][] = [
  "A",
  "B",
  "C",
  "D",
  "E"
];

const usePublicAuctions = () => {
  const [publicAuctions, setPublicAuctions] = useState<Auction[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "auctions"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      limit(12)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows: Auction[] = [];
      snapshot.forEach((docSnap) =>
        rows.push({ id: docSnap.id, ...(docSnap.data() as Omit<Auction, "id">) })
      );
      setPublicAuctions(rows);
    });

    return () => unsubscribe();
  }, []);

  return publicAuctions;
};

const App = () => {
  const clientId = useClientId();
  const [view, setView] = useState<ViewMode>("landing");
  const [activeAuctionId, setActiveAuctionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("saifur-auction:last");
  });
  const { auction, participants, loading } = useAuctionData(activeAuctionId);
  const selfParticipant = useMemo(
    () => participants.find((p) => p.id === clientId) ?? null,
    [participants, clientId]
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const publicAuctions = usePublicAuctions();

  const notify = (type: ToastState["type"], text: string) => {
    setToast({ type, text });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeAuctionId) {
      window.localStorage.setItem("saifur-auction:last", activeAuctionId);
    } else {
      window.localStorage.removeItem("saifur-auction:last");
    }
  }, [activeAuctionId]);

  useEffect(() => {
    if (!auction) return;
    const stageMap: Record<Auction["status"], ViewMode> = {
      lobby: "lobby",
      live: "auction",
      ended: "post",
      ranking: "ranking",
      results: "results"
    };
    setView((prev) => {
      if (prev === "create" || prev === "join") return prev;
      return stageMap[auction.status];
    });
  }, [auction?.status]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useAdminAutomation(auction, participants, selfParticipant, notify);

  const handleCreated = (newAuctionId: string) => {
    setActiveAuctionId(newAuctionId);
    setView("lobby");
  };

  const handleJoined = (targetAuctionId: string) => {
    setActiveAuctionId(targetAuctionId);
    setView("lobby");
  };

  const handleLeaveSession = () => {
    setActiveAuctionId(null);
    setView("landing");
  };

  const renderView = () => {
    if (!auction && ["lobby", "auction", "post", "ranking", "results"].includes(view)) {
      return (
        <LandingHero
          hasActiveAuction={false}
          onCreate={() => setView("create")}
          onJoin={() => setView("join")}
          onResume={null}
        />
      );
    }

    switch (view) {
      case "landing":
        return (
          <LandingHero
            hasActiveAuction={Boolean(activeAuctionId)}
            onCreate={() => setView("create")}
            onJoin={() => setView("join")}
            onResume={
              activeAuctionId
                ? () => setView(auction ? "lobby" : "landing")
                : null
            }
          />
        );
      case "create":
        return (
          <CreateAuctionForm
            clientId={clientId}
            onBack={() => setView("landing")}
            onCreated={handleCreated}
            notify={notify}
          />
        );
      case "join":
        return (
          <JoinAuctionPanel
            clientId={clientId}
            publicAuctions={publicAuctions}
            onBack={() => setView("landing")}
            onJoined={handleJoined}
            notify={notify}
          />
        );
      case "lobby":
        return (
          auction && (
            <LobbyView
              auction={auction}
              participants={participants}
              selfParticipant={selfParticipant}
              notify={notify}
            />
          )
        );
      case "auction":
        return (
          auction && (
            <LiveAuctionBoard
              auction={auction}
              participants={participants}
              selfParticipant={selfParticipant}
              notify={notify}
            />
          )
        );
      case "post":
        return (
          auction && (
            <TeamConfirmationPanel
              auction={auction}
              participants={participants}
              selfParticipant={selfParticipant}
              notify={notify}
            />
          )
        );
      case "ranking":
        return (
          auction && (
            <RankingPanel
              auction={auction}
              participants={participants}
              selfParticipant={selfParticipant}
              notify={notify}
            />
          )
        );
      case "results":
        return auction && <ResultsBoard auction={auction} participants={participants} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-root">
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.text}</span>
        </div>
      )}
      <header className="hero-header">
        <div>
          <h1 className="hero-title">Midnight Draft Arena</h1>
          <p className="hero-subtitle">The night begins when the auction starts.</p>
        </div>
        {auction && (
          <div className="session-chip">
            <div>
              <p className="chip-label">Active auction</p>
              <p className="chip-value">
                {auction.name} -{" "}
                <span className="status-pill">{auction.status.toUpperCase()}</span>
              </p>
            </div>
            <button className="btn text" onClick={handleLeaveSession}>
              Leave
            </button>
          </div>
        )}
      </header>
      <main className="stage-panel">{loading ? <p>Loading...</p> : renderView()}</main>
      <footer className="app-footer">© Saifur Rahman Mehedi</footer>
    </div>
  );
};

const LandingHero = ({
  hasActiveAuction,
  onCreate,
  onJoin,
  onResume
}: {
  hasActiveAuction: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onResume: (() => void) | null;
}) => (
  <section className="landing-card">
    <h2>Let's play auction.</h2>
    <p>
      Start a lobby, share the password, and run a live late-night auction with your friends.
    </p>
    <div className="landing-actions">
      <button className="btn accent" onClick={onCreate}>
        Create auction
      </button>
      <button className="btn outline" onClick={onJoin}>
        Join auction
      </button>
    </div>
    {hasActiveAuction && onResume && (
      <button className="btn text" onClick={onResume}>
        Resume last lobby
      </button>
    )}
  </section>
);
const CreateAuctionForm = ({
  clientId,
  onBack,
  onCreated,
  notify
}: {
  clientId: string;
  onBack: () => void;
  onCreated: (auctionId: string) => void;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const [adminName, setAdminName] = useState("");
  const [auctionName, setAuctionName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(6);
  const [playersPerTeam, setPlayersPerTeam] = useState(11);
  const [budgetPerPlayer, setBudgetPerPlayer] = useState(100);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [password, setPassword] = useState("");
  const [categories, setCategories] = useState<CategoryFormState[]>([
    {
      id: crypto.randomUUID(),
      label: "A",
      basePrice: 10,
      playersText: ""
    }
  ]);
  const [saving, setSaving] = useState(false);

  const addCategory = () => {
    const remaining = CATEGORY_LABELS.filter(
      (label) => !categories.some((category) => category.label === label)
    );
    if (!remaining.length) return;

    setCategories((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: remaining[0],
        basePrice: prev.length ? prev[prev.length - 1].basePrice : 10,
        playersText: ""
      }
    ]);
  };

  const updateCategory = (id: string, updates: Partial<CategoryFormState>) => {
    setCategories((prev) =>
      prev.map((category) => (category.id === id ? { ...category, ...updates } : category))
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      notify("error", "Set a password so friends can join safely.");
      return;
    }

    setSaving(true);
    try {
      const preparedCategories = categories
        .map((category) => ({
          id: category.id,
          label: category.label,
          basePrice: Number(category.basePrice),
          players: category.playersText
            .split(",")
            .map((player) => player.trim())
            .filter(Boolean)
        }))
        .filter((category) => category.players.length);

      const newAuctionId = await createAuction({
        auctionName: auctionName.slice(0, 20),
        adminName: adminName || "Admin",
        clientId,
        maxParticipants,
        playersPerTeam,
        budgetPerPlayer,
        visibility,
        password: password.trim(),
        categories: preparedCategories
      });
      notify("success", "Auction created. Share the code + password to start inviting.");
      onCreated(newAuctionId);
    } catch (error) {
      notify("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel-card">
      <button className="btn text" onClick={onBack}>
        Back
      </button>
      <h2>Create Auction</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Admin name (you'll play too)
          <input
            type="text"
            value={adminName}
            maxLength={10}
            onChange={(event) => setAdminName(event.target.value)}
            required
          />
        </label>
        <label>
          Auction name (max 20 chars)
          <input
            type="text"
            value={auctionName}
            maxLength={20}
            onChange={(event) => setAuctionName(event.target.value)}
            required
          />
        </label>
        <label>
          How many friends will play?
          <input
            type="number"
            min={2}
            max={20}
            value={maxParticipants}
            onChange={(event) => setMaxParticipants(Number(event.target.value))}
            required
          />
        </label>
        <label>
          Players per team
          <input
            type="number"
            min={1}
            max={20}
            value={playersPerTeam}
            onChange={(event) => setPlayersPerTeam(Number(event.target.value))}
            required
          />
        </label>
        <label>
          Budget per player (USD)
          <input
            type="number"
            min={10}
            value={budgetPerPlayer}
            onChange={(event) => setBudgetPerPlayer(Number(event.target.value))}
            required
          />
        </label>
        <fieldset>
          <legend>Visibility</legend>
          <label className="radio-pill">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
            />
            Public (show in lobby list)
          </label>
          <label className="radio-pill">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            Private (only password holders)
          </label>
        </fieldset>
        <label>
          Password (share with friends)
          <input
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="category-section">
          <h3>Categories & Players</h3>
          {categories.map((category) => (
            <div key={category.id} className="category-card">
              <div className="category-header">
                <strong>Category {category.label}</strong>
                <label>
                  Base price (USD)
                  <input
                    type="number"
                    min={1}
                    value={category.basePrice}
                    onChange={(event) =>
                      updateCategory(category.id, {
                        basePrice: Number(event.target.value)
                      })
                    }
                  />
                </label>
              </div>
              <textarea
                value={category.playersText}
                onChange={(event) =>
                  updateCategory(category.id, { playersText: event.target.value })
                }
                placeholder="Messi, Ronaldo, Neymar, Mbappe"
              />
            </div>
          ))}
          {categories.length < CATEGORY_LABELS.length && (
            <button type="button" className="btn outline" onClick={addCategory}>
              Add new category (B-E)
            </button>
          )}
        </div>
        <button className="btn accent" disabled={saving}>
          {saving ? "Creating..." : "Create Auction"}
        </button>
      </form>
    </section>
  );
};

const JoinAuctionPanel = ({
  clientId,
  publicAuctions,
  onBack,
  onJoined,
  notify
}: {
  clientId: string;
  publicAuctions: Auction[];
  onBack: () => void;
  onJoined: (auctionId: string) => void;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const [name, setName] = useState("");
  const [auctionName, setAuctionName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const lookup = await findAuctionByName(auctionName);
      if (!lookup) {
        notify("error", "Auction name not found.");
        setPending(false);
        return;
      }
      await joinAuction({
        auctionId: lookup.id,
        password: password.trim(),
        clientId,
        displayName: name
      });
      notify("success", "Welcome to the lobby!");
      onJoined(lookup.id);
    } catch (error) {
      notify("error", (error as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel-card join-panel">
      <button className="btn text" onClick={onBack}>
        Back
      </button>
      <div className="join-grid">
        <form onSubmit={handleJoin} className="form-grid">
          <h3>Join with password</h3>
          <label>
            Your name (10 char max)
            <input
              type="text"
              value={name}
              maxLength={10}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Auction name
            <input
              type="text"
              value={auctionName}
              onChange={(event) => setAuctionName(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="btn accent" disabled={pending}>
            {pending ? "Joining..." : "Join auction"}
          </button>
        </form>
        <div className="public-list">
          <h3>Public auctions live now</h3>
          {!publicAuctions.length && <p>No public auctions yet.</p>}
          <ul>
            {publicAuctions.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.participantCount}/{item.maxParticipants} players -{" "}
                    {item.categories.length} categories
                  </p>
                </div>
                <button
                  className="btn outline"
                  onClick={() => {
                    setAuctionName(item.name);
                    setPassword("");
                    notify("success", `Selected ${item.name}. Enter the password to join.`);
                  }}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

const LobbyView = ({
  auction,
  participants,
  selfParticipant,
  notify
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const isAdmin = selfParticipant?.role === "admin";
  const queuedPlayers = useMemo(() => buildPlayerQueue(auction.categories), [auction.categories]);
  const handleStart = async () => {
    try {
      await startAuction(auction.id);
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  return (
    <section className="panel-card lobby">
        <div className="lobby-header">
          <div className="lobby-title-row">
            <p className="eyebrow">Lobby</p>
            <div className="title-with-badge">
              <h2>{auction.name}</h2>
              <span className="join-pill">
                <span>Joined</span>
                <strong>
                  {auction.participantCount}/{auction.maxParticipants}
                </strong>
              </span>
            </div>
          </div>
        <div className="share-block">
          <div className="password-row">
            <div>
              <p className="muted-label">Share this password</p>
              <div className="password-chip">
                <strong>{auction.password}</strong>
                <button
                  className="btn text"
                  onClick={() => {
                    navigator.clipboard.writeText(auction.password);
                    notify("success", "Password copied");
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
            {isAdmin && (
              <button className="btn accent" onClick={handleStart}>
                Start auction
              </button>
            )}
          </div>
          {!isAdmin && <p className="muted-label">Waiting for admin to start</p>}
        </div>
      </div>
      <div className="lobby-body">
        <div>
          <h3>Players in lobby</h3>
          <ul className="participant-list lobby-list">
            {participants.map((player) => (
              <li key={player.id}>
                <div className="name-stack">
                  <strong>{player.name}</strong>
                  {player.role === "admin" && <span className="mini-pill">Admin</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="info-grid">
          <InfoStat label="Total budget" value={formatCurrency(auction.budgetPerPlayer)} />
          <InfoStat label="Players per team" value={`${auction.playersPerTeam}`} />
          <InfoStat label="Categories loaded" value={`${auction.categories.length}`} />
          <InfoStat label="Players queued" value={`${auction.totalPlayers}`} />
        </div>
      </div>
      {queuedPlayers.length > 0 && (
        <div className="player-order-card lobby-players">
          <h3>Player list</h3>
          <p className="muted-label">Review the list before the auction starts.</p>
          <div className="player-table player-table-head">
            <span>Name</span>
            <span>Base price</span>
          </div>
          <ol className="player-order-list table-style">
            {queuedPlayers.map((slot, index) => (
              <li key={slot.key} className="player-table">
                <strong>
                  {index + 1}. {slot.name}
                </strong>
                <span>{formatCurrency(slot.basePrice)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

const InfoStat = ({ label, value }: { label: string; value: string }) => (
  <div className="info-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const LiveAuctionBoard = ({
  auction,
  participants,
  selfParticipant,
  notify
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const queue = useMemo(() => buildPlayerQueue(auction.categories), [auction.categories]);
  const activeSlot = auction.manualPlayer ?? queue[auction.currentPlayerIndex] ?? null;
  const isManual = Boolean(auction.manualPlayer);
  const { msRemaining } = useCountdown(auction.countdownEndsAt);
  const [bidValue, setBidValue] = useState(() =>
    activeSlot
      ? Math.max(activeSlot.basePrice, (auction.activeBid?.amount ?? activeSlot.basePrice) + 1)
      : 0
  );
  const [voiceConnected, setVoiceConnected] = useState(false);

  useEffect(() => {
    if (!activeSlot) return;
    const nextBid = Math.max(
      activeSlot.basePrice,
      (auction.activeBid?.amount ?? activeSlot.basePrice) + 1
    );
    setBidValue(nextBid);
  }, [activeSlot?.key, auction.activeBid?.amount, auction.activeBid?.bidderId]);

  const isAdmin = selfParticipant?.role === "admin";
  const highestBidderId = auction.activeBid?.bidderId;
  const isHighestBidder = Boolean(highestBidderId && highestBidderId === selfParticipant?.id);
  const skipVotes = auction.skipVotes ?? [];
  const passes = auction.activeBid
    ? skipVotes.filter((id) => id !== highestBidderId).length
    : skipVotes.length;
  const passesNeeded = auction.activeBid
    ? Math.max(auction.participantCount - 1, 1)
    : Math.max(auction.participantCount, 1);
  const passLabel = auction.activeBid ? "Pass" : "Skip";
  const passCountdown = Math.max(passesNeeded - passes, 0);

  const completedMap = useMemo(() => {
    const map = new Map<string, CompletedPlayerEntry>();
    (auction.completedPlayers ?? []).forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [auction.completedPlayers]);

  const playerLedger = useMemo(
    () =>
      queue.map((slot, index) => {
        const entry = completedMap.get(slot.key);
        if (index < auction.currentPlayerIndex) {
          const soldText =
            entry?.result === "sold"
              ? `Sold to ${entry?.winnerName ?? "Unknown"} (${formatCurrency(entry?.finalBid ?? 0)})`
              : "Unsold";
          return { slot, status: soldText, tone: entry?.result === "sold" ? "sold" : "unsold" };
        }
        if (index === auction.currentPlayerIndex && !isManual) {
          return {
            slot,
            status: auction.isPaused ? "Paused" : "Live now",
            tone: "live"
          };
        }
        return {
          slot,
          status: index === auction.currentPlayerIndex + 1 ? "Next up" : "Queued",
          tone: "upcoming"
        };
      }),
    [queue, auction.currentPlayerIndex, completedMap, auction.isPaused, isManual]
  );

  const handleBid = async () => {
    if (!selfParticipant || !activeSlot || auction.isPaused) {
      return;
    }
    try {
      await placeBid({
        auctionId: auction.id,
        clientId: selfParticipant.id,
        bidderName: selfParticipant.name,
        amount: Number(bidValue)
      });
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const handlePass = async () => {
    if (!selfParticipant || !activeSlot || auction.isPaused) return;
    try {
      await skipPlayer({ auctionId: auction.id, clientId: selfParticipant.id });
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const toggleVoiceChannel = () => {
    setVoiceConnected((prev) => !prev);
    notify("success", !voiceConnected ? "Joined voice chat." : "Left voice chat.");
  };

  const handlePauseToggle = async () => {
    if (!isAdmin) return;
    try {
      if (auction.isPaused) {
        await resumeAuction(auction.id);
      } else {
        await pauseAuction(auction.id);
      }
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const handleManualResolve = async () => {
    if (!isAdmin) return;
    try {
      await finalizeCurrentPlayer({
        auctionId: auction.id,
        forceUnsold: !auction.activeBid
      });
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const handleRelist = async (playerId: string) => {
    try {
      await relistUnsoldPlayer({ auctionId: auction.id, completedPlayerId: playerId });
      notify("success", "Player moved back to the block.");
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const myRoster = selfParticipant?.roster ?? [];
  const otherPlayers = participants.filter((player) => player.id !== selfParticipant?.id);
  const unsoldPlayers = useMemo(
    () => (auction.completedPlayers ?? []).filter((entry) => entry.result === "unsold"),
    [auction.completedPlayers]
  );

  const timerLabel =
    auction.isPaused || !activeSlot
      ? auction.isPaused
        ? "PAUSED"
        : "--:--"
      : formatTimer(msRemaining);

  const bidDisabled = !selfParticipant || !activeSlot || auction.isPaused || isHighestBidder;

  return (
    <section className="panel-card live-board">
      <div className="deck-card">
        <div className="deck-head">
          <div>
            <p className="eyebrow">On deck</p>
            <h2>{activeSlot ? activeSlot.name : "No players left"}</h2>
            {activeSlot && (
              <p>
                Category {activeSlot.categoryLabel} - Base {formatCurrency(activeSlot.basePrice)}
              </p>
            )}
            {isManual && <p className="muted-label">Re-auctioning an unsold player</p>}
          </div>
          <div className="deck-head-right">
            <div className="timer-display">
              <span>Time left</span>
              <strong>{timerLabel}</strong>
            </div>
            <button
              className={`voice-toggle ${voiceConnected ? "active" : ""}`}
              onClick={toggleVoiceChannel}
            >
              {voiceConnected ? "Leave voice" : "Join voice"}
            </button>
          </div>
        </div>
        {isAdmin && (
          <div className="admin-controls">
            <button className="btn ghost" onClick={handlePauseToggle}>
              {auction.isPaused ? "Resume auction" : "Pause auction"}
            </button>
            <button className="btn text" onClick={handleManualResolve}>
              Resolve player
            </button>
          </div>
        )}
      </div>
      <div className="bid-card">
        <div className="bid-header">
          <h3>Current bid</h3>
          {auction.activeBid ? (
            <p>
              {formatCurrency(auction.activeBid.amount)} by {auction.activeBid.bidderName}
            </p>
          ) : (
            <p>No bids yet</p>
          )}
        </div>
        <div className="bid-inputs">
          <input
            type="number"
            min={activeSlot?.basePrice ?? 0}
            value={activeSlot ? bidValue : 0}
            disabled={bidDisabled}
            onChange={(event) => setBidValue(Number(event.target.value))}
          />
          <button className="btn accent" disabled={bidDisabled} onClick={handleBid}>
            Place bid
          </button>
          <button
            className="btn ghost"
            disabled={bidDisabled}
            onClick={() => setBidValue((value) => value + 1)}
          >
            +1
          </button>
          <button
            className="btn outline"
            disabled={!selfParticipant || !activeSlot || auction.isPaused || isHighestBidder}
            onClick={handlePass}
          >
            {passLabel}
          </button>
        </div>
        <p className="muted-label">
          {passCountdown === 0
            ? "Waiting for confirmation..."
            : `${passCountdown} more ${passLabel.toLowerCase()}${passCountdown === 1 ? "" : "s"} needed`}
        </p>
        {isHighestBidder && (
          <p className="muted-label">You already hold the top bid. Let someone else raise.</p>
        )}
        {auction.isPaused && <p className="muted-label">Auction is paused.</p>}
      </div>
      <div className="roster-grid live-roster">
        <div className="roster-card">
          <h3>My bench</h3>
          <p>
            {selfParticipant?.name ?? "You"} - {formatCurrency(selfParticipant?.budgetRemaining ?? 0)} left -{" "}
            {selfParticipant?.playersNeeded ?? auction.playersPerTeam} slots
          </p>
          <ul className="roster-list">
            {myRoster.length === 0 && <li>No players yet.</li>}
            {myRoster.map((player, index) => (
              <li key={`${player.playerName}-${index}`}>
                <span>{player.playerName}</span>
                <span>
                  Cat {player.categoryLabel} - {formatCurrency(player.price)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="roster-card">
          <h3>Other coaches</h3>
          <ul className="other-coaches">
            {otherPlayers.map((player) => (
              <li key={player.id}>
                <div className="name-stack">
                  <strong>{player.name}</strong>
                </div>
                <div className="pill-row">
                  <span>{formatCurrency(player.budgetRemaining)} left</span>
                  <span>{player.playersNeeded} slots</span>
                </div>
                <ul className="mini-roster">
                  {player.roster.map((entry, idx) => (
                    <li key={`${entry.playerName}-${idx}`}>
                      {entry.playerName} - {formatCurrency(entry.price)}
                    </li>
                  ))}
                  {player.roster.length === 0 && <li>No picks yet.</li>}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="player-order-card">
        <h3>Full player list</h3>
        <p className="muted-label">Check categories before the auction begins.</p>
        <ol className="player-order-list">
          {playerLedger.map((entry, index) => (
            <li key={entry.slot.key} className={entry.tone}>
              <div>
                <strong>
                  {index + 1}. {entry.slot.name}
                </strong>
                <p>
                  Cat {entry.slot.categoryLabel} - Base {formatCurrency(entry.slot.basePrice)}
                </p>
              </div>
              <span>{entry.status}</span>
            </li>
          ))}
        </ol>
      </div>
      {isAdmin && unsoldPlayers.length > 0 && (
        <div className="player-order-card">
          <h3>Unsold players</h3>
          <p className="muted-label">Bring someone back for a re-auction.</p>
          <ul className="participant-list compact">
            {unsoldPlayers.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.playerName}</strong>
                  <p>Cat {entry.categoryLabel}</p>
                </div>
                <button
                  className="btn outline"
                  disabled={Boolean(auction.manualPlayer)}
                  onClick={() => handleRelist(entry.id)}
                >
                  Re-open
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
const TeamConfirmationPanel = ({
  auction,
  participants,
  selfParticipant,
  notify
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const roster = selfParticipant?.roster ?? [];
  const finalRoster = selfParticipant?.finalRoster ?? [];
  const limit = auction.playersPerTeam;
  const rosterWithKeys = useMemo(
    () => roster.map((player, index) => ({ ...player, key: `${player.playerName}-${index}` })),
    [roster]
  );
  const initialSelection = useMemo(
    () => rosterWithKeys.slice(0, limit).map((player) => player.key),
    [rosterWithKeys, limit]
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialSelection);
  const [tagMap, setTagMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedKeys(initialSelection);
  }, [initialSelection.join("|")]);

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      }
      if (prev.length >= limit) {
        notify("error", `You already picked ${limit} players.`);
        return prev;
      }
      return [...prev, key];
    });
  };

  const moveSelection = (key: string, direction: -1 | 1) => {
    setSelectedKeys((prev) => {
      const index = prev.findIndex((item) => item === key);
      if (index === -1) return prev;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleTagChange = (key: string, value: string) => {
    setTagMap((prev) => ({ ...prev, [key]: value.slice(0, 3).toUpperCase() }));
  };

  const handleSubmit = async () => {
    if (!selfParticipant) return;
    if (selectedKeys.length !== limit) {
      notify("error", `Select exactly ${limit} players before submitting.`);
      return;
    }
    const lineup = selectedKeys
      .map((key) => rosterWithKeys.find((player) => player.key === key))
      .filter(Boolean)
      .map((player) => ({
        playerName: player!.playerName,
        categoryLabel: player!.categoryLabel,
        price: player!.price,
        tag: tagMap[player!.key] ?? ""
      }));

    try {
      await submitTeam({
        auctionId: auction.id,
        clientId: selfParticipant.id,
        finalRoster: lineup
      });
      notify("success", "Final squad locked in.");
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const otherPlayers = participants.filter((player) => player.id !== selfParticipant?.id);

  return (
    <section className="panel-card">
      {finalRoster.length > 0 ? (
        <>
          <h2>Your final squad</h2>
          <ol className="ranking-list">
            {finalRoster.map((player, index) => (
              <li key={`${player.playerName}-${index}`}>
                <div>
                  <strong>
                    #{index + 1} {player.playerName}
                  </strong>
                  <p>
                    Cat {player.categoryLabel} - {formatCurrency(player.price)}
                  </p>
                </div>
                {player.tag && <span className="mini-pill">{player.tag}</span>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <h2>Choose your final {limit}</h2>
          <p>Select players, set 3-letter tags, and reorder them before submitting.</p>
          <div className="roster-grid">
            <div>
              <h3>Available</h3>
              <p className="muted-label">
                {selectedKeys.length}/{limit} selected
              </p>
              <ul className="participant-list">
                {rosterWithKeys.map((player) => {
                  const checked = selectedKeys.includes(player.key);
                  const disabled = !checked && selectedKeys.length >= limit;
                  return (
                    <li key={player.key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleSelection(player.key)}
                        />{" "}
                        {player.playerName} - {formatCurrency(player.price)}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Selected lineup</h3>
              {selectedKeys.length === 0 && <p className="muted-label">Pick players to build your lineup.</p>}
              <ol className="ranking-list">
                {selectedKeys.map((key, index) => {
                  const player = rosterWithKeys.find((item) => item.key === key);
                  if (!player) return null;
                  return (
                    <li key={key}>
                      <div>
                        <strong>
                          #{index + 1} {player.playerName}
                        </strong>
                        <p>
                          Cat {player.categoryLabel} - {formatCurrency(player.price)}
                        </p>
                      </div>
                      <div className="rank-actions">
                        <input
                          type="text"
                          maxLength={3}
                          value={tagMap[key] ?? ""}
                          onChange={(event) => handleTagChange(key, event.target.value)}
                          placeholder="TAG"
                        />
                        <button className="btn ghost" onClick={() => moveSelection(key, -1)}>
                          Up
                        </button>
                        <button className="btn ghost" onClick={() => moveSelection(key, 1)}>
                          Down
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button className="btn accent" disabled={selfParticipant?.hasSubmittedTeam} onClick={handleSubmit}>
                {selfParticipant?.hasSubmittedTeam ? "Submitted" : "Submit team"}
              </button>
            </div>
          </div>
        </>
      )}
      <div className="roster-card" style={{ marginTop: "1.5rem" }}>
        <h3>Others</h3>
        <ul className="participant-list">
          {otherPlayers.map((player) => (
            <li key={player.id}>
              <div>
                <strong>{player.name}</strong>
                <p>
                  {player.finalRoster?.length ?? player.roster.length} picks{" "}
                  {player.hasSubmittedTeam ? "(Submitted)" : ""}
                </p>
              </div>
              <span>{player.hasSubmittedTeam ? "Locked" : "Pending"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const RankingPanel = ({
  auction,
  participants,
  selfParticipant,
  notify
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
}) => {
  const others = participants.filter((player) => player.id !== selfParticipant?.id);
  const [order, setOrder] = useState(others.map((player) => player.id));

  useEffect(() => {
    setOrder(others.map((player) => player.id));
  }, [others.map((player) => player.id).join(":")]);

  const move = (index: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selfParticipant) return;
    try {
      await submitRanking({
        auctionId: auction.id,
        clientId: selfParticipant.id,
        rankingOrder: order
      });
      notify("success", "Ranking submitted.");
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  return (
    <section className="panel-card">
      <h2>Rank everyone else</h2>
      <p>Move cards to reorder. Top pick earns the most points.</p>
      <ol className="ranking-list">
        {order.map((participantId, index) => {
          const target = participants.find((item) => item.id === participantId);
          if (!target) return null;
          const lineup =
            target.finalRoster && target.finalRoster.length ? target.finalRoster : target.roster;
          return (
            <li key={participantId}>
              <div>
                <strong>
                  #{index + 1} {target.name}
                </strong>
                <p>{formatCurrency(target.budgetRemaining)} left</p>
                <ul className="mini-roster">
                  {lineup.map((player, idx) => {
                    const tag = "tag" in player && player.tag ? ` (${player.tag})` : "";
                    return (
                      <li key={`${player.playerName}-${idx}`}>
                        {player.playerName}
                        {tag} - Cat {player.categoryLabel}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="rank-actions">
                <button className="btn ghost" onClick={() => move(index, -1)}>
                  Up
                </button>
                <button className="btn ghost" onClick={() => move(index, 1)}>
                  Down
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        className="btn accent"
        disabled={selfParticipant?.rankingSubmitted}
        onClick={handleSubmit}
      >
        {selfParticipant?.rankingSubmitted ? "Submitted" : "Submit ranking"}
      </button>
      <div className="ranking-status">
        <h3>Status</h3>
        <ul>
          {participants.map((player) => (
            <li key={player.id}>
              {player.name} -{" "}
              {player.id === selfParticipant?.id
                ? selfParticipant.rankingSubmitted
                  ? "Done"
                  : "Waiting on you"
                : player.rankingSubmitted
                ? "Submitted"
                : "Pending"}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const ResultsBoard = ({
  auction,
  participants
}: {
  auction: Auction;
  participants: Participant[];
}) => {
  const results = auction.results ?? [];

  return (
    <section className="panel-card">
      <h2>Final leaderboard</h2>
      {!results.length && <p>Waiting for admin to publish results...</p>}
      {results.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Points</th>
              <th>Roster</th>
              <th>Budget left</th>
            </tr>
          </thead>
          <tbody>
            {results.map((entry) => (
              <tr key={entry.participantId}>
                <td>#{entry.rank}</td>
                <td>{entry.name}</td>
                <td>{entry.points}</td>
                <td>{entry.rosterCount}</td>
                <td>{formatCurrency(entry.budgetRemaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="results-rosters">
        {participants.map((player) => {
          const lineup =
            player.finalRoster && player.finalRoster.length ? player.finalRoster : player.roster;
          return (
            <div key={player.id} className="roster-card">
              <h4>{player.name}</h4>
              <ul>
                {lineup.map((entry, index) => {
                  const tag = "tag" in entry && entry.tag ? ` (${entry.tag})` : "";
                  return (
                    <li key={`${entry.playerName}-${index}`}>
                      {entry.playerName}
                      {tag} - {formatCurrency(entry.price)} - Cat {entry.categoryLabel}
                    </li>
                  );
                })}
             </ul>
           </div>
         );
       })}
      </div>
    </section>
  );
};

const useAdminAutomation = (
  auction: Auction | null,
  participants: Participant[],
  selfParticipant: Participant | null,
  notify: (type: ToastState["type"], text: string) => void
) => {
  const isAdmin = selfParticipant?.role === "admin";
  const timerRef = useRef(false);
  const rankingTriggered = useRef(false);
  const resultsTriggered = useRef(false);

  useEffect(() => {
    if (!auction || auction.status !== "live" || !isAdmin) return;
    const interval = setInterval(() => {
      if (!auction.countdownEndsAt || timerRef.current) return;
      if (auction.countdownEndsAt.toMillis() <= Date.now()) {
        timerRef.current = true;
        finalizeCurrentPlayer({
          auctionId: auction.id,
          forceUnsold: !auction.activeBid
        })
          .catch((error) => notify("error", (error as Error).message))
          .finally(() => {
            timerRef.current = false;
          });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [auction, isAdmin, notify]);

  useEffect(() => {
    if (!auction || auction.status !== "ended" || !isAdmin) {
      rankingTriggered.current = false;
      return;
    }
    const everyoneSubmitted =
      participants.length > 0 &&
      participants.every((player) => player.hasSubmittedTeam);
    if (everyoneSubmitted && !rankingTriggered.current) {
      rankingTriggered.current = true;
      markAuctionAsRanking(auction.id).catch((error) =>
        notify("error", (error as Error).message)
      );
    }
  }, [auction, participants, isAdmin, notify]);

  useEffect(() => {
    if (!auction || auction.status !== "ranking" || !isAdmin) {
      resultsTriggered.current = false;
      return;
    }
    const everyoneRanked =
      participants.length > 0 &&
      participants.every((player) => player.rankingSubmitted);
    if (everyoneRanked && !resultsTriggered.current) {
      resultsTriggered.current = true;
      finalizeResults(auction.id).catch((error) =>
        notify("error", (error as Error).message)
      );
    }
  }, [auction, participants, isAdmin, notify]);
};

export default App;
