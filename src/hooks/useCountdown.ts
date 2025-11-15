import { useEffect, useState } from "react";
import type { Timestamp } from "firebase/firestore";

export const useCountdown = (target?: Timestamp | null) => {
  const [msRemaining, setMsRemaining] = useState(0);
  const [isExpired, setExpired] = useState(false);

  useEffect(() => {
    const targetMs = target?.toMillis();
    if (!targetMs) {
      setMsRemaining(0);
      setExpired(false);
      return;
    }

    const update = () => {
      const diff = targetMs - Date.now();
      setMsRemaining(diff);
      setExpired(diff <= 0);
    };

    update();
    const interval = setInterval(update, 300);
    return () => clearInterval(interval);
  }, [target]);

  return { msRemaining, isExpired };
};
