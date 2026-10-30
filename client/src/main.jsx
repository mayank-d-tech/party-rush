import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { socket } from "./socket.js";
import { Trophy, Users, Zap, Timer, Crown, Copy, Gamepad2, Sparkles, Wifi, ArrowRight, RotateCcw, WifiOff, CheckCircle2, Eye, EyeOff } from "lucide-react";
import "./style.css";

const games = [
  ["Quick Quiz", "Answer fast. Score big.", "⚡"],
  ["Memory Master", "Remember every symbol.", "🧠"],
  ["Reflex Rush", "Wait for GO. Tap instantly.", "🎯"],
  ["Word Scramble", "Unscramble before time runs out.", "🔤"],
  ["Brain Battle", "Crack the final puzzles.", "🚀"]
];
const symbols = ["●", "◆", "▲", "★"];

function App() {
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("partyRushToken") || "");
  const [savedCode, setSavedCode] = useState(() => localStorage.getItem("partyRushRoom") || "");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answer, setAnswer] = useState("");
  const [memoryInput, setMemoryInput] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(socket.connected);
  const [showSequence, setShowSequence] = useState(true);

  const saveSession = (roomCode, playerToken) => {
    localStorage.setItem("partyRushRoom", roomCode);
    localStorage.setItem("partyRushToken", playerToken);
    setSavedCode(roomCode);
    setToken(playerToken);
  };
  const clearSession = () => {
    localStorage.removeItem("partyRushRoom");
    localStorage.removeItem("partyRushToken");
    setSavedCode("");
    setToken("");
  };

  useEffect(() => {
    const update = r => {
      setRoom(r);
      if (r.status === "lobby") setScreen("lobby");
      else if (r.status === "playing") setScreen("game");
      else if (r.status === "leaderboard") setScreen("leaderboard");
      else if (r.status === "finished") setScreen("finished");
    };
    const onConnect = () => {
      setOnline(true);
      const savedToken = localStorage.getItem("partyRushToken");
      const savedRoom = localStorage.getItem("partyRushRoom");
      if (savedToken && savedRoom) {
        socket.emit("room:resume", { code: savedRoom, token: savedToken }, result => {
          if (result?.ok) {
            setRoom(result.room);
            if (result.room.status === "lobby") setScreen("lobby");
            else if (result.room.status === "playing") setScreen("game");
            else if (result.room.status === "leaderboard") setScreen("leaderboard");
            else if (result.room.status === "finished") setScreen("finished");
          } else {
            clearSession();
          }
        });
      }
    };
    const onDisconnect = () => setOnline(false);
    socket.on("room:update", update);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off("room:update", update);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    setFeedback("");
    setAnswer("");
    setMemoryInput([]);
    setShowSequence(true);
  }, [room?.roundIndex, room?.questionIndex, room?.prompt?.phase]);

  useEffect(() => {
    if (!room?.deadline || room.status !== "playing") return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [room?.deadline, room?.status]);

  const me = room?.players?.find(p => p.id === token);
  const isHost = room?.hostId === token;
  const myScore = me?.score ?? 0;
  const roundName = room?.round ? games[room.roundIndex]?.[0] : "";
  const rank = useMemo(() => [...(room?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)), [room?.players]);
  const submitted = !!me?.submitted;

  const connect = mode => {
    setError("");
    setBusy(true);
    const done = result => {
      setBusy(false);
      if (!result?.ok) { setError(result?.error || "Something went wrong."); return; }
      saveSession(result.room.code, result.token);
      setRoom(result.room);
      setScreen("lobby");
    };
    if (mode === "create") socket.emit("room:create", { name }, done);
    else socket.emit("room:join", { code, name }, done);
  };

  const submit = value => {
    if (!room || submitted || feedback) return;
    const payload = value === undefined ? answer : value;
    if (payload === "" || payload === null || (Array.isArray(payload) && !payload.length)) return;
    socket.emit("game:answer", { answer: payload }, result => {
      if (result?.ok) {
        setFeedback(result.message || (result.correct ? `+${result.points} points` : "Answer submitted"));
        setAnswer("");
      } else setFeedback(result?.error || "Could not submit. Try again.");
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setFeedback("Room code copied!");
    } catch {
      setFeedback(`Room code: ${room.code}`);
    }
  };
  const next = () => {
    setError("");
    socket.emit("game:next", result => { if (!result?.ok) setError(result?.error || "Unable to continue."); });
  };
  const leave = () => {
    socket.emit("room:leave");
    clearSession();
    setRoom(null);
    setScreen("home");
    setError("");
    setFeedback("");
    setAnswer("");
    setMemoryInput([]);
  };
  const toggleMemorySymbol = symbol => {
    if (submitted || feedback || memoryInput.length >= (room?.questionIndex || 0) + 3) return;
    setMemoryInput(current => [...current, symbol]);
  };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); if (!room) setScreen("home"); }}><span className="brand-mark"><Gamepad2 size={21} /></span> PARTY<span>RUSH</span></a>
      <div className="top-meta"><span className={`live-dot ${online ? "" : "offline"}`} /> {online ? "REAL-TIME PARTY GAME" : "RECONNECTING…"} <span className="version">V2.0</span></div>
    </header>
    <main>
      {screen === "home" && <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> THE ULTIMATE MULTIPLAYER SHOWDOWN</div>
          <h1>One room.<br /><em>Eight rivals.</em><br />Five battles.</h1>
          <p className="hero-sub">Bring your friends. Join from any device. Make every second count.</p>
          <div className="stats"><span><Users size={17} /> 2–8 PLAYERS</span><span><Zap size={17} /> 5 MINI-GAMES</span><span><Trophy size={17} /> 500 POINTS</span></div>
          <div className="join-card">
            <label>YOUR PLAYER NAME</label>
            <input maxLength="18" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your nickname" onKeyDown={e => e.key === "Enter" && connect("create")} />
            <button className="primary full" disabled={!name.trim() || busy || !online} onClick={() => connect("create")}>{busy ? "PLEASE WAIT…" : "CREATE A ROOM"} <ArrowRight size={18} /></button>
            <div className="or"><span /> OR JOIN A ROOM <span /></div>
            <div className="join-row"><input maxLength="6" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="6-CHARACTER CODE" /><button className="secondary" disabled={!name.trim() || code.trim().length !== 6 || busy || !online} onClick={() => connect("join")}>JOIN</button></div>
            {error && <p className="error">{error}</p>}
            {!online && <p className="hint"><WifiOff size={14} /> Waiting for the game server to reconnect…</p>}
          </div>
        </div>
        <div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="game-tile tile-one">⚡<small>QUIZ</small></div><div className="game-tile tile-two">🧠<small>MEMORY</small></div><div className="game-tile tile-three">🎯<small>REFLEX</small></div><div className="game-tile tile-four">🔤<small>WORDS</small></div><div className="center-burst"><Crown size={54} /><strong>RUSH</strong><small>YOUR FRIENDS</small></div><div className="floating-score">+100 <span>PTS</span></div></div>
      </section>}

      {screen === "lobby" && room && <section className="panel lobby-panel">
        <div className="panel-head"><div><div className="eyebrow">ROOM LOBBY</div><h2>Get your crew together.</h2><p>Share the code and wait for your friends to join.</p></div><button className="room-code" onClick={copyCode}><small>ROOM CODE</small><strong>{room.code}</strong><span><Copy size={14} /> COPY</span></button></div>
        <div className="lobby-grid"><div className="player-section"><div className="section-label"><Users size={16} /> PLAYERS <b>{room.players.length}/8</b></div><div className="player-grid">{room.players.map((p, i) => <div className="player-card" key={p.id}><div className={`avatar avatar-${i % 6}`}>{p.name.slice(0, 1).toUpperCase()}</div><div><strong>{p.name} {p.id === room.hostId && <Crown size={13} className="crown" />}</strong><small>{p.id === token ? "YOU" : p.id === room.hostId ? "HOST" : "PLAYER"} · {p.connected ? "CONNECTED" : "RECONNECTING"}</small></div><span className={`ready-dot ${p.connected ? "" : "offline"}`} /></div>)}</div><div className="waiting-note"><span className="pulse" /> {room.players.length < 2 ? "Need at least one more player to start." : "Your crew is ready. Waiting for host to launch."}</div></div>
          <div className="round-preview"><div className="section-label">THE FIVE ROUNDS</div>{games.map((g, i) => <div className="preview-game" key={g[0]}><span className="game-emoji">{g[2]}</span><div><strong>{String(i + 1).padStart(2, "0")} · {g[0]}</strong><small>{g[1]}</small></div><span className="preview-check">✓</span></div>)}</div></div>
        <div className="lobby-actions"><button className="ghost" onClick={leave}>LEAVE ROOM</button>{isHost ? <button className="primary" disabled={room.players.filter(p => p.connected).length < 2} onClick={() => socket.emit("game:start", r => { if (!r?.ok) setError(r?.error || "Could not start."); })}>START MATCH <ArrowRight size={18} /></button> : <div className="host-wait"><Timer size={16} /> HOST WILL START THE MATCH</div>}</div>{error && <p className="error">{error}</p>}
      </section>}

      {screen === "game" && room && <section className="panel game-panel">
        <div className="game-top"><div><div className="eyebrow">ROUND {room.roundIndex + 1} OF 5</div><h2>{games[room.roundIndex]?.[2]} {roundName}</h2></div><div className={`timer ${seconds <= 5 ? "urgent" : ""}`}><Timer size={18} /><strong>{seconds}s</strong></div></div>
        <div className="progress"><span style={{ width: `${((room.questionIndex + 1) / 5) * 100}%` }} /></div>
        <div className="question-meta">CHALLENGE {room.questionIndex + 1} / 5 <span>YOUR SCORE: {myScore}</span></div>
        <div className="challenge"><h3>{room.prompt?.title}</h3>
          {room.prompt?.type === "quiz" && <div className="answer-grid">{room.prompt.options.map((opt, i) => <button className={`answer-option ${answer === i ? "selected" : ""}`} key={opt} onClick={() => setAnswer(i)} disabled={submitted || !!feedback}>{String.fromCharCode(65 + i)} <span>{opt}</span></button>)}</div>}
          {room.prompt?.type === "words" && <><div className="scramble">{room.prompt.word?.split("").join(" ")}</div><input className="answer-input" value={answer} onChange={e => setAnswer(e.target.value.toUpperCase())} placeholder="TYPE YOUR ANSWER" maxLength={12} disabled={submitted || !!feedback} onKeyDown={e => e.key === "Enter" && submit()} /></>}
          {room.prompt?.type === "brain" && <input className="answer-input" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="YOUR ANSWER" disabled={submitted || !!feedback} onKeyDown={e => e.key === "Enter" && submit()} />}
          {room.prompt?.type === "memory" && <div className="memory-game">
            {room.prompt.phase === "memorize" ? <><div className="memory-sequence">{room.prompt.sequence?.map((s, i) => <span key={i}>{s}</span>)}</div><p className="hint"><Eye size={14} /> Memorize the sequence. It will disappear when the timer ends.</p></> : <><div className="memory-sequence recall-sequence">{memoryInput.length ? memoryInput.map((s, i) => <span key={i}>{s}</span>) : <span className="memory-placeholder">Your sequence</span>}</div><p className="hint"><EyeOff size={14} /> Repeat the symbols in the correct order.</p><div className="symbol-pad">{symbols.map(s => <button key={s} className="symbol-key" onClick={() => toggleMemorySymbol(s)} disabled={submitted || !!feedback || memoryInput.length >= room.questionIndex + 3}>{s}</button>)}<button className="symbol-clear" onClick={() => setMemoryInput([])} disabled={submitted || !!feedback || !memoryInput.length}>CLEAR</button></div><button className="primary submit-btn" onClick={() => submit(memoryInput)} disabled={submitted || !!feedback || memoryInput.length !== room.questionIndex + 3}>SUBMIT SEQUENCE <ArrowRight size={18} /></button></>}
          </div>}
          {room.prompt?.type === "reflex" && <button className={`reflex-button ${room.prompt.phase === "go" ? "go" : ""} ${submitted ? "locked" : ""}`} onClick={() => submit("tap")} disabled={submitted || !!feedback}>{submitted ? "LOCKED IN" : room.prompt.phase === "go" ? "TAP NOW!" : "WAIT FOR GO…"}</button>}
          {room.prompt?.type !== "reflex" && room.prompt?.type !== "memory" && <button className="primary submit-btn" onClick={() => submit()} disabled={submitted || !!feedback || answer === ""}>SUBMIT ANSWER <ArrowRight size={18} /></button>}
          {(feedback || submitted) && <div className="feedback"><CheckCircle2 size={16} /> {feedback || "Answer locked in. Waiting for other players…"}</div>}
        </div>
        <div className="game-footer"><span><Wifi size={15} /> LIVE MATCH</span><span>{room.players.filter(p => p.connected).length} PLAYERS ONLINE</span></div>
      </section>}

      {screen === "leaderboard" && room && <section className="panel results-panel"><div className="eyebrow">ROUND {room.roundIndex + 1} COMPLETE</div><h2>Here's how it stands.</h2><p className="muted">Round {room.roundIndex + 1}: {roundName}</p><div className="score-list">{rank.map((p, i) => <div className={`score-row ${i === 0 ? "first" : ""}`} key={p.id}><span className="rank">{i === 0 ? <Crown size={18} /> : String(i + 1).padStart(2, "0")}</span><div className={`avatar avatar-${i % 6}`}>{p.name.slice(0, 1).toUpperCase()}</div><strong>{p.name} {p.id === token && <small>(YOU)</small>}</strong><span className="round-points">+{p.roundScores?.[room.roundIndex] || 0} <small>ROUND</small></span><b>{p.score} <small>PTS</small></b></div>)}</div><div className="results-actions">{isHost ? <button className="primary" onClick={next}>{room.roundIndex === 4 ? "SHOW FINAL RESULTS" : "NEXT ROUND"} <ArrowRight size={18} /></button> : <div className="host-wait"><Timer size={16} /> WAITING FOR HOST TO CONTINUE</div>}</div>{error && <p className="error">{error}</p>}</section>}

      {screen === "finished" && room && <section className="panel finished-panel"><div className="confetti">✦　✧　✦　✧　✦</div><div className="eyebrow">MATCH COMPLETE</div><div className="trophy-big"><Trophy size={68} /></div><h1>{room.champions?.length > 1 ? "IT'S A TIE!" : "THE CHAMPION"}</h1><h2>{room.champions?.map(p => p.name).join(" & ") || "No winner"}</h2><div className="champion-score">{room.champions?.[0]?.score || 0} <small>POINTS</small></div><div className="score-list final-list">{rank.map((p, i) => <div className="score-row" key={p.id}><span className="rank">#{i + 1}</span><strong>{p.name} {p.id === token && <small>(YOU)</small>}</strong><b>{p.score} <small>PTS</small></b></div>)}</div><button className="primary" onClick={leave}><RotateCcw size={18} /> BACK TO HOME</button></section>}
    </main>
    <footer><span>PARTY RUSH © 2026</span><span>BUILT FOR THE FRIEND GROUP <span className="footer-star">✦</span></span></footer>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
