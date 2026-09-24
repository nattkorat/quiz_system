# QuizForge

A full-stack live classroom quiz app with instructor-controlled pacing, server-side scoring, real-time leaderboards, reconnect support, and grade-ready XLSX/CSV exports.

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

The initial instructor name, email, and password come from `.env`. Set strong deployment values for the instructor password, database password, and `JWT_SECRET` before starting the app.

## Classroom workflow

1. Sign in, create a course folder, and share it with other registered instructors by email when needed.
2. Select **New quiz**. Choose its folder, then build single-choice, multiple-choice, drag-to-order, or matching-pair questions with 2–6 items, time, and points.
3. Find quizzes by folder, title, course tag, or instructor. Any instructor with folder access can select **Review** to inspect all questions and correct answers, then **Play** and share the 6-digit PIN, link, or QR code.
4. Students open `/join`, enter the PIN, their name, and optional student ID. They can still join while a quiz is already live.
5. Start the quiz. The server reveals results when everyone answers or time expires, then advances automatically after the result screen.
6. At the end, export XLSX or CSV. The file includes each question result, total correct, accuracy, score, and rank.
7. Open **Stats** in session history for question analysis and the leaderboard, or re-export XLSX/CSV later.
8. Session hosts may remove test runs. Quiz owners can see sessions hosted by collaborators who used their quizzes.

Student reconnect tokens are kept in that device's browser. Refreshing the player page restores the session and score.

Instructor sound effects and original background quiz music are controlled separately from the presenter bar. Music starts only after the instructor clicks its control because browsers block automatic audio.

While answers are open, the presenter sees only the total response count; per-option counts stay hidden until reveal. A short sound plays for every accepted answer when instructor SFX is enabled.

Students can send approved emoji reactions or short chat messages from the lobby and live quiz. Reactions appear as temporary floating overlays for the whole room and are rate-limited by the server.

Played quiz definitions are locked so later editing cannot change historical results. Create a new quiz version when you need different questions.

Deleting a quiz removes it from the library without touching played sessions. Its statistics and exports remain in session history until the session host deletes those sessions.

Folder sharing grants access to view and play every quiz in that folder and to add new quizzes. Each quiz remains editable and deletable only by its creator. A session can be removed only by the instructor who hosted it; the quiz owner can still view its statistics and export the result.

## Local development

Backend:

```bash
cp .env.example .env
# Edit every required value in .env
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
The frontend reads its API, WebSocket, and local proxy addresses from the root `.env`. For a separately hosted frontend, set `VITE_API_URL` and `VITE_WS_URL` to the public HTTPS and WSS backend addresses during the frontend build.

## API and real-time behavior

- REST API: `http://localhost:8000/api`
- OpenAPI docs in local development: `http://localhost:8000/docs`
- WebSocket room: `/ws/sessions/{session_id}`
- Health check: `/api/health`

Correctness and response time are computed on the server. Ordering and matching items are shuffled per game without sending the solution before reveal. Correct responses receive the question's base points multiplied by a linear speed factor from `1.0` down to `0.5`. Duplicate and late answers are rejected.

`RESULT_DISPLAY_SECONDS` controls how long the per-question result remains visible before the server advances. The default is six seconds.

## Tests

```bash
cd backend
pytest
cd ../frontend
npm run build
```

## Deployment notes

The containers are single-node ready and keep all HTTP/WebSocket traffic behind the frontend Nginx service. For multi-replica deployment, replace the in-process WebSocket room manager with Redis pub/sub and use a shared PostgreSQL database.

For a complete Docker Compose deployment on port 9090 through your Cloudflare domain, follow [DEPLOYMENT.md](DEPLOYMENT.md).
