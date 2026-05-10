import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const AVATAR_COLORS = [
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#6366f1", "#ec4899", "#8b5cf6", "#14b8a6",
  "#f43f5e", "#3b82f6",
];

export function avatarColor(seed: string): string {
  const str = seed.replace(/\D/g, "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function phoneInitials(phone: string): string {
  const clean = phone.replace("whatsapp:", "").replace("+", "");
  return clean.slice(-2);
}
