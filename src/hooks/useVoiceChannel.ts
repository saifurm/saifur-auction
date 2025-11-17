import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type MediaConnection } from "peerjs";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase";

type VoiceScope = "lobby" | "live";

export interface VoiceStream {
  peerId: string;
  stream: MediaStream;
}

interface VoiceChannelOptions {
  auctionId: string | null;
  clientId: string | null;
  scope: VoiceScope;
  listenOnly?: boolean;
  autoJoin?: boolean;
}

const buildPeerId = (auctionId: string, scope: VoiceScope, clientId: string) =>
  `voice-${auctionId}-${scope}-${clientId}`;

export const useVoiceChannel = ({
  auctionId,
  clientId,
  scope,
  listenOnly = false,
  autoJoin = false
}: VoiceChannelOptions) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<VoiceStream[]>([]);

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const presenceDocRef = useRef<ReturnType<typeof doc> | null>(null);
  const snapshotUnsubRef = useRef<Unsubscribe | null>(null);
  const callMapRef = useRef<Map<string, MediaConnection>>(new Map());
  const listenOnlyRef = useRef(listenOnly);

  const resetRemoteStreams = useCallback(() => {
    setRemoteStreams([]);
    callMapRef.current.forEach((call) => {
      try {
        call.close();
      } catch {
        // ignore
      }
    });
    callMapRef.current.clear();
  }, []);

  const teardownPeer = useCallback(() => {
    snapshotUnsubRef.current?.();
    snapshotUnsubRef.current = null;

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    resetRemoteStreams();
  }, [resetRemoteStreams]);

  const removePresenceDoc = useCallback(async () => {
    const ref = presenceDocRef.current;
    presenceDocRef.current = null;
    if (!ref) return;
    try {
      await deleteDoc(ref);
    } catch {
      // Firestore delete errors are non-blocking for UX here.
    }
  }, []);

  const addRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const existing = prev.some((entry) => entry.peerId === peerId);
      if (existing) {
        return prev.map((entry) => (entry.peerId === peerId ? { ...entry, stream } : entry));
      }
      return [...prev, { peerId, stream }];
    });
  }, []);

  const removeRemoteStream = useCallback((peerId: string) => {
    setRemoteStreams((prev) => {
      const next = prev.filter((entry) => entry.peerId !== peerId);
      if (next.length === prev.length) return prev;
      return next;
    });
    callMapRef.current.delete(peerId);
  }, []);

  const bindCall = useCallback(
    (call: MediaConnection, peerId: string) => {
      callMapRef.current.set(peerId, call);
      call.on("stream", (remote) => addRemoteStream(peerId, remote));
      call.on("close", () => removeRemoteStream(peerId));
      call.on("error", () => removeRemoteStream(peerId));
    },
    [addRemoteStream, removeRemoteStream]
  );

  const leaveChannel = useCallback(async () => {
    if (!peerRef.current && !streamRef.current && !presenceDocRef.current) {
      return;
    }
    setConnected(false);
    teardownPeer();
    await removePresenceDoc();
  }, [removePresenceDoc, teardownPeer]);

  const joinChannel = useCallback(async () => {
    if (connecting || connected) return;
    if (!auctionId || !clientId) {
      setError("Join an auction before using voice chat.");
      return;
    }
    if (typeof window === "undefined") return;
    if (!listenOnly && !navigator?.mediaDevices?.getUserMedia) {
      setError("Browser does not support microphone access.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      if (!listenOnly) {
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = localStream;
      } else {
        streamRef.current = null;
      }

      const peerId = buildPeerId(auctionId, scope, clientId);
      const peer = new Peer(peerId);
      peerRef.current = peer;

      await new Promise<void>((resolve, reject) => {
        peer.once("open", () => resolve());
        peer.once("error", (err) => reject(err));
      });

      peer.on("error", () => {
        setError("Voice connection lost.");
        void leaveChannel();
      });

      peer.on("call", (call) => {
        if (callMapRef.current.has(call.peer)) {
          call.close();
          return;
        }
        call.answer(streamRef.current ?? undefined);
        bindCall(call, call.peer);
      });

      const voiceCollection = collection(db, "auctions", auctionId, "voicePresence");
      const docId = `${scope}-${clientId}`;
      const ref = doc(voiceCollection, docId);
      presenceDocRef.current = ref;
      await setDoc(ref, {
        peerId,
        clientId,
        scope,
        listenOnly,
        joinedAt: serverTimestamp()
      });

      const startCall = (targetPeerId: string) => {
        if (listenOnly) return;
        if (!peerRef.current || !streamRef.current) return;
        if (targetPeerId === peerId) return;
        if (callMapRef.current.has(targetPeerId)) return;
        const call = peerRef.current.call(targetPeerId, streamRef.current);
        if (!call) return;
        bindCall(call, targetPeerId);
      };

      snapshotUnsubRef.current = onSnapshot(
        query(voiceCollection, where("scope", "==", scope)),
        (snapshot) => {
          const peers = snapshot
            .docs.map(
              (docSnap) =>
                docSnap.data() as { peerId: string; clientId: string; listenOnly?: boolean }
            )
            .filter((entry) => entry.clientId !== clientId);

          const activePeerIds = new Set(peers.map((entry) => entry.peerId));
          Array.from(callMapRef.current.keys()).forEach((peerKey) => {
            if (!activePeerIds.has(peerKey)) {
              const existingCall = callMapRef.current.get(peerKey);
              if (existingCall) {
                existingCall.close();
              }
              removeRemoteStream(peerKey);
            }
          });

          peers.forEach((entry) => startCall(entry.peerId));
        }
      );

      setConnected(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to join the voice channel.";
      setError(message);
      teardownPeer();
      await removePresenceDoc();
    } finally {
      setConnecting(false);
    }
  }, [
    auctionId,
    bindCall,
    clientId,
    connected,
    connecting,
    leaveChannel,
    removePresenceDoc,
    removeRemoteStream,
    scope,
    teardownPeer,
    listenOnly
  ]);

  useEffect(() => {
    return () => {
      void leaveChannel();
    };
  }, [leaveChannel]);

  useEffect(() => {
    if (!auctionId && connected) {
      void leaveChannel();
    }
  }, [auctionId, connected, leaveChannel]);

  useEffect(() => {
    if (!autoJoin) return;
    if (connected || connecting) return;
    void joinChannel();
  }, [autoJoin, connected, connecting, joinChannel]);

  useEffect(() => {
    if (listenOnlyRef.current === listenOnly) return;
    listenOnlyRef.current = listenOnly;
    if (!auctionId || !clientId) return;
    if (!peerRef.current) {
      if (autoJoin) {
        void joinChannel();
      }
      return;
    }
    (async () => {
      await leaveChannel();
      if (autoJoin) {
        await joinChannel();
      }
    })();
  }, [listenOnly, autoJoin, auctionId, clientId, joinChannel, leaveChannel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBeforeUnload = () => {
      void leaveChannel();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [leaveChannel]);

  return {
    connected,
    connecting,
    error,
    remoteStreams,
    join: joinChannel,
    leave: leaveChannel,
    toggle: () => {
      if (connected) {
        void leaveChannel();
      } else {
        void joinChannel();
      }
    }
  };
};
