// List of random 5-letter words for team names/codes
export const WORDS = [
    "APPLE", "BEACH", "CANDY", "DELTA", "EAGLE", "FLAME", "GRAPE", "HONEY", "IVORY", "JOLLY",
    "KARMA", "LEMON", "MANGO", "NOBLE", "OCEAN", "PEARL", "QUAKE", "RAVEN", "SUNNY", "TIGER",
    "ULTRA", "VIVID", "WALTZ", "XENON", "YACHT", "ZEBRA", "ACORN", "BASIL", "CHILI", "DUSKY",
    "ELDER", "FROST", "GLORY", "HAPPY", "IDEAL", "JUICE", "KNIFE", "LIGHT", "MIGHT", "NINJA",
    "OPERA", "PRIDE", "QUILL", "ROAST", "SHEEP", "THORN", "UNITY", "VIXEN", "WOOZY", "XENIA",
    "YOUTH", "ZAPPY", "ANGEL", "BRAVE", "CRISP", "DREAM", "EVERY", "FAITH", "GHOST", "HEART",
    "IMAGE", "JUDGE", "KNEEL", "LUSHY", "MOUSE", "NOVEL", "OFFER", "PIXEL", "QUIRK", "REACH",
    "SHINE", "TRUST", "UNION", "VAPOR", "WOMAN", "YIELD", "ZONAL", "ALERT", "BERRY", "ZESTY",
    "CLASS", "DRIVE", "ELITE", "FABLE", "GRAND", "HOUSE", "INERT", "JOLTS", "KNACK", "LABEL",
    "MAGIC", "NOBLY", "ORDER", "PEACE", "QUOTA", "RANGE", "SCALE", "TOKEN", "UNITE", "VAULT",
    "WHOLE", "XERIC", "YEARN", "ZIPPY", "AMBER", "BLISS", "CRANE", "DUSK", "ENJOY"
]

export function getRandomWord(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return word;
}
