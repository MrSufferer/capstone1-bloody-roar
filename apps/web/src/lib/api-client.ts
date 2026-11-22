import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/",
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Cache-Control": "no-store",
  },
});

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    return (
      error.response?.data?.error ??
      error.response?.data?.message ??
      (error.response ? error.message : "Cannot reach the server. Check your connection and try again.")
    );
  }
  if (typeof error === "object" && error !== null && "message" in error &&
      typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
