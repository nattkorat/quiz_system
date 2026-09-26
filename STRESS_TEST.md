# QuizForge stress-test baseline

Test date: 25 September 2026

## Result

The infrastructure baseline found that 400 simultaneous students was comfortable on the development setup. The application now deliberately caps each game at **150 students**, so 150 is the supported per-game maximum. A stage of 800 completed before the cap was introduced, but connection and answer latency was too high to treat it as comfortable capacity. The 1,000-student stage failed while establishing the WebSocket connections.

| Students | Result | Join p95 | WebSocket p95 | Question p95 | Answer p95 |
| ---: | :---: | ---: | ---: | ---: | ---: |
| 25 | Pass | 13.4 ms | 57.4 ms | 10.7 ms | 11.2 ms |
| 50 | Pass | 11.4 ms | 108.7 ms | 9.7 ms | 6.1 ms |
| 100 | Pass | 8.1 ms | 281.9 ms | 12.7 ms | 4.9 ms |
| 200 | Pass | 7.0 ms | 744.7 ms | 19.7 ms | 4.1 ms |
| 400 | Pass | 10.2 ms | 2,378.3 ms | 67.9 ms | 2.9 ms |
| 800 | Pass | 1,021.8 ms | 9,688.8 ms | 79.5 ms | 1,201.9 ms |
| 1,000 | Fail | 3,139.0 ms | 15,833.0 ms | — | — |

## Scope and limitations

This is a development baseline, not the production capacity number. It used one Uvicorn worker, local SQLite, and generated load from the same computer. The harness used a deliberately harsh burst of WebSocket connections after the students joined.

Production capacity depends on the server CPU and memory, PostgreSQL configuration, network, and Cloudflare Tunnel. Run the same test from a separate computer against the public URL during a maintenance window before inviting a large class.

The test exposed a database-pool leak: each connected WebSocket previously retained one SQLAlchemy connection. That leak is fixed, and an automated 20-WebSocket regression test now protects the fix.

## Reproduce

```bash
cd backend
.venv/bin/python scripts/load_test.py \
  --base-url https://quiz.example.com \
  --email loadtest@example.com \
  --password 'test-account-password' \
  --students 50,100,150 \
  --ramp-seconds 10 \
  --json-output /tmp/quizforge-production-load.json
```

Use a dedicated instructor account and database backup. The script creates and deletes a temporary quiz and one session per stage.
