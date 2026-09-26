# QuizForge

A full-stack live classroom quiz app with instructor-controlled pacing, server-side scoring, real-time leaderboards, reconnect support, and grade-ready XLSX/CSV exports.

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:9090](http://localhost:9090), or the port configured by `APP_PORT`.

The initial instructor name, email, and password come from `.env`. Set strong deployment values for the instructor password, database password, and `JWT_SECRET` before starting the app.

The initial instructor is also the platform administrator. Sign in with `DEFAULT_INSTRUCTOR_EMAIL`, then open **Admin** in the top navigation to view registration and usage totals, monitor open games, suspend/reactivate instructor accounts, generate manual password-reset links, or end an open game. Suspending an instructor preserves their quizzes and played-session history.

Manual reset links do not require SMTP. Find the instructor by their registered email, select **Reset link**, then privately send the generated URL to that email owner. The link expires after `PASSWORD_RESET_EXPIRE_MINUTES` and becomes invalid immediately after the password changes.

## Classroom workflow

1. Sign in, create a course folder, and share it with other registered instructors by email or an expiring invitation link. Owners can rename, update, or delete folders and revoke active links.
2. Select **New quiz**. Choose its folder, then build single-choice, multiple-choice, drag-to-order, or matching-pair questions with 2–6 items, time, and points.
3. Find quizzes by folder, title, course tag, or instructor. Any instructor with access can review, play, or copy a quiz into an independently editable version, then share the game PIN, link, or QR code.
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

## Live load test

The load test exercises the complete student flow: REST join, WebSocket connection, question broadcast, answer submission, and server acknowledgement. Use a dedicated test instructor and database because it creates temporary quiz sessions.

```bash
cd backend
.venv/bin/python scripts/load_test.py \
  --base-url http://127.0.0.1:8000 \
  --email loadtest@example.com \
  --password 'your-test-password' \
  --students 25,50,100,150 \
  --json-output /tmp/quizforge-load-report.json
```

For production capacity, run it from a separate machine against the public Cloudflare URL during a maintenance window. Local SQLite results are only a development baseline; the deployed PostgreSQL server, network, Cloudflare tunnel, CPU, and memory determine the real limit.

Each game accepts at most 150 students by default. Set `MAX_PARTICIPANTS_PER_SESSION` to change the limit; reconnecting students can still resume when the game is full.

An instructor lobby that is created but never started automatically closes after two hours, including across backend restarts. Set `PENDING_SESSION_EXPIRE_HOURS` to change this period. Active quizzes still finish through their normal question timers, and completed sessions remain in history.

## Backend modules

- `app/main.py` assembles the application and routers.
- `app/routers/` separates authentication, administration, quiz library, game sessions, reports, and live WebSockets.
- `app/quiz_service.py` owns quiz/folder access rules and serialization.
- `app/game_service.py` owns live-game state transitions and timers.
- `app/lifecycle.py` owns startup, database initialization, and task restoration.

## Deployment notes

The containers are single-node ready and keep all HTTP/WebSocket traffic behind the frontend Nginx service. For multi-replica deployment, replace the in-process WebSocket room manager with Redis pub/sub and use a shared PostgreSQL database.

For a complete Docker Compose deployment on port 9090 through your Cloudflare domain, follow [DEPLOYMENT.md](DEPLOYMENT.md).
