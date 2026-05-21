# 🚗 US Accidents Analytics Dashboard

Plateforme d'analyse et de prédiction des accidents routiers aux États-Unis basée sur le dataset **US Accidents**.  
Le projet combine **Data Engineering, Machine Learning et Visualisation BI** dans une architecture full-stack moderne.

---

## 📌 Aperçu du projet

Ce système permet de :

- 📊 Analyser les accidents routiers aux USA (2016–2023)
- 🌦️ Étudier l'impact de la météo, du trafic et de l'environnement
- 🗺️ Explorer les données par état, région et période
- 🤖 Prédire la gravité d'un accident (Machine Learning)
- 📈 Visualiser les insights via un dashboard interactif

---

## 📂 Dataset

### 🚗 US Accidents Dataset (Kaggle)

> <https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents>

Le dataset contient plus de **7 millions d'accidents routiers** enregistrés aux États-Unis entre 2016 et 2023.

**Types de données :**

- ⏱️ **Temps** — heure, date, saison, jour de semaine
- 🌍 **Géographie** — état, ville, région, coordonnées GPS
- 🌦️ **Météo** — température, visibilité, conditions météo
- 🛣️ **Route** — feux, intersections, rond-points, stop
- 🚨 **Sévérité** — niveau de gravité (1 → 4)

---

## 🏗️ Architecture

```
backend/   → API + ML + ETL + Database
frontend/  → Dashboard React
```

---

## ⚙️ Backend

**Technologies :** Python · Flask / FastAPI · PostgreSQL · SQLAlchemy · JWT Authentication · Random Forest

### 🔑 Authentification

- Login / Register avec JWT
- Sécurisation des endpoints

### 📊 Data Engineering

- ETL pipeline complet
- Nettoyage des données
- Transformation en **Star Schema**

### 🧠 Machine Learning

- Random Forest
- Feature engineering avancé
- Prédiction de la sévérité


---

## 🎨 Frontend

**Technologies :** React (Vite) · Tailwind CSS · Axios

### 📊 Fonctionnalités

- 📈 Dashboard interactif
- 🗺️ Analyse géographique des accidents
- 🌦️ Impact météo sur les accidents
- 📅 Analyse temporelle
- 🤖 Formulaire de prédiction IA

---

## 🗄️ Data Warehouse — Star Schema

**Fact Table**

- `fact_accident`

**Dimensions**

- `dim_time`
- `dim_location`
- `dim_weather`
- `dim_road`

---

## 🧠 Machine Learning Pipeline

1. Extraction des données (PostgreSQL)
2. Feature Engineering
3. Encodage catégoriel
4. Split train / test
5. Entraînement du modèle
6. Évaluation (Accuracy / Balanced Accuracy)
7. Optimisation des seuils

**Modèles utilisés**

| Modèle | Résultat |
|---|---|
| Random Forest | ⭐ Baseline (meilleur équilibré) |
---

## 🚀 Installation

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**Lancer l'API**

```bash
flask run --host=0.0.0.0 --port=5050
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### 🌐 URLs

| Service | URL |
|---|---|
| Backend API | <http://127.0.0.1:5050> |
| Frontend | <http://127.0.0.1:5173> |

---

## 🧪 Technologies utilisées

| Couche | Technologies |
|---|---|
| **Backend** | Flask / FastAPI · PostgreSQL · SQLAlchemy · Scikit-learn · Pandas / NumPy |
| **Frontend** | React · Tailwind CSS · Recharts · Axios |
| **Data Engineering** | ETL Pipeline · Star Schema · Feature Engineering |

---

## 🎯 Objectifs

- Comprendre les causes des accidents routiers
- Construire un pipeline Data end-to-end
- Appliquer le Machine Learning sur données réelles
- Créer un dashboard BI interactif
- Développer un système prédictif complet
