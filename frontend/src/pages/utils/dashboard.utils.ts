
/**
 * 🛠️ DASHBOARD UTILS - Fonctions utilitaires partagées
 * 
 * Ce fichier contient des fonctions réutilisables pour :
 * - Détection du thème (dark/light)
 * - Construction des paramètres d'URL
 * 
 * 🎯 Pourquoi ce fichier ?
 * - Évite la duplication de code
 * - Centralise la logique réutilisable
 * - Facilite les tests unitaires
 */



import { AxiosError } from "axios";
import type { Filters } from "../types/dashboard.types";

export function useIsDark() {
  // Implementation from original
}



export function buildQS(f: Filters): string {
  const p = new URLSearchParams();
  if (f.year.length) p.set("year", f.year.join(","));
  if (f.severity.length) p.set("severity", f.severity.join(","));
  if (f.state.length) p.set("state", f.state.join(","));
  if (f.month.length) p.set("month", f.month.join(","));
  return p.toString() ? "?" + p.toString() : "";
}