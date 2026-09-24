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
os.environ["CORS_ORIGIN_REGEX"] = ""
os.environ["ALLOW_PUBLIC_REGISTRATION"] = "true"
os.environ["PASSWORD_RESET_ENABLED"] = "false"

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app import main as main_module
from app.main import app
from app.services import expected_submission, get_full_session, question_payload, reveal_payload


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


def test_order_and_matching_questions_use_shuffled_public_ids():
    quiz_body = {
        "title": "Interactive quiz",
        "course_tag": "UX-101",
        "questions": [
            {"text": "Put these in order", "type": "order", "options": ["Plan", "Build", "Test"], "correct_options": [], "time_limit_sec": 20, "points": 1000},
            {"text": "Match the capitals", "type": "matching", "options": ["Cambodia", "Japan"], "match_options": ["Phnom Penh", "Tokyo"], "correct_options": [], "time_limit_sec": 20, "points": 1000},
        ],
    }
    with TestClient(app) as client:
        headers = auth(client)
        created = client.post("/api/quizzes", json=quiz_body, headers=headers)
        assert created.status_code == 201
        assert created.json()["questions"][1]["match_options"] == ["Phnom Penh", "Tokyo"]
        game_data = client.post(f"/api/quizzes/{created.json()['id']}/sessions", headers=headers).json()

        with SessionLocal() as db:
            game = get_full_session(db, game_data["id"])
            order_question, matching_question = game.quiz.questions
            order_public = question_payload(game, order_question)
            matching_public = question_payload(game, matching_question)

            assert "options" not in order_public
            assert "match_options" not in matching_public
            assert [item["text"] for item in order_public["items"]] != order_question.options
            assert expected_submission(game, order_question) == [next(item["id"] for item in order_public["items"] if item["text"] == text) for text in order_question.options]
            assert expected_submission(game, matching_question) == [next(item["id"] for item in matching_public["right_items"] if item["text"] == text) for text in matching_question.match_options]
            assert reveal_payload(db, game, order_question)["correct_sequence"] == expected_submission(game, order_question)
            assert reveal_payload(db, game, matching_question)["correct_matches"] == expected_submission(game, matching_question)

        invalid_order = {**quiz_body, "questions": [{**quiz_body["questions"][0], "options": ["One", "Two"]}]}
        invalid_matching = {**quiz_body, "questions": [{**quiz_body["questions"][1], "match_options": ["Only one"]}]}
        assert client.post("/api/quizzes", json=invalid_order, headers=headers).status_code == 422
        assert client.post("/api/quizzes", json=invalid_matching, headers=headers).status_code == 422


def test_password_reset_is_generic_single_use_and_changes_password(monkeypatch):
    captured = {}
    monkeypatch.setattr(main_module, "PASSWORD_RESET_ENABLED", True)
    monkeypatch.setattr(main_module, "PASSWORD_RESET_BASE_URL", "https://quiz.example.com")
    monkeypatch.setattr(main_module, "send_password_reset_email", lambda recipient, url: captured.update({"recipient": recipient, "url": url}))
    with TestClient(app) as client:
        register(client, "Reset Teacher", "reset@example.com")
        requested = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
        unknown = client.post("/api/auth/forgot-password", json={"email": "unknown@example.com"})
        assert requested.status_code == 200
        assert requested.json() == unknown.json()
        assert captured["recipient"] == "reset@example.com"
        token = captured["url"].split("token=", 1)[1]
        changed = client.post("/api/auth/reset-password", json={"token": token, "password": "new-strong-password"})
        assert changed.status_code == 200
        assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "strong-pass"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "new-strong-password"}).status_code == 200
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "another-password"}).status_code == 400


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


def test_late_student_can_join_and_send_live_reactions():
    with TestClient(app) as client:
        headers = auth(client)
        quiz_id = client.post("/api/quizzes", json=sample_quiz(), headers=headers).json()["id"]
        game = client.post(f"/api/quizzes/{quiz_id}/sessions", headers=headers).json()
        first = client.post("/api/sessions/join", json={"pin": game["pin"], "display_name": "First"})
        assert first.status_code == 200
        assert client.post(f"/api/sessions/{game['id']}/start", headers=headers).status_code == 200

        late = client.post("/api/sessions/join", json={"pin": game["pin"], "display_name": "Late Student"})
        assert late.status_code == 200
        access_token = headers["Authorization"].split(" ", 1)[1]
        with client.websocket_connect(f"/ws/sessions/{game['id']}?access_token={access_token}") as host_socket:
            assert host_socket.receive_json()["type"] == "snapshot"
            with client.websocket_connect(f"/ws/sessions/{game['id']}?participant_token={late.json()['resume_token']}") as player_socket:
                snapshot = player_socket.receive_json()
                assert snapshot["type"] == "snapshot"
                assert snapshot["session"]["status"] == "live"
                player_socket.send_json({"type": "reaction_send", "kind": "emoji", "content": "🔥"})
                player_reaction = player_socket.receive_json()
                host_reaction = host_socket.receive_json()
                assert player_reaction["type"] == "reaction"
                assert host_reaction["type"] == "reaction"
                assert host_reaction["display_name"] == "Late Student"
                assert host_reaction["content"] == "🔥"
                player_socket.send_json({"type": "reaction_send", "kind": "chat", "content": "hello"})
                assert player_socket.receive_json() == {"type": "reaction_rejected", "message": "Slow down a little"}


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
