# QuizForge

A full-stack live classroom quiz app with instructor-controlled pacing, server-side scoring, real-time leaderboards, reconnect support, and grade-ready XLSX/CSV exports.

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

Default instructor login:

- Email: `instructor@example.com`
- Password: `change-me-123`

Change both credentials and `JWT_SECRET` in `.env` before a real deployment.

## Classroom workflow

1. Sign in and select **New quiz**.
2. Add a title, course tag, questions, 2–6 options, correct answer(s), time, and points.
3. From the library, select **Launch**. Share the 6-digit PIN, link, or QR code.
4. Students open `/join`, enter the PIN, their name, and optional student ID.
5. Start the quiz. Reveal each answer, show the leaderboard, and advance when ready.
6. At the end, export XLSX or CSV. The file includes each question result, total correct, accuracy, score, and rank.

Student reconnect tokens are kept in that device's browser. Refreshing the player page restores the session and score.

## Local development

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend, in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The backend uses SQLite by default for local development. Docker Compose uses PostgreSQL.

## API and real-time behavior

- REST API: `http://localhost:8000/api`
- OpenAPI docs in local development: `http://localhost:8000/docs`
- WebSocket room: `/ws/sessions/{session_id}`
- Health check: `/api/health`

Correctness and response time are computed on the server. Correct responses receive the question's base points multiplied by a linear speed factor from `1.0` down to `0.5`. Duplicate and late answers are rejected.

## Tests

```bash
cd backend
pytest
cd ../frontend
npm run build
```

## Deployment notes

The containers are single-node ready and keep all HTTP/WebSocket traffic behind the frontend Nginx service. For multi-replica deployment, replace the in-process WebSocket room manager with Redis pub/sub and use a shared PostgreSQL database.
