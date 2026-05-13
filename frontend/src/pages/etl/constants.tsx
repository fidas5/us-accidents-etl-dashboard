// frontend/src/pages/etl/constants.tsx
import React from "react";
import { Database, Zap, BarChart3 } from "lucide-react";
import type { Job } from "./types";

export const JOBS: Job[] = [
  {
    id: "load-raw",
    label: "Charger les données brutes",
    description: "Ingestion CSV → table accidents_raw (ajout des nouvelles années, suppression des doublons)",
    endpoint: "/etl/load-raw",
    dependsOn: "__upload__",
    lockHint: "Téléchargez et analysez d'abord un fichier CSV valide",
    icon: <Database size={14} />,
  },
  {
    id: "build-clean",
    label: "Construire les données nettoyées",
    description: "Validation, conversion des unités (°C / km) et enrichissement → accidents_clean",
    endpoint: "/etl/build-clean",
    dependsOn: "load-raw",
    lockHint: '"Charger les données brutes"',
    icon: <Zap size={14} />,
  },
  {
    id: "build-datamart",
    label: "Construire le datamart",
    description: "Création du schéma en étoile (dimensions : temps, lieu, météo, route + table de faits)",
    endpoint: "/etl/build-datamart-full", // ✅ Changement : utilise le nouveau endpoint
    dependsOn: "build-clean",
    lockHint: '"Construire les données nettoyées"',
    icon: <BarChart3 size={14} />,
  },
];

export const REQUIRED_COLUMNS = [
  "ID", "Start_Time", "End_Time", "City", "State", "Severity",
  "Temperature(F)", "Visibility(mi)", "Weather_Condition", "Start_Lat", "Start_Lng",
];