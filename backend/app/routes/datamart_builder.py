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

        # Supprimer les anciennes données pour cette année uniquement
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

        # ✅ BUG 3 CORRIGÉ : cast explicite en int pour que les clés correspondent
        # EXTRACT retourne des float en Python (ex: 2021.0) → le dict.get() ratait toujours
        self.time_map = {
            (int(r[0]), int(r[1]), int(r[2]), int(r[3])): r[4]
            for r in rows
        }
        print(f"  ✅ dim_time: {len(self.time_map)} entrées")
        return self.time_map

    def build_dim_location(self) -> dict:
        """Construit dim_location pour l'année cible (UPSERT — ne supprime jamais les autres années)"""
        print(f"  📍 Construction de dim_location pour {self.target_year}...")

        # ✅ BUG 1 CORRIGÉ : on n'efface plus toute la table.
        # Un DELETE global cassait les FK des fact_accident des autres années déjà chargées.
        # On utilise INSERT ... ON CONFLICT DO NOTHING pour n'ajouter que les nouvelles entrées.
        # Pré-requis : contrainte UNIQUE (city, state) sur dim_location (voir note ci-dessous).
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
            ON CONFLICT (city, state) DO NOTHING
        """), {"year": self.target_year})

        db.session.commit()

        # Charger TOUTE la table pour avoir un mapping complet (toutes années confondues)
        rows = db.session.execute(text("""
            SELECT city, state, location_id FROM dim_location
        """)).fetchall()

        self.loc_map = {(r[0] or 'Inconnu', r[1] or 'Inconnu'): r[2] for r in rows}
        print(f"  ✅ dim_location: {len(self.loc_map)} entrées (table complète)")
        return self.loc_map

    def build_dim_weather(self) -> dict:
        """Construit dim_weather pour l'année cible (UPSERT — ne supprime jamais les autres années)"""
        print(f"  🌤️ Construction de dim_weather pour {self.target_year}...")

        # ✅ BUG 1 CORRIGÉ (même logique que dim_location) :
        # DELETE global remplacé par INSERT ... ON CONFLICT DO NOTHING.
        # Pré-requis : contrainte UNIQUE (weather_condition, temperature_c, visibility_km).
        db.session.execute(text("""
            INSERT INTO dim_weather (weather_condition, temperature_c, visibility_km, temp_bucket, visibility_bucket)
            SELECT DISTINCT
                COALESCE(weather_condition, 'Inconnu'),
                ROUND(CAST(temperature_c AS numeric), 0),
                ROUND(CAST(visibility_km AS numeric), 0),
                CASE
                    WHEN temperature_c < 0  THEN 'Glacial'
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
            ON CONFLICT (weather_condition, temperature_c, visibility_km) DO NOTHING
        """), {"year": self.target_year})

        db.session.commit()

        rows = db.session.execute(text("""
            SELECT weather_condition, temperature_c, visibility_km, weather_id
            FROM dim_weather
        """)).fetchall()

        # ✅ BUG 3 CORRIGÉ aussi ici : les valeurs venant de ROUND/EXTRACT sont des Decimal/float.
        # On normalise en int pour correspondre aux clés générées dans build_fact_accident.
        self.weather_map = {
            (
                r[0] or 'Inconnu',
                int(r[1]) if r[1] is not None else None,
                int(r[2]) if r[2] is not None else None,
            ): r[3]
            for r in rows
        }
        print(f"  ✅ dim_weather: {len(self.weather_map)} entrées (table complète)")
        return self.weather_map

    def build_dim_road(self) -> dict:
        """Retourne (ou crée) l'entrée par défaut de dim_road sans jamais la supprimer"""
        print(f"  🛣️ dim_road: vérification de l'entrée par défaut...")

        # ✅ BUG 2 CORRIGÉ : on ne supprime plus dim_road.
        # Avant, chaque appel recréait un nouvel ID → toutes les FK road_id dans
        # fact_accident devenaient invalides dès l'appel suivant à run_all().
        existing = db.session.execute(
            text("SELECT road_id FROM dim_road LIMIT 1")
        ).fetchone()

        if existing:
            road_id = existing[0]
            print(f"  ✅ dim_road: entrée existante réutilisée, ID = {road_id}")
        else:
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
            print(f"  ✅ dim_road: nouvelle entrée créée, ID = {road_id}")

        self.road_map = {tuple([False] * 13): road_id}
        return self.road_map

    # ─── 2. Construction de la table de faits ─────────────────────────────────

    def build_fact_accident(self, batch_size: int = 10000) -> dict:
        """Construit fact_accident par batches pour l'année cible"""
        print(f"\n  📊 Construction de fact_accident pour {self.target_year}...")

        total = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": self.target_year}
        ).scalar()

        if total == 0:
            print(f"  ⚠️ Aucune donnée clean pour {self.target_year}")
            return {"rows_inserted": 0, "total": 0, "batches": 0}

        # ✅ BUG 4 CORRIGÉ : le filtre d'origine échouait silencieusement quand start_time
        # était NULL (EXTRACT retourne NULL → la comparaison échoue → 0 lignes supprimées).
        # Conséquence : les insertions suivantes violaient la contrainte UNIQUE sur accident_id.
        deleted = db.session.execute(
            text("""
                DELETE FROM fact_accident
                WHERE start_time IS NOT NULL
                  AND EXTRACT(YEAR FROM start_time)::INTEGER = :year
            """),
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
                    EXTRACT(YEAR  FROM start_time)::INTEGER AS yr,
                    EXTRACT(MONTH FROM start_time)::INTEGER AS mo,
                    EXTRACT(DAY   FROM start_time)::INTEGER AS dy,
                    EXTRACT(HOUR  FROM start_time)::INTEGER AS hr,
                    COALESCE(city, 'Inconnu')              AS city,
                    COALESCE(state, 'Inconnu')             AS state,
                    COALESCE(weather_condition, 'Inconnu') AS weather_condition,
                    ROUND(CAST(temperature_c AS numeric), 0) AS temp,
                    ROUND(CAST(visibility_km AS numeric), 0) AS vis
                FROM accidents_clean
                WHERE EXTRACT(YEAR FROM start_time) = :year
                ORDER BY accident_id
                LIMIT :limit OFFSET :offset
            """), {"year": self.target_year, "limit": batch_size, "offset": offset}).fetchall()

            if not rows:
                break

            fact_batch = []
            skipped = 0

            for r in rows:
                # ✅ BUG 3 CORRIGÉ : cast explicite en int sur toutes les clés de lookup.
                # Sans ce cast, (2021.0, 3.0, 15.0, 8.0) != (2021, 3, 15, 8) → time_id=1 partout.
                time_key = (int(r[6]), int(r[7]), int(r[8]), int(r[9]))
                loc_key  = (r[10], r[11])
                weather_key = (
                    r[12],
                    int(r[13]) if r[13] is not None else None,
                    int(r[14]) if r[14] is not None else None,
                )
                road_key = tuple([False] * 13)

                time_id    = self.time_map.get(time_key)
                loc_id     = self.loc_map.get(loc_key)
                weather_id = self.weather_map.get(weather_key)
                road_id    = self.road_map.get(road_key)

                # ✅ VALIDATION AJOUTÉE : on ne tolère pas un FK manquant qui insérerait
                # des données incohérentes. On log et on skip plutôt que d'utiliser id=1.
                if time_id is None or loc_id is None or weather_id is None or road_id is None:
                    skipped += 1
                    if skipped <= 5:
                        print(f"    ⚠️ FK manquante pour {r[0]}: "
                              f"time={time_id}, loc={loc_id}, weather={weather_id}, road={road_id} "
                              f"(clés: time={time_key}, loc={loc_key}, weather={weather_key})")
                    continue

                fact_batch.append({
                    "accident_id":  r[0],
                    "start_time":   r[1],
                    "end_time":     r[2],
                    "severity":     r[3],
                    "severity_label": r[4],
                    "duration_min": r[5],
                    "time_id":      time_id,
                    "location_id":  loc_id,
                    "weather_id":   weather_id,
                    "road_id":      road_id,
                })

            if fact_batch:
                db.session.bulk_insert_mappings(FactAccident, fact_batch)
                db.session.commit()
                inserted += len(fact_batch)

            batch_time = time.time() - batch_start
            print(f"    Batch {batch_num}: +{len(fact_batch):,} insérés "
                  f"({skipped} skippés, total: {inserted:,}/{total:,}) en {batch_time:.1f}s")

            offset += batch_size

        return {"rows_inserted": inserted, "total": total, "batches": batch_num}

    # ─── 3. Exécution complète ────────────────────────────────────────────────

    def run_all(self) -> dict:
        """Exécute toutes les étapes séquentiellement"""
        print(f"\n🚀 Construction complète du datamart pour {self.target_year}")
        print("=" * 50)

        start_time = time.time()

        # Étape 1 : Dimensions
        self.build_dim_time()
        self.build_dim_location()
        self.build_dim_weather()
        self.build_dim_road()

        # Étape 2 : Faits
        result = self.build_fact_accident()

        elapsed = time.time() - start_time

        return {
            "year":         self.target_year,
            "dim_time":     len(self.time_map),
            "dim_location": len(self.loc_map),
            "dim_weather":  len(self.weather_map),
            "dim_road":     len(self.road_map),
            "fact_rows":    result["rows_inserted"],
            "fact_total":   result["total"],
            "batches":      result["batches"],
            "duration_seconds": round(elapsed, 2),
        }