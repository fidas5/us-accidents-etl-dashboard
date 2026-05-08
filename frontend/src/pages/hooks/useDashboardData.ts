// src/hooks/useDashboardData.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { buildQS } from '../../pages/utils/dashboard.utils';

const API = "http://127.0.0.1:5050";

interface Filters {
  year: number[];
  severity: number[];
  state: string[];
  month: number[];
}

// Generate a unique key for filters
const getFiltersKey = (filters: Filters): string => {
  return JSON.stringify({
    year: [...filters.year].sort(),
    severity: [...filters.severity].sort(),
    state: [...filters.state].sort(),
    month: [...filters.month].sort(),
  });
};

export const useDashboardData = (filters: Filters, token: string | null) => {
  return useQuery({
    // Include a hash of filters in the query key for proper caching
    queryKey: ['dashboard', getFiltersKey(filters)],
    queryFn: async () => {
      console.log('🔄 Fetching fresh data from API for filters:', filters);
      const qs = buildQS(filters);
      const hdrs = { Authorization: `Bearer ${token}` };
      
      const [
        ov, sev, mo, yr, st, mp, wea, hr, env, 
        avgDur, highSev, sevRF, riskM, rushH, durS, nightR, visR
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

      return {
        overview: ov.data,
        sevData: sev.data.data ?? [],
        monthData: mo.data.data ?? [],
        yearData: yr.data.data ?? [],
        stateData: (st.data.data ?? []).slice(0, 10),
        mapData: mp.data,
        weatherData: wea.data.data ?? [],
        hourGrid: hr.data.grid ?? [],
        tempBuckets: env.data.temp_buckets ?? [],
        visBuckets: env.data.vis_buckets ?? [],
        avgDuration: avgDur.data.avg_duration_min ?? null,
        highSeverityRate: highSev.data.high_severity_rate ?? null,
        sevByRoadFeat: sevRF.data.data ?? [],
        riskMultiplier: riskM.data ?? null,
        rushHourIndex: rushH.data.rush_hour_severity_index ?? null,
        durBySev: durS.data.data ?? [],
        nightRiskMult: nightR.data ?? null,
        visRisk: visR.data.data ?? [],
      };
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    refetchOnMount: false, // Don't refetch on mount
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Don't automatically refetch when filters change
    // The query will use cached data if available
  });
};