/**
 * Shared className utility: merges conditional class lists (clsx) and
 * resolves conflicting Tailwind classes (tailwind-merge).
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
