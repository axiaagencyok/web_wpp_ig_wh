import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const AVATAR_GRADIENTS: [string, string][] = [
  ["#7C3AED", "#EC4899"],
  ["#3B82F6", "#06B6D4"],
  ["#22C55E", "#10B981"],
  ["#F59E0B", "#EF4444"],
  ["#8B5CF6", "#6366F1"],
  ["#EC4899", "#F43F5E"],
  ["#14B8A6", "#0EA5E9"],
  ["#F97316", "#FBBF24"],
  ["#A855F7", "#7C3AED"],
  ["#EF4444", "#F97316"],
];

function hashSeed(seed: string): number {
  const str = seed.replace(/\D/g, "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function avatarGradient(seed: string): string {
  const [from, to] = AVATAR_GRADIENTS[hashSeed(seed) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function avatarColor(seed: string): string {
  const [from] = AVATAR_GRADIENTS[hashSeed(seed) % AVATAR_GRADIENTS.length];
  return from;
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
