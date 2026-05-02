// Utility functions
import { AxiosError } from "axios";
import type { Filters } from "../types/dashboard.types";

export function useIsDark() {
  // Implementation from original
}

export function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    const d = err.response?.data;
    if (d?.detail) return String(d.detail);
    if (d?.error) return String(d.error);
    if (d?.message) return String(d.message);
    if (!err.response) return "Cannot reach server — is the backend running?";
    return `Server error ${err.response.status}`;
  }
  return err instanceof Error ? err.message : "Unexpected error";
}

export function buildQS(f: Filters): string {
  const p = new URLSearchParams();
  if (f.year.length) p.set("year", f.year.join(","));
  if (f.severity.length) p.set("severity", f.severity.join(","));
  if (f.state.length) p.set("state", f.state.join(","));
  if (f.month.length) p.set("month", f.month.join(","));
  return p.toString() ? "?" + p.toString() : "";
}