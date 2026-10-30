// The host-authoritative runner. It holds the state, takes moves from seats through a transport,
// checks and applies them, sends each seat its view, runs the CPU seats, and keeps `seq` and the
// history for Undo. It never touches the DOM, so the same engine runs a solo match or a room.
//
// Messages (all with `v: 1`):
//   to the engine:   {t: "move", seat, seq, move} · {t: "undo", seat} · {t: "hint", seat}
//   from the engine: {t: "view", seat, seq, turn, view, legal, note, last, places}
//                    {t: "refused", seat, reason} · {t: "hinted", seat, move}
//                    {t: "end", places} · {t: "crash", reason}

export const PROTOCOL = 1;
export const CRASH = "Something went wrong. Start again?";

/**
 * @param {object} o
 * @param {object} o.game the rules (site/games/<id>/rules.js)
 * @param {{name: string, kind: "human" | "cpu", level?: string}[]} o.seats
 * @param {number} o.seed
 * @param {{send: Function, onMessage: Function}} o.transport
 * @param {number} [o.delay] the CPU's pause before a move, in ms
 * @param {(fn: () => void, ms: number) => unknown} [o.schedule]
 * @param {(handle: unknown) => void} [o.cancel]
 */
export function createEngine({
  game,
  seats,
  seed,
  transport,
  delay = 500,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
}) {
  let state = game.init(seats.length, seed);
  let seq = 0;
  let last = null;
  let places = null;
  let timer = null;
  let crashed = false;
  /** States before each human move, for Undo. */
  const history = [];

  const send = (msg) => transport.send({ v: PROTOCOL, ...msg });
  const refuse = (seat, reason) => send({ t: "refused", seat, reason });

  function crash(error) {
    crashed = true;
    stopTimer();
    console.error("games: rules error", error);
    send({ t: "crash", reason: CRASH });
  }

  function stopTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function publish() {
    const turn = state.turn;
    for (let seat = 0; seat < seats.length; seat++) {
      send({
        t: "view",
        seat,
        seq,
        turn,
        view: game.view(state, seat),
        legal: !places && seat === turn ? game.legalMoves(state, seat) : [],
        note: state.note ?? null,
        last,
        places,
      });
    }
    if (places) {
      send({ t: "end", places });
      return;
    }
    if (!game.legalMoves(state, turn).length) {
      crash(new Error(`seat ${turn} has no legal move`));
      return;
    }
    if (seats[turn].kind === "cpu") timer = schedule(cpuTurn, delay);
  }

  function commit(next, seat, move) {
    state = next;
    seq += 1;
    last = { seat, move };
    places = game.winner(state)?.places ?? null;
    publish();
  }

  function cpuTurn() {
    timer = null;
    if (crashed || places) return;
    const seat = state.turn;
    try {
      const move = game.ai(state, seat, seats[seat].level ?? "normal");
      commit(game.apply(state, seat, move), seat, move);
    } catch (error) {
      crash(error);
    }
  }

  function onMove({ seat, seq: moveSeq, move }) {
    if (crashed) return;
    if (places) return refuse(seat, "The match is over.");
    if (seats[seat]?.kind !== "human") return refuse(seat, "That seat isn't yours.");
    if (seat !== state.turn) return refuse(seat, `It's ${seats[state.turn].name}'s turn.`);
    if (moveSeq !== seq) return refuse(seat, "The board changed. Try again.");
    let next;
    try {
      next = game.apply(state, seat, move);
    } catch (error) {
      return refuse(seat, error instanceof Error ? error.message : "You can't do that now.");
    }
    history.push(state);
    try {
      commit(next, seat, move);
    } catch (error) {
      crash(error);
    }
  }

  function onUndo({ seat }) {
    if (crashed || places || !history.length)
      return refuse(seat, "There's no move to take back.");
    stopTimer();
    state = history.pop();
    seq += 1;
    last = null;
    publish();
  }

  function onHint({ seat }) {
    if (crashed || places || seat !== state.turn) return refuse(seat, "It isn't your turn.");
    send({ t: "hinted", seat, move: game.ai(state, seat, "best") });
  }

  const handlers = { move: onMove, undo: onUndo, hint: onHint };
  const off = transport.onMessage((msg) => handlers[msg?.t]?.(msg));

  return {
    start() {
      try {
        places = game.winner(state)?.places ?? null;
        publish();
      } catch (error) {
        crash(error);
      }
    },
    stop() {
      stopTimer();
      off();
    },
    canUndo: () => history.length > 0 && !places && !crashed,
    get seq() {
      return seq;
    },
    get state() {
      return state;
    },
  };
}
