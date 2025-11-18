const ALIAS_POOL = [
  "Nova",
  "Lyric",
  "Mochi",
  "Zippy",
  "Cosmo",
  "Peach",
  "Buzzy",
  "Pipin",
  "Jelly",
  "Salsa",
  "Lilac",
  "Mango",
  "Turbo",
  "Nifty",
  "Pixel",
  "Bingo",
  "Chill",
  "Sprig",
  "Sunny",
  "Taffy",
  "Gigle",
  "Quirk",
  "Bongo",
  "Noodle",
  "Happy"
];

export const generateAlias = () => {
  const base = ALIAS_POOL[Math.floor(Math.random() * ALIAS_POOL.length)];
  return base.slice(0, 6);
};
