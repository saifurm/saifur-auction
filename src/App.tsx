import {
  useCallback,
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
import { useVoiceChannel } from "./hooks/useVoiceChannel";
import { getVoiceAudioContext } from "./services/audioEngine";
import { playAnnouncement } from "./services/voiceAnnouncer";
import type { VoiceStream } from "./hooks/useVoiceChannel";
import { formatCurrency, formatTimer } from "./utils/format";
import { buildPlayerQueue } from "./utils/players";
import { SOCCER_FORMATIONS, getFormationByCode } from "./utils/formations";
import type { Auction, Participant, CompletedPlayerEntry, SportMode, TaggedRosterEntry } from "./types";
import {
  createAuction,
  finalizeCurrentPlayer,
  finalizeResults,
  findAuctionByName,
  joinAuction,
  openFinalizationPhase,
  markAuctionAsRanking,
  pauseAuction,
  placeBid,
  incrementViewCount,
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
  basePriceInput: string;
  playersText: string;
}

interface VoiceButtonControl {
  connected: boolean;
  connecting: boolean;
  canToggle: boolean;
  toggle: () => void;
  stageLabel: string;
  mode: "talk" | "listen";
}

const CATEGORY_LABELS: CategoryFormState["label"][] = [
  "A",
  "B",
  "C",
  "D",
  "E"
];

const CRICKET_POSITIONS = [
  "Opener 1",
  "Opener 2",
  "One down",
  "Two down",
  "Three down",
  "Four down",
  "Five down",
  "Six down",
  "Seven down",
  "Eight down",
  "Nine down",
  "Ten down",
  "Eleven"
];

const EXTENDED_BENCH_POSITIONS = Array.from({ length: 12 }).map((_, idx) => ({
  id: `soccer-bench-${idx}`,
  label: `Bench ${idx + 1}`,
  x: 10 + ((idx % 5) * 18),
  y: 94 - Math.floor(idx / 5) * 3
}));

const extendSoccerSlots = (formation: ReturnType<typeof getFormationByCode>, limit: number) => {
  const slots = formation?.slots ?? [];
  if (limit <= slots.length) {
    return slots.slice(0, limit);
  }
  const extrasNeeded = limit - slots.length;
  return [...slots, ...EXTENDED_BENCH_POSITIONS.slice(0, extrasNeeded)];
};

type CustomSport = Exclude<SportMode, "cricket" | "soccer">;

interface SportSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

const CUSTOM_SPORT_PRESETS: Record<
  CustomSport,
  {
    displayLabel: string;
    background: string;
    formations: Array<{ code: string; label: string; slots: SportSlot[] }>;
  }
> = {
  basketball: {
    displayLabel: "Basketball lineup",
    background: "basketball",
    formations: [
      {
        code: "basketball-classic",
        label: "Classic 2-3",
        slots: [
          { id: "bb-pg", label: "Point Guard", x: 50, y: 82 },
          { id: "bb-sg", label: "Shooting Guard", x: 70, y: 65 },
          { id: "bb-sf", label: "Small Forward", x: 30, y: 65 },
          { id: "bb-pf", label: "Power Forward", x: 65, y: 45 },
          { id: "bb-c", label: "Center", x: 35, y: 45 }
        ]
      },
      {
        code: "basketball-stretch",
        label: "Stretch 4",
        slots: [
          { id: "bb2-pg", label: "Point Guard", x: 50, y: 82 },
          { id: "bb2-sg", label: "Wing", x: 75, y: 58 },
          { id: "bb2-sf", label: "Wing", x: 25, y: 58 },
          { id: "bb2-pf", label: "Stretch Forward", x: 70, y: 40 },
          { id: "bb2-c", label: "Mobile Center", x: 30, y: 40 }
        ]
      }
    ]
  },
  football: {
    displayLabel: "Football depth chart",
    background: "football",
    formations: [
      {
        code: "football-trips",
        label: "Trips Right",
        slots: [
          { id: "fb-qb", label: "QB", x: 50, y: 82 },
          { id: "fb-rb", label: "RB", x: 40, y: 68 },
          { id: "fb-wr1", label: "X WR", x: 15, y: 60 },
          { id: "fb-wr2", label: "Slot WR", x: 70, y: 55 },
          { id: "fb-wr3", label: "Z WR", x: 85, y: 60 },
          { id: "fb-te", label: "TE", x: 60, y: 58 },
          { id: "fb-ol1", label: "LT", x: 30, y: 48 },
          { id: "fb-ol2", label: "LG", x: 45, y: 48 },
          { id: "fb-ol3", label: "C", x: 60, y: 48 },
          { id: "fb-ol4", label: "RG", x: 75, y: 48 },
          { id: "fb-ol5", label: "RT", x: 90, y: 48 }
        ]
      },
      {
        code: "football-i",
        label: "I-Formation",
        slots: [
          { id: "fb2-qb", label: "QB", x: 50, y: 78 },
          { id: "fb2-rb", label: "HB", x: 50, y: 65 },
          { id: "fb2-fb", label: "FB", x: 50, y: 70 },
          { id: "fb2-wr1", label: "WR", x: 20, y: 58 },
          { id: "fb2-wr2", label: "WR", x: 80, y: 58 },
          { id: "fb2-te", label: "TE", x: 70, y: 55 },
          { id: "fb2-ol1", label: "LT", x: 30, y: 47 },
          { id: "fb2-ol2", label: "LG", x: 45, y: 47 },
          { id: "fb2-ol3", label: "C", x: 60, y: 47 },
          { id: "fb2-ol4", label: "RG", x: 75, y: 47 },
          { id: "fb2-ol5", label: "RT", x: 90, y: 47 }
        ]
      }
    ]
  },
  rugby: {
    displayLabel: "Rugby fifteen",
    background: "rugby",
    formations: [
      {
        code: "rugby-balanced",
        label: "Balanced Fifteen",
        slots: [
          { id: "rg-15", label: "Full Back", x: 50, y: 88 },
          { id: "rg-14", label: "Right Wing", x: 80, y: 73 },
          { id: "rg-13", label: "Outside Centre", x: 60, y: 68 },
          { id: "rg-12", label: "Inside Centre", x: 40, y: 68 },
          { id: "rg-11", label: "Left Wing", x: 20, y: 73 },
          { id: "rg-10", label: "Fly-half", x: 50, y: 58 },
          { id: "rg-9", label: "Scrum-half", x: 50, y: 48 },
          { id: "rg-8", label: "Number 8", x: 50, y: 40 },
          { id: "rg-7", label: "Open Flanker", x: 70, y: 35 },
          { id: "rg-6", label: "Blind Flanker", x: 30, y: 35 },
          { id: "rg-5", label: "Lock", x: 62, y: 25 },
          { id: "rg-4", label: "Lock", x: 38, y: 25 },
          { id: "rg-3", label: "Tight Prop", x: 70, y: 15 },
          { id: "rg-2", label: "Hooker", x: 50, y: 15 },
          { id: "rg-1", label: "Loose Prop", x: 30, y: 15 }
        ]
      },
      {
        code: "rugby-wide",
        label: "Wide Attack",
        slots: [
          { id: "rg2-15", label: "Full Back", x: 50, y: 88 },
          { id: "rg2-14", label: "Wing", x: 85, y: 70 },
          { id: "rg2-11", label: "Wing", x: 15, y: 70 },
          { id: "rg2-13", label: "Outside Centre", x: 65, y: 60 },
          { id: "rg2-12", label: "Inside Centre", x: 35, y: 60 },
          { id: "rg2-10", label: "Fly-half", x: 50, y: 52 },
          { id: "rg2-9", label: "Scrum-half", x: 50, y: 44 },
          { id: "rg2-8", label: "Number 8", x: 50, y: 36 },
          { id: "rg2-7", label: "Op Flanker", x: 70, y: 30 },
          { id: "rg2-6", label: "Bl Flanker", x: 30, y: 30 },
          { id: "rg2-5", label: "Lock", x: 65, y: 22 },
          { id: "rg2-4", label: "Lock", x: 35, y: 22 },
          { id: "rg2-3", label: "Prop", x: 72, y: 12 },
          { id: "rg2-2", label: "Hooker", x: 50, y: 12 },
          { id: "rg2-1", label: "Prop", x: 28, y: 12 }
        ]
      }
    ]
  }
};

const getCustomFormation = (sport: CustomSport, code?: string) => {
  const preset = CUSTOM_SPORT_PRESETS[sport];
  if (!preset) return null;
  return preset.formations.find((entry) => entry.code === code) ?? preset.formations[0];
};

const buildCustomSportSlots = (sport: CustomSport, limit: number, code?: string): SportSlot[] => {
  const formation = getCustomFormation(sport, code);
  const base = formation?.slots ?? [];
  if (limit <= base.length) {
    return base.slice(0, limit);
  }
  const extraCount = limit - base.length;
  const extras: SportSlot[] = Array.from({ length: extraCount }).map((_, idx) => ({
    id: `${sport}-bench-${idx}`,
    label: `Bench ${idx + 1}`,
    x: 10 + ((idx % 5) * 18),
    y: 94 - Math.floor(idx / 5) * 4
  }));
  return [...base, ...extras];
};

const syncAssignments = (
  slots: SportSlot[],
  prev: Record<string, string | null> = {}
): Record<string, string | null> => {
  const next: Record<string, string | null> = {};
  slots.forEach((slot) => {
    next[slot.id] = prev[slot.id] ?? null;
  });
  return next;
};

const getParticipantDisplayName = (
  participant: Participant,
  auction: Auction | null,
  context: "default" | "lobby" | "leaderboard" = "default"
) => {
  if (!auction?.anonymousMode) return participant.name;
  if (context === "lobby" || context === "leaderboard") {
    return participant.name;
  }
  return participant.alias ?? participant.name;
};

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
  const [pendingStartAuction, setPendingStartAuction] = useState<string | null>(null);
  const [preStartCountdown, setPreStartCountdown] = useState(0);
  const resumeAvailable = Boolean(activeAuctionId && !auction);

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
      ended: "auction",
      ranking: "ranking",
      results: "results"
    };
    const resolvedView =
      auction.status === "ended" && auction.finalizationOpen ? "post" : stageMap[auction.status];
    setView((prev) => {
      if (prev === "create" || prev === "join") return prev;
      return resolvedView;
    });
  }, [auction?.status, auction?.finalizationOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useAdminAutomation(auction, participants, selfParticipant, notify);
  useEffect(() => {
    if (!auction || auction.status !== "lobby") {
      setPendingStartAuction(null);
      setPreStartCountdown(0);
    }
  }, [auction?.status]);
  const viewingOnly = useMemo(
    () => Boolean(auction && auction.visibility === "public" && !selfParticipant),
    [auction?.id, auction?.visibility, selfParticipant?.id]
  );
  const viewerCount = viewingOnly ? auction?.viewCount ?? 0 : 0;
  const showViewerCount = viewingOnly && viewerCount > 0;
  useEffect(() => {
    if (!viewingOnly || !auction) return;
    if (typeof window === "undefined") return;
    const key = `saifur-auction:view:${auction.id}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    incrementViewCount(auction.id).catch(() => {
      window.localStorage.removeItem(key);
    });
  }, [viewingOnly, auction?.id]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [auctionAudioEnabled, setAuctionAudioEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("saifur-auction:voice") !== "off";
  });
  const triggerStartCountdown = useCallback(() => {
    if (!auction || auction.status !== "lobby" || !selfParticipant || selfParticipant.role !== "admin") return;
    if (preStartCountdown > 0 || pendingStartAuction) return;
    setPendingStartAuction(auction.id);
    setPreStartCountdown(10);
    playAnnouncement("Auction starting in ten seconds");
  }, [auction?.id, auction?.status, pendingStartAuction, preStartCountdown, selfParticipant]);
  useEffect(() => {
    if (!pendingStartAuction || preStartCountdown <= 0) return;
    const timer = setTimeout(() => {
      setPreStartCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingStartAuction, preStartCountdown]);
  useEffect(() => {
    if (!pendingStartAuction || preStartCountdown !== 0) return;
    const target = pendingStartAuction;
    setPendingStartAuction(null);
    startAuction(target).catch((error) => notify("error", (error as Error).message));
  }, [pendingStartAuction, preStartCountdown, notify]);
  useEffect(() => {
    if (!selfParticipant) {
      setMicEnabled(false);
    }
  }, [selfParticipant?.id]);
  useEffect(() => {
    if (view !== "auction") {
      setAuctionAudioEnabled(false);
    }
  }, [view]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("saifur-auction:voice", auctionAudioEnabled ? "on" : "off");
  }, [auctionAudioEnabled]);

  const voiceCapableViews: ViewMode[] = ["lobby", "auction", "post", "ranking", "results"];
  const voiceEnabled = Boolean(auction && voiceCapableViews.includes(view));
  const canSpeak = Boolean(selfParticipant);
  const shouldUseMic = Boolean(canSpeak && micEnabled);
  const listenOnlyMode = viewingOnly || !shouldUseMic;
  const {
    connected: voiceConnected,
    connecting: voiceConnecting,
    error: voiceError,
    remoteStreams: voiceStreams,
    leave: leaveVoice
  } = useVoiceChannel({
    auctionId: (voiceEnabled || listenOnlyMode) && auction ? auction.id : null,
    clientId: clientId || null,
    scope: auction?.status === "lobby" ? "lobby" : "live",
    listenOnly: listenOnlyMode,
    autoJoin: true
  });
  const lastVoiceStateRef = useRef(voiceConnected);
  useEffect(() => {
    const shouldTrack = voiceEnabled || listenOnlyMode;
    if (!shouldTrack) {
      lastVoiceStateRef.current = voiceConnected;
      return;
    }
    if (voiceConnected !== lastVoiceStateRef.current) {
      if (listenOnlyMode) {
        notify("success", voiceConnected ? "Listening to live voice." : "Stopped listening.");
      } else {
        const isLobby = auction?.status === "lobby";
        notify(
          "success",
          voiceConnected ? (isLobby ? "Joined lobby voice chat." : "Joined voice chat.") : "Left voice chat."
        );
      }
      lastVoiceStateRef.current = voiceConnected;
    }
  }, [voiceConnected, voiceEnabled, listenOnlyMode, notify, auction?.status]);
  const voiceErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceEnabled && !listenOnlyMode) {
      voiceErrorRef.current = voiceError;
      return;
    }
    if (voiceError && voiceError !== voiceErrorRef.current) {
      notify("error", voiceError);
      voiceErrorRef.current = voiceError;
    }
  }, [voiceError, notify, voiceEnabled]);
  useEffect(() => {
    if (!selfParticipant && !listenOnlyMode && voiceConnected) {
      void leaveVoice();
    }
  }, [selfParticipant, listenOnlyMode, voiceConnected, leaveVoice]);
  const canUseVoice = Boolean(canSpeak && voiceEnabled);
  const listenOnlyAvailable = Boolean(listenOnlyMode && voiceEnabled);
  const voiceStageLabel = auction?.status === "lobby" ? "the lobby" : "the floor";
  const voiceButtonControl =
    canUseVoice && (voiceEnabled || listenOnlyMode)
      ? {
          connected: shouldUseMic && voiceConnected,
          connecting: voiceConnecting,
          canToggle: true,
          toggle: () => setMicEnabled((prev) => !prev),
          stageLabel: voiceStageLabel,
          mode: shouldUseMic ? ("talk" as const) : ("listen" as const)
        }
      : null;

  const handleCreated = (newAuctionId: string) => {
    setActiveAuctionId(newAuctionId);
    setView("lobby");
  };

  const handleJoined = (targetAuctionId: string) => {
    setActiveAuctionId(targetAuctionId);
    setView("lobby");
  };
  const handleWatch = (targetAuctionId: string) => {
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
          hasActiveAuction={resumeAvailable}
          onCreate={() => setView("create")}
          onJoin={() => setView("join")}
          onResume={resumeAvailable ? () => setView("lobby") : null}
        />
      );
    }

    switch (view) {
      case "landing":
        return (
          <LandingHero
            hasActiveAuction={resumeAvailable}
            onCreate={() => setView("create")}
            onJoin={() => setView("join")}
            onResume={resumeAvailable ? () => setView("lobby") : null}
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
            onWatch={handleWatch}
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
              voiceControl={voiceButtonControl}
              viewerCount={showViewerCount ? viewerCount : null}
              preStartCountdown={preStartCountdown}
              onStartCountdown={triggerStartCountdown}
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
              voiceControl={voiceButtonControl}
              audioEnabled={auctionAudioEnabled}
              onToggleAudio={() => setAuctionAudioEnabled((prev) => !prev)}
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
              voiceControl={voiceButtonControl}
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
              voiceControl={voiceButtonControl}
            />
          )
        );
      case "results":
        return (
          auction && (
            <ResultsBoard
              auction={auction}
              participants={participants}
              voiceControl={voiceButtonControl}
            />
          )
        );
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
        <div className="header-actions">
          {auction && (
            <div className="session-chip">
              <div>
                <p className="chip-label">Active auction</p>
                <p className="chip-value">
                  <span className="chip-auction-name">{auction.name}</span>
                  <span className="status-pill">{auction.status.toUpperCase()}</span>
                </p>
                {viewingOnly && <p className="chip-label">Viewing only</p>}
              </div>
              <button className="btn text" onClick={handleLeaveSession}>
                Leave
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="stage-panel">{loading ? <p>Loading...</p> : renderView()}</main>
      <VoiceAudioLayer streams={voiceStreams} />
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
  const [password, setPassword] = useState("");
  const [maxParticipantsInput, setMaxParticipantsInput] = useState("6");
  const [playersPerTeamInput, setPlayersPerTeamInput] = useState("11");
  const [budgetPerPlayerInput, setBudgetPerPlayerInput] = useState("100");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [adminWillPlay, setAdminWillPlay] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [categories, setCategories] = useState<CategoryFormState[]>([
    {
      id: crypto.randomUUID(),
      label: "A",
      basePrice: 10,
      basePriceInput: "10",
      playersText: ""
    }
  ]);
  const [saving, setSaving] = useState(false);

  const parsePlayerInput = useCallback((value: string) => {
    return value
      .split(/[\n,]/)
      .map((player) => player.trim())
      .filter(Boolean);
  }, []);

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
        basePriceInput: String(prev.length ? prev[prev.length - 1].basePrice : 10),
        playersText: ""
      }
    ]);
  };

  const updateCategory = (id: string, updates: Partial<CategoryFormState>) => {
    setCategories((prev) =>
      prev.map((category) => (category.id === id ? { ...category, ...updates } : category))
    );
  };

  const handleBasePriceInput = (id: string, rawValue: string) => {
    const sanitized = rawValue.replace(/[^0-9]/g, "");
    updateCategory(id, {
      basePriceInput: sanitized,
      basePrice: Number(sanitized || 0)
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      notify("error", "Set a password so friends can join safely.");
      return;
    }
    const resolvedParticipants = Number(maxParticipantsInput || "0");
    if (!Number.isFinite(resolvedParticipants) || resolvedParticipants < 2 || resolvedParticipants > 20) {
      notify("error", "Set between 2 and 20 friends for this auction.");
      return;
    }
    const resolvedPlayersPerTeam = Number(playersPerTeamInput || "0");
    if (!Number.isFinite(resolvedPlayersPerTeam) || resolvedPlayersPerTeam < 1 || resolvedPlayersPerTeam > 20) {
      notify("error", "Players per team must be between 1 and 20.");
      return;
    }
    const resolvedBudgetMillions = Number(budgetPerPlayerInput || "0");
    if (!Number.isFinite(resolvedBudgetMillions) || resolvedBudgetMillions < 1) {
      notify("error", "Budget per player should be at least $1M.");
      return;
    }
    const resolvedBudget = resolvedBudgetMillions * 1_000_000;

    setSaving(true);
    try {
      const preparedCategories = categories
        .map((category) => ({
          id: category.id,
          label: category.label,
          basePrice: Number(category.basePrice),
          players: parsePlayerInput(category.playersText)
        }))
        .filter((category) => category.players.length);

      const newAuctionId = await createAuction({
        auctionName: auctionName.slice(0, 20),
        adminName: adminName || "Admin",
        clientId,
        maxParticipants: resolvedParticipants,
        playersPerTeam: resolvedPlayersPerTeam,
        budgetPerPlayer: resolvedBudget,
        visibility,
        password: password.trim(),
        categories: preparedCategories,
        anonymousMode,
        adminWillPlay
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
          Password
          <input
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Set a password for this auction"
            required
          />
        </label>
        <label>
          Admin name
          <input
            type="text"
            value={adminName}
            maxLength={10}
            onChange={(event) => setAdminName(event.target.value)}
            required
          />
        </label>
        <label className="toggle-row">
          <span>I'll play in this auction</span>
          <input
            type="checkbox"
            checked={adminWillPlay}
            onChange={(event) => setAdminWillPlay(event.target.checked)}
          />
          <p className="muted-label">
            Keep this on to bid alongside friends. Turn it off if you're just hosting & judging.
          </p>
        </label>
        <label className="toggle-row">
          <span>Anonymous auction</span>
          <input
            type="checkbox"
            checked={anonymousMode}
            onChange={(event) => setAnonymousMode(event.target.checked)}
          />
          <p className="muted-label">
            Everyone gets a short alias during bidding and ranking. Real names show only in lobby
            and final leaderboard.
          </p>
        </label>
        <label>
          How many friends will play?
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="6"
            value={maxParticipantsInput}
            onChange={(event) => setMaxParticipantsInput(event.target.value.replace(/^0+/, ""))}
            required
          />
        </label>
        <label>
          Players per team
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="11"
            value={playersPerTeamInput}
            onChange={(event) => setPlayersPerTeamInput(event.target.value.replace(/^0+/, ""))}
            required
          />
        </label>
        <label>
          Budget per player (USD millions)
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="100"
            value={budgetPerPlayerInput}
            onChange={(event) => setBudgetPerPlayerInput(event.target.value.replace(/^0+/, ""))}
            required
          />
        </label>
        <div className="chip-select" role="group" aria-label="Visibility">
          <span>Visibility</span>
          <div className="chip-row">
            <button
              type="button"
              className={visibility === "public" ? "chip active" : "chip"}
              onClick={() => setVisibility("public")}
            >
              Public
            </button>
            <button
              type="button"
              className={visibility === "private" ? "chip active" : "chip"}
              onClick={() => setVisibility("private")}
            >
              Private
            </button>
          </div>
          <p className="muted-label">
            {visibility === "public"
              ? "Lobby listed for anyone browsing."
              : "Hidden lobby. Share the password manually."}
          </p>
        </div>
        <div className="category-section">
          <h3>Categories & Players</h3>
          <p className="muted-label">Paste names separated by commas or new lines.</p>
          <div className="category-grid">
            {categories.map((category) => (
              <div key={category.id} className="category-card">
                <div className="category-header">
                  <div className="category-title">
                    <span className="category-pill">{category.label}</span>
                    <span className="player-count">
                      {parsePlayerInput(category.playersText).length} players
                    </span>
                  </div>
                  <div className="category-meta">
                    <label>
                      Base price (USD)
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={category.basePriceInput}
                        onChange={(event) => handleBasePriceInput(category.id, event.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <textarea
                  className="category-textarea"
                  rows={4}
                  value={category.playersText}
                  onChange={(event) =>
                    updateCategory(category.id, { playersText: event.target.value })
                  }
                  placeholder={"Messi, Ronaldo, Neymar\nMbappe, Haaland"}
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
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
  onWatch,
  notify
}: {
  clientId: string;
  publicAuctions: Auction[];
  onBack: () => void;
  onJoined: (auctionId: string) => void;
  onWatch: (auctionId: string) => void;
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
          <h3>Join Auction (Players)</h3>
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
          <h3>Watch public auctions live</h3>
          <p className="muted-label">Tap Watch to spectate ongoing public auctions.</p>
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
                <div className="public-actions">
                  <button
                    className="btn outline"
                    onClick={() => {
                      setAuctionName(item.name);
                      setPassword("");
                      notify("success", `Selected ${item.name}. Enter the password to join.`);
                    }}
                  >
                    Join
                  </button>
                  <button className="btn ghost" type="button" onClick={() => onWatch(item.id)}>
                    Watch
                  </button>
                </div>
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
  notify,
  voiceControl,
  viewerCount,
  preStartCountdown,
  onStartCountdown
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
  voiceControl: VoiceButtonControl | null;
  viewerCount: number | null;
  preStartCountdown: number;
  onStartCountdown: () => void;
}) => {
  const isAdmin = selfParticipant?.role === "admin";
  const queuedPlayers = useMemo(() => buildPlayerQueue(auction.categories), [auction.categories]);

  return (
    <section className="panel-card lobby">
      <PanelVoiceButton control={voiceControl} />
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
            {viewerCount && <ViewPill count={viewerCount} />}
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
              <button
                className="btn accent"
                onClick={onStartCountdown}
                disabled={preStartCountdown > 0}
              >
                {preStartCountdown > 0 ? `Starting in ${preStartCountdown}s` : "Start auction"}
              </button>
            )}
          </div>
          {!isAdmin && <p className="muted-label">Waiting for admin to start</p>}
          {preStartCountdown > 0 && (
            <div className="prestart-banner floating">
              <span>Auction begins in</span>
              <strong>{preStartCountdown}s</strong>
            </div>
          )}
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

const PanelVoiceButton = ({
  control,
  variant = "panel"
}: {
  control: VoiceButtonControl | null;
  variant?: "panel" | "inline";
}) => {
  if (!control) return null;
  if (variant === "inline") {
    return (
      <div className="inline-voice-toggle">
        <VoiceIconButton {...control} />
      </div>
    );
  }
  return (
    <div className="panel-voice-toggle">
      <VoiceIconButton {...control} />
    </div>
  );
};

const VoiceIconButton = ({
  connected,
  connecting,
  canToggle,
  toggle,
  stageLabel,
  mode
}: VoiceButtonControl) => {
  const muted = mode === "talk" && !connected;
  const label =
    mode === "talk"
      ? connected
        ? "Mute voice chat"
        : "Join voice chat"
      : connected
        ? "Stop listening"
        : "Listen in";
  const title =
    mode === "talk"
      ? connected
        ? `Speaking to ${stageLabel}`
        : `Tap to speak in ${stageLabel}`
      : connected
        ? `Listening to ${stageLabel}`
        : `Tap to listen to ${stageLabel}`;
  return (
    <button
      type="button"
      className={`voice-icon-btn ${mode} ${connected ? "active" : ""} ${muted ? "muted" : ""}`}
      onClick={toggle}
      disabled={!canToggle || connecting}
      aria-busy={connecting}
      aria-label={label}
      title={title}
    >
      <MicIcon crossed={muted} />
    </button>
  );
};

const MicIcon = ({ crossed }: { crossed?: boolean }) => (
  <span className={`mic-shell ${crossed ? "muted" : ""}`}>
    <svg className="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 10V6a3 3 0 0 0-6 0v4a3 3 0 0 0 6 0Z"
        fill="currentColor"
      />
      <path
        d="M7 10a5 5 0 0 0 10 0M12 15v4M8 19h8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
    {crossed && <span className="mic-slash" />}
  </span>
);

const VoiceAudioLayer = ({ streams }: { streams: VoiceStream[] }) => {
  if (!streams.length) {
    return null;
  }
  return (
    <div className="voice-audio-layer" aria-hidden>
      {streams.map((entry) => (
        <RemoteVoiceAudio key={entry.peerId} stream={entry.stream} />
      ))}
    </div>
  );
};

const RemoteVoiceAudio = ({ stream }: { stream: MediaStream }) => {
  const fallbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const ctx = getVoiceAudioContext();
    if (!ctx) return;
    const resume = () => {
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    };
    window.addEventListener("click", resume);
    window.addEventListener("touchstart", resume, { passive: true });
    return () => {
      window.removeEventListener("click", resume);
      window.removeEventListener("touchstart", resume);
    };
  }, []);

  useEffect(() => {
    const element = fallbackRef.current;
    if (!element) return;
    element.srcObject = stream;
    element.volume = 0;
    element.play().catch(() => {
      element.muted = true;
      element.play().finally(() => {
        element.muted = false;
      });
    });
    return () => {
      element.pause();
      element.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const ctx = getVoiceAudioContext();
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(stream);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 120;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 8200;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    const gain = ctx.createGain();
    gain.gain.value = 1.08;
    source.connect(highpass).connect(lowpass).connect(compressor).connect(gain).connect(ctx.destination);
    return () => {
      source.disconnect();
      highpass.disconnect();
      lowpass.disconnect();
      compressor.disconnect();
      gain.disconnect();
    };
  }, [stream]);

  return <audio ref={fallbackRef} autoPlay playsInline muted />;
};

const ViewPill = ({ count }: { count?: number }) => {
  if (typeof count !== "number" || count <= 0) return null;
  return <span className="view-pill">{count} viewers</span>;
};

const SoccerFormationBoard = ({
  formationCode,
  players,
  compact = false,
  limit
}: {
  formationCode: string;
  players: TaggedRosterEntry[];
  compact?: boolean;
  limit?: number;
}) => {
  const formation = getFormationByCode(formationCode);
  if (!formation) return null;
  const slots = extendSoccerSlots(formation, limit ?? formation.slots.length);
  const playerBySlot = new Map(
    players
      .filter((entry) => entry.slotId)
      .map((entry) => [entry.slotId as string, entry])
  );
  return (
    <div className={`soccer-pitch ${compact ? "compact" : ""}`}>
      <div className="pitch-lines">
        <span className="pitch-line center-line" />
        <span className="pitch-line center-circle" />
        <span className="pitch-line penalty-box top" />
        <span className="pitch-line penalty-box bottom" />
      </div>
      {slots.map((slot) => {
        const player = playerBySlot.get(slot.id);
        return (
          <div
            key={slot.id}
            className={`soccer-slot ${player ? "filled" : ""}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <span className="label">{slot.label}</span>
            {player && <strong>{player.playerName}</strong>}
          </div>
        );
      })}
    </div>
  );
};

const SportFormationBoard = ({
  sport,
  slots,
  players,
  compact = false
}: {
  sport: CustomSport;
  slots: SportSlot[];
  players: TaggedRosterEntry[];
  compact?: boolean;
}) => {
  const playerBySlot = new Map(
    players
      .filter((entry) => entry.slotId)
      .map((entry) => [entry.slotId as string, entry])
  );
  return (
    <div className={`sport-board ${sport} ${compact ? "compact" : ""}`}>
      {slots.map((slot) => {
        const player = playerBySlot.get(slot.id);
        return (
          <div
            key={slot.id}
            className={`sport-slot ${player ? "filled" : ""}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <span className="label">{slot.label}</span>
            {player && <strong>{player.playerName}</strong>}
          </div>
        );
      })}
    </div>
  );
};

const FormationDisplay = ({
  sport,
  formationCode,
  players,
  limit,
  compact
}: {
  sport: SportMode;
  formationCode?: string | null;
  players: TaggedRosterEntry[];
  limit: number;
  compact?: boolean;
}) => {
  if (sport === "soccer" && formationCode) {
    return (
      <SoccerFormationBoard
        formationCode={formationCode}
        players={players}
        compact={compact}
        limit={limit}
      />
    );
  }
  if (sport === "cricket") return null;
  if (sport === "basketball" || sport === "football" || sport === "rugby") {
    const slots = buildCustomSportSlots(sport, limit);
    return <SportFormationBoard sport={sport} slots={slots} players={players} compact={compact} />;
  }
  return null;
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
  notify,
  voiceControl,
  audioEnabled,
  onToggleAudio
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
  voiceControl: VoiceButtonControl | null;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}) => {
  const queue = useMemo(() => buildPlayerQueue(auction.categories), [auction.categories]);
  const participantDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((player) =>
      map.set(player.id, getParticipantDisplayName(player, auction, "default"))
    );
    return map;
  }, [participants, auction]);
  const selfIsSpectator = selfParticipant?.participating === false;
  const activeSlot = auction.manualPlayer ?? queue[auction.currentPlayerIndex] ?? null;
  const isManual = Boolean(auction.manualPlayer);
  const { msRemaining } = useCountdown(auction.countdownEndsAt);
  const minimumBid = useMemo(() => {
    if (!activeSlot) return 0;
    if (typeof auction.activeBid?.amount === "number") {
      return Math.max(activeSlot.basePrice, auction.activeBid.amount + 1);
    }
    return activeSlot.basePrice;
  }, [activeSlot?.key, activeSlot?.basePrice, auction.activeBid?.amount]);
  const [bidInput, setBidInput] = useState(() => (activeSlot ? String(minimumBid) : ""));

  useEffect(() => {
    if (!activeSlot) {
      setBidInput("");
      return;
    }
    const liveAmount = auction.activeBid?.amount;
    const nextBid =
      typeof liveAmount === "number" ? Math.max(activeSlot.basePrice, liveAmount + 1) : activeSlot.basePrice;
    setBidInput(String(nextBid));
  }, [activeSlot?.key]);

  useEffect(() => {
    if (!activeSlot) return;
    setBidInput((prev) => {
      if (!prev) return prev;
      const numeric = Number(prev);
      if (!Number.isFinite(numeric) || numeric < minimumBid) {
        return String(minimumBid);
      }
      return prev;
    });
  }, [minimumBid, activeSlot?.key]);

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
          const winnerLabel =
            entry?.winnerId && participantDisplayMap.get(entry.winnerId)
              ? participantDisplayMap.get(entry.winnerId)
              : entry?.winnerAlias ?? entry?.winnerName ?? "Unknown";
          const soldText =
            entry?.result === "sold"
              ? `Sold to ${winnerLabel} (${formatCurrency(entry?.finalBid ?? 0)})`
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
    if (!selfParticipant || selfIsSpectator || !activeSlot || auction.isPaused) {
      return;
    }
    try {
      const bidAmount = Number(bidInput || "0");
      if (!bidAmount || bidAmount < minimumBid) {
        notify("error", `Bid at least ${formatCurrency(minimumBid)}.`);
        return;
      }
      await placeBid({
        auctionId: auction.id,
        clientId: selfParticipant.id,
        bidderName: getParticipantDisplayName(selfParticipant, auction, "default"),
        amount: bidAmount
      });
      } catch (error) {
        notify("error", (error as Error).message);
      }
    };

  const handlePass = async () => {
    if (!selfParticipant || selfIsSpectator || !activeSlot || auction.isPaused) return;
    try {
      await skipPlayer({ auctionId: auction.id, clientId: selfParticipant.id });
    } catch (error) {
      notify("error", (error as Error).message);
    }
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

  const handleOpenFinalization = async () => {
    if (!isAdmin || auction.finalizationOpen) return;
    if (auction.status !== "ended") {
      notify("error", "Finish the auction before opening final teams.");
      return;
    }
    try {
      await openFinalizationPhase(auction.id);
      notify("success", "Final team selection opened for everyone.");
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
  const myRosterWithKeys = useMemo(
    () => myRoster.map((player, index) => ({ ...player, key: `${player.playerName}-${index}` })),
    [myRoster]
  );
  const [rosterOrder, setRosterOrder] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  useEffect(() => {
    setRosterOrder(myRosterWithKeys.map((player) => player.key));
  }, [myRosterWithKeys]);
  const orderedRoster = rosterOrder
    .map((key) => myRosterWithKeys.find((player) => player.key === key))
    .filter(Boolean) as typeof myRosterWithKeys;
  const handleDragStart = (key: string) => {
    setDragKey(key);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>) => {
    event.preventDefault();
  };

  const handleDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    setRosterOrder((prev) => {
      const from = prev.indexOf(dragKey);
      const to = prev.indexOf(targetKey);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragKey(null);
  };
  const otherPlayers = participants.filter(
    (player) => player.id !== selfParticipant?.id && player.participating !== false
  );
  const unsoldPlayers = useMemo(
    () => (auction.completedPlayers ?? []).filter((entry) => entry.result === "unsold"),
    [auction.completedPlayers]
  );
  const soldHistory = useMemo(
    () =>
      (auction.completedPlayers ?? []).filter(
        (entry): entry is CompletedPlayerEntry & { finalBid: number } =>
          entry.result === "sold" && typeof entry.finalBid === "number"
      ),
    [auction.completedPlayers]
  );
  const recordSale = useMemo(() => {
    if (soldHistory.length < 3) return null;
    return soldHistory.reduce<CompletedPlayerEntry & { finalBid: number } | null>((prev, current) => {
      if (!prev) return current;
      return current.finalBid > (prev.finalBid ?? 0) ? current : prev;
    }, soldHistory[0]);
  }, [soldHistory]);
  const recordEntryKey = recordSale?.id ?? null;
  const lastAnnouncedRef = useRef<string | null>(null);
  const lastBidVoiceRef = useRef<string | null>(null);
  const lastSaleToneRef = useRef<string | null>(null);

  const speakAnnouncement = useCallback(
    (text: string) => {
      if (!audioEnabled) return;
      void playAnnouncement(text).catch(() => {});
    },
    [audioEnabled]
  );

  useEffect(() => {
    if (!audioEnabled || !activeSlot) return;
    if (activeSlot.key === lastAnnouncedRef.current) return;
    lastAnnouncedRef.current = activeSlot.key;
    lastBidVoiceRef.current = null;
    speakAnnouncement(`Now drafting ${activeSlot.name}`);
  }, [audioEnabled, activeSlot?.key, activeSlot?.name, speakAnnouncement]);

  useEffect(() => {
    if (!audioEnabled || !activeSlot || !auction.activeBid) return;
    if (auction.activeBid.bidderId === selfParticipant?.id) return;
    const signature = `${activeSlot.key}-${auction.activeBid.amount}`;
    if (signature === lastBidVoiceRef.current) return;
    lastBidVoiceRef.current = signature;
    speakAnnouncement(`${activeSlot.name} going for ${formatCurrency(auction.activeBid.amount)}`);
  }, [
    audioEnabled,
    auction.activeBid?.amount,
    auction.activeBid?.bidderId,
    activeSlot?.key,
    speakAnnouncement,
    selfParticipant?.id
  ]);

  useEffect(() => {
    if (!audioEnabled) {
      lastAnnouncedRef.current = null;
      lastBidVoiceRef.current = null;
    }
  }, [audioEnabled]);

  const playToneSequence = useCallback(
    (frequencies: number[]) => {
      if (!audioEnabled) return;
      const ctx = getVoiceAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = freq;
        oscillator.connect(gain).connect(ctx.destination);
        const start = now + index * 0.15;
        const end = start + 0.3;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.start(start);
        oscillator.stop(end);
      });
    },
    [audioEnabled]
  );

  useEffect(() => {
    if (!audioEnabled) return;
    const entries = auction.completedPlayers ?? [];
    if (!entries.length) return;
    const latest = entries[entries.length - 1];
    if (!latest || latest.id === lastSaleToneRef.current) return;
    if (latest.result === "sold") {
      playToneSequence([720, 880, 1040]);
    } else if (latest.result === "unsold") {
      playToneSequence([420, 310]);
    }
    lastSaleToneRef.current = latest.id;
  }, [audioEnabled, auction.completedPlayers, playToneSequence]);

  const timerLabel =
    auction.isPaused || !activeSlot
      ? auction.isPaused
        ? "PAUSED"
        : "--:--"
      : formatTimer(msRemaining);

  const bidDisabled =
    !selfParticipant || selfIsSpectator || !activeSlot || auction.isPaused || isHighestBidder;

  const ledgerWithIndices = useMemo(
    () => playerLedger.map((entry, index) => ({ ...entry, queueIndex: index })),
    [playerLedger]
  );
  const finishedEntries = ledgerWithIndices.filter(
    (entry) => entry.queueIndex < auction.currentPlayerIndex
  );
  const recentHistory = finishedEntries.slice(-2);
  const olderHistory = finishedEntries.slice(
    0,
    Math.max(0, finishedEntries.length - recentHistory.length)
  );
  const upcomingStartIndex = Math.max(auction.currentPlayerIndex + (isManual ? 0 : 1), 0);
  const upcomingEntries = ledgerWithIndices.filter(
    (entry) => entry.queueIndex >= upcomingStartIndex
  );
  const currentBoardEntries: typeof ledgerWithIndices = [];
  if (activeSlot) {
    if (!isManual && auction.currentPlayerIndex >= 0) {
      const currentLedgerEntry = ledgerWithIndices.find(
        (entry) => entry.queueIndex === auction.currentPlayerIndex
      );
      if (currentLedgerEntry) {
        currentBoardEntries.push(currentLedgerEntry);
      }
    } else {
      currentBoardEntries.push({
        slot: activeSlot,
        status: auction.isPaused ? "Paused" : "Live now",
        tone: auction.isPaused ? "paused" : "live",
        queueIndex: -1
      });
    }
  }
  const boardSections: Array<
    | { kind: "label"; text: string }
    | { kind: "entry"; entry: (typeof ledgerWithIndices)[number] }
  > = [];
  const appendSection = (label: string, entries: typeof ledgerWithIndices) => {
    if (!entries.length) return;
    boardSections.push({ kind: "label", text: label });
    entries.forEach((entry) => boardSections.push({ kind: "entry", entry }));
  };
  appendSection("Recent picks", recentHistory);
  appendSection("Now drafting", currentBoardEntries);
  appendSection("Upcoming", upcomingEntries);
  appendSection("Earlier picks", olderHistory);

  const playersPurchased = orderedRoster.length;

  return (
    <section className="panel-card live-board">
      <div className="deck-card">
        <div className="deck-head">
          <div className="deck-copy">
            <p className="eyebrow">On deck</p>
            <div className="deck-title-row">
              <h2>{activeSlot ? activeSlot.name : "No players left"}</h2>
              <button
                type="button"
                className={`audio-toggle ${audioEnabled ? "active" : ""}`}
                onClick={onToggleAudio}
                aria-label={audioEnabled ? "Mute auction announcer" : "Enable auction announcer"}
              >
                <span aria-hidden="true">{audioEnabled ? "🔊" : "🔇"}</span>
              </button>
            </div>
            {activeSlot && (
              <p>
                Category {activeSlot.categoryLabel} - Base {formatCurrency(activeSlot.basePrice)}
              </p>
            )}
            {isManual && <p className="muted-label">Re-auctioning an unsold player</p>}
          </div>
          <PanelVoiceButton control={voiceControl} variant="inline" />
        </div>
        <div className="timer-display deck-timer">
          <span>Time left</span>
          <strong>{timerLabel}</strong>
        </div>
        {isAdmin && (
          <div className="admin-controls">
            <button className="btn ghost" onClick={handlePauseToggle}>
              {auction.isPaused ? "Resume auction" : "Pause auction"}
            </button>
            <button className="btn text" onClick={handleManualResolve}>
              Next player
            </button>
            <button
              className="btn accent"
              onClick={handleOpenFinalization}
              disabled={auction.finalizationOpen || auction.status !== "ended"}
            >
              {auction.finalizationOpen ? "Final teams live" : "Go to final teams"}
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
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={activeSlot ? String(activeSlot.basePrice) : ""}
            value={activeSlot ? bidInput : ""}
            disabled={bidDisabled}
            onChange={(event) =>
              setBidInput(event.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))
            }
          />
          <button className="btn accent" disabled={bidDisabled} onClick={handleBid}>
            Place bid
          </button>
          <button
            className="btn ghost"
            disabled={bidDisabled}
            onClick={() =>
              setBidInput((value) => {
                const parsed = Number(value);
                const fallback = minimumBid || activeSlot?.basePrice || 0;
                const next = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : fallback + 1;
                return String(next);
              })
            }
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
        <div className="team-card">
          <div className="team-card__header">
            <h3>{selfIsSpectator ? "Host mode" : "My Team"}</h3>
            {!selfIsSpectator && (
              <span>
                {formatCurrency(selfParticipant?.budgetRemaining ?? 0)} left, {playersPurchased} signed
              </span>
            )}
          </div>
          {selfIsSpectator ? (
            <p className="muted-label">You're spectating this auction. Use admin controls to run the show.</p>
          ) : (
            <ul className="team-roster">
              {orderedRoster.length === 0 && <li>No players yet.</li>}
              {orderedRoster.map((player, index) => (
                <li
                  key={player.key}
                  draggable
                  onDragStart={() => handleDragStart(player.key)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(player.key)}
                  className={dragKey === player.key ? "dragging" : ""}
                >
                  <span className="player-name">{player.playerName}</span>
                  <span className="player-price">{formatCurrency(player.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="team-card">
          <div className="team-card__header">
            <h3>Other Teams</h3>
          </div>
          <ul className="coach-summary">
            {otherPlayers.map((player) => (
              <li key={player.id}>
                <strong>{getParticipantDisplayName(player, auction, "default")}</strong>
                <div>
                  <span>{formatCurrency(player.budgetRemaining)} left</span>
                  <span>
                    {Math.max(auction.playersPerTeam - player.playersNeeded, 0)} signed
                  </span>
                </div>
              </li>
            ))}
            {otherPlayers.length === 0 && <li>No other teams yet.</li>}
          </ul>
        </div>
      </div>
      <div className="player-order-card draft-board">
        <div className="draft-header">
          <h3>Full player list</h3>
        </div>
        <ol className="player-order-list">
          {boardSections.length === 0 && <li className="ledger-label">No players queued.</li>}
          {boardSections.map((item, idx) =>
            item.kind === "label" ? (
              <li key={`label-${idx}`} className="ledger-label">
                {item.text}
              </li>
            ) : (
              <li
                key={`${item.entry.slot.key}-${item.entry.queueIndex}`}
                className={`player-table ${item.entry.tone ?? ""} ${
                  recordEntryKey && item.entry.slot.key === recordEntryKey ? "record" : ""
                }`}
              >
                <div>
                  <strong>
                    {item.entry.queueIndex != null && item.entry.queueIndex >= 0
                      ? `${item.entry.queueIndex + 1}. `
                      : ""}
                    {item.entry.slot.name}
                  </strong>
                  <p>
                    Cat {item.entry.slot.categoryLabel} - Base {formatCurrency(item.entry.slot.basePrice)}
                  </p>
                  {recordEntryKey && item.entry.slot.key === recordEntryKey && (
                    <span className="record-flag">Most expensive pick</span>
                  )}
                </div>
                <span>{item.entry.status}</span>
              </li>
            )
          )}
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
  notify,
  voiceControl
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
  voiceControl: VoiceButtonControl | null;
}) => {
  const roster = selfParticipant?.roster ?? [];
  const finalRoster = selfParticipant?.finalRoster ?? [];
  const finalSport = (selfParticipant?.finalRosterSport ?? "cricket") as SportMode;
  const finalFormation = selfParticipant?.finalRosterFormation ?? null;
  const limit = auction.playersPerTeam;
  const rosterWithKeys = useMemo(
    () => roster.map((player, index) => ({ ...player, key: `${player.playerName}-${index}` })),
    [roster]
  );
  const [sport, setSport] = useState<SportMode>(finalRoster.length ? finalSport : "soccer");
  const sportOptions: { value: SportMode; label: string }[] = [
    { value: "soccer", label: "Soccer" },
    { value: "cricket", label: "Cricket" },
    { value: "basketball", label: "Basketball" },
    { value: "football", label: "Football" },
    { value: "rugby", label: "Rugby" }
  ];
  const cricketSlots = useMemo(() => {
    return Array.from({ length: limit }).map((_, index) => ({
      id: `cricket-${index}`,
      label: CRICKET_POSITIONS[index] ?? `Player ${index + 1}`
    }));
  }, [limit]);
  const [cricketAssignments, setCricketAssignments] = useState<Record<string, string | null>>({});
  const [cricketWicketSlot, setCricketWicketSlot] = useState<string | null>(null);
  useEffect(() => {
    setCricketAssignments((prev) => {
      const next: Record<string, string | null> = {};
      cricketSlots.forEach((slot) => {
        next[slot.id] = prev[slot.id] ?? null;
      });
      return next;
    });
    setCricketWicketSlot((prev) => (prev && cricketSlots.some((slot) => slot.id === prev) ? prev : null));
  }, [cricketSlots]);
  const defaultBasketballFormation =
    finalSport === "basketball" && finalFormation ? finalFormation.code : CUSTOM_SPORT_PRESETS.basketball.formations[0].code;
  const defaultFootballFormation =
    finalSport === "football" && finalFormation ? finalFormation.code : CUSTOM_SPORT_PRESETS.football.formations[0].code;
  const defaultRugbyFormation =
    finalSport === "rugby" && finalFormation ? finalFormation.code : CUSTOM_SPORT_PRESETS.rugby.formations[0].code;
  const [basketballFormation, setBasketballFormation] = useState(defaultBasketballFormation);
  const [footballFormation, setFootballFormation] = useState(defaultFootballFormation);
  const [rugbyFormation, setRugbyFormation] = useState(defaultRugbyFormation);
  const basketballSlots = useMemo(
    () => buildCustomSportSlots("basketball", limit, basketballFormation),
    [limit, basketballFormation]
  );
  const footballSlots = useMemo(
    () => buildCustomSportSlots("football", limit, footballFormation),
    [limit, footballFormation]
  );
  const rugbySlots = useMemo(
    () => buildCustomSportSlots("rugby", limit, rugbyFormation),
    [limit, rugbyFormation]
  );
  const [basketballAssignments, setBasketballAssignments] = useState<Record<string, string | null>>(() =>
    syncAssignments(basketballSlots)
  );
  const [footballAssignments, setFootballAssignments] = useState<Record<string, string | null>>(() =>
    syncAssignments(footballSlots)
  );
  const [rugbyAssignments, setRugbyAssignments] = useState<Record<string, string | null>>(() =>
    syncAssignments(rugbySlots)
  );
  useEffect(() => {
    setBasketballAssignments((prev) => syncAssignments(basketballSlots, prev));
  }, [basketballSlots]);
  useEffect(() => {
    setFootballAssignments((prev) => syncAssignments(footballSlots, prev));
  }, [footballSlots]);
  useEffect(() => {
    setRugbyAssignments((prev) => syncAssignments(rugbySlots, prev));
  }, [rugbySlots]);

  const handleCricketAssign = (slotId: string, playerKey: string) => {
    setCricketAssignments((prev) => {
      const next = { ...prev };
      const sanitized = playerKey || "";
      if (sanitized) {
        Object.entries(next).forEach(([key, value]) => {
          if (key !== slotId && value === sanitized) {
            next[key] = null;
          }
        });
      }
      next[slotId] = sanitized || null;
      return next;
    });
  };

  const handleWicketToggle = (slotId: string) => {
    setCricketWicketSlot((prev) => (prev === slotId ? null : slotId));
  };

  const cricketAllFilled = useMemo(
    () => cricketSlots.every((slot) => Boolean(cricketAssignments[slot.id])),
    [cricketSlots, cricketAssignments]
  );
  const basketballFilled = useMemo(
    () => basketballSlots.every((slot) => Boolean(basketballAssignments[slot.id])),
    [basketballSlots, basketballAssignments]
  );
  const footballFilled = useMemo(
    () => footballSlots.every((slot) => Boolean(footballAssignments[slot.id])),
    [footballSlots, footballAssignments]
  );
  const rugbyFilled = useMemo(
    () => rugbySlots.every((slot) => Boolean(rugbyAssignments[slot.id])),
    [rugbySlots, rugbyAssignments]
  );

  const buildAssignmentMap = useCallback(
    (code: string, prev?: Record<string, string | null>) => {
      const formation = getFormationByCode(code);
      const next: Record<string, string | null> = {};
      (formation?.slots ?? []).forEach((slot) => {
        next[slot.id] = prev?.[slot.id] ?? null;
      });
      return next;
    },
    []
  );

  const defaultFormationCode =
    finalSport === "soccer" && finalFormation ? finalFormation.code : SOCCER_FORMATIONS[0].code;
  const [soccerFormation, setSoccerFormation] = useState(defaultFormationCode);
  const [soccerAssignments, setSoccerAssignments] = useState<Record<string, string | null>>(() =>
    buildAssignmentMap(defaultFormationCode)
  );
  useEffect(() => {
    setSoccerAssignments((prev) => buildAssignmentMap(soccerFormation, prev));
  }, [soccerFormation, buildAssignmentMap]);
  const soccerFormationDef = getFormationByCode(soccerFormation);
  const soccerSlots = useMemo(
    () => extendSoccerSlots(soccerFormationDef, limit),
    [soccerFormationDef?.code, limit]
  );
  const handleSlotAssignment = (slotId: string, playerKey: string) => {
    setSoccerAssignments((prev) => {
      const next = { ...prev };
      const nextValue = playerKey || null;
      if (nextValue) {
        Object.entries(next).forEach(([key, value]) => {
          if (key !== slotId && value === nextValue) {
            next[key] = null;
          }
        });
      }
      next[slotId] = nextValue;
      return next;
    });
  };

  const assignUnique = (
    setter: React.Dispatch<React.SetStateAction<Record<string, string | null>>>,
    slotId: string,
    playerKey: string
  ) => {
    setter((prev) => {
      const next = { ...prev };
      const sanitized = playerKey || "";
      if (sanitized) {
        Object.entries(next).forEach(([key, value]) => {
          if (key !== slotId && value === sanitized) {
            next[key] = null;
          }
        });
      }
      next[slotId] = sanitized || null;
      return next;
    });
  };

  const handleCustomAssignment = (mode: CustomSport, slotId: string, playerKey: string) => {
    switch (mode) {
      case "basketball":
        assignUnique(setBasketballAssignments, slotId, playerKey);
        break;
      case "football":
        assignUnique(setFootballAssignments, slotId, playerKey);
        break;
      case "rugby":
        assignUnique(setRugbyAssignments, slotId, playerKey);
        break;
      default:
        break;
    }
  };

  const buildTaggedEntries = useCallback(
    (slots: SportSlot[], assignments: Record<string, string | null>) =>
      slots
        .map((slot) => {
          const key = assignments[slot.id];
          if (!key) return null;
          const player = rosterWithKeys.find((entry) => entry.key === key);
          if (!player) return null;
          return {
            playerName: player.playerName,
            categoryLabel: player.categoryLabel,
            price: player.price,
            slotId: slot.id,
            slotLabel: slot.label
          };
        })
        .filter(Boolean) as TaggedRosterEntry[],
    [rosterWithKeys]
  );

  const renderCustomSportBuilder = (mode: CustomSport) => {
    const { slots, assignments, formationCode, setFormation } = getCustomSportConfig(mode);
    const assignedEntries = buildTaggedEntries(slots, assignments);
    const shortage = rosterWithKeys.length < slots.length;
    return (
      <div className="sport-builder">
        <div className="formation-select">
          <label htmlFor={`${mode}-formation`}>Formation</label>
          <select
            id={`${mode}-formation`}
            value={formationCode}
            onChange={(event) => setFormation(event.target.value)}
          >
            {CUSTOM_SPORT_PRESETS[mode].formations.map((formation) => (
              <option key={formation.code} value={formation.code}>
                {formation.label}
              </option>
            ))}
          </select>
        </div>
        <SportFormationBoard sport={mode} slots={slots} players={assignedEntries} />
        <div className="formation-editor">
          {shortage && (
            <p className="muted-label warning">
              Need {slots.length} players to fill this layout. You currently have {rosterWithKeys.length}.
            </p>
          )}
          <ul>
            {slots.map((slot) => (
              <li key={slot.id}>
                <span>{slot.label}</span>
                <select
                  value={assignments[slot.id] ?? ""}
                  onChange={(event) => handleCustomAssignment(mode, slot.id, event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {rosterWithKeys.map((player) => {
                    const assignedElsewhere =
                      assignments[slot.id] !== player.key &&
                      Object.values(assignments).includes(player.key);
                    return (
                      <option key={player.key} value={player.key} disabled={assignedElsewhere}>
                        {player.playerName} - {formatCurrency(player.price)}
                      </option>
                    );
                  })}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const getCustomSportConfig = (mode: CustomSport) => {
    switch (mode) {
      case "basketball":
        return {
          slots: basketballSlots,
          assignments: basketballAssignments,
          setAssignments: setBasketballAssignments,
          filled: basketballFilled,
          formationCode: basketballFormation,
          setFormation: setBasketballFormation
        };
      case "football":
        return {
          slots: footballSlots,
          assignments: footballAssignments,
          setAssignments: setFootballAssignments,
          filled: footballFilled,
          formationCode: footballFormation,
          setFormation: setFootballFormation
        };
      case "rugby":
        return {
          slots: rugbySlots,
          assignments: rugbyAssignments,
          setAssignments: setRugbyAssignments,
          filled: rugbyFilled,
          formationCode: rugbyFormation,
          setFormation: setRugbyFormation
        };
      default:
        return {
          slots: [],
          assignments: {},
          setAssignments: () => {},
          filled: false,
          formationCode: "",
          setFormation: () => {}
        };
    }
  };

  const soccerAssignmentsList = useMemo(() => {
    return soccerSlots
      .map((slot) => {
        const playerKey = soccerAssignments[slot.id];
        if (!playerKey) return null;
        const player = rosterWithKeys.find((entry) => entry.key === playerKey);
        if (!player) return null;
        return {
          playerName: player.playerName,
          categoryLabel: player.categoryLabel,
          price: player.price,
          tag: slot.label,
          slotId: slot.id,
          slotLabel: slot.label
        };
      })
      .filter(Boolean) as TaggedRosterEntry[];
  }, [rosterWithKeys, soccerAssignments, soccerFormationDef]);

  const soccerReady = soccerSlots.every((slot) => Boolean(soccerAssignments[slot.id]));
  const soccerShortage = rosterWithKeys.length < soccerSlots.length;

  const handleSubmit = async () => {
    if (!selfParticipant) return;
    if (sport === "soccer") {
      if (!soccerFormationDef) {
        notify("error", "Select a formation.");
        return;
      }
      if (soccerShortage) {
        notify("error", `You need ${soccerSlots.length} players for this formation.`);
        return;
      }
      if (!soccerReady) {
        notify("error", "Assign every position before submitting.");
        return;
      }
    } else if (sport === "cricket") {
      if (!cricketAllFilled) {
        notify("error", "Assign every batting slot before submitting.");
        return;
      }
    } else {
      const config = getCustomSportConfig(sport as CustomSport);
      if (!config.filled) {
        notify("error", "Assign every position before submitting.");
        return;
      }
    }

    let payload: TaggedRosterEntry[] = [];
    let formationCode: string | undefined;
    let formationLabel: string | undefined;

    if (sport === "soccer" && soccerFormationDef) {
      payload = soccerSlots.map((slot) => {
        const playerKey = soccerAssignments[slot.id];
        const player = rosterWithKeys.find((entry) => entry.key === playerKey);
        if (!player) {
          throw new Error("Missing player assignment.");
        }
        return {
          playerName: player.playerName,
          categoryLabel: player.categoryLabel,
          price: player.price,
          tag: slot.label,
          slotId: slot.id,
          slotLabel: slot.label
        };
      });
      formationCode = soccerFormationDef.code;
      formationLabel = soccerFormationDef.label;
    } else if (sport === "cricket") {
      payload = cricketSlots.map((slot) => {
        const playerKey = cricketAssignments[slot.id];
        const player = rosterWithKeys.find((entry) => entry.key === playerKey);
        if (!player) {
          throw new Error("Missing player assignment.");
        }
        return {
          playerName: player.playerName,
          categoryLabel: player.categoryLabel,
          price: player.price,
          slotId: slot.id,
          slotLabel: slot.label,
          tag: cricketWicketSlot === slot.id ? "WK" : ""
        };
      });
    } else {
      const mode = sport as CustomSport;
      const { slots, assignments, formationCode: selectedCode } = getCustomSportConfig(mode);
      payload = slots.map((slot) => {
        const playerKey = assignments[slot.id];
        const player = rosterWithKeys.find((entry) => entry.key === playerKey);
        if (!player) {
          throw new Error("Missing player assignment.");
        }
        return {
          playerName: player.playerName,
          categoryLabel: player.categoryLabel,
          price: player.price,
          slotId: slot.id,
          slotLabel: slot.label
        };
      });
      const meta = getCustomFormation(mode, selectedCode);
      formationCode = meta?.code;
      formationLabel = meta?.label ?? CUSTOM_SPORT_PRESETS[mode].displayLabel;
    }

    try {
      await submitTeam({
        auctionId: auction.id,
        clientId: selfParticipant.id,
        finalRoster: payload,
        sport,
        formationCode,
        formationLabel
      });
      notify("success", "Final squad locked in.");
    } catch (error) {
      notify("error", (error as Error).message);
    }
  };

  const otherPlayers = participants.filter(
    (player) => player.id !== selfParticipant?.id && player.participating !== false
  );

  if (selfParticipant?.participating === false) {
    return (
      <section className="panel-card">
        <PanelVoiceButton control={voiceControl} />
        <h2>Host overview</h2>
        <p className="muted-label">
          You're running this auction but not submitting a lineup. Track everyone else's picks and wait
          for them to finish.
        </p>
        <div className="roster-card" style={{ marginTop: "1.5rem" }}>
          <h3>Players</h3>
          <ul className="participant-list">
            {participants
              .filter((player) => player.participating !== false)
              .map((player) => (
                <li key={player.id}>
                  <div>
                    <strong>{getParticipantDisplayName(player, auction, "default")}</strong>
                    <p>{player.roster.length} picks</p>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </section>
    );
  }

  if (finalRoster.length > 0) {
    const submittedSoccer = finalSport === "soccer" && finalFormation;
    const submittedCustom =
      finalSport !== "soccer" && finalSport !== "cricket" && Boolean(finalRoster.length);
    return (
      <section className="panel-card">
        <PanelVoiceButton control={voiceControl} />
        <h2>Your final squad</h2>
        {submittedSoccer ? (
          <>
            <p className="muted-label">{finalFormation?.label}</p>
            <SoccerFormationBoard formationCode={finalFormation!.code} players={finalRoster} limit={limit} />
            <ul className="mini-roster">
              {finalRoster.map((player, index) => (
                <li key={`${player.playerName}-${index}`}>
                  {player.slotLabel ?? player.tag ?? `#${index + 1}`} - {player.playerName}
                </li>
              ))}
            </ul>
          </>
        ) : submittedCustom ? (
          <>
            <p className="muted-label">
              {CUSTOM_SPORT_PRESETS[finalSport as CustomSport]?.displayLabel ?? "Formation"}
            </p>
            <SportFormationBoard
              sport={finalSport as CustomSport}
              slots={buildCustomSportSlots(finalSport as CustomSport, limit)}
              players={finalRoster}
            />
            <ul className="price-list">
              {finalRoster.map((player, index) => (
                <li key={`${player.playerName}-${index}`}>
                  <strong>{player.playerName}</strong>
                  <span className="price-value">{formatCurrency(player.price)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="price-list">
            {finalRoster.map((player, index) => (
              <li key={`${player.playerName}-${index}`}>
                <strong>{player.playerName}</strong>
                <span className="price-value">
                  {formatCurrency(player.price)}
                  {player.tag === "WK" && <em className="wk-badge">WK</em>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="roster-card" style={{ marginTop: "1.5rem" }}>
          <h3>Others</h3>
          <ul className="participant-list">
            {otherPlayers.map((player) => (
              <li key={player.id}>
                <div>
                  <strong>{getParticipantDisplayName(player, auction, "default")}</strong>
                  <p>
                    {player.finalRoster?.length ?? player.roster.length} picks{" "}
                    {player.hasSubmittedTeam ? "(Submitted)" : ""}
                  </p>
                </div>
                <span>
                  {player.hasSubmittedTeam
                    ? player.finalRosterSport === "soccer"
                      ? player.finalRosterFormation?.label ?? "Soccer"
                      : player.finalRosterSport === "cricket"
                        ? "Cricket"
                        : CUSTOM_SPORT_PRESETS[player.finalRosterSport as CustomSport]?.displayLabel ?? "Lineup"
                    : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card">
      <PanelVoiceButton control={voiceControl} />
      <h2>Lock your final {limit}</h2>
      <p className="muted-label">Switch between cricket order or stadium boards for other sports.</p>
      <div className="sport-toggle">
        {sportOptions.map((option) => (
          <button
            key={option.value}
            className={`btn ghost ${sport === option.value ? "active" : ""}`}
            onClick={() => setSport(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {sport === "cricket" ? (
        <div className="cricket-builder">
          <div className="formation-editor">
            <ul>
              {cricketSlots.map((slot) => {
                const assigned = cricketAssignments[slot.id] ?? "";
                const assignedElsewhere = (playerKey: string) =>
                  Object.entries(cricketAssignments).some(
                    ([key, value]) => key !== slot.id && value === playerKey
                  );
                return (
                  <li key={slot.id}>
                    <div className="cricket-slot-head">
                      <strong>{slot.label}</strong>
                      <label className={`wk-toggle ${cricketWicketSlot === slot.id ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="wk-slot"
                          checked={cricketWicketSlot === slot.id}
                          onChange={() => handleWicketToggle(slot.id)}
                        />
                        WK
                      </label>
                    </div>
                    <select
                      value={assigned ?? ""}
                      onChange={(event) => handleCricketAssign(slot.id, event.target.value)}
                    >
                      <option value="">Select player</option>
                      {rosterWithKeys.map((player) => (
                        <option
                          key={player.key}
                          value={player.key}
                          disabled={assignedElsewhere(player.key)}
                        >
                          {player.playerName} - {formatCurrency(player.price)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="player-pool">
            <h3>Player pool</h3>
            <ul>
              {rosterWithKeys.map((player) => {
                const assigned = Object.values(cricketAssignments).includes(player.key);
                return (
                  <li key={player.key} className={assigned ? "assigned" : ""}>
                    {player.playerName} - {formatCurrency(player.price)} {assigned ? "(Placed)" : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : sport === "soccer" ? (
        <div className="soccer-builder">
          <div className="formation-select">
            <label htmlFor="formation-select">Formation</label>
            <select
              id="formation-select"
              value={soccerFormation}
              onChange={(event) => setSoccerFormation(event.target.value)}
            >
              {SOCCER_FORMATIONS.map((formation) => (
                <option key={formation.code} value={formation.code}>
                  {formation.label}
                </option>
              ))}
            </select>
            {soccerShortage && (
              <p className="muted-label warning">
                Need {soccerSlots.length} players to fill this formation. You currently have{" "}
                {rosterWithKeys.length}.
              </p>
            )}
          </div>
          <div className="soccer-layout">
            <SoccerFormationBoard formationCode={soccerFormation} players={soccerAssignmentsList} limit={limit} />
            <div className="formation-editor">
              <ul>
                {soccerSlots.map((slot) => (
                  <li key={slot.id}>
                    <span>{slot.label}</span>
                    <select
                      value={soccerAssignments[slot.id] ?? ""}
                      onChange={(event) => handleSlotAssignment(slot.id, event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {rosterWithKeys.map((player) => {
                        const assignedElsewhere =
                          soccerAssignments[slot.id] !== player.key &&
                          Object.values(soccerAssignments).includes(player.key);
                        return (
                          <option key={player.key} value={player.key} disabled={assignedElsewhere}>
                            {player.playerName} - {formatCurrency(player.price)}
                          </option>
                        );
                      })}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="player-pool">
            <h3>Player pool</h3>
            <ul>
              {rosterWithKeys.map((player) => {
                const assigned = Object.values(soccerAssignments).includes(player.key);
                return (
                  <li key={player.key} className={assigned ? "assigned" : ""}>
                    {player.playerName} - {formatCurrency(player.price)} {assigned ? "(Placed)" : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        renderCustomSportBuilder(sport as CustomSport)
      )}
      <button
        className="btn accent"
        disabled={selfParticipant?.hasSubmittedTeam}
        onClick={handleSubmit}
      >
        {selfParticipant?.hasSubmittedTeam ? "Submitted" : "Submit team"}
      </button>
      <div className="roster-card" style={{ marginTop: "1.5rem" }}>
        <h3>Others</h3>
        <ul className="participant-list">
          {otherPlayers.map((player) => (
            <li key={player.id}>
              <div>
                <strong>{getParticipantDisplayName(player, auction, "default")}</strong>
                <p>
                  {player.finalRoster?.length ?? player.roster.length} picks{" "}
                  {player.hasSubmittedTeam ? "(Submitted)" : ""}
                </p>
              </div>
                <span>
                  {player.hasSubmittedTeam
                    ? player.finalRosterSport === "soccer"
                      ? player.finalRosterFormation?.label ?? "Soccer"
                      : player.finalRosterSport === "cricket"
                        ? "Cricket"
                        : CUSTOM_SPORT_PRESETS[player.finalRosterSport as CustomSport]?.displayLabel ?? "Lineup"
                    : "Pending"}
                </span>
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
  notify,
  voiceControl
}: {
  auction: Auction;
  participants: Participant[];
  selfParticipant: Participant | null;
  notify: (type: ToastState["type"], text: string) => void;
  voiceControl: VoiceButtonControl | null;
}) => {
  const others = participants.filter(
    (player) => player.id !== selfParticipant?.id && player.participating !== false
  );
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
      <PanelVoiceButton control={voiceControl} />
      <h2>Rank others</h2>
      <p>Move cards to reorder. Top pick earns the most points.</p>
      <ol className="ranking-list">
        {order.map((participantId, index) => {
          const target = participants.find((item) => item.id === participantId);
          if (!target) return null;
          const lineup =
            target.finalRoster && target.finalRoster.length ? target.finalRoster : target.roster;
          const showFormation =
            target.finalRosterSport !== "cricket" && Boolean(target.finalRoster?.length);
          return (
            <li key={participantId}>
              <div>
                <strong>
                  #{index + 1} {getParticipantDisplayName(target, auction, "default")}
                </strong>
                {showFormation ? (
                  <div className="ranking-formation">
                    <FormationDisplay
                      sport={target.finalRosterSport ?? "cricket"}
                      formationCode={target.finalRosterFormation?.code ?? null}
                      players={target.finalRoster ?? []}
                      limit={auction.playersPerTeam}
                      compact={target.finalRosterSport !== "soccer"}
                    />
                  </div>
                ) : (
                  <ul className="price-list">
                    {lineup.map((player, idx) => (
                      <li key={`${player.playerName}-${idx}`}>
                        <strong>{player.playerName}</strong>
                        <span className="price-value">
                          {formatCurrency(player.price)}
                          {"tag" in player && player.tag === "WK" && (
                            <em className="wk-badge">WK</em>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
          {participants
            .filter((player) => player.participating !== false)
            .map((player) => (
            <li key={player.id}>
              {getParticipantDisplayName(player, auction, "default")}{" "}
              -{" "}
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
  participants,
  voiceControl
}: {
  auction: Auction;
  participants: Participant[];
  voiceControl: VoiceButtonControl | null;
}) => {
  const results = auction.results ?? [];

  return (
    <section className="panel-card">
      <PanelVoiceButton control={voiceControl} />
      <h2>Final leaderboard</h2>
      {!results.length && <p>Waiting for admin to publish results...</p>}
      {results.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Points</th>
              <th>Budget left</th>
            </tr>
          </thead>
          <tbody>
            {results.map((entry) => (
              <tr key={entry.participantId}>
                <td>#{entry.rank}</td>
                <td>{entry.name}</td>
                <td>{entry.points}</td>
                <td>{formatCurrency(entry.budgetRemaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="results-rosters">
        {participants.filter((player) => player.participating !== false).map((player) => {
          const lineup =
            player.finalRoster && player.finalRoster.length ? player.finalRoster : player.roster;
          const showFormation =
            player.finalRosterSport !== "cricket" && Boolean(player.finalRoster?.length);
          return (
            <div key={player.id} className="roster-card">
              <h4>{player.name}</h4>
              <div className={`roster-body ${showFormation ? "with-board" : ""}`}>
                {showFormation && player.finalRoster && (
                  <FormationDisplay
                    sport={player.finalRosterSport ?? "cricket"}
                    formationCode={player.finalRosterFormation?.code ?? null}
                    players={player.finalRoster}
                    limit={auction.playersPerTeam}
                  />
                )}
                <ul className="price-list">
                  {lineup.map((entry, index) => (
                    <li key={`${entry.playerName}-${index}`}>
                      <strong>{entry.playerName}</strong>
                      <span className="price-value">
                        {formatCurrency(entry.price)}
                        {"tag" in entry && entry.tag === "WK" && <em className="wk-badge">WK</em>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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
    if (!auction || auction.status !== "ended" || !auction.finalizationOpen || !isAdmin) {
      rankingTriggered.current = false;
      return;
    }
    const activePlayers = participants.filter((player) => player.participating !== false);
    const everyoneSubmitted =
      activePlayers.length > 0 && activePlayers.every((player) => player.hasSubmittedTeam);
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
    const activePlayers = participants.filter((player) => player.participating !== false);
    const everyoneRanked =
      activePlayers.length > 0 && activePlayers.every((player) => player.rankingSubmitted);
    if (everyoneRanked && !resultsTriggered.current) {
      resultsTriggered.current = true;
      finalizeResults(auction.id).catch((error) =>
        notify("error", (error as Error).message)
      );
    }
  }, [auction, participants, isAdmin, notify]);
};

export default App;
