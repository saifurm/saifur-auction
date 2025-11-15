import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase";
import type { Auction, Participant } from "../types";

export const useAuctionData = (auctionId: string | null) => {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auctionId) {
      setAuction(null);
      setParticipants([]);
      return;
    }

    setLoading(true);
    const auctionRef = doc(db, "auctions", auctionId);
    let participantUnsub: Unsubscribe | null = null;

    const unsubAuction = onSnapshot(
      auctionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setAuction(null);
          setParticipants([]);
          setLoading(false);
          if (participantUnsub) {
            participantUnsub();
            participantUnsub = null;
          }
          return;
        }

        setAuction({
          id: snapshot.id,
          ...(snapshot.data() as Omit<Auction, "id">)
        });
        setLoading(false);

        if (!participantUnsub) {
          const participantRef = collection(auctionRef, "participants");
          const q = query(participantRef, orderBy("joinedAt", "asc"));
          participantUnsub = onSnapshot(q, (partSnap) => {
            const entries: Participant[] = [];
            partSnap.forEach((docSnap) => {
              entries.push({
                id: docSnap.id,
                ...(docSnap.data() as Omit<Participant, "id">)
              });
            });
            setParticipants(entries);
          });
        }
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      unsubAuction();
      if (participantUnsub) {
        participantUnsub();
      }
    };
  }, [auctionId]);

  return { auction, participants, loading };
};
