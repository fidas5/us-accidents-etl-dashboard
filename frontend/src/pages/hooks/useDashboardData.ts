// src/hooks/useDashboardData.ts
/**
 * 🎯 HOOK PERSONNALISÉ - Gestion des données du tableau de bord
 * 
 * Ce hook est responsable de :
 * 1. Récupérer toutes les données du dashboard depuis l'API
 * 2. Mettre en cache les résultats pour éviter les appels réseau inutiles
 * 3. Gérer le chargement, les erreurs et les refetchs automatiques
 * 4. Appliquer les filtres (année, sévérité, état, mois)
 * 
 */

import { useQuery } from '@tanstack/react-query';
// 📦 useQuery : Hook principal de React Query
// Il gère tout le cycle de vie d'une requête asynchrone :
// - État de chargement (isLoading)
// - État d'erreur (error)
// - Données (data)
// - Cache automatique
// - Refetch (rechargement)

import axios from 'axios';
// 🌐 axios : Client HTTP pour faire des requêtes API


import { buildQS } from '../../pages/utils/dashboard.utils';
// 🔧 buildQS : Fonction utilitaire qui construit la Query String
// Exemple : { year: [2021,2022], state: ['CA'] } → "?year=2021,2022&state=CA"

// ─── Configuration ───────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL;

// ─── Types TypeScript ────────────────────────────────────────────────────────

interface Filters {
  year: number[];      // Liste des années sélectionnées (ex: [2021, 2022])
  severity: number[];  // Liste des sévérités (1=Low, 2=Moderate, 3=High, 4=Critical)
  state: string[];     // Liste des codes d'états (ex: ['CA', 'TX', 'NY'])
  month: number[];     // Liste des mois (1=Janvier à 12=Décembre)
}


// ─── Fonction utilitaire pour générer une clé de cache unique ───────────────

/**
 * Génère une clé unique pour les filtres (utilisée pour le cache React Query)
 * 
 * Pourquoi ? React Query utilise les clés pour identifier chaque requête dans le cache.
 * Deux requêtes avec la même clé = mêmes données en cache.
 * 
 * Exemple :
 * - Filtres: { year: [2021,2022], severity: [2,3] }
 * - Clé générée: '{"year":[2021,2022],"severity":[2,3],"state":[],"month":[]}'
 * 
 */
const getFiltersKey = (filters: Filters): string => {
  return JSON.stringify({
    year: [...filters.year].sort(),
    severity: [...filters.severity].sort(),
    state: [...filters.state].sort(),
    month: [...filters.month].sort(),
  });
};

// ─── Hook principal ──────────────────────────────────────────────────────────

/**
 * Hook personnalisé pour récupérer toutes les données du dashboard
 * 
 * Fonctionnement :
 * 1. Vérifie si un token JWT est présent (authentification requise)
 * 2. Construit la query string à partir des filtres
 * 3. Lance les requêtes API en parallèle (Promise.all)
 * 4. Met en cache les résultats pour 5 minutes
 * 5. Revalide automatiquement les données quand les filtres changent
 * 
 */
export const useDashboardData = (filters: Filters, token: string | null) => {
  return useQuery({
    // 🔑 Clé de cache unique basée sur les filtres
    // Permet de stocker séparément les données pour différentes combinaisons de filtres
    queryKey: ['dashboard', getFiltersKey(filters)],
    
    // 📡 Fonction qui exécute la requête (appelée automatiquement par React Query)
    queryFn: async () => {
      console.log('🔄 Fetching fresh data from API for filters:', filters);
      
      // 1. Construire la query string à partir des filtres
      // Exemple: "?year=2021,2022&severity=2,3&state=CA,TX&month=1,2"
      const qs = buildQS(filters);
      
      // 2. Préparer les headers avec le token JWT pour l'authentification
      const hdrs = { Authorization: `Bearer ${token}` };
      
      // 3. Lancer TOUTES les requêtes API en parallèle
      // Promise.all = attend que TOUTES les promesses soient résolues
      // 17 requêtes simultanées = meilleure performance
      const [
        ov,     // 📊 overview     - Vue d'ensemble (total accidents, moyennes)
        sev,    // 📈 by-severity  - Distribution par sévérité
        mo,     // 📅 by-month     - Tendance mensuelle
        yr,     // 📆 by-year      - Comparaison année par année
        st,     // 🗺️ by-state     - Accidents par état (top 10)
        mp,     // 📍 map-points   - Points sur la carte (villes)
        wea,    // 🌤️ by-weather   - Impact météo
        hr,     // ⏰ by-hour      - Heatmap heure/jour
        env,    // 🌡️ by-env-bucket - Buckets température + visibilité
        avgDur, // ⏱️ avg-duration  - Durée moyenne des accidents
        highSev,// 🔴 high-severity-rate - Taux de sévérité élevée
        sevRF,  // 🛣️ severity-by-road-feature - Impact des infrastructures
        riskM,  // ⚠️ risk-multiplier - Multiplicateur de risque
        rushH,  // 🚦 rush-hour-severity-index - Index heures de pointe
        durS,   // 📊 duration-by-severity - Durée par sévérité
        nightR, // 🌙 night-risk-multiplier - Risque nocturne
        visR,   // 👁️ visibility-risk - Risque par visibilité
      ] = await Promise.all([
        axios.get(`${API}/api/stats/overview${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-severity${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-month${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-year${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-state${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/map-points${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-weather${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-hour${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-env-bucket${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/avg-duration${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/high-severity-rate${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/severity-by-road-feature${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/risk-multiplier${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/rush-hour-severity-index${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/duration-by-severity${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/night-risk-multiplier${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/visibility-risk${qs}`, { headers: hdrs }),
      ]);

      // 4. Formater et retourner les données (transformation des réponses API)
      // Chaque composant du dashboard reçoit exactement la structure de données dont il a besoin
      return {
        // 📊 KPI 1 - Overview (carte d'identité des accidents)
        overview: ov.data,
        
        // 📈 Distribution des sévérités (pour le graphique circulaire)
        sevData: sev.data.data ?? [],
        
        // 📅 Tendance mensuelle (pour le graphique linéaire)
        monthData: mo.data.data ?? [],
        
        // 📆 Comparaison annuelle (pour le graphique YoY)
        yearData: yr.data.data ?? [],
        
        // 🗺️ Top 10 des états (pour le classement)
        stateData: (st.data.data ?? []).slice(0, 10),
        
        // 📍 Données cartographiques (villes avec coordonnées GPS)
        mapData: mp.data,
        
        // 🌤️ Impact météo (top conditions)
        weatherData: wea.data.data ?? [],
        
        // ⏰ Heatmap heures (matrice 24h × 7 jours)
        hourGrid: hr.data.grid ?? [],
        
        // 🌡️ Buckets température (ex: Chaud, Froid, etc.)
        tempBuckets: env.data.temp_buckets ?? [],
        
        // 👁️ Buckets visibilité (Bonne, Modérée, Faible)
        visBuckets: env.data.vis_buckets ?? [],
        
        // ⏱️ Durée moyenne (indicateur clé)
        avgDuration: avgDur.data.avg_duration_min ?? null,
        
        // 🔴 Taux de sévérité élevée (severity >= 3)
        highSeverityRate: highSev.data.high_severity_rate ?? null,
        
        // 🛣️ Impact des infrastructures routières (feux, stops, etc.)
        sevByRoadFeat: sevRF.data.data ?? [],
        
        // ⚠️ Multiplicateur de risque global
        riskMultiplier: riskM.data ?? null,
        
        // 🚦 Index de sévérité aux heures de pointe
        rushHourIndex: rushH.data.rush_hour_severity_index ?? null,
        
        // 📊 Durée moyenne par niveau de sévérité
        durBySev: durS.data.data ?? [],
        
        // 🌙 Multiplicateur de risque nocturne
        nightRiskMult: nightR.data ?? null,
        
        // 👁️ Risque par niveau de visibilité
        visRisk: visR.data.data ?? [],
      };
    },
    
    // ⚙️ Configuration de React Query ─────────────────────────────────────────
    
    // enabled : La requête ne s'exécute que si un token est présent
    // Évite les appels API quand l'utilisateur n'est pas connecté
    enabled: !!token,
    
    // staleTime : 5 minutes avant que les données ne soient considérées "périmées"
    // Pendant 5 minutes, React Query retourne les données du cache sans refetch
    // Réduit les appels API inutiles
    staleTime: 5 * 60 * 1000,
    
    // gcTime : 24 heures avant suppression du cache (Garbage Collection)
    // Si l'utilisateur revient sur la page après 23h, les données sont encore là
    gcTime: 24 * 60 * 60 * 1000,
    
    // refetchOnMount : Ne pas refetch automatique au montage du composant
    // Utilise les données du cache si disponibles
    refetchOnMount: false,
    
    // refetchOnWindowFocus : Ne pas refetch quand l'utilisateur revient sur l'onglet
    // Économise des requêtes inutiles
    refetchOnWindowFocus: false,
    
    // refetchOnReconnect : Ne pas refetch quand la connexion réseau revient
    refetchOnReconnect: false,
    
    // Note: Les filtres changent automatiquement la queryKey, donc React Query
    // va chercher de nouvelles données UNIQUEMENT quand les filtres changent
  });
};