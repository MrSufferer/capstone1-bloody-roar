import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}
