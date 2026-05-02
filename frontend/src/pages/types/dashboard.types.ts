// Types for all dashboard data
export interface Filters { year: number[]; severity: number[]; state: string[]; month: number[] }
export interface Overview { years_covered: number[]; total_accidents: number; avg_severity: number; avg_duration_min: number; severity_breakdown: Record<string, number>; }
export interface SevRow { severity: number; label: string; count: number; pct: number }
export interface MonthRow { month: number; month_name: string; month_short: string; count: number; avg_severity: number }
export interface YearRow { year: number; count: number; avg_severity: number }
export interface StateRow { state: string; count: number; avg_severity: number }
export interface MapCity { city: string; state: string; count: number; avg_severity: number; lat: number; lng: number }
export interface WeatherRow { weather_condition: string; count: number; pct: number; avg_severity: number }
export interface HourCell { hour: number; day_of_week: number; day_name: string; count: number; intensity: number }
export interface EnvBucket { bucket: string; count: number; pct: number; avg_severity: number }
export interface SevRoadFeat { road_feature: string; count: number; avg_severity: number }
export interface DurBySev { severity: number; label: string; avg_duration_min: number }
export interface VisRisk { visibility_bucket: string; avg_severity: number }
export interface WeaSevScore { weather_condition: string; avg_severity: number }
export interface FeatImportance { feature: string; importance: number }

// Add or verify these types exist in src/pages/types/dashboard.types.ts
export interface SevRoadFeat {
  road_feature: string;
  count: number;
  avg_severity: number;
}

export interface VisRisk {
  visibility_bucket: string;  // "Poor", "Moderate", "Good"
  avg_severity: number;
}