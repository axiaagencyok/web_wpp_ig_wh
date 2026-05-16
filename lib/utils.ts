import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* Editorial avatar palette — Nocturno / Violeta / Piedra families.
   Mix of solid + gradient backgrounds, dark + stone surfaces, occasional violet ring. */
export type AvatarStyle = {
  bg: string;            // CSS background (solid color or gradient)
  fg: string;            // initial color
  ring?: string;         // optional outer ring color
};

const AVATAR_STYLES: AvatarStyle[] = [
  { bg: "linear-gradient(135deg, #2E2A3F, #4A4560)", fg: "#EDE5D8" },
  { bg: "#2E2A3F",                                   fg: "#EDE5D8" },
  { bg: "linear-gradient(135deg, #4A4560, #6B6385)", fg: "#EDE5D8" },
  { bg: "#4A4560",                                   fg: "#EDE5D8" },
  { bg: "#A89E90",                                   fg: "#2E2A3F" },
  { bg: "#8A7D6D",                                   fg: "#EDE5D8" },
  { bg: "linear-gradient(135deg, #3F3B55, #2E2A3F)", fg: "#EDE5D8" },
  { bg: "#3F3B55",                                   fg: "#EDE5D8" },
  { bg: "#2E2A3F",                                   fg: "#EDE5D8", ring: "#4A4560" },
  { bg: "linear-gradient(135deg, #5A5470, #3F3B55)", fg: "#EDE5D8" },
  { bg: "#4A4560",                                   fg: "#EDE5D8", ring: "#6B6385" },
  { bg: "linear-gradient(135deg, #6B6385, #4A4560)", fg: "#EDE5D8" },
  { bg: "#C9BFAE",                                   fg: "#2E2A3F" },
  { bg: "#6B6385",                                   fg: "#EDE5D8" },
  { bg: "linear-gradient(135deg, #4A4560, #2E2A3F)", fg: "#EDE5D8" },
  { bg: "linear-gradient(135deg, #A89E90, #8A7D6D)", fg: "#EDE5D8" },
];

function hashSeed(seed: string): number {
  const str = seed.replace(/\D/g, "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getAvatarStyle(seed: string): AvatarStyle {
  return AVATAR_STYLES[hashSeed(seed) % AVATAR_STYLES.length];
}

export function avatarGradient(seed: string): string {
  return getAvatarStyle(seed).bg;
}

export function avatarColor(seed: string): string {
  return getAvatarStyle(seed).bg;
}

export function phoneInitials(phone: string): string {
  const clean = phone.replace("whatsapp:", "").replace("+", "");
  return clean.slice(-2);
}

export function nameInitials(name: string | null, phone: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.trim().slice(0, 2).toUpperCase();
  }
  return phoneInitials(phone);
}
