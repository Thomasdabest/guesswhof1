import {
  useEffect,
  useRef,
  useState,
} from "react";

import DriverCard
  from "./components/DriverCard";

import {
  drivers,
  type Driver,
} from "./data/drivers";

import {
  createRoom,
  joinRoom,
  getRoom,
} from "./api/gameApi";

import {
  createGameSocket,
} from "./api/gameSocket.ts";

import "./App.css";


type Screen =
  | "home"
  | "waiting"
  | "game";


function App() {
  const [
    screen,
    setScreen,
  ] = useState<Screen>("home");

  const [
    roomCode,
    setRoomCode,
  ] = useState("");

  const [
    joinCode,
    setJoinCode,
  ] = useState("");

  const [
    secretDriver,
    setSecretDriver,
  ] = useState<Driver | null>(
    null
  );

  const [
    eliminatedDrivers,
    setEliminatedDrivers,
  ] = useState<number[]>([]);

  const [
    error,
    setError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    question,
    setQuestion,
  ] = useState("");

  const [
    incomingQuestion,
    setIncomingQuestion,
  ] = useState("");

  const [
    lastQuestion,
    setLastQuestion,
  ] = useState("");

  const [
    lastAnswer,
    setLastAnswer,
  ] = useState("");

  const [
    isMyTurn,
    setIsMyTurn,
  ] = useState(false);

  const [
    waitingForAnswer,
    setWaitingForAnswer,
  ] = useState(false);

  const [
    socketConnected,
    setSocketConnected,
  ] = useState(false);

  const socketRef =
    useRef<WebSocket | null>(
      null
    );


  // ========================================================
  // PLAYER ID
  // ========================================================

  function getPlayerId() {
    let playerId =
      localStorage.getItem(
        "formulaGuessPlayerId"
      );

    if (!playerId) {
      playerId =
        crypto.randomUUID();

      localStorage.setItem(
        "formulaGuessPlayerId",
        playerId
      );
    }

    return playerId;
  }


  // ========================================================
  // CREATE GAME
  // ========================================================

  async function handleCreateGame() {
    try {
      setLoading(true);
      setError("");

      const playerId =
        getPlayerId();

      const room =
        await createRoom(
          playerId
        );

      setRoomCode(
        room.room_code
      );

      const driver =
        drivers.find(
          (currentDriver) =>
            currentDriver.id ===
            room.secret_driver_id
        );

      setSecretDriver(
        driver ?? null
      );

      setEliminatedDrivers(
        []
      );

      setScreen(
        "waiting"
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(
          err.message
        );
      }
    } finally {
      setLoading(false);
    }
  }


  // ========================================================
  // JOIN GAME
  // ========================================================

  async function handleJoinGame() {
    if (!joinCode.trim()) {
      setError(
        "Please enter a room code."
      );

      return;
    }

    try {
      setLoading(true);
      setError("");

      const playerId =
        getPlayerId();

      const room =
        await joinRoom(
          joinCode
            .trim()
            .toUpperCase(),
          playerId
        );

      setRoomCode(
        room.room_code
      );

      const driver =
        drivers.find(
          (currentDriver) =>
            currentDriver.id ===
            room.secret_driver_id
        );

      setSecretDriver(
        driver ?? null
      );

      setEliminatedDrivers(
        []
      );

      setScreen(
        "game"
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(
          err.message
        );
      }
    } finally {
      setLoading(false);
    }
  }


  // ========================================================
  // CREATOR WAITS FOR PLAYER TWO
  // ========================================================

  useEffect(() => {
    if (
      screen !== "waiting" ||
      !roomCode
    ) {
      return;
    }

    const interval =
      window.setInterval(
        async () => {
          try {
            const room =
              await getRoom(
                roomCode
              );

            if (room.ready) {
              window.clearInterval(
                interval
              );

              setScreen(
                "game"
              );
            }
          } catch (err) {
            console.error(
              "Could not check room:",
              err
            );
          }
        },
        1000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    screen,
    roomCode,
  ]);


  // ========================================================
  // WEBSOCKET
  // ========================================================

  useEffect(() => {
    if (
      screen !== "game" ||
      !roomCode
    ) {
      return;
    }

    const playerId =
      getPlayerId();

    const socket =
      createGameSocket(
        roomCode,
        playerId
      );

    socketRef.current =
      socket;

    socket.onopen = () => {
      console.log(
        "Connected to Formula Guess"
      );

      setSocketConnected(
        true
      );

      setError("");
    };

    socket.onmessage = (
      event
    ) => {
      const data =
        JSON.parse(
          event.data
        );

      console.log(
        "WebSocket message:",
        data
      );

      if (
        data.type === "turn"
      ) {
        setIsMyTurn(
          data.player_id ===
            playerId
        );
      }

      if (
        data.type === "question"
      ) {
        setIncomingQuestion(
          data.question
        );

        setLastAnswer("");
      }

      if (
        data.type ===
        "question_sent"
      ) {
        setWaitingForAnswer(
          true
        );

        setLastQuestion(
          data.question
        );

        setLastAnswer("");
      }

      if (
        data.type === "answer"
      ) {
        setWaitingForAnswer(
          false
        );

        setLastQuestion(
          data.question
        );

        setLastAnswer(
          data.answer
        );
      }

      if (
        data.type ===
        "answer_sent"
      ) {
        setIncomingQuestion(
          ""
        );
      }

      if (
        data.type === "error"
      ) {
        setError(
          data.message
        );
      }
    };

    socket.onerror = () => {
      setError(
        "Game connection error."
      );
    };

    socket.onclose = () => {
      console.log(
        "Disconnected from Formula Guess"
      );

      setSocketConnected(
        false
      );
    };

    return () => {
      socket.close();

      socketRef.current =
        null;
    };
  }, [
    screen,
    roomCode,
  ]);


  // ========================================================
  // SEND QUESTION
  // ========================================================

  function sendQuestion() {
    const cleanQuestion =
      question.trim();

    if (!cleanQuestion) {
      setError(
        "Enter a question first."
      );

      return;
    }

    if (!isMyTurn) {
      setError(
        "It is not your turn."
      );

      return;
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !==
        WebSocket.OPEN
    ) {
      setError(
        "Not connected to the game server."
      );

      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "question",
        question:
          cleanQuestion,
      })
    );

    setQuestion("");
    setError("");
  }


  // ========================================================
  // ANSWER QUESTION
  // ========================================================

  function answerQuestion(
    answer: "YES" | "NO"
  ) {
    if (
      !socketRef.current ||
      socketRef.current.readyState !==
        WebSocket.OPEN
    ) {
      setError(
        "Not connected to the game server."
      );

      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "answer",
        answer,
      })
    );

    setIncomingQuestion(
      ""
    );

    setError("");
  }


  // ========================================================
  // ELIMINATE DRIVER
  // ========================================================

  function toggleDriver(
    id: number
  ) {
    setEliminatedDrivers(
      (current) => {
        if (
          current.includes(id)
        ) {
          return current.filter(
            (driverId) =>
              driverId !== id
          );
        }

        return [
          ...current,
          id,
        ];
      }
    );
  }


  // ========================================================
  // RESET BOARD
  // ========================================================

  function resetBoard() {
    setEliminatedDrivers(
      []
    );
  }


  // ========================================================
  // LEAVE GAME
  // ========================================================

  function leaveGame() {
    if (socketRef.current) {
      socketRef.current.close();

      socketRef.current =
        null;
    }

    setScreen("home");

    setRoomCode("");
    setJoinCode("");

    setSecretDriver(null);

    setEliminatedDrivers(
      []
    );

    setQuestion("");
    setIncomingQuestion("");

    setLastQuestion("");
    setLastAnswer("");

    setWaitingForAnswer(
      false
    );

    setIsMyTurn(false);

    setSocketConnected(
      false
    );

    setError("");
  }


  // ========================================================
  // HOME
  // ========================================================

  if (screen === "home") {
    return (
      <div className="home">
        <div className="home-content">
          <div className="logo-small">
            FORMULA GUESS
          </div>

          <h1>
            GUESS{" "}
            <span>
              WHO?
            </span>
          </h1>

          <p>
            The Formula 1 driver
            guessing game.
          </p>

          <button
            className="primary-button"
            onClick={
              handleCreateGame
            }
            disabled={
              loading
            }
          >
            {loading
              ? "CREATING..."
              : "CREATE GAME"}
          </button>

          <div className="join-section">
            <span>
              OR
            </span>

            <input
              type="text"
              placeholder="ROOM CODE"
              value={
                joinCode
              }
              maxLength={6}
              onChange={(
                event
              ) =>
                setJoinCode(
                  event.target.value
                    .toUpperCase()
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  handleJoinGame();
                }
              }}
            />

            <button
              className=
                "secondary-button"
              onClick={
                handleJoinGame
              }
              disabled={
                loading
              }
            >
              JOIN GAME
            </button>
          </div>

          {error && (
            <p className=
              "error-message"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }


  // ========================================================
  // WAITING
  // ========================================================

  if (screen === "waiting") {
    return (
      <div className="home">
        <div className="home-content">
          <div className="logo-small">
            FORMULA GUESS
          </div>

          <h2>
            ROOM CREATED
          </h2>

          <p>
            Send this code
            to your friend:
          </p>

          <div className=
            "room-code"
          >
            {roomCode}
          </div>

          <div className=
            "waiting"
          >
            <div className=
              "spinner"
            />

            <p>
              Waiting for
              opponent...
            </p>
          </div>

          <button
            className=
              "secondary-button"
            onClick={
              leaveGame
            }
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }


  // ========================================================
  // GAME
  // ========================================================

  return (
    <div className="game">
      <header className=
        "game-header"
      >
        <div>
          <span className=
            "logo-small"
          >
            FORMULA GUESS
          </span>

          <h1>
            GUESS WHO?
          </h1>

          <div className=
            "game-meta"
          >
            <span>
              Room {roomCode}
            </span>

            <span
              className={
                socketConnected
                  ? "connection online"
                  : "connection offline"
              }
            >
              {socketConnected
                ? "Connected"
                : "Connecting..."}
            </span>
          </div>
        </div>

        <div className=
          "header-buttons"
        >
          <button
            className=
              "secondary-button"
            onClick={
              resetBoard
            }
          >
            Reset Board
          </button>

          <button
            className=
              "exit-button"
            onClick={
              leaveGame
            }
          >
            Exit
          </button>
        </div>
      </header>


      <section className=
        "secret-section"
      >
        <div>
          <span className=
            "section-label"
          >
            YOUR SECRET DRIVER
          </span>

          <h2>
            {secretDriver?.name}
          </h2>

          <p>
            Keep this hidden
            from your opponent.
          </p>
        </div>

        <div className=
          "secret-number"
        >
          {secretDriver?.number}
        </div>
      </section>


      <section className=
        "question-panel"
      >
        {incomingQuestion ? (
          <>
            <span className=
              "section-label"
            >
              OPPONENT ASKS
            </span>

            <h2 className=
              "incoming-question"
            >
              {incomingQuestion}
            </h2>

            <p>
              Answer honestly about
              your secret driver.
            </p>

            <div className=
              "answer-buttons"
            >
              <button
                className=
                  "yes-button"
                onClick={() =>
                  answerQuestion(
                    "YES"
                  )
                }
              >
                YES
              </button>

              <button
                className=
                  "no-button"
                onClick={() =>
                  answerQuestion(
                    "NO"
                  )
                }
              >
                NO
              </button>
            </div>
          </>
        ) : isMyTurn ? (
          <>
            <span className=
              "section-label"
            >
              YOUR TURN
            </span>

            <h2>
              Ask your opponent
            </h2>

            <p>
              Ask a yes/no question
              about their secret
              driver.
            </p>

            <div className=
              "question-input-row"
            >
              <input
                type="text"
                placeholder=
                  "Has your driver won a championship?"
                value={
                  question
                }
                onChange={(
                  event
                ) =>
                  setQuestion(
                    event.target.value
                  )
                }
                onKeyDown={(
                  event
                ) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    sendQuestion();
                  }
                }}
              />

              <button
                className=
                  "primary-button"
                onClick={
                  sendQuestion
                }
                disabled={
                  waitingForAnswer
                }
              >
                ASK
              </button>
            </div>

            {waitingForAnswer && (
              <div className=
                "waiting-answer"
              >
                Waiting for your
                opponent's answer...
              </div>
            )}

            {lastAnswer && (
              <div className=
                "answer-result"
              >
                <span>
                  {lastQuestion}
                </span>

                <strong>
                  {lastAnswer}
                </strong>
              </div>
            )}
          </>
        ) : (
          <>
            <span className=
              "section-label"
            >
              OPPONENT'S TURN
            </span>

            <h2>
              Waiting for their
              question...
            </h2>

            <p>
              You can still eliminate
              drivers while you wait.
            </p>

            {lastAnswer && (
              <div className=
                "answer-result"
              >
                <span>
                  {lastQuestion}
                </span>

                <strong>
                  {lastAnswer}
                </strong>
              </div>
            )}
          </>
        )}

        {error && (
          <p className=
            "game-error"
          >
            {error}
          </p>
        )}
      </section>


      <section className=
        "board-header"
      >
        <div>
          <h2>
            Driver Board
          </h2>

          <p>
            Click a driver
            to eliminate them.
          </p>
        </div>

        <div className=
          "remaining"
        >
          <strong>
            {drivers.length -
              eliminatedDrivers.length}
          </strong>

          <span>
            {" "}remaining
          </span>
        </div>
      </section>


      <main className=
        "driver-grid"
      >
        {drivers.map(
          (driver) => (
            <DriverCard
              key={
                driver.id
              }
              driver={
                driver
              }
              eliminated={
                eliminatedDrivers
                  .includes(
                    driver.id
                  )
              }
              onToggle={() =>
                toggleDriver(
                  driver.id
                )
              }
            />
          )
        )}
      </main>
    </div>
  );
}


export default App;