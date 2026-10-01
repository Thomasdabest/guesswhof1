const API_URL =
  "http://localhost:8000";


export interface RoomResponse {
  room_code: string;
  player_id: string;
  secret_driver_id: number;
  players: number;
  ready: boolean;
}


export interface RoomStatus {
  room_code: string;
  players: number;
  ready: boolean;
}


export async function createRoom(
  playerId: string
): Promise<RoomResponse> {
  const response = await fetch(
    `${API_URL}/rooms`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        player_id: playerId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      "Could not create room."
    );
  }

  return response.json();
}


export async function joinRoom(
  roomCode: string,
  playerId: string
): Promise<RoomResponse> {
  const response = await fetch(
    `${API_URL}/rooms/${roomCode}/join`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        player_id: playerId,
      }),
    }
  );

  if (!response.ok) {
    const error =
      await response.json();

    throw new Error(
      error.detail ||
      "Could not join room."
    );
  }

  return response.json();
}


export async function getRoom(
  roomCode: string
): Promise<RoomStatus> {
  const response = await fetch(
    `${API_URL}/rooms/${roomCode}`
  );

  if (!response.ok) {
    throw new Error(
      "Room not found."
    );
  }

  return response.json();
}