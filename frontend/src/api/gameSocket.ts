const WS_URL =
  "ws://localhost:8000";


export function createGameSocket(
  roomCode: string,
  playerId: string
) {
  return new WebSocket(
    `${WS_URL}/ws/${roomCode}/${playerId}`
  );
}