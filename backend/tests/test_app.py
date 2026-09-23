import os
from pathlib import Path

TEST_DB = Path(__file__).parent / "test_quiz.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def auth(client):
    response = client.post("/api/auth/register", json={"name": "Teacher", "email": "teacher@example.com", "password": "strong-pass"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def sample_quiz():
    return {
        "title": "Networking Basics",
        "course_tag": "NET-101",
        "questions": [{"text": "Which protocol resolves names?", "type": "single", "options": ["DNS", "SSH"], "correct_options": [0], "time_limit_sec": 20, "points": 1000}],
    }


def test_quiz_session_join_and_export():
    with TestClient(app) as client:
        headers = auth(client)
        created = client.post("/api/quizzes", json=sample_quiz(), headers=headers)
        assert created.status_code == 201
        quiz_id = created.json()["id"]
        game = client.post(f"/api/quizzes/{quiz_id}/sessions", headers=headers)
        assert game.status_code == 201
        data = game.json()
        joined = client.post("/api/sessions/join", json={"pin": data["pin"], "display_name": "Sokha", "student_id": "S001"})
        assert joined.status_code == 200
        export = client.get(f"/api/sessions/{data['id']}/export?format=csv", headers=headers)
        assert export.status_code == 200
        assert "Student Name,Student ID,Q1" in export.text
        assert "Sokha,S001,0" in export.text


def test_rejects_invalid_correct_option():
    with TestClient(app) as client:
        headers = auth(client)
        quiz = sample_quiz()
        quiz["questions"][0]["correct_options"] = [4]
        response = client.post("/api/quizzes", json=quiz, headers=headers)
        assert response.status_code == 422


def test_websocket_answer_is_scored_and_broadcast():
    with TestClient(app) as client:
        headers = auth(client)
        quiz_id = client.post("/api/quizzes", json=sample_quiz(), headers=headers).json()["id"]
        game = client.post(f"/api/quizzes/{quiz_id}/sessions", headers=headers).json()
        player = client.post("/api/sessions/join", json={"pin": game["pin"], "display_name": "Dara"}).json()
        with client.websocket_connect(f"/ws/sessions/{game['id']}?participant_token={player['resume_token']}") as socket:
            assert socket.receive_json()["type"] == "snapshot"
            assert client.post(f"/api/sessions/{game['id']}/start", headers=headers).status_code == 200
            started = socket.receive_json()
            assert started["type"] == "question_start"
            socket.send_json({"type": "answer_submitted", "question_id": started["question"]["id"], "selected_options": [0]})
            accepted = socket.receive_json()
            assert accepted["type"] == "answer_accepted"
            assert 500 <= accepted["score"] <= 1000
            assert client.post(f"/api/sessions/{game['id']}/reveal", headers=headers).status_code == 200
            assert socket.receive_json()["type"] == "question_reveal"
            ranking = socket.receive_json()
            assert ranking["type"] == "leaderboard_update"
            assert ranking["leaderboard"][0]["display_name"] == "Dara"
