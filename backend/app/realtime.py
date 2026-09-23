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


manager = ConnectionManager()

