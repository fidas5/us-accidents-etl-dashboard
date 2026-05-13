// frontend/src/pages/etl/types.ts
/**
 * 📦 TYPES ET UTILITAIRES - PAGE ETL
 * ============================================================================
 * 
 * Ce fichier contient tous les types TypeScript, interfaces et fonctions
 * utilitaires pour la gestion du pipeline ETL.
 * 
 * Il sert de contrat entre le frontend et le backend, garantissant la
 * cohérence des données échangées via l'API.
 * 
 * @module ETFTypes
 */

import React from "react";

// ────────────────────────────────────────────────────────────────────────────
// 🏷️ TYPES DE BASE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Statut d'une tâche ETL dans l'interface utilisateur
 * - idle      : Tâche non démarrée, prête à être exécutée
 * - loading   : Tâche en cours d'exécution (affichage du spinner)
 * - success   : Tâche terminée avec succès
 * - error     : Tâche échouée
 * - partial   : Tâche partiellement complétée (ex: datamart à 70%)
 */
export type JobStatus = "idle" | "loading" | "success" | "error" | "partial";

/**
 * Onglets de la page ETL
 * - jobs   : Onglet principal pour exécuter les tâches
 * - manage : Onglet pour gérer les années (suppression, etc.)
 */
export type TabType = "jobs" | "manage";

// ────────────────────────────────────────────────────────────────────────────
// 📊 INTERFACES - RÉSULTATS DES TÂCHES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Résultat détaillé d'une exécution de tâche ETL
 * Utilisé pour afficher les statistiques après chaque Run
 */
export interface JobResult {
  message: string;           // Message principal (succès/erreur)
  rows_inserted?: number;    // Nombre d'enregistrements insérés
  rows_processed?: number;   // Nombre d'enregistrements traités
  rows_skipped?: number;     // Nombre d'enregistrements ignorés (doublons)
  detail?: string;           // Détail technique de l'erreur
  missing?: string[];        // Colonnes manquantes dans le CSV
}


// ✅ Ajouter ce nouveau type pour la réponse de build-datamart-full
export interface DatamartBuildResult {
  message: string;
  result: {
    year: number;
    dim_time: number;
    dim_location: number;
    dim_weather: number;
    dim_road: number;
    fact_rows: number;
    fact_total: number;
    batches: number;
    duration_seconds: number;
  };
}
/**
 * Définition d'une tâche ETL dans l'interface
 * Utilisé pour générer dynamiquement les boutons et descriptions
 */
export interface Job {
  id: string;                // Identifiant unique (ex: "load-raw")
  label: string;             // Libellé affiché à l'utilisateur
  description: string;       // Description détaillée de l'étape
  endpoint: string;          // URL de l'API backend (ex: "/etl/load-raw")
  dependsOn?: string;        // Tâche prérequise (ex: "load-raw" pour "build-clean")
  lockHint: string;          // Message affiché si la tâche est bloquée
  icon: React.ReactNode;     // Icône Lucide React pour l'affichage
}

// ────────────────────────────────────────────────────────────────────────────
// 📁 INTERFACES - ANALYSE CSV
// ────────────────────────────────────────────────────────────────────────────

/**
 * Résultat de l'analyse du fichier CSV
 * Obtenu via l'endpoint /etl/upload-and-analyze-csv
 */
export interface CSVAnalysis {
  available_years: number[];                    // Années trouvées dans le fichier
  year_counts: Record<number, number>;         // Nombre de lignes par année
  total_rows_scanned: number;                   // Total des lignes analysées
  valid_dates_found: number;                    // Lignes avec une date valide
}

// ────────────────────────────────────────────────────────────────────────────
// 📜 INTERFACES - HISTORIQUE DES TÂCHES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enregistrement d'une tâche ETL dans l'historique
 * Correspond à la table ETLJob en base de données
 */
export interface JobHistoryItem {
  id: number;                  // ID unique en base
  name: string;                // Nom de la tâche (ex: "load-raw")
  job_type: string;            // Type (manuel, schedule, etc.)
  status: string;              // Statut: success, running, error, timeout
  rows_processed: number;      // Lignes traitées
  rows_inserted: number;       // Lignes insérées
  rows_skipped: number;        // Lignes ignorées
  error_message: string | null; // Message d'erreur si échec
  duration_seconds: number;    // Durée d'exécution en secondes
  created_at: string;          // Date/heure de création (ISO)
  last_run_at: string;         // Dernière exécution
}

// ────────────────────────────────────────────────────────────────────────────
// 🚦 INTERFACES - ÉTAT DU PIPELINE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Étape individuelle du pipeline (Raw, Clean, Datamart)
 */
export interface PipelineStep {
  exists: boolean;            // La table contient-elle des données ?
  count: number;              // Nombre d'enregistrements
  is_complete: boolean;       // L'étape est-elle terminée ?
  last_job: {                 // Dernière exécution de cette étape
    status: string;
    rows_inserted: number;
    completed_at: string | null;
    duration_seconds: number;
  } | null;
}

/**
 * État complet du pipeline ETL
 * Utilisé pour l'affichage des 4 étapes (CSV, Raw, Clean, Datamart)
 */
export interface PipelineStatus {
  csv_exists: boolean;                         // Le fichier CSV est-il uploadé ?
  raw: PipelineStep;                           // État de accidents_raw
  clean: PipelineStep;                         // État de accidents_clean
  datamart: PipelineStep & {                   // État du datamart (avec infos supplémentaires)
    expected_count: number;                    // Nombre attendu (total clean)
    missing_records: number;                   // Enregistrements manquants
    completion_percentage: number;             // Pourcentage de complétion
  };
  recommended_action: string;                  // Action recommandée ("upload", "load-raw", etc.)
}

// ────────────────────────────────────────────────────────────────────────────
// 🔄 INTERFACES - JOBS EN COURS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tâche actuellement en cours d'exécution sur le backend
 */
export interface RunningJob {
  job_id: string;              // Identifiant unique
  name: string;                // Nom de la tâche
  started_at: string;          // Date/heure de début
  duration_seconds: number;    // Durée écoulée
  process_id: number;          // ID du processus (pour annulation)
}

// ────────────────────────────────────────────────────────────────────────────
// 📅 INTERFACES - GESTION DES ANNÉES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Distribution des accidents par année dans le datamart
 */
export interface YearData {
  year: number;                // Année (ex: 2022)
  count: number;               // Nombre d'accidents pour cette année
}

/**
 * État du pipeline pour une année spécifique
 * Permet de savoir où en est l'import pour chaque année
 */
export interface YearPipelineStatus {
  year: number;                // Année concernée
  raw_exists: boolean;         // Présence dans accidents_raw
  clean_exists: boolean;       // Présence dans accidents_clean
  fact_exists: boolean;        // Présence dans fact_accident
  raw_count: number;           // Nombre dans raw
  clean_count: number;         // Nombre dans clean
  fact_count: number;          // Nombre dans datamart
}

// ────────────────────────────────────────────────────────────────────────────
// 📈 INTERFACES - PROGRESSION EN TEMPS RÉEL
// ────────────────────────────────────────────────────────────────────────────

/**
 * Progression d'une tâche en cours (pour le polling frontend)
 * Permet d'afficher le pourcentage, le nombre de lignes, etc.
 */
export interface JobProgress {
  active: boolean;             // La tâche est-elle encore active ?
  stage?: string;              // Étape actuelle (loading, cleaning, etc.)
  rows_processed?: number;     // Lignes traitées jusqu'ici
  rows_inserted?: number;      // Lignes insérées jusqu'ici
  rows_skipped?: number;       // Lignes ignorées
  pct?: number;                // Pourcentage de complétion (0-100)
  elapsed_seconds?: number;    // Temps écoulé
  chunk?: number;              // Numéro du chunk en cours (load-raw)
  batch?: number;              // Numéro du batch en cours (build-clean)
}


// ────────────────────────────────────────────────────────────────────────────
// 🛠️ FONCTIONS UTILITAIRES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Formate un nombre en français (séparateur de milliers)
 * Exemple: 1234567 → "1 234 567"
 * 
 * @param n - Nombre à formater (peut être undefined)
 * @returns Chaîne formatée ou "—" si valeur manquante
 */
export function fmt(n?: number): string {
  return n != null ? n.toLocaleString("fr-FR") : "—";
}

/**
 * Formate une durée en secondes en format lisible
 * Exemples:
 * - 45s → "45.0s"
 * - 125s → "2m 5s"
 * - 3665s → "61m 5s"
 * 
 * @param s - Durée en secondes
 * @returns Chaîne formatée
 */
export function fmtDuration(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

/**
 * Ensemble des statuts indiquant qu'une tâche est en cours d'exécution
 * Utilisé par isInProgress() pour déterminer l'affichage
 */
export const IN_PROGRESS_STATUSES = new Set([
  "running",      // En cours d'exécution normale
  "pending",      // En attente dans la file
  "in_progress",  // En progression
  "started",      // Démarré
  "processing",   // En traitement
  "active",       // Actif
  "loading"       // En chargement
]);

/**
 * Vérifie si un statut indique que la tâche est en cours
 * 
 * @param status - Statut à vérifier
 * @returns true si la tâche est en cours, false sinon
 * 
 * @example
 * isInProgress("running")  // true
 * isInProgress("success")  // false
 */
export function isInProgress(status: string): boolean {
  return IN_PROGRESS_STATUSES.has(status);
}

/**
 * Détermine l'affichage du badge de statut (label + couleurs)
 * Centralise la logique de rendu pour les badges d'historique
 * 
 * @param job - Élément de l'historique
 * @returns Label, couleur du texte et couleur de fond
 * 
 * @example
 * const { label, color, background } = getDisplayStatus(job);
 * // { label: "Succès", color: "#4ade80", background: "rgba(74,222,128,.12)" }
 */
export function getDisplayStatus(job: JobHistoryItem): {
  label: string;
  color: string;
  background: string;
} {
  // Succès
  if (job.status === "success") {
    return {
      label: "Succès",
      color: "#4ade80",
      background: "rgba(74,222,128,.12)"
    };
  }
  
  // En cours (tous les statuts de IN_PROGRESS_STATUSES)
  if (isInProgress(job.status)) {
    return {
      label: "En cours",
      color: "#60a5fa",
      background: "rgba(59,130,246,.12)"
    };
  }
  
  // Par défaut : Échec
  return {
    label: "Échec",
    color: "#f87171",
    background: "rgba(239,68,68,.12)"
  };
}

/**
 * Extrait un message d'erreur lisible à partir d'une exception Axios
 * Gère différents types d'erreurs (réseau, serveur, timeout, etc.)
 * 
 * @param err - L'erreur capturée (unknown type)
 * @returns Message d'erreur en français
 * 
 * @example
 * try {
 *   await axios.post(...)
 * } catch (err) {
 *   setError(extractErrorMessage(err));
 * }
 */
export function extractErrorMessage(err: unknown): string {
  // Erreur Axios avec réponse du serveur
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as any;
    const data = axiosErr.response?.data;
    
    // Priorité au détail technique
    if (data?.detail) return String(data.detail);
    // Puis au message général
    if (data?.message) return String(data.message);
    // Timeout
    if (axiosErr.code === "ECONNABORTED") {
      return "Le traitement est toujours en cours sur le serveur";
    }
    // Pas de réponse du serveur
    if (!axiosErr.response) {
      return "Impossible de joindre le serveur";
    }
    // Code HTTP standard
    return `Erreur serveur ${axiosErr.response.status}: ${axiosErr.response.statusText}`;
  }
  
  // Erreur JavaScript standard
  if (err instanceof Error) return err.message;
  
  // Fallback
  return "Une erreur inattendue s'est produite.";
}