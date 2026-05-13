# backend/app/api/datamart_builder.py
"""
DatamartBuilder - Construction modulaire du datamart
"""

import time
from sqlalchemy import text
from .. import db
from ..models import DimTime, DimLocation, DimWeather, DimRoad, FactAccident


class DatamartBuilder:
    """Constructeur modulaire du datamart"""
    
    def __init__(self, target_year: int):
        self.target_year = target_year
        self.time_map = {}
        self.loc_map = {}
        self.weather_map = {}
        self.road_map = {}
    
    # ─── 1. Peuplement des dimensions ─────────────────────────────────────
    
    def build_dim_time(self) -> dict:
        """Construit dim_time pour l'année cible"""
        print(f"  📅 Construction de dim_time pour {self.target_year}...")
        
        # Supprimer les anciennes données pour cette année
        db.session.execute(
            text("DELETE FROM dim_time WHERE year = :year"),
            {"year": self.target_year}
        )
        
        db.session.execute(text("""
            INSERT INTO dim_time (year, month, day, hour, day_of_week, season, time_of_day, is_weekend)
            SELECT DISTINCT
                EXTRACT(YEAR FROM start_time)::INTEGER,
                EXTRACT(MONTH FROM start_time)::INTEGER,
                EXTRACT(DAY FROM start_time)::INTEGER,
                EXTRACT(HOUR FROM start_time)::INTEGER,
                EXTRACT(DOW FROM start_time)::INTEGER,
                CASE 
                    WHEN EXTRACT(MONTH FROM start_time) IN (12,1,2) THEN 'Hiver'
                    WHEN EXTRACT(MONTH FROM start_time) IN (3,4,5) THEN 'Printemps'
                    WHEN EXTRACT(MONTH FROM start_time) IN (6,7,8) THEN 'Été'
                    ELSE 'Automne'
                END,
                CASE 
                    WHEN EXTRACT(HOUR FROM start_time) BETWEEN 5 AND 11 THEN 'Matin'
                    WHEN EXTRACT(HOUR FROM start_time) BETWEEN 12 AND 16 THEN 'Après-midi'
                    WHEN EXTRACT(HOUR FROM start_time) BETWEEN 17 AND 20 THEN 'Soir'
                    ELSE 'Nuit'
                END,
                EXTRACT(DOW FROM start_time) IN (0,6)
            FROM accidents_clean
            WHERE EXTRACT(YEAR FROM start_time) = :year
        """), {"year": self.target_year})
        
        db.session.commit()
        
        rows = db.session.execute(
            text("SELECT year, month, day, hour, time_id FROM dim_time WHERE year = :year"),
            {"year": self.target_year}
        ).fetchall()
        
        self.time_map = {(r[0], r[1], r[2], r[3]): r[4] for r in rows}
        print(f"  ✅ dim_time: {len(self.time_map)} entrées")
        return self.time_map
    
    def build_dim_location(self) -> dict:
        """Construit dim_location pour l'année cible"""
        print(f"  📍 Construction de dim_location pour {self.target_year}...")
        
        # Vider la table pour éviter les doublons
        db.session.execute(text("DELETE FROM dim_location"))
        
        db.session.execute(text("""
            INSERT INTO dim_location (city, state, latitude, longitude, us_region)
            SELECT DISTINCT
                COALESCE(city, 'Inconnu'),
                COALESCE(state, 'Inconnu'),
                ROUND(CAST(latitude AS numeric), 4),
                ROUND(CAST(longitude AS numeric), 4),
                CASE 
                    WHEN state IN ('CT','ME','MA','NH','NJ','NY','PA','RI','VT') THEN 'Nord-Est'
                    WHEN state IN ('AL','AR','DE','FL','GA','KY','LA','MD','MS','NC','OK','SC','TN','TX','VA','WV','DC') THEN 'Sud'
                    WHEN state IN ('IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI') THEN 'Midwest'
                    WHEN state IN ('AK','AZ','CA','CO','HI','ID','MT','NV','NM','OR','UT','WA','WY') THEN 'Ouest'
                    ELSE 'Autre'
                END
            FROM accidents_clean
            WHERE EXTRACT(YEAR FROM start_time) = :year
              AND state IS NOT NULL
        """), {"year": self.target_year})
        
        db.session.commit()
        
        rows = db.session.execute(text("""
            SELECT city, state, location_id FROM dim_location
        """)).fetchall()
        
        self.loc_map = {(r[0] or 'Inconnu', r[1] or 'Inconnu'): r[2] for r in rows}
        print(f"  ✅ dim_location: {len(self.loc_map)} entrées")
        return self.loc_map
    
    def build_dim_weather(self) -> dict:
        """Construit dim_weather pour l'année cible"""
        print(f"  🌤️ Construction de dim_weather pour {self.target_year}...")
        
        # Vider la table pour éviter les doublons
        db.session.execute(text("DELETE FROM dim_weather"))
        
        db.session.execute(text("""
            INSERT INTO dim_weather (weather_condition, temperature_c, visibility_km, temp_bucket, visibility_bucket)
            SELECT DISTINCT
                COALESCE(weather_condition, 'Inconnu'),
                ROUND(CAST(temperature_c AS numeric), 0),
                ROUND(CAST(visibility_km AS numeric), 0),
                CASE 
                    WHEN temperature_c < 0 THEN 'Glacial'
                    WHEN temperature_c < 10 THEN 'Froid'
                    WHEN temperature_c < 20 THEN 'Frais'
                    WHEN temperature_c < 30 THEN 'Chaud'
                    ELSE 'Très chaud'
                END,
                CASE 
                    WHEN visibility_km < 1.6 THEN 'Faible'
                    WHEN visibility_km < 8.0 THEN 'Modérée'
                    ELSE 'Bonne'
                END
            FROM accidents_clean
            WHERE EXTRACT(YEAR FROM start_time) = :year
        """), {"year": self.target_year})
        
        db.session.commit()
        
        rows = db.session.execute(text("""
            SELECT weather_condition, temperature_c, visibility_km, weather_id 
            FROM dim_weather
        """)).fetchall()
        
        self.weather_map = {(r[0], r[1], r[2]): r[3] for r in rows}
        print(f"  ✅ dim_weather: {len(self.weather_map)} entrées")
        return self.weather_map
    
    def build_dim_road(self) -> dict:
        """Construit dim_road avec une entrée par défaut"""
        print(f"  🛣️ dim_road: utilisation de l'entrée par défaut")
        
        # Vider la table
        db.session.execute(text("DELETE FROM dim_road"))
        
        # Créer l'entrée par défaut
        result = db.session.execute(text("""
            INSERT INTO dim_road (amenity, bump, crossing, give_way, junction, no_exit,
                                 railway, roundabout, station, stop, traffic_calming,
                                 traffic_signal, turning_loop, feature_count)
            VALUES (false, false, false, false, false, false,
                    false, false, false, false, false,
                    false, false, 0)
            RETURNING road_id
        """))
        db.session.commit()
        road_id = result.fetchone()[0]
        
        self.road_map = {tuple([False]*13): road_id}
        print(f"  ✅ dim_road: ID par défaut = {road_id}")
        return self.road_map
    
    # ─── 2. Construction de la table de faits ─────────────────────────────────
    
    def build_fact_accident(self, batch_size: int = 10000) -> dict:
        """Construit fact_accident par batches"""
        print(f"\n  📊 Construction de fact_accident pour {self.target_year}...")
        
        total = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": self.target_year}
        ).scalar()
        
        if total == 0:
            return {"rows_inserted": 0, "total": 0}
        
        # Supprimer les anciennes données
        deleted = db.session.execute(
            text("DELETE FROM fact_accident WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": self.target_year}
        ).rowcount
        db.session.commit()
        print(f"  🗑️ Suppression de {deleted:,} anciens enregistrements")
        
        offset = 0
        inserted = 0
        batch_num = 0
        
        while offset < total:
            batch_num += 1
            batch_start = time.time()
            
            rows = db.session.execute(text("""
                SELECT 
                    accident_id, start_time, end_time, severity, severity_label, duration_min,
                    EXTRACT(YEAR FROM start_time)::INTEGER as yr,
                    EXTRACT(MONTH FROM start_time)::INTEGER as mo,
                    EXTRACT(DAY FROM start_time)::INTEGER as dy,
                    EXTRACT(HOUR FROM start_time)::INTEGER as hr,
                    COALESCE(city, 'Inconnu') as city,
                    COALESCE(state, 'Inconnu') as state,
                    COALESCE(weather_condition, 'Inconnu') as weather_condition,
                    ROUND(CAST(temperature_c AS numeric), 0) as temp,
                    ROUND(CAST(visibility_km AS numeric), 0) as vis
                FROM accidents_clean
                WHERE EXTRACT(YEAR FROM start_time) = :year
                ORDER BY accident_id
                LIMIT :limit OFFSET :offset
            """), {"year": self.target_year, "limit": batch_size, "offset": offset}).fetchall()
            
            if not rows:
                break
            
            fact_batch = []
            for r in rows:
                time_key = (r[6], r[7], r[8], r[9])
                loc_key = (r[10], r[11])
                weather_key = (r[12], r[13], r[14])
                road_key = tuple([False]*13)
                
                time_id = self.time_map.get(time_key, 1)
                loc_id = self.loc_map.get(loc_key, 1)
                weather_id = self.weather_map.get(weather_key, 1)
                road_id = self.road_map.get(road_key, 1)
                
                fact_batch.append({
                    "accident_id": r[0],
                    "start_time": r[1],
                    "end_time": r[2],
                    "severity": r[3],
                    "severity_label": r[4],
                    "duration_min": r[5],
                    "time_id": time_id,
                    "location_id": loc_id,
                    "weather_id": weather_id,
                    "road_id": road_id,
                })
            
            db.session.bulk_insert_mappings(FactAccident, fact_batch)
            db.session.commit()
            
            inserted += len(fact_batch)
            batch_time = time.time() - batch_start
            
            print(f"    Batch {batch_num}: +{len(fact_batch):,} insérés "
                  f"(total: {inserted:,}/{total:,}) en {batch_time:.1f}s")
            
            offset += batch_size
        
        return {"rows_inserted": inserted, "total": total, "batches": batch_num}
    
    # ─── 3. Exécution complète ────────────────────────────────────────────────
    
    def run_all(self) -> dict:
        """Exécute toutes les étapes séquentiellement"""
        print(f"\n🚀 Construction complète du datamart pour {self.target_year}")
        print("=" * 50)
        
        start_time = time.time()
        
        # Étape 1: Dimensions
        self.build_dim_time()
        self.build_dim_location()
        self.build_dim_weather()
        self.build_dim_road()
        
        # Étape 2: Faits
        result = self.build_fact_accident()
        
        elapsed = time.time() - start_time
        
        return {
            "year": self.target_year,
            "dim_time": len(self.time_map),
            "dim_location": len(self.loc_map),
            "dim_weather": len(self.weather_map),
            "dim_road": len(self.road_map),
            "fact_rows": result["rows_inserted"],
            "fact_total": result["total"],
            "batches": result["batches"],
            "duration_seconds": round(elapsed, 2)
        }