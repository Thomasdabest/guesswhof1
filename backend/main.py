import random
import string

from fastapi import (
    FastAPI,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(
    title="Formula Guess API",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GAME DATA
# ============================================================

# These IDs must match drivers.ts
DRIVER_IDS = list(range(1, 23))

# Temporary memory storage.
# Restarting FastAPI will delete all active rooms.
rooms = {}

# Active WebSocket connections.
connections = {}


# ============================================================
# REQUEST MODELS
# ============================================================

class PlayerRequest(BaseModel):
    player_id: str


# ============================================================
# HELPERS
# ============================================================

def generate_room_code():
    characters = string.ascii_uppercase + string.digits

    while True:
        code = "".join(
            random.choices(characters, k=6)
        )

        if code not in rooms:
            return code


def get_opponent(room_code: str, player_id: str):
    room = rooms.get(room_code)

    if not room:
        return None

    for current_player in room["players"]:
        if current_player != player_id:
            return current_player

    return None


async def send_to_player(
    room_code: str,
    player_id: str,
    message: dict,
):
    room_connections = connections.get(
        room_code,
        {},
    )

    socket = room_connections.get(player_id)

    if socket:
        try:
            await socket.send_json(message)
        except Exception:
            pass


async def send_turn_update(room_code: str):
    room = rooms.get(room_code)

    if not room:
        return

    for player_id in room["players"]:
        await send_to_player(
            room_code,
            player_id,
            {
                "type": "turn",
                "player_id": room["turn"],
            },
        )


# ============================================================
# TEST ROUTE
# ============================================================

@app.get("/")
def home():
    return {
        "message": "Formula Guess server is running"
    }


# ============================================================
# CREATE ROOM
# ============================================================

@app.post("/rooms")
def create_room(request: PlayerRequest):
    room_code = generate_room_code()

    secret_driver = random.choice(
        DRIVER_IDS
    )

    rooms[room_code] = {
        "players": {
            request.player_id: secret_driver
        },
        "turn": request.player_id,
        "current_question": None,
    }

    return {
        "room_code": room_code,
        "player_id": request.player_id,
        "secret_driver_id": secret_driver,
        "players": 1,
        "ready": False,
    }


# ============================================================
# JOIN ROOM
# ============================================================

@app.post("/rooms/{room_code}/join")
def join_room(
    room_code: str,
    request: PlayerRequest,
):
    room_code = room_code.strip().upper()

    if room_code not in rooms:
        raise HTTPException(
            status_code=404,
            detail="Room not found",
        )

    room = rooms[room_code]

    # Player already belongs to this room
    if request.player_id in room["players"]:
        return {
            "room_code": room_code,
            "player_id": request.player_id,
            "secret_driver_id": room["players"][
                request.player_id
            ],
            "players": len(room["players"]),
            "ready": len(room["players"]) == 2,
        }

    # Only two players allowed
    if len(room["players"]) >= 2:
        raise HTTPException(
            status_code=400,
            detail="Room is full",
        )

    # Make sure players don't receive
    # the exact same secret driver.
    used_drivers = list(
        room["players"].values()
    )

    available_drivers = [
        driver_id
        for driver_id in DRIVER_IDS
        if driver_id not in used_drivers
    ]

    secret_driver = random.choice(
        available_drivers
    )

    room["players"][
        request.player_id
    ] = secret_driver

    return {
        "room_code": room_code,
        "player_id": request.player_id,
        "secret_driver_id": secret_driver,
        "players": len(room["players"]),
        "ready": True,
    }


# ============================================================
# ROOM STATUS
# ============================================================

@app.get("/rooms/{room_code}")
def get_room(room_code: str):
    room_code = room_code.strip().upper()

    if room_code not in rooms:
        raise HTTPException(
            status_code=404,
            detail="Room not found",
        )

    room = rooms[room_code]

    player_count = len(
        room["players"]
    )

    return {
        "room_code": room_code,
        "players": player_count,
        "ready": player_count == 2,
    }


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket(
    "/ws/{room_code}/{player_id}"
)
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    player_id: str,
):
    room_code = room_code.strip().upper()

    # Validate room
    if room_code not in rooms:
        await websocket.close(code=4004)
        return

    room = rooms[room_code]

    # Validate player
    if player_id not in room["players"]:
        await websocket.close(code=4003)
        return

    await websocket.accept()

    if room_code not in connections:
        connections[room_code] = {}

    connections[room_code][
        player_id
    ] = websocket

    print(
        f"Player connected: {player_id} "
        f"in room {room_code}"
    )

    # Immediately tell the player
    # whose turn it currently is.
    await websocket.send_json(
        {
            "type": "turn",
            "player_id": room["turn"],
        }
    )

    try:
        while True:
            data = await websocket.receive_json()

            message_type = data.get("type")

            # ================================================
            # QUESTION
            # ================================================

            if message_type == "question":
                if room["turn"] != player_id:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "It is not your turn.",
                        }
                    )
                    continue

                if room["current_question"] is not None:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "Wait for your opponent to answer.",
                        }
                    )
                    continue

                question = (
                    data
                    .get("question", "")
                    .strip()
                )

                if not question:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "Question cannot be empty.",
                        }
                    )
                    continue

                opponent = get_opponent(
                    room_code,
                    player_id,
                )

                if not opponent:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "Your opponent is not connected.",
                        }
                    )
                    continue

                room["current_question"] = {
                    "asker": player_id,
                    "answerer": opponent,
                    "question": question,
                }

                await send_to_player(
                    room_code,
                    opponent,
                    {
                        "type": "question",
                        "question": question,
                    },
                )

                await send_to_player(
                    room_code,
                    player_id,
                    {
                        "type": "question_sent",
                        "question": question,
                    },
                )

            # ================================================
            # ANSWER
            # ================================================

            elif message_type == "answer":
                current_question = room.get(
                    "current_question"
                )

                if not current_question:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "There is no question to answer.",
                        }
                    )
                    continue

                if (
                    current_question["answerer"]
                    != player_id
                ):
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "You cannot answer this question.",
                        }
                    )
                    continue

                answer = (
                    data
                    .get("answer", "")
                    .strip()
                    .upper()
                )

                if answer not in ["YES", "NO"]:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message":
                                "Answer must be YES or NO.",
                        }
                    )
                    continue

                asker = current_question[
                    "asker"
                ]

                question = current_question[
                    "question"
                ]

                # Send answer to person
                # who asked the question.
                await send_to_player(
                    room_code,
                    asker,
                    {
                        "type": "answer",
                        "question": question,
                        "answer": answer,
                    },
                )

                # Confirm to the answering player.
                await send_to_player(
                    room_code,
                    player_id,
                    {
                        "type": "answer_sent",
                        "question": question,
                        "answer": answer,
                    },
                )

                # The answering player gets
                # the next turn.
                room["turn"] = player_id

                room["current_question"] = None

                await send_turn_update(
                    room_code
                )

            # ================================================
            # UNKNOWN MESSAGE
            # ================================================

            else:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message":
                            "Unknown message type.",
                    }
                )

    except WebSocketDisconnect:
        print(
            f"Player disconnected: {player_id} "
            f"from room {room_code}"
        )

        if room_code in connections:
            connections[
                room_code
            ].pop(
                player_id,
                None,
            )

            if not connections[room_code]:
                connections.pop(
                    room_code,
                    None,
                )