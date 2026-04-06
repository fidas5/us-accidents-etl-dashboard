# US Accidents Analytics 

Interactive analytics dashboard for the **US Accidents** dataset with a secure backend (JWT auth) and modern React frontend.

The project is split in two parts:

- `backend/` – REST API (auth + statistics) powered by Python (Flask / FastAPI) and PostgreSQL
- `frontend/` – React + Vite dashboard consuming the API

---






## . How to Run – Backend

### . Prerequisites

- Python 3.10+
- PostgreSQL (or compatible DB) with the `accidents_clean` table loaded
- `virtualenv` or `conda` 

### . Configuration

1. Copy the example environment file:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Edit `.env` to match your environment, for example:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/us_accidents
   SECRET_KEY=your_jwt_secret_key
   ```

### . Install dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### . Run the API

```bash
cd backend
# Example if you use Flask
export FLASK_APP=app.py
export FLASK_ENV=development
flask run --host=0.0.0.0 --port=5050
```

The API will be available at:

- `http://127.0.0.1:5050`

---

## . How to Run – Frontend

### . Prerequisites

- Node.js 18+
- npm or yarn

### . Install dependencies

```bash
cd frontend
npm install
# ou
yarn
```

### . Development server

```bash
cd frontend
npm run dev
# ou
yarn dev
```

By default Vite runs on:

- `http://127.0.0.1:5173`

---

