const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const millionFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

export const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) {
    return "$0";
  }
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    const label = millionFormatter.format(millions);
    return `$${label}M`;
  }
  return usdFormatter.format(value);
};

export const formatTimer = (ms: number) => {
  const safeMs = Math.max(ms, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};
