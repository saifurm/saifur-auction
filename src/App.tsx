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
import type { Auction, Participant } from "./types";
import {
  createAuction,
  finalizeCurrentPlayer,
  finalizeResults,
  findAuctionByName,
  joinAuction,
  markAuctionAsRanking,
  placeBid,
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
          <p className="eyebrow">Stanford × Harvard × Stony Brook inspired</p>
          <h1>Midnight Auction War Room</h1>
          <p className="lede">
            Blacked-out interface to protect your eyes, optimized for billion-dollar
            banter. Create a lobby, invite friends with a password, and let the bidding
            chaos begin.
          </p>
        </div>
        <div className="header-actions">
          {!["create", "join"].includes(view) && (
            <>
              <button className="btn primary" onClick={() => setView("create")}>
                Create Auction
              </button>
              <button className="btn ghost" onClick={() => setView("join")}>
                Join Auction
              </button>
            </>
          )}
          {auction && (
            <div className="session-chip">
              <div>
                <p className="chip-label">Active Auction</p>
                <p className="chip-value">
                  {auction.name} •{" "}
                  <span className="status-pill">{auction.status.toUpperCase()}</span>
                </p>
              </div>
              <button className="btn text" onClick={handleLeaveSession}>
                Leave
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="stage-panel">{loading ? <p>Loading...</p> : renderView()}</main>
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
    <h2>Let’s play auction.</h2>
    <p>
      Spin up a lobby, share the name + password with friends, and run the most dramatic
      player draft of the season.
    </p>
    <div className="landing-actions">
      <button className="btn accent" onClick={onCreate}>
        Create Auction
      </button>
      <button className="btn outline" onClick={onJoin}>
        Join Auction
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
        ← Back
      </button>
      <h2>Create Auction</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Admin name (you’ll play too)
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
                placeholder="Messi, Ronaldo, Neymar, Mbappé"
              />
            </div>
          ))}
          {categories.length < CATEGORY_LABELS.length && (
            <button type="button" className="btn outline" onClick={addCategory}>
              Add new category (B–E)
            </button>
          )}
        </div>
        <button className="btn accent" disabled={saving}>
          {saving ? "Creating…" : "Create Auction"}
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
        ← Back
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
            {pending ? "Joining…" : "Join Auction"}
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
                    {item.participantCount}/{item.maxParticipants} players ·{" "}
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
        <div>
          <p className="eyebrow">Lobby</p>
          <h2>{auction.name}</h2>
          <div className="tag-row">
            <span className="tag">{auction.visibility}</span>
            <span className="tag">Max {auction.maxParticipants} players</span>
            <span className="tag">{auction.playersPerTeam} roster slots</span>
          </div>
        </div>
        <div>
          <p>Share this password</p>
          <div className="password-chip">
            <strong>{auction.password}</strong>
            <button
              className="btn text"
              onClick={() => {
                navigator.clipboard.writeText(auction.password);
                notify("success", "Password copied.");
              }}
            >
              Copy
            </button>
          </div>
          {isAdmin ? (
            <button className="btn accent" onClick={handleStart}>
              Start Auction
            </button>
          ) : (
            <p>Waiting for admin to start…</p>
          )}
        </div>
      </div>
      <div className="lobby-body">
        <div>
          <h3>Players in lobby</h3>
          <ul className="participant-list">
            {participants.map((player) => (
              <li key={player.id}>
                <div>
                  <strong>{player.name}</strong>
                  <p>{player.role === "admin" ? "Admin" : "Player"}</p>
                </div>
                <span>
                  Budget {formatCurrency(player.budgetRemaining)} · Needs{" "}
                  {player.playersNeeded}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="info-grid">
          <InfoStat label="Total budget" value={formatCurrency(auction.budgetPerPlayer)} />
          <InfoStat label="Categories loaded" value={`${auction.categories.length}`} />
          <InfoStat label="Players queued" value={`${auction.totalPlayers}`} />
          <InfoStat label="Visibility" value={auction.visibility.toUpperCase()} />
        </div>
      </div>
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
  const currentPlayer = queue[auction.currentPlayerIndex] ?? null;
  const { msRemaining } = useCountdown(auction.countdownEndsAt);
  const [bidValue, setBidValue] = useState(() =>
    currentPlayer
      ? Math.max(
          currentPlayer.basePrice,
          (auction.activeBid?.amount ?? currentPlayer.basePrice) + 1
        )
      : 0
  );

  useEffect(() => {
    if (!currentPlayer) return;
    const nextBid = Math.max(
      currentPlayer.basePrice,
      (auction.activeBid?.amount ?? currentPlayer.basePrice) + 1
    );
    setBidValue(nextBid);
  }, [currentPlayer?.key, auction.activeBid?.amount, auction.activeBid?.bidderId]);

  const handleBid = async () => {
    if (!selfParticipant) {
      notify("error", "Join the lobby to bid.");
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

  const handleSkip = async () => {
    if (!selfParticipant) return;
    try {
      await skipPlayer({ auctionId: auction.id, clientId: selfParticipant.id });
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const handleManualResolve = async () => {
    try {
      await finalizeCurrentPlayer({
        auctionId: auction.id,
        forceUnsold: !auction.activeBid
      });
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const skipCount = auction.skipVotes?.length ?? 0;
  const completed = auction.completedPlayers ?? [];
  const totalPlayers = queue.length;
  const progress = Math.min(
    totalPlayers,
    Math.max(0, auction.currentPlayerIndex + (currentPlayer ? 1 : 0))
  );

  return (
    <section className="panel-card live-board">
      <div className="live-main">
        <div>
          <p className="eyebrow">On the block</p>
          <h2>{currentPlayer ? currentPlayer.name : "All players processed"}</h2>
          {currentPlayer && (
            <p>
              Category {currentPlayer.categoryLabel} · Base price{" "}
              {formatCurrency(currentPlayer.basePrice)}
            </p>
          )}
        </div>
        <div className="timer-display">
          <span>Time left</span>
          <strong>{formatTimer(msRemaining)}</strong>
        </div>
        {currentPlayer && (
          <div className="bid-panel">
            <div>
              <p>Current highest bid</p>
              {auction.activeBid ? (
                <strong>
                  {formatCurrency(auction.activeBid.amount)} by {auction.activeBid.bidderName}
                </strong>
              ) : (
                <strong>No bids yet (starts at {formatCurrency(currentPlayer.basePrice)})</strong>
              )}
            </div>
            <div className="bid-inputs">
              <input
                type="number"
                min={currentPlayer.basePrice}
                value={bidValue}
                onChange={(event) => setBidValue(Number(event.target.value))}
              />
              <button className="btn accent" onClick={handleBid}>
                Place bid
              </button>
              <button className="btn ghost" onClick={() => setBidValue((value) => value + 1)}>
                +1
              </button>
              <button className="btn outline" onClick={handleSkip}>
                Skip ({skipCount}/{auction.participantCount})
              </button>
            </div>
          </div>
        )}
        <div className="progress-bar">
          <div style={{ width: `${(progress / Math.max(totalPlayers, 1)) * 100}%` }} />
        </div>
        <p>
          Player {progress}/{totalPlayers}
        </p>
        <div className="completed-grid">
          <h3>Recent outcomes</h3>
          {completed.length === 0 && <p>No players sold yet.</p>}
          <ul>
            {completed.slice().reverse().map((entry) => (
              <li key={entry.id}>
                <strong>{entry.playerName}</strong>
                <span>Cat {entry.categoryLabel}</span>
                {entry.result === "sold" ? (
                  <p>
                    Sold to {entry.winnerName} for {formatCurrency(entry.finalBid ?? 0)}
                  </p>
                ) : (
                  <p>Unsold</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sidebar">
        <h3>Players</h3>
        <ul className="participant-list compact">
          {participants.map((player) => (
            <li key={player.id}>
              <div>
                <strong>{player.name}</strong>
                <p>{player.role === "admin" ? "Admin" : "Player"}</p>
              </div>
              <div>
                <span>{formatCurrency(player.budgetRemaining)}</span>
                <small>{player.playersNeeded} slots left</small>
              </div>
            </li>
          ))}
        </ul>
        {selfParticipant?.role === "admin" && (
          <button className="btn outline" onClick={handleManualResolve}>
            Force resolve current player
          </button>
        )}
      </div>
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
  const totalSpent = roster.reduce((sum, player) => sum + player.price, 0);

  const handleSubmit = async () => {
    if (!selfParticipant) return;
    try {
      await submitTeam(auction.id, selfParticipant.id);
      notify("success", "Team submitted.");
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  return (
    <section className="panel-card">
      <h2>Review your roster</h2>
      <div className="roster-grid">
        <div>
          <h3>{selfParticipant?.name || "My team"}</h3>
          <ul>
            {roster.map((player, index) => (
              <li key={`${player.playerName}-${index}`}>
                <span>{player.playerName}</span>
                <span>
                  Cat {player.categoryLabel} · {formatCurrency(player.price)}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Total spent {formatCurrency(totalSpent)} · Remaining{" "}
            {formatCurrency(selfParticipant?.budgetRemaining ?? 0)}
          </p>
          <button
            className="btn accent"
            disabled={selfParticipant?.hasSubmittedTeam}
            onClick={handleSubmit}
          >
            {selfParticipant?.hasSubmittedTeam ? "Submitted" : "Submit team"}
          </button>
        </div>
        <div>
          <h3>Everyone else</h3>
          <ul className="participant-list">
            {participants
              .filter((player) => player.id !== selfParticipant?.id)
              .map((player) => (
                <li key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <p>{player.roster.length} players</p>
                  </div>
                  <span>{player.hasSubmittedTeam ? "Submitted" : "Waiting"}</span>
                </li>
              ))}
          </ul>
        </div>
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
          return (
            <li key={participantId}>
              <div>
                <strong>
                  #{index + 1} {target.name}
                </strong>
                <p>
                  {target.roster.length} players · {formatCurrency(target.budgetRemaining)} left
                </p>
              </div>
              <div className="rank-actions">
                <button className="btn ghost" onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button className="btn ghost" onClick={() => move(index, 1)}>
                  ↓
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
              {player.name} –{" "}
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
      {!results.length && <p>Waiting for admin to publish results…</p>}
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
        {participants.map((player) => (
          <div key={player.id} className="roster-card">
            <h4>{player.name}</h4>
            <ul>
              {player.roster.map((entry, index) => (
                <li key={`${entry.playerName}-${index}`}>
                  {entry.playerName} – {formatCurrency(entry.price)} · Cat {entry.categoryLabel}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
