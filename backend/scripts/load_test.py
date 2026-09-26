#!/usr/bin/env python3
"""QuizForge live-session load test.

Exercises the real instructor login, session creation, student join, WebSocket
connection, question broadcast, and answer acknowledgement flow.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import time
from pathlib import Path
from urllib.parse import quote

import httpx
import websockets


def percentile(values: list[float], value: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * value
    lower, upper = math.floor(index), math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - index) + ordered[upper] * (index - lower)


def latency_summary(values: list[float]) -> dict[str, float]:
    return {
        "p50_ms": round(percentile(values, 0.50) * 1000, 1),
        "p95_ms": round(percentile(values, 0.95) * 1000, 1),
        "p99_ms": round(percentile(values, 0.99) * 1000, 1),
        "max_ms": round(max(values, default=0) * 1000, 1),
    }


async def receive_type(socket, expected: str, timeout: float) -> dict:
    deadline = time.perf_counter() + timeout
    while True:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            raise TimeoutError(f"Timed out waiting for {expected}")
        message = json.loads(await asyncio.wait_for(socket.recv(), remaining))
        if message.get("type") == expected:
            return message
        if message.get("type") in {"answer_rejected", "error"}:
            raise RuntimeError(message.get("message", message["type"]))


async def run_stage(client: httpx.AsyncClient, base_url: str, ws_base: str, headers: dict, quiz_id: int, students: int, ramp_seconds: float, timeout: float) -> dict:
    session_response = await client.post(f"{base_url}/api/quizzes/{quiz_id}/sessions", headers=headers)
    session_response.raise_for_status()
    game = session_response.json()
    started_at = time.perf_counter()

    async def join_one(index: int):
        await asyncio.sleep(ramp_seconds * index / max(students, 1))
        request_started = time.perf_counter()
        response = await client.post(
            f"{base_url}/api/sessions/join",
            json={"pin": game["pin"], "display_name": f"Load Student {index + 1}", "student_id": f"LOAD-{index + 1:05d}"},
        )
        response.raise_for_status()
        return response.json(), time.perf_counter() - request_started

    join_results = await asyncio.gather(*(join_one(index) for index in range(students)), return_exceptions=True)
    joined = [result for result in join_results if not isinstance(result, Exception)]
    errors = [f"join: {type(result).__name__}: {result}" for result in join_results if isinstance(result, Exception)]
    join_latencies = [result[1] for result in joined]

    sockets = []

    async def connect_one(student):
        connected_at = time.perf_counter()
        socket = await websockets.connect(
            f"{ws_base}/ws/sessions/{game['id']}?participant_token={quote(student[0]['resume_token'])}",
            open_timeout=timeout,
            close_timeout=2,
            ping_interval=20,
            ping_timeout=20,
            max_size=1_048_576,
        )
        snapshot = await receive_type(socket, "snapshot", timeout)
        if snapshot.get("session", {}).get("id") != game["id"]:
            await socket.close()
            raise RuntimeError("Incorrect session snapshot")
        return socket, time.perf_counter() - connected_at

    if not errors:
        socket_results = await asyncio.gather(*(connect_one(student) for student in joined), return_exceptions=True)
        sockets = [result[0] for result in socket_results if not isinstance(result, Exception)]
        socket_latencies = [result[1] for result in socket_results if not isinstance(result, Exception)]
        errors.extend(f"socket: {type(result).__name__}: {result}" for result in socket_results if isinstance(result, Exception))
    else:
        socket_latencies = []

    question_latencies = []
    answer_latencies = []
    response_count = 0

    if not errors and len(sockets) == students:
        broadcast_started = time.perf_counter()
        start_response = await client.post(f"{base_url}/api/sessions/{game['id']}/start", headers=headers)
        start_response.raise_for_status()

        async def receive_question(socket):
            question = await receive_type(socket, "question_start", timeout)
            return question, time.perf_counter() - broadcast_started

        question_results = await asyncio.gather(*(receive_question(socket) for socket in sockets), return_exceptions=True)
        errors.extend(f"question: {type(result).__name__}: {result}" for result in question_results if isinstance(result, Exception))
        question_latencies = [result[1] for result in question_results if not isinstance(result, Exception)]

        if not errors:
            question_id = question_results[0][0]["question"]["id"]

            async def answer_one(index: int, socket):
                await asyncio.sleep(index / max(students, 1))
                answer_started = time.perf_counter()
                await socket.send(json.dumps({"type": "answer_submitted", "question_id": question_id, "selected_options": [0]}))
                await receive_type(socket, "answer_accepted", timeout)
                return time.perf_counter() - answer_started

            answer_results = await asyncio.gather(*(answer_one(index, socket) for index, socket in enumerate(sockets)), return_exceptions=True)
            errors.extend(f"answer: {type(result).__name__}: {result}" for result in answer_results if isinstance(result, Exception))
            answer_latencies = [result for result in answer_results if not isinstance(result, Exception)]

            if not errors:
                stats_response = await client.get(f"{base_url}/api/sessions/{game['id']}/statistics", headers=headers)
                stats_response.raise_for_status()
                response_count = stats_response.json()["questions"][0]["response_count"]
                if response_count != students:
                    errors.append(f"statistics: expected {students} answers, found {response_count}")

    await asyncio.gather(*(socket.close() for socket in sockets), return_exceptions=True)
    try:
        await client.delete(f"{base_url}/api/sessions/{game['id']}", headers=headers)
    except Exception as exc:
        errors.append(f"cleanup: {type(exc).__name__}: {exc}")

    elapsed = time.perf_counter() - started_at
    return {
        "students": students,
        "passed": not errors,
        "joined": len(joined),
        "connected": len(sockets),
        "answers_recorded": response_count,
        "elapsed_seconds": round(elapsed, 2),
        "joins_per_second": round(len(joined) / elapsed, 1) if elapsed else 0,
        "join": latency_summary(join_latencies),
        "socket": latency_summary(socket_latencies),
        "question_delivery": latency_summary(question_latencies),
        "answer_ack": latency_summary(answer_latencies),
        "errors": errors[:10],
    }


async def run(args) -> int:
    base_url = args.base_url.rstrip("/")
    ws_base = base_url.replace("https://", "wss://", 1).replace("http://", "ws://", 1)
    counts = [int(value.strip()) for value in args.students.split(",") if value.strip()]
    limits = httpx.Limits(max_connections=max(counts) + 30, max_keepalive_connections=max(counts) + 10)
    timeout_config = httpx.Timeout(args.timeout)
    results = []

    async with httpx.AsyncClient(limits=limits, timeout=timeout_config) as client:
        health = await client.get(f"{base_url}/api/health")
        health.raise_for_status()
        login = await client.post(f"{base_url}/api/auth/login", json={"email": args.email, "password": args.password})
        login.raise_for_status()
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        quiz = await client.post(
            f"{base_url}/api/quizzes",
            headers=headers,
            json={
                "title": f"Load test {int(time.time())}",
                "course_tag": "LOAD-TEST",
                "questions": [{"text": "Select the first answer", "type": "single", "options": ["Correct", "Wrong"], "correct_options": [0], "time_limit_sec": 300, "points": 1000}],
            },
        )
        quiz.raise_for_status()
        quiz_id = quiz.json()["id"]
        try:
            for count in counts:
                print(f"Running {count} concurrent students…", flush=True)
                result = await run_stage(client, base_url, ws_base, headers, quiz_id, count, args.ramp_seconds, args.timeout)
                results.append(result)
                status = "PASS" if result["passed"] else "FAIL"
                print(
                    f"{status} {count}: connected={result['connected']} answers={result['answers_recorded']} "
                    f"join_p95={result['join']['p95_ms']}ms ws_p95={result['socket']['p95_ms']}ms "
                    f"question_p95={result['question_delivery']['p95_ms']}ms answer_p95={result['answer_ack']['p95_ms']}ms",
                    flush=True,
                )
                if result["errors"]:
                    print(f"  First error: {result['errors'][0]}", flush=True)
                if not result["passed"] and args.stop_on_failure:
                    break
        finally:
            try:
                await client.delete(f"{base_url}/api/quizzes/{quiz_id}", headers=headers)
            except Exception as exc:
                print(f"Quiz cleanup warning: {type(exc).__name__}: {exc}", flush=True)

    report = {
        "target": base_url,
        "tested_at_unix": int(time.time()),
        "ramp_seconds": args.ramp_seconds,
        "timeout_seconds": args.timeout,
        "stages": results,
    }
    if args.json_output:
        output = Path(args.json_output).expanduser().resolve()
        output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"JSON report: {output}")
    successful = [stage["students"] for stage in results if stage["passed"]]
    print(f"Highest passing stage: {max(successful) if successful else 0} students")
    return 0 if results and all(stage["passed"] for stage in results) else 1


def parse_args():
    parser = argparse.ArgumentParser(description="Load-test QuizForge's complete live student flow")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--students", default="25,50,100,150", help="Comma-separated stage sizes")
    parser.add_argument("--ramp-seconds", type=float, default=3.0, help="Seconds over which students join")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--json-output")
    parser.add_argument("--stop-on-failure", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
