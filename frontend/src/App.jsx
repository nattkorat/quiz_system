import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Check, ChevronDown, ChevronUp, CirclePlay, Clock3, Copy, Download, FilePlus2, GraduationCap, LogOut, Plus, Radio, Save, ShieldCheck, Trash2, Users, X, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, clearAuth, downloadExport, getToken, setAuth, socketUrl } from "./api";

const palette = ["coral", "blue", "gold", "violet", "green", "pink"];
const blankQuestion = () => ({ text: "", type: "single", options: ["", ""], correct_options: [0], time_limit_sec: 20, points: 1000 });

function Brand({ compact = false }) {
  return <div className="brand"><span className="brand-mark"><Zap size={compact ? 17 : 21} fill="currentColor" /></span>{!compact && <span>QuizForge</span>}</div>;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
}

function Loader({ label = "Loading…" }) { return <div className="loader"><span />{label}</div>; }
function ErrorBox({ error }) { return error ? <div className="error-box">{error}</div> : null; }

function Shell({ children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("quizforge_user") || "null");
  return <div className="app-shell">
    <header className="topbar">
      <Brand />
      <div className="topbar-right"><span className="user-chip"><span>{user?.name?.[0] || "I"}</span>{user?.name || "Instructor"}</span><button className="icon-button" aria-label="Sign out" onClick={() => { clearAuth(); navigate("/login"); }}><LogOut size={18} /></button></div>
    </header>
    <main className="shell-content">{children}</main>
  </div>;
}

function Protected({ children }) { return getToken() ? children : <Navigate to="/login" replace />; }

function Login() {
  const navigate = useNavigate();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "instructor@example.com", password: "change-me-123" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await api(`/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(form) });
      setAuth(result); navigate("/dashboard");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-page">
    <section className="auth-story">
      <Brand />
      <div className="signal-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="pulse-core"><Radio size={52} /></div></div>
      <div><p className="eyebrow">LIVE CLASSROOM SIGNAL</p><h1>Questions in.<br />Energy up.</h1><p>Run fast, fair classroom quizzes with scores your gradebook can actually use.</p></div>
      <div className="story-stats"><span><b>&lt; 1 sec</b>live updates</span><span><b>60+</b>players ready</span><span><b>XLSX</b>grade export</span></div>
    </section>
    <section className="auth-panel">
      <form className="auth-card" onSubmit={submit}>
        <div className="mobile-brand"><Brand /></div>
        <p className="eyebrow">INSTRUCTOR CONSOLE</p><h2>{register ? "Create your account" : "Welcome back"}</h2><p className="muted">{register ? "Start building your first live quiz." : "Sign in to launch your next session."}</p>
        <ErrorBox error={error} />
        {register && <label>Full name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. Ada Lovelace" /></label>}
        <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        <Button disabled={busy} type="submit">{busy ? "Please wait…" : register ? "Create account" : "Enter console"}<ArrowRight size={18} /></Button>
        <button className="text-button" type="button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "New instructor? Create an account"}</button>
      </form>
    </section>
  </div>;
}

function Dashboard() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null); const [error, setError] = useState(""); const [launching, setLaunching] = useState(null);
  const load = useCallback(() => api("/quizzes").then(setQuizzes).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function launch(quiz) {
    setLaunching(quiz.id); setError("");
    try { const game = await api(`/quizzes/${quiz.id}/sessions`, { method: "POST" }); navigate(`/host/${game.id}`); }
    catch (e) { setError(e.message); setLaunching(null); }
  }
  return <Shell><div className="page-heading"><div><p className="eyebrow">QUIZ LIBRARY</p><h1>Your classroom, live.</h1><p className="muted">Build once. Launch in seconds. Export clean results.</p></div><Button onClick={() => navigate("/quizzes/new")}><Plus size={18} />New quiz</Button></div>
    <ErrorBox error={error} />
    {quizzes === null ? <Loader /> : quizzes.length === 0 ? <div className="empty-state"><div className="empty-icon"><FilePlus2 /></div><h2>Build your first quiz</h2><p>Start with two answer choices. Add timing and points when you are ready.</p><Button onClick={() => navigate("/quizzes/new")}><Plus size={18} />Create quiz</Button></div> : <div className="quiz-grid">
      {quizzes.map((quiz, index) => <article className="quiz-card" key={quiz.id}>
        <div className={`quiz-card-accent ${palette[index % palette.length]}`}><span>{quiz.course_tag || "UNTAGGED"}</span><BarChart3 size={28} /></div>
        <div className="quiz-card-body"><h2>{quiz.title}</h2><div className="quiz-meta"><span>{quiz.questions.length} questions</span><span>•</span><span>{quiz.questions.reduce((sum, q) => sum + q.time_limit_sec, 0)} sec</span></div>
          <div className="card-actions"><Button onClick={() => launch(quiz)} disabled={launching === quiz.id}><CirclePlay size={18} />{launching === quiz.id ? "Launching…" : "Launch"}</Button><Button variant="ghost" onClick={() => navigate(`/quizzes/${quiz.id}`)}>Edit</Button></div>
        </div>
      </article>)}
    </div>}
  </Shell>;
}

function QuizEditor() {
  const { quizId } = useParams(); const navigate = useNavigate(); const isNew = quizId === "new";
  const [quiz, setQuiz] = useState({ title: "", course_tag: "", questions: [blankQuestion()] });
  const [loading, setLoading] = useState(!isNew); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (!isNew) api(`/quizzes/${quizId}`).then(data => { setQuiz(data); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }, [isNew, quizId]);
  function updateQuestion(index, patch) { setQuiz({ ...quiz, questions: quiz.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }); }
  function toggleCorrect(qIndex, optionIndex) {
    const q = quiz.questions[qIndex]; let selected;
    if (q.type === "single") selected = [optionIndex];
    else selected = q.correct_options.includes(optionIndex) ? q.correct_options.filter(i => i !== optionIndex) : [...q.correct_options, optionIndex];
    updateQuestion(qIndex, { correct_options: selected });
  }
  function changeType(index, type) { const q = quiz.questions[index]; updateQuestion(index, { type, correct_options: type === "single" ? [q.correct_options[0] ?? 0] : q.correct_options }); }
  function move(index, direction) { const copy = [...quiz.questions]; const other = index + direction; if (other < 0 || other >= copy.length) return; [copy[index], copy[other]] = [copy[other], copy[index]]; setQuiz({ ...quiz, questions: copy }); }
  async function save() {
    setError("");
    if (!quiz.title.trim()) return setError("Give the quiz a title.");
    if (quiz.questions.some(q => !q.text.trim() || q.options.some(o => !o.trim()) || !q.correct_options.length)) return setError("Complete every question, option, and correct answer.");
    setSaving(true);
    const body = { title: quiz.title, course_tag: quiz.course_tag, questions: quiz.questions.map(({ id, position, ...q }) => q) };
    try { await api(isNew ? "/quizzes" : `/quizzes/${quizId}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) }); navigate("/dashboard"); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  if (loading) return <Shell><Loader /></Shell>;
  return <Shell><div className="editor-header"><button className="back-link" onClick={() => navigate("/dashboard")}><ArrowLeft size={17} />Library</button><div><p className="eyebrow">{isNew ? "NEW QUIZ" : "EDIT QUIZ"}</p><h1>{quiz.title || "Untitled quiz"}</h1></div><Button onClick={save} disabled={saving}><Save size={18} />{saving ? "Saving…" : "Save quiz"}</Button></div>
    <ErrorBox error={error} />
    <section className="quiz-basics panel"><label>Quiz title<input value={quiz.title} onChange={e => setQuiz({ ...quiz, title: e.target.value })} placeholder="Java fundamentals — Week 3" /></label><label>Course tag<input value={quiz.course_tag} onChange={e => setQuiz({ ...quiz, course_tag: e.target.value.toUpperCase() })} placeholder="OOP-JAVA" /></label></section>
    <div className="question-list">{quiz.questions.map((q, qIndex) => <section className="question-editor panel" key={q.id || qIndex}>
      <div className="question-number"><span>{String(qIndex + 1).padStart(2, "0")}</span><div><button aria-label="Move up" onClick={() => move(qIndex, -1)} disabled={qIndex === 0}><ChevronUp /></button><button aria-label="Move down" onClick={() => move(qIndex, 1)} disabled={qIndex === quiz.questions.length - 1}><ChevronDown /></button></div></div>
      <div className="question-fields"><label>Question<input value={q.text} onChange={e => updateQuestion(qIndex, { text: e.target.value })} placeholder="What does encapsulation protect?" /></label>
        <div className="settings-row"><label>Answer type<select value={q.type} onChange={e => changeType(qIndex, e.target.value)}><option value="single">Single choice</option><option value="multi">Multiple choice</option></select></label><label>Time<select value={q.time_limit_sec} onChange={e => updateQuestion(qIndex, { time_limit_sec: Number(e.target.value) })}>{[10, 15, 20, 30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label>Points<input type="number" min="0" max="100000" value={q.points} onChange={e => updateQuestion(qIndex, { points: Number(e.target.value) })} /></label></div>
        <div className="option-editor-grid">{q.options.map((option, oIndex) => <div className={`option-editor ${q.correct_options.includes(oIndex) ? "correct" : ""}`} key={oIndex}><button className="correct-toggle" aria-label={`Mark option ${oIndex + 1} correct`} onClick={() => toggleCorrect(qIndex, oIndex)}>{q.correct_options.includes(oIndex) ? <Check size={17} /> : String.fromCharCode(65 + oIndex)}</button><input value={option} onChange={e => { const options = [...q.options]; options[oIndex] = e.target.value; updateQuestion(qIndex, { options }); }} placeholder={`Answer ${oIndex + 1}`} />{q.options.length > 2 && <button className="mini-remove" aria-label="Remove answer" onClick={() => { const options = q.options.filter((_, i) => i !== oIndex); const correct = q.correct_options.filter(i => i !== oIndex).map(i => i > oIndex ? i - 1 : i); updateQuestion(qIndex, { options, correct_options: correct.length ? correct : [0] }); }}><X size={16} /></button>}</div>)}</div>
        <div className="question-footer"><button className="text-button left" disabled={q.options.length >= 6} onClick={() => updateQuestion(qIndex, { options: [...q.options, ""] })}><Plus size={16} />Add answer</button>{quiz.questions.length > 1 && <button className="danger-link" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qIndex) })}><Trash2 size={16} />Delete question</button>}</div>
      </div>
    </section>)}</div>
    <button className="add-question" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion()] })}><Plus />Add another question</button>
  </Shell>;
}

function useLiveSocket(sessionId, params, onMessage) {
  const callback = useRef(onMessage); callback.current = onMessage;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true; let ws; let retry;
    const connect = () => {
      ws = new WebSocket(socketUrl(sessionId, params));
      ws.onopen = () => active && setConnected(true);
      ws.onclose = () => { if (active) { setConnected(false); retry = setTimeout(connect, 1200); } };
      ws.onmessage = event => callback.current(JSON.parse(event.data), ws);
    };
    connect();
    return () => { active = false; clearTimeout(retry); ws?.close(); };
  }, [sessionId, JSON.stringify(params)]);
  return connected;
}

function Leaderboard({ rows = [], me }) {
  if (!rows.length) return <div className="no-data">No scores yet</div>;
  return <div className="leaderboard">{rows.map(row => <div className={`leader-row ${row.participant_id === me ? "me" : ""}`} key={row.participant_id}><span className={`rank rank-${row.rank}`}>{row.rank}</span><strong>{row.display_name}</strong><span className="rank-change">{row.rank_delta > 0 ? <><ArrowUp />{row.rank_delta}</> : row.rank_delta < 0 ? <><ArrowDown />{Math.abs(row.rank_delta)}</> : "—"}</span><b>{row.score.toLocaleString()}</b></div>)}</div>;
}

function Host() {
  const { sessionId } = useParams(); const navigate = useNavigate();
  const [state, setState] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const handleMessage = useCallback(message => setState(prev => {
    if (message.type === "snapshot") return { ...message, response_count: message.reveal?.response_count || 0, distribution: message.reveal?.distribution || [] };
    if (!prev) return prev;
    if (message.type === "player_joined") return { ...prev, participants: message.participants };
    if (message.type === "question_start") return { ...prev, session: { ...prev.session, status: "live", current_question_index: message.question.position, is_revealed: false }, question: message.question, reveal: null, leaderboard: null, response_count: 0, distribution: message.question.options.map(() => 0) };
    if (message.type === "question_progress") return { ...prev, response_count: message.response_count, distribution: message.distribution };
    if (message.type === "question_reveal") return { ...prev, session: { ...prev.session, is_revealed: true }, reveal: message, response_count: message.response_count, distribution: message.distribution };
    if (message.type === "leaderboard_update") return { ...prev, leaderboard: message.leaderboard };
    if (message.type === "session_end") return { ...prev, session: { ...prev.session, status: "ended" }, leaderboard: message.leaderboard };
    return prev;
  }), []);
  const connected = useLiveSocket(sessionId, { access_token: getToken() }, handleMessage);
  useEffect(() => { api(`/sessions/${sessionId}`).then(setState).catch(e => setError(e.message)); }, [sessionId]);
  async function action(name) { setBusy(true); setError(""); try { await api(`/sessions/${sessionId}/${name}`, { method: "POST" }); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (!state) return <div className="host-page"><Loader label="Opening presenter view…" /></div>;
  const { session, participants = [], question, leaderboard: board = [] } = state;
  const joinUrl = `${location.origin}/join?pin=${session.pin}`;
  const exportFile = async format => { try { await downloadExport(sessionId, format); } catch (e) { setError(e.message); } };
  return <div className="host-page">
    <header className="presenter-bar"><Brand /><div className={`connection ${connected ? "online" : ""}`}><span />{connected ? "Live" : "Reconnecting"}</div><button className="text-button" onClick={() => navigate("/dashboard")}>Exit presenter</button></header>
    <ErrorBox error={error} />
    {session.status === "pending" && <main className="lobby-layout"><section className="join-panel"><p className="eyebrow">JOIN AT {location.host}/join</p><h1>Game PIN</h1><div className="pin-display">{session.pin}</div><button className="copy-link" onClick={() => { navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy join link"}</button><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={154} bgColor="transparent" fgColor="#071621" /></div></section>
      <section className="lobby-players"><div className="section-title"><div><p className="eyebrow">LOBBY</p><h2>{participants.length} {participants.length === 1 ? "player" : "players"} ready</h2></div><Users size={30} /></div><div className="player-cloud">{participants.map((p, i) => <span key={p.id} style={{ animationDelay: `${i * 35}ms` }}>{p.display_name}</span>)}</div>{!participants.length && <div className="waiting"><span className="dots"><i /><i /><i /></span>Waiting for students to join</div>}<Button className="start-button" disabled={busy || !participants.length} onClick={() => action("start")}><CirclePlay />Start quiz</Button></section></main>}
    {session.status === "live" && <main className="live-host"><div className="question-stage"><div className="question-topline"><span>Question {(session.current_question_index ?? 0) + 1} / {session.question_count}</span><span><Users />{state.response_count || 0} / {participants.length} answered</span></div><h1>{question?.text}</h1><div className="host-options">{question?.options.map((option, index) => { const count = state.distribution?.[index] || 0; const max = Math.max(1, ...state.distribution || [1]); return <div className={`host-option ${palette[index]}`} key={index}><span className="option-key">{String.fromCharCode(65 + index)}</span><strong>{option}</strong><div className="bar-track"><i style={{ width: `${count / max * 100}%` }} /></div><b>{count}</b>{state.reveal?.correct_options?.includes(index) && <span className="correct-badge"><Check /></span>}</div>; })}</div></div>
      <aside className="host-sidebar"><div className="host-action panel"><p className="eyebrow">HOST CONTROL</p>{!session.is_revealed ? <><h2>Answers coming in</h2><p>{state.response_count || 0} of {participants.length} responses locked.</p><Button disabled={busy} onClick={() => action("reveal")}><ShieldCheck />Reveal answer</Button></> : <><h2>Scores updated</h2><p>Leaderboard is ready for the room.</p><Button disabled={busy} onClick={() => action((session.current_question_index ?? 0) + 1 >= session.question_count ? "end" : "next")}>{(session.current_question_index ?? 0) + 1 >= session.question_count ? "Finish quiz" : "Next question"}<ArrowRight /></Button></>}</div>{session.is_revealed && <div className="panel compact-board"><p className="eyebrow">LEADERBOARD</p><Leaderboard rows={board?.slice(0, 5)} /></div>}</aside></main>}
    {session.status === "ended" && <main className="final-screen"><div className="final-heading"><p className="eyebrow">SESSION COMPLETE</p><h1>That’s a wrap.</h1><p>{participants.length} players • {session.question_count} questions • PIN {session.pin}</p></div><div className="final-grid"><section className="panel"><div className="section-title"><h2>Final leaderboard</h2><GraduationCap /></div><Leaderboard rows={board} /></section><aside className="export-card"><Download size={34} /><h2>Gradebook ready</h2><p>One row per student, with question results, accuracy, score, and rank.</p><Button onClick={() => exportFile("xlsx")}><Download />Export XLSX</Button><Button variant="secondary" onClick={() => exportFile("csv")}>Export CSV</Button><button className="text-button" onClick={() => navigate("/dashboard")}>Back to library</button></aside></div></main>}
  </div>;
}

function Join() {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const [form, setForm] = useState({ pin: params.get("pin") || "", display_name: "", student_id: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api("/sessions/join", { method: "POST", body: JSON.stringify(form) }); localStorage.setItem(`quizforge_player_${result.session_id}`, result.resume_token); navigate(`/play/${result.session_id}`); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <div className="join-page"><div className="join-glow" /><div className="join-card"><Brand /><div className="join-icon"><Radio /></div><p className="eyebrow">JOIN LIVE QUIZ</p><h1>Ready to play?</h1><p className="muted">Enter the code on the classroom screen.</p><form onSubmit={submit}><ErrorBox error={error} /><label>Game PIN<input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} placeholder="000000" className="pin-input" required /></label><label>Your name<input value={form.display_name} maxLength={80} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Sokha" required /></label><label>Student ID <span>optional</span><input value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} placeholder="e.g. 20260042" /></label><Button disabled={busy || form.pin.length < 4}>{busy ? "Joining…" : "Join game"}<ArrowRight /></Button></form></div></div>;
}

function Countdown({ deadline }) {
  const [left, setLeft] = useState(0);
  useEffect(() => { const tick = () => setLeft(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer); }, [deadline]);
  return <span className={`countdown ${left <= 5 ? "urgent" : ""}`}><Clock3 />{left}s</span>;
}

function Player() {
  const { sessionId } = useParams(); const navigate = useNavigate(); const token = localStorage.getItem(`quizforge_player_${sessionId}`);
  const [state, setState] = useState(null); const [selected, setSelected] = useState([]); const [submitted, setSubmitted] = useState(false); const [notice, setNotice] = useState(""); const socket = useRef(null);
  const onMessage = useCallback((message, ws) => { socket.current = ws; setState(prev => {
    if (message.type === "snapshot") { setSubmitted(Boolean(message.me?.answered)); return message; }
    if (!prev) return prev;
    if (message.type === "question_start") { setSelected([]); setSubmitted(false); setNotice(""); return { ...prev, session: { ...prev.session, status: "live", is_revealed: false, current_question_index: message.question.position, question_count: message.question_count }, question: message.question, reveal: null, leaderboard: null }; }
    if (message.type === "answer_accepted") { setSubmitted(true); setNotice("Answer locked"); return { ...prev, me: { ...prev.me, score: message.score, answered: true } }; }
    if (message.type === "answer_rejected") { setNotice(message.message); return prev; }
    if (message.type === "question_reveal") return { ...prev, session: { ...prev.session, is_revealed: true }, reveal: message };
    if (message.type === "leaderboard_update") return { ...prev, leaderboard: message.leaderboard };
    if (message.type === "session_end") return { ...prev, session: { ...prev.session, status: "ended" }, leaderboard: message.leaderboard };
    return prev;
  }); }, []);
  const connected = useLiveSocket(sessionId, { participant_token: token || "" }, onMessage);
  if (!token) return <Navigate to="/join" replace />;
  if (!state) return <div className="player-page"><Loader label="Joining the room…" /></div>;
  const { session, question, reveal, leaderboard = [], me = {} } = state;
  const myRow = leaderboard.find(row => row.participant_id === Number(state.me?.participant_id));
  function choose(index) { if (submitted || reveal) return; if (question.type === "single") setSelected([index]); else setSelected(s => s.includes(index) ? s.filter(i => i !== index) : [...s, index]); }
  function submit() { if (!selected.length || !socket.current || socket.current.readyState !== WebSocket.OPEN) return; socket.current.send(JSON.stringify({ type: "answer_submitted", question_id: question.id, selected_options: selected })); }
  if (session.status === "pending") return <div className="player-page waiting-room"><div className="player-status"><Brand /><div className="ready-check"><Check /></div><p className="eyebrow">YOU’RE IN</p><h1>Eyes up front.</h1><p>Your instructor will start <b>{session.quiz_title}</b> soon.</p><span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "Connected" : "Reconnecting"}</span></div></div>;
  if (session.status === "ended") return <div className="player-page result-page"><div className="result-card"><p className="eyebrow">FINAL RESULT</p><h1>{myRow ? `#${myRow.rank}` : "Finished"}</h1><h2>{myRow?.display_name || "Quiz complete"}</h2><div className="score-big">{(myRow?.score ?? me.score ?? 0).toLocaleString()}<span>points</span></div><Leaderboard rows={leaderboard.slice(0, 5)} me={myRow?.participant_id} /><Button onClick={() => navigate("/join")}>Join another game</Button></div></div>;
  return <div className="player-page play-surface"><header className="player-bar"><span>Q{(session.current_question_index ?? 0) + 1}/{session.question_count}</span><strong>{session.quiz_title}</strong><span>{(me.score || 0).toLocaleString()} pts</span></header>
    <main className="player-main">{question && <><div className="player-question"><Countdown deadline={question.deadline} /><h1>{question.text}</h1><p>{question.type === "multi" ? "Select all correct answers" : "Choose one answer"}</p></div><div className="player-options">{question.options.map((option, index) => { const isSelected = selected.includes(index); const isCorrect = reveal?.correct_options?.includes(index); const isWrong = reveal && isSelected && !isCorrect; return <button disabled={submitted || Boolean(reveal)} onClick={() => choose(index)} className={`${palette[index]} ${isSelected ? "selected" : ""} ${isCorrect ? "revealed-correct" : ""} ${isWrong ? "revealed-wrong" : ""}`} key={index}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{(isSelected || isCorrect) && <i>{isWrong ? <X /> : <Check />}</i>}</button>; })}</div>{!reveal && <div className="submit-zone"><Button onClick={submit} disabled={!selected.length || submitted}>{submitted ? <><Check />Answer locked</> : question.type === "multi" ? "Lock answers" : "Lock answer"}</Button>{notice && <span>{notice}</span>}</div>}</>}
      {reveal && <div className={`feedback-banner ${selected.length && selected.every(i => reveal.correct_options.includes(i)) && selected.length === reveal.correct_options.length ? "right" : "wrong"}`}><div>{selected.length && selected.every(i => reveal.correct_options.includes(i)) && selected.length === reveal.correct_options.length ? <Check /> : <X />}</div><span><b>{selected.length && selected.every(i => reveal.correct_options.includes(i)) && selected.length === reveal.correct_options.length ? "Correct!" : "Not this time"}</b>Score: {(me.score || 0).toLocaleString()}</span><em>Next question soon</em></div>}
    </main></div>;
}

export default function App() {
  return <Routes><Route path="/" element={<Navigate to={getToken() ? "/dashboard" : "/join"} replace />} /><Route path="/login" element={<Login />} /><Route path="/join" element={<Join />} /><Route path="/play/:sessionId" element={<Player />} /><Route path="/dashboard" element={<Protected><Dashboard /></Protected>} /><Route path="/quizzes/:quizId" element={<Protected><QuizEditor /></Protected>} /><Route path="/host/:sessionId" element={<Protected><Host /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}

