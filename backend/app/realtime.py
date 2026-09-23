import asyncio
from collections import defaultdict
from dataclasses import dataclass

from fastapi import WebSocket


@dataclass
class Client:
    socket: WebSocket
    role: str
    participant_id: int | None = None


class ConnectionManager:
    def __init__(self):
        self.rooms: dict[int, list[Client]] = defaultdict(list)
        self.last_ranks: dict[int, dict[int, int]] = defaultdict(dict)
        self.tasks: dict[tuple[int, str], asyncio.Task] = {}
        self.locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def connect(self, session_id: int, client: Client):
        await client.socket.accept()
        self.rooms[session_id].append(client)

    def disconnect(self, session_id: int, socket: WebSocket):
        self.rooms[session_id] = [client for client in self.rooms[session_id] if client.socket is not socket]

    async def broadcast(self, session_id: int, payload: dict, role: str | None = None):
        stale = []
        for client in list(self.rooms[session_id]):
            if role and client.role != role:
                continue
            try:
                await client.socket.send_json(payload)
            except Exception:
                stale.append(client.socket)
        for socket in stale:
            self.disconnect(session_id, socket)

    async def send(self, socket: WebSocket, payload: dict):
        await socket.send_json(payload)

    async def send_participant_payloads(self, session_id: int, payloads: dict[int, dict]):
        stale = []
        for client in list(self.rooms[session_id]):
            if client.role != "player" or client.participant_id not in payloads:
                continue
            try:
                await client.socket.send_json(payloads[client.participant_id])
            except Exception:
                stale.append(client.socket)
        for socket in stale:
            self.disconnect(session_id, socket)

    def set_task(self, session_id: int, name: str, coroutine):
        self.cancel_task(session_id, name)
        key = (session_id, name)
        task = asyncio.create_task(coroutine)
        self.tasks[key] = task
        task.add_done_callback(lambda finished: self.tasks.pop(key, None) if self.tasks.get(key) is finished else None)

    def cancel_task(self, session_id: int, name: str):
        task = self.tasks.pop((session_id, name), None)
        if task and task is not asyncio.current_task() and not task.done():
            task.cancel()

    def cancel_session_tasks(self, session_id: int):
        for key in [key for key in self.tasks if key[0] == session_id]:
            self.cancel_task(*key)

    def lock(self, session_id: int) -> asyncio.Lock:
        return self.locks[session_id]


manager = ConnectionManager()
