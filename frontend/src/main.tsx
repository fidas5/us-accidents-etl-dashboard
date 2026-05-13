/**
 * 🚀 MAIN.TSX - Point d'entrée de l'application
 * 
 * Ce fichier est le tout premier code exécuté par l'application.
 * Il monte l'application React dans le DOM et configure :
 * - Le cache persistant (React Query)
 * - Les styles globaux (Bootstrap, index.css)
 * - Le mode strict (détection d'erreurs)
 * 
 * 🎯 Flux d'exécution :
 * 1. Récupère la div "root" dans index.html
 * 2. Crée un root React (React 18)
 * 3. Entoure l'App avec les providers nécessaires
 * 4. Affiche l'application dans le navigateur
 * 
 * 💾 Cache persistant :
 * - Les données API sont sauvegardées dans localStorage
 * - Valides pendant 24 heures
 * - Refetch silencieux en arrière-plan
 * - L'utilisateur voit les données immédiatement après refresh
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client' // API React 18 pour le rendu
import './index.css' // Styles CSS globaux
import App from './App.tsx'
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours (for persistence)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// Create persister that saves to localStorage
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'REACT_QUERY_CACHE', // Key for localStorage
  throttleTime: 1000, // Don't save more than once per second
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // Cache persists for 24 hours
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)