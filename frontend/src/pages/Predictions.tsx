// src/pages/Predictions.tsx
import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useIsDark } from "./utils/dashboard.utils";
import { DARK, LIGHT } from "./themes/dashboard.themes";

const API = "http://127.0.0.1:5050";

const SEASONS = ["Printemps", "Été", "Automne", "Hiver"];
const TIME_OF_DAY = ["Matin", "Après-midi", "Soir", "Nuit"];
const STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI", "Autre"];
const WEATHER_CONDITIONS = ["Clair", "Nuageux", "Pluie", "Neige", "Brouillard", "Autre"];
const US_REGIONS = ["Ouest", "Sud", "Nord-Est", "Midwest"];

const SEV_COLORS = {
  1: "#60a5fa",
  2: "#fbbf24",
  3: "#fb923c",
  4: "#f87171"
};

const SEV_LABELS_FR = {
  1: "Faible",
  2: "Modérée",
  3: "Élevée",
  4: "Critique"
};

const SEV_DESCRIPTIONS_FR = {
  1: "Accident mineur avec dégâts minimes. Peu ou pas de blessures.",
  2: "Gravité moyenne avec blessures possibles. Peut causer des ralentissements.",
  3: "Accident grave avec blessures confirmées. Perturbation significative du trafic.",
  4: "Accident grave avec blessures majeures ou décès. Fermeture complète de la route."
};

interface PredictionForm {
  duration_min: number;
  hour: number;
  month: number;
  day_of_week: number;
  temperature_c: number;
  visibility_km: number;
  season: string;
  time_of_day: string;
  state: string;
  weather_condition: string;
  us_region: string;
  traffic_signal: boolean;
  crossing: boolean;
  junction: boolean;
  railway: boolean;
  stop: boolean;
  station: boolean;
  amenity: boolean;
  give_way: boolean;
  bump: boolean;
  no_exit: boolean;
  roundabout: boolean;
  traffic_calming: boolean;
  turning_loop: boolean;
}

interface PredictionResult {
  predicted_severity: number;
  severity_label: string;
  confidence_percentage: number;
  confidence_level: string;
  probability: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
  };
}

const PredictorContent: React.FC<{ t: any }> = ({ t }) => {
  const { token } = useAuth();
  
  const [form, setForm] = useState<PredictionForm>({
    duration_min: 30,
    hour: 12,
    month: 6,
    day_of_week: 2,
    temperature_c: 20,
    visibility_km: 10,
    season: "Été",
    time_of_day: "Après-midi",
    state: "CA",
    weather_condition: "Clair",
    us_region: "Ouest",
    traffic_signal: false,
    crossing: false,
    junction: false,
    railway: false,
    stop: false,
    station: false,
    amenity: false,
    give_way: false,
    bump: false,
    no_exit: false,
    roundabout: false,
    traffic_calming: false,
    turning_loop: false
  });
  
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof PredictionForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateRoadFlag = (flag: keyof PredictionForm) => {
    setForm(prev => ({ ...prev, [flag]: !prev[flag] }));
  };

  const runPrediction = async () => {
    if (!token) {
      setError("Authentification requise");
      return;
    }
    
    setPredicting(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.post(
        `${API}/api/predict/predict`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(response.data.prediction);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Échec de la prédiction");
    } finally {
      setPredicting(false);
    }
  };

  const activeRoadCount = Object.entries(form).filter(([key, val]) => 
    ['traffic_signal', 'crossing', 'junction', 'railway', 'stop', 'station', 
     'amenity', 'give_way', 'bump', 'no_exit', 'roundabout', 'traffic_calming', 'turning_loop'].includes(key) && val === true
  ).length;

  const getConfidenceLevelFR = (level: string) => {
    if (level === "High") return "Élevée";
    if (level === "Moderate") return "Modérée";
    return "Faible";
  };

  return (
    <div className="pr-layout">
      {/* Colonne gauche - Formulaire */}
      <div className="pr-card">
        <div className="pr-card-title">
          <span>⚙️</span> Paramètres d'entrée
        </div>
        
        {/* Durée */}
        <div className="pr-field">
          <div className="pr-label">Durée (minutes)</div>
          <div className="pr-slider-wrap">
            <input
              type="range"
              min="0"
              max="300"
              step="5"
              value={form.duration_min}
              onChange={(e) => updateField("duration_min", parseInt(e.target.value))}
              className="pr-slider"
            />
            <span className="pr-slider-val">{form.duration_min} min</span>
          </div>
        </div>
        
        {/* Heure */}
        <div className="pr-field">
          <div className="pr-label">Heure</div>
          <div className="pr-pill-grid">
            {Array.from({ length: 24 }, (_, i) => i).map(h => (
              <button
                key={h}
                onClick={() => updateField("hour", h)}
                className={`pr-pill ${form.hour === h ? 'active' : ''}`}
                style={{ backgroundColor: form.hour === h ? t.accent : 'transparent' }}
              >
                {h.toString().padStart(2, '0')}:00
              </button>
            ))}
          </div>
        </div>
        
        {/* Mois */}
        <div className="pr-field">
          <div className="pr-label">Mois</div>
          <div className="pr-pill-grid">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <button
                key={m}
                onClick={() => updateField("month", m)}
                className={`pr-pill ${form.month === m ? 'active' : ''}`}
                style={{ backgroundColor: form.month === m ? t.accent : 'transparent' }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        
        {/* Jour de semaine */}
        <div className="pr-field">
          <div className="pr-label">Jour de la semaine</div>
          <div className="pr-pill-grid">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day, idx) => (
              <button
                key={idx}
                onClick={() => updateField("day_of_week", idx)}
                className={`pr-pill ${form.day_of_week === idx ? 'active' : ''}`}
                style={{ backgroundColor: form.day_of_week === idx ? t.accent : 'transparent' }}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
        
        <div className="pr-row2">
          {/* Température */}
          <div className="pr-field">
            <div className="pr-label">Température (°C)</div>
            <input
              type="number"
              value={form.temperature_c}
              onChange={(e) => updateField("temperature_c", parseFloat(e.target.value))}
              className="pr-input"
              step="1"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            />
          </div>
          
          {/* Visibilité */}
          <div className="pr-field">
            <div className="pr-label">Visibilité (km)</div>
            <input
              type="number"
              value={form.visibility_km}
              onChange={(e) => updateField("visibility_km", parseFloat(e.target.value))}
              className="pr-input"
              step="0.5"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            />
          </div>
        </div>
        
        <div className="pr-row2">
          {/* Saison */}
          <div className="pr-field">
            <div className="pr-label">Saison</div>
            <select
              value={form.season}
              onChange={(e) => updateField("season", e.target.value)}
              className="pr-select"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            >
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          {/* Moment de la journée */}
          <div className="pr-field">
            <div className="pr-label">Moment</div>
            <select
              value={form.time_of_day}
              onChange={(e) => updateField("time_of_day", e.target.value)}
              className="pr-select"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            >
              {TIME_OF_DAY.map(tod => <option key={tod} value={tod}>{tod}</option>)}
            </select>
          </div>
        </div>
        
        <div className="pr-row2">
          {/* État */}
          <div className="pr-field">
            <div className="pr-label">État</div>
            <select
              value={form.state}
              onChange={(e) => updateField("state", e.target.value)}
              className="pr-select"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            >
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          {/* Météo */}
          <div className="pr-field">
            <div className="pr-label">Météo</div>
            <select
              value={form.weather_condition}
              onChange={(e) => updateField("weather_condition", e.target.value)}
              className="pr-select"
              style={{ backgroundColor: t.inputBg, color: t.textMain, borderColor: t.border }}
            >
              {WEATHER_CONDITIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        
        {/* Région US */}
        <div className="pr-field">
          <div className="pr-label">Région US</div>
          <div className="pr-pill-grid">
            {US_REGIONS.map(r => (
              <button
                key={r}
                onClick={() => updateField("us_region", r)}
                className={`pr-pill ${form.us_region === r ? 'active' : ''}`}
                style={{ backgroundColor: form.us_region === r ? t.accent : 'transparent' }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        
        {/* Infrastructures routières */}
        <div className="pr-section">
          <div className="pr-section-title">
            <span>🛣️</span> Infrastructures routières
          </div>
          <div className="pr-road-grid">
            {[
              { key: 'traffic_signal', label: '🚦 Feu de signalisation' },
              { key: 'crossing', label: '🚸 Passage piéton' },
              { key: 'junction', label: '🔀 Jonction' },
              { key: 'stop', label: '🛑 Stop' },
              { key: 'railway', label: '🚆 Passage à niveau' },
              { key: 'station', label: '🚉 Station' },
              { key: 'amenity', label: '🏪 Équipement' },
              { key: 'bump', label: '⛔ Ralentisseur' },
              { key: 'give_way', label: '⚠️ Cédez le passage' },
              { key: 'no_exit', label: '🚫 Impasse' },
              { key: 'roundabout', label: '🔄 Rond-point' },
              { key: 'traffic_calming', label: '📉 Modérateur de trafic' },
              { key: 'turning_loop', label: '↩️ Boucle de retournement' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => updateRoadFlag(key as keyof PredictionForm)}
                className={`pr-road-flag ${form[key as keyof PredictionForm] ? 'active' : ''}`}
                style={{ 
                  borderColor: form[key as keyof PredictionForm] ? t.accent : t.border,
                  background: form[key as keyof PredictionForm] ? `${t.accent}20` : 'transparent'
                }}
              >
                <span className="pr-road-dot" style={{ background: form[key as keyof PredictionForm] ? t.accent : 'transparent' }}></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="pr-road-hint">
            {activeRoadCount} infrastructure{activeRoadCount !== 1 ? 's' : ''} routière{activeRoadCount !== 1 ? 's' : ''} active{activeRoadCount !== 1 ? 's' : ''}
          </div>
        </div>
        
        {/* Bouton Prédire */}
        <button
          onClick={runPrediction}
          disabled={predicting}
          className="pr-predict-btn"
          style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accentDark || t.accent})` }}
        >
          {predicting ? (
            <>
              <span className="spin">⚙️</span> Prédiction en cours...
            </>
          ) : (
            <>🔮 Prédire la sévérité</>
          )}
        </button>
        
        
      </div>
      
      {/* Colonne droite - Résultats */}
      <div>
        {error && (
          <div className="pr-error" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171' }}>
            <span>⚠️</span> {error}
          </div>
        )}
        
        {predicting && (
          <div className="pr-loading" style={{ color: t.textMuted }}>
            <div className="db-spinner"></div>
            Analyse des caractéristiques de l'accident...
          </div>
        )}
        
        {!predicting && !result && !error && (
          <div className="pr-idle">
            <div style={{ fontSize: 48, opacity: 0.4 }}>◈</div>
            <div className="pr-idle-txt" style={{ color: t.textMuted }}>
              Configurez les caractéristiques de l'accident et cliquez sur <strong>Prédire la sévérité</strong>
            </div>
          </div>
        )}
        
        {result && (
          <>
            <div className="pr-result-wrap" style={{ borderColor: t.border }}>
              <div className="pr-result-top">
                <div className="pr-result-eyebrow" style={{ color: t.textMuted }}>Sévérité prédite</div>
                <div 
                  className="pr-result-num"
                  style={{ color: SEV_COLORS[result.predicted_severity as keyof typeof SEV_COLORS] }}
                >
                  {result.predicted_severity}
                </div>
                <div 
                  className="pr-result-badge"
                  style={{ 
                    background: `${SEV_COLORS[result.predicted_severity as keyof typeof SEV_COLORS]}20`,
                    color: SEV_COLORS[result.predicted_severity as keyof typeof SEV_COLORS],
                    border: `1px solid ${SEV_COLORS[result.predicted_severity as keyof typeof SEV_COLORS]}40`
                  }}
                >
                  {SEV_LABELS_FR[result.predicted_severity as keyof typeof SEV_LABELS_FR]}
                </div>
                <div className="pr-result-conf" style={{ color: t.textMuted }}>
                  Confiance: {result.confidence_percentage}% ({getConfidenceLevelFR(result.confidence_level)})
                </div>
                <div className="pr-result-desc" style={{ color: t.textMuted }}>
                  {SEV_DESCRIPTIONS_FR[result.predicted_severity as keyof typeof SEV_DESCRIPTIONS_FR]}
                </div>
              </div>
              
              <div className="pr-proba-label-row" style={{ color: t.textMuted }}>
                <span>📊</span> Distribution des probabilités
              </div>
              <div className="pr-proba-grid">
                {[1, 2, 3, 4].map(sev => (
                  <div key={sev} className="pr-proba-row">
                    <div className="pr-proba-sev" style={{ color: SEV_COLORS[sev as keyof typeof SEV_COLORS] }}>
                      Sévérité {sev}
                    </div>
                    <div className="pr-proba-track" style={{ background: t.surface2 }}>
                      <div 
                        className="pr-proba-fill"
                        style={{ 
                          width: `${(result.probability[sev as keyof typeof result.probability] || 0) * 100}%`,
                          background: SEV_COLORS[sev as keyof typeof SEV_COLORS]
                        }}
                      />
                    </div>
                    <div className="pr-proba-pct" style={{ color: t.textMuted }}>
                      {((result.probability[sev as keyof typeof result.probability] || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Résumé des entrées */}
            <div className="pr-card" style={{ borderColor: t.border, background: t.surface }}>
              <div className="pr-card-title">
                <span>📋</span> Résumé des entrées
              </div>
              <div className="pr-summary">
                <div className="pr-summary-row" style={{ borderBottomColor: t.border }}>
                  <span className="pr-summary-key" style={{ color: t.textMuted }}>Durée</span>
                  <span className="pr-summary-val" style={{ color: t.textMain }}>{form.duration_min} min</span>
                </div>
                <div className="pr-summary-row" style={{ borderBottomColor: t.border }}>
                  <span className="pr-summary-key" style={{ color: t.textMuted }}>Horaire</span>
                  <span className="pr-summary-val" style={{ color: t.textMain }}>
                    {form.hour.toString().padStart(2, '0')}:00 • {form.time_of_day} • {form.season}
                  </span>
                </div>
                <div className="pr-summary-row" style={{ borderBottomColor: t.border }}>
                  <span className="pr-summary-key" style={{ color: t.textMuted }}>Localisation</span>
                  <span className="pr-summary-val" style={{ color: t.textMain }}>{form.state} • {form.us_region}</span>
                </div>
                <div className="pr-summary-row" style={{ borderBottomColor: t.border }}>
                  <span className="pr-summary-key" style={{ color: t.textMuted }}>Météo</span>
                  <span className="pr-summary-val" style={{ color: t.textMain }}>
                    {form.weather_condition} • {form.temperature_c}°C • {form.visibility_km}km
                  </span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key" style={{ color: t.textMuted }}>Infrastructures</span>
                  <div className="pr-road-active-list">
                    {activeRoadCount === 0 && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Aucune</span>}
                    {form.traffic_signal && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Feu</span>}
                    {form.crossing && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Passage piéton</span>}
                    {form.junction && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Jonction</span>}
                    {form.railway && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Passage à niveau</span>}
                    {form.stop && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Stop</span>}
                    {form.station && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Station</span>}
                    {form.amenity && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Équipement</span>}
                    {form.bump && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Ralentisseur</span>}
                    {form.give_way && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Cédez</span>}
                    {form.no_exit && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Impasse</span>}
                    {form.roundabout && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Rond-point</span>}
                    {form.traffic_calming && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Modérateur</span>}
                    {form.turning_loop && <span className="pr-road-chip" style={{ background: `${t.accent}20`, color: '#93c5fd' }}>Boucle</span>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Page principale
export default function Predictions() {
  const isDark = useIsDark();
  const t = isDark ? DARK : LIGHT;

  return (
    <>
      <style>{`
        /* ── Layout ─────────────────────────────────────────── */
        .pr-title { font-size: 22px; font-weight: 500; color: var(--text-main); margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
        .pr-sub   { font-size: 12px; color: var(--text-muted); font-family: var(--mono); margin: 0 0 28px; }
        .pr-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .pr-layout { grid-template-columns: 1fr; } }

        /* ── Cards ──────────────────────────────────────────── */
        .pr-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
        .pr-card-title { font-size: 13px; font-weight: 500; color: #93c5fd; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 16px; display: flex; align-items: center; gap: 6px; }
        .pr-section { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
        .pr-section-title { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

        /* ── Fields ─────────────────────────────────────────── */
        .pr-field { margin-bottom: 16px; }
        .pr-label { display: block; font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
        .pr-row2  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pr-input, .pr-select { width: 100%; height: 36px; padding: 0 12px; box-sizing: border-box; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text-main); font-size: 13px; font-family: inherit; transition: border-color .15s; }
        .pr-input:focus, .pr-select:focus { outline: none; border-color: var(--primary-color); }

        /* ── Sliders ────────────────────────────────────────── */
        .pr-slider-wrap { display: flex; align-items: center; gap: 10px; }
        .pr-slider { flex: 1; accent-color: var(--primary-color); }
        .pr-slider-val { font-size: 13px; color: #93c5fd; font-family: var(--mono); min-width: 60px; text-align: right; }

        /* ── Pill button grids ─────────────────────────────── */
        .pr-pill-grid { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .pr-pill { height: 28px; padding: 0 9px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; font-family: var(--mono); transition: all .1s; white-space: nowrap; }
        .pr-pill:hover  { background: var(--primary-color-soft); color: #93c5fd; }
        .pr-pill.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }

        /* ── Road flags grid ────────────────────────────────── */
        .pr-road-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
        .pr-road-flag {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 10px; border-radius: 8px;
          border: 1px solid var(--border);
          background: transparent; cursor: pointer;
          font-size: 12px; font-family: inherit;
          color: var(--text-muted);
          transition: all .12s; text-align: left;
        }
        .pr-road-flag:hover { border-color: #3b82f6; color: var(--text-main); }
        .pr-road-flag.active { border-color: #3b82f6; background: rgba(59,130,246,0.12); color: #93c5fd; }
        .pr-road-dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid currentColor; flex-shrink: 0; transition: all .12s; }
        .pr-road-flag.active .pr-road-dot { background: #3b82f6; border-color: #3b82f6; }
        .pr-road-hint { font-size: 10px; color: var(--text-muted); margin-top: 8px; font-family: var(--mono); }

        /* ── Predict button ─────────────────────────────────── */
        .pr-predict-btn { width: 100%; height: 42px; border-radius: 10px; border: none; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity .15s; margin-top: 20px; }
        .pr-predict-btn:hover    { opacity: .88; }
        .pr-predict-btn:disabled { opacity: .45; cursor: not-allowed; }

        /* ── Model info bar ─────────────────────────────────── */
        .pr-model-bar { margin-top: 12px; padding: 9px 12px; background: var(--surface2); border-radius: 8px; font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-align: center; }

        /* ── Result card ────────────────────────────────────── */
        .pr-result-wrap { border-radius: 12px; padding: 22px; border: 1px solid var(--border); margin-bottom: 16px; }
        .pr-result-top  { text-align: center; margin-bottom: 20px; }
        .pr-result-eyebrow { font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
        .pr-result-num    { font-size: 72px; font-weight: 500; line-height: 1; margin-bottom: 8px; }
        .pr-result-badge  { display: inline-block; padding: 4px 16px; border-radius: 99px; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
        .pr-result-desc   { font-size: 13px; color: var(--text-muted); }
        .pr-result-conf   { font-size: 13px; color: var(--text-muted); margin-top: 6px; }

        /* ── Probability bars ───────────────────────────────── */
        .pr-proba-label-row { font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
        .pr-proba-grid { display: flex; flex-direction: column; gap: 10px; }
        .pr-proba-row  { display: flex; align-items: center; gap: 10px; }
        .pr-proba-sev  { font-size: 12px; font-family: var(--mono); width: 80px; flex-shrink: 0; font-weight: 500; }
        .pr-proba-track { flex: 1; height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
        .pr-proba-fill  { height: 100%; border-radius: 4px; transition: width .6s ease; }
        .pr-proba-pct   { font-size: 12px; font-family: var(--mono); color: var(--text-muted); width: 45px; text-align: right; flex-shrink: 0; font-weight: 500; }

        /* ── Input summary ──────────────────────────────────── */
        .pr-summary { display: flex; flex-direction: column; gap: 0; margin-top: 16px; }
        .pr-summary-row { display: flex; justify-content: space-between; font-size: 12px; padding: 7px 0; border-bottom: 1px solid var(--border); }
        .pr-summary-row:last-child { border-bottom: none; }
        .pr-summary-key { color: var(--text-muted); font-family: var(--mono); }
        .pr-summary-val { color: var(--text-main); font-weight: 500; }
        .pr-road-active-list { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
        .pr-road-chip { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); font-family: var(--mono); }

        /* ── Idle / loading / error states ─────────────────── */
        .pr-idle    { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px 24px; text-align: center; gap: 12px; }
        .pr-idle-txt { font-size: 13px; color: var(--text-muted); font-family: var(--mono); }
        .pr-error   { padding: 14px; border-radius: 10px; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); color: #f87171; font-size: 13px; font-family: var(--mono); display: flex; gap: 8px; align-items: flex-start; }
        .pr-loading { display: flex; align-items: center; justify-content: center; padding: 56px; color: var(--text-muted); font-size: 13px; font-family: var(--mono); gap: 10px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        .db-spinner { width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#38bdf8;border-radius:50%;animation:spin .7s linear infinite; }
      `}</style>
      <div className="db-root" style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
        <header style={{ marginBottom: "28px" }}>
          <h1 style={{ 
            fontFamily: "'Syne', sans-serif", 
            fontSize: "28px", 
            fontWeight: 800, 
            color: t.textStrong, 
            margin: "0 0 8px" 
          }}>
            🔮 Prédiction de sévérité
          </h1>
          <p style={{ color: t.textMuted, fontSize: "13px", fontFamily: "'IBM Plex Mono', monospace" }}>
            Random Forest 
          </p>
        </header>
        <PredictorContent t={t} />
      </div>
    </>
  );
}