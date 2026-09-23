import os
from pathlib import Path

TEST_DB = Path(__file__).parent / "test_quiz.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["JWT_SECRET"] = "test-secret-at-least-thirty-two-characters"
os.environ["RESULT_DISPLAY_SECONDS"] = "1"
os.environ["DEFAULT_INSTRUCTOR_NAME"] = "Test Instructor"
os.environ["DEFAULT_INSTRUCTOR_EMAIL"] = "default@example.com"
os.environ["DEFAULT_INSTRUCTOR_PASSWORD"] = "strong-default-password"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

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


def register(client, name, email):
    response = client.post("/api/auth/register", json={"name": name, "email": email, "password": "strong-pass"})
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
        access_token = headers["Authorization"].split(" ", 1)[1]
        with client.websocket_connect(f"/ws/sessions/{game['id']}?access_token={access_token}") as host_socket:
            assert host_socket.receive_json()["type"] == "snapshot"
            with client.websocket_connect(f"/ws/sessions/{game['id']}?participant_token={player['resume_token']}") as socket:
                assert socket.receive_json()["type"] == "snapshot"
                assert client.post(f"/api/sessions/{game['id']}/start", headers=headers).status_code == 200
                started = socket.receive_json()
                assert started["type"] == "question_start"
                assert host_socket.receive_json()["type"] == "question_start"
                socket.send_json({"type": "answer_submitted", "question_id": started["question"]["id"], "selected_options": [0]})
                accepted = socket.receive_json()
                assert accepted["type"] == "answer_accepted"
                assert 500 <= accepted["score"] <= 1000
                progress = host_socket.receive_json()
                assert progress == {"type": "question_progress", "question_id": started["question"]["id"], "response_count": 1}
                result = socket.receive_json()
                reveal = socket.receive_json()
                ranking = socket.receive_json()
                assert result["type"] == "player_result"
                assert result["is_correct"] is True
                assert reveal["type"] == "question_reveal"
                assert reveal["next_in_sec"] == 1
                assert ranking["type"] == "leaderboard_update"
                assert ranking["leaderboard"][0]["display_name"] == "Dara"
                assert socket.receive_json()["type"] == "session_end"
        history = client.get("/api/sessions/history", headers=headers)
        assert history.status_code == 200
        assert history.json()[0]["status"] == "ended"
        assert history.json()[0]["participant_count"] == 1
        locked = client.put(f"/api/quizzes/{quiz_id}", json=sample_quiz(), headers=headers)
        assert locked.status_code == 409


def test_shared_folder_quiz_usage_statistics_and_session_removal():
    with TestClient(app) as client:
        owner = register(client, "Quiz Owner", "owner@example.com")
        instructor = register(client, "Guest Instructor", "guest@example.com")
        folder = client.post("/api/folders", json={"name": "Networking", "course_tag": "NET", "description": "Shared course"}, headers=owner).json()
        shared = client.post(f"/api/folders/{folder['id']}/members", json={"email": "guest@example.com"}, headers=owner)
        assert shared.status_code == 201
        quiz_body = {**sample_quiz(), "folder_id": folder["id"]}
        quiz = client.post("/api/quizzes", json=quiz_body, headers=owner).json()

        visible = client.get("/api/quizzes?search=quiz%20owner", headers=instructor)
        assert visible.status_code == 200
        assert visible.json()[0]["id"] == quiz["id"]
        assert visible.json()[0]["can_edit"] is False
        assert client.put(f"/api/quizzes/{quiz['id']}", json=quiz_body, headers=instructor).status_code == 404

        game = client.post(f"/api/quizzes/{quiz['id']}/sessions", headers=instructor)
        assert game.status_code == 201
        session_id = game.json()["id"]
        assert client.post(f"/api/sessions/{session_id}/start", headers=instructor).status_code == 200
        assert client.post(f"/api/sessions/{session_id}/end", headers=instructor).status_code == 200

        owner_history = client.get("/api/sessions/history", headers=owner).json()
        assert owner_history[0]["used_my_quiz"] is True
        assert owner_history[0]["host"]["name"] == "Guest Instructor"
        assert owner_history[0]["can_delete"] is False
        assert client.delete(f"/api/quizzes/{quiz['id']}", headers=owner).status_code == 204
        assert client.get("/api/quizzes", headers=owner).json() == []
        assert client.get("/api/quizzes", headers=instructor).json() == []
        assert client.get(f"/api/sessions/{session_id}/statistics", headers=owner).status_code == 200
        assert client.get(f"/api/sessions/{session_id}/export?format=csv", headers=owner).status_code == 200
        assert client.delete(f"/api/sessions/{session_id}", headers=owner).status_code == 404
        assert client.delete(f"/api/sessions/{session_id}", headers=instructor).status_code == 204
        assert client.get("/api/sessions/history", headers=instructor).json() == []
