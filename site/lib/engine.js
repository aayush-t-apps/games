// The host-authoritative runner. It holds the state, takes moves from seats through a transport,
// checks and applies them, sends each seat its view, runs the CPU seats, and keeps `seq` and the
// history for Undo. It never touches the DOM, so the same engine runs a solo match or a room.
//
// Messages (all with `v: 1`):
//   to the engine:   {t: "move", seat, seq, move} · {t: "undo", seat} · {t: "hint", seat}
//   from the engine: {t: "view", seat, seq, turn, view, legal, note, last, places}, one per seat,
//                    then {t: "public", seq, turn, view, legal: [], note, last, places}: the view
//                    with no seat, for spectators and a table (online rooms send it on)
//                    {t: "refused", seat, reason} · {t: "hinted", seat, move}
//                    {t: "end", places} · {t: "crash", reason}
// Online (change 0002), the host device runs this engine: `snapshot()` is what the room keeps,
// `from` goes on from it on a new host, and a seat that is away for `idleMs` on its turn is played
// by the CPU until it's back.

export const PROTOCOL = 1;
export const CRASH = "Something went wrong. Start again?";
export const IDLE_MS = 60_000;

/**
 * @param {object} o
 * @param {object} o.game the rules (site/games/<id>/rules.js)
 * @param {{name: string, kind: "human" | "cpu", level?: string}[]} o.seats
 * @param {number} o.seed
 * @param {{send: Function, onMessage: Function}} o.transport
 * @param {{state: object, seq: number, last: object | null, places: number[][] | null}} [o.from]
 *   a snapshot to go on from, instead of a new match
 * @param {number} [o.delay] the CPU's pause before a move, in ms
 * @param {number} [o.idleMs] how long an away seat has on its turn before the CPU plays for it
 * @param {(fn: () => void, ms: number) => unknown} [o.schedule]
 * @param {(handle: unknown) => void} [o.cancel]
 */
export function createEngine({
  game,
  seats,
  seed,
  transport,
  from,
  delay = 500,
  idleMs = IDLE_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
}) {
  let state = from ? from.state : game.init(seats.length, seed);
  let seq = from?.seq ?? 0;
  let last = from?.last ?? null;
  let places = from?.places ?? null;
  let timer = null;
  let crashed = false;
  /** States before each human move, for Undo. */
  const history = [];
  /** Seats whose device is away, and those of them the CPU now plays for. */
  const away = new Set();
  const covered = new Set();

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
    const note = state.note ?? null;
    send({ t: "public", seq, turn, view: game.view(state, null), legal: [], note, last, places });
    if (places) {
      send({ t: "end", places });
      return;
    }
    if (!game.legalMoves(state, turn).length) {
      crash(new Error(`seat ${turn} has no legal move`));
      return;
    }
    plan();
  }

  /** Start the timer for whoever moves next: a CPU, a covered seat, or an away seat's grace. */
  function plan() {
    stopTimer();
    if (crashed || places) return;
    const turn = state.turn;
    if (seats[turn].kind === "cpu" || covered.has(turn)) timer = schedule(cpuTurn, delay);
    else if (away.has(turn))
      timer = schedule(() => {
        timer = null;
        covered.add(turn);
        cpuTurn();
      }, idleMs);
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
    if (away.has(seat)) back(seat);
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

  /** A seat's device is back: it plays for itself again. */
  function back(seat) {
    away.delete(seat);
    covered.delete(seat);
    if (seat === state.turn) stopTimer();
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
    /** Send every view again, at the same `seq` (a host that reconnected). */
    resend() {
      if (!crashed) publish();
    },
    /** Which human seats are away (online: their device is offline). */
    setAway(seats) {
      const now = new Set(seats);
      for (const seat of [...away]) if (!now.has(seat)) back(seat);
      for (const seat of now) away.add(seat);
      if (timer === null) plan();
    },
    /** What the room keeps, to go on from on another device (`from`). */
    snapshot: () => ({ state, seq, last, places }),
    canUndo: () => history.length > 0 && !places && !crashed,
    get seq() {
      return seq;
    },
    get state() {
      return state;
    },
  };
}
