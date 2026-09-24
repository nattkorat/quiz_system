import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Check, ChevronDown, ChevronUp, CirclePlay, Clock3, Copy, Download, Eye, EyeOff, FilePlus2, Folder, FolderOpen, GraduationCap, GripVertical, History, KeyRound, ListOrdered, LogOut, Music2, Pause, Play, Plus, Radio, Save, Search, Share2, ShieldCheck, Shuffle, Trash2, UserPlus, Users, Volume2, VolumeX, X, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, clearAuth, downloadExport, getToken, setAuth, socketUrl } from "./api";

const palette = ["coral", "blue", "gold", "violet", "green", "pink"];
const questionTypeLabels = { single: "Single choice", multi: "Multiple choice", order: "Drag to order", matching: "Matching pairs" };
const blankQuestion = () => ({ text: "", type: "single", options: ["", ""], match_options: [], correct_options: [0], time_limit_sec: 20, points: 1000 });

function Brand({ compact = false }) {
  return <Link className="brand" to="/" aria-label="QuizForge home"><span className="brand-mark"><Zap size={compact ? 17 : 21} fill="currentColor" /></span>{!compact && <span>QuizForge</span>}</Link>;
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

function Landing() {
  const navigate = useNavigate();
  const instructorPath = getToken() ? "/dashboard" : "/login";
  return <div className="landing-page">
    <header className="landing-nav"><Brand /><span>Live classroom quizzes</span></header>
    <main className="landing-main">
      <section className="landing-intro">
        <p className="eyebrow">WELCOME TO QUIZFORGE</p>
        <h1>Choose how you’re joining.</h1>
        <p>Enter a live classroom quiz as a student, or open the instructor workspace to create, host, and review quizzes.</p>
      </section>
      <section className="role-grid" aria-label="Choose your QuizForge role">
        <article className="role-card student-role">
          <span className="role-icon"><Users /></span>
          <div><p className="eyebrow">STUDENT</p><h2>Join a live quiz</h2><p>Have a game PIN from your instructor? Enter it and start playing—no account needed.</p></div>
          <Button onClick={() => navigate("/join")}>Join quiz<ArrowRight /></Button>
        </article>
        <article className="role-card instructor-role">
          <span className="role-icon"><GraduationCap /></span>
          <div><p className="eyebrow">INSTRUCTOR</p><h2>{getToken() ? "Open your workspace" : "Instructor access"}</h2><p>Create and organize quizzes, host live games, review statistics, and export results.</p></div>
          <Button variant="secondary" onClick={() => navigate(instructorPath)}>{getToken() ? "Open dashboard" : "Instructor sign in"}<ArrowRight /></Button>
        </article>
      </section>
      <div className="landing-trust"><ShieldCheck /><span>Live scoring</span><i />Real-time results<i />Grade-ready exports</div>
    </main>
  </div>;
}

function Login() {
  const navigate = useNavigate();
  const registrationEnabled = import.meta.env.VITE_ALLOW_REGISTRATION !== "false";
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const register = mode === "register"; const forgot = mode === "forgot";
  function changeMode(nextMode) { setMode(nextMode); setShowPassword(false); setError(""); setNotice(""); }
  async function submit(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      if (forgot) {
        const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: form.email }) });
        setNotice(result.message); return;
      }
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
        <p className="eyebrow">INSTRUCTOR CONSOLE</p><h2>{forgot ? "Reset your password" : register ? "Create your account" : "Welcome back"}</h2><p className="muted">{forgot ? "We’ll email a secure reset link if this account exists." : register ? "Start building your first live quiz." : "Sign in to launch your next session."}</p>
        <ErrorBox error={error} />
        {notice && <div className="success-box"><Check />{notice}</div>}
        {register && <label>Full name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. Ada Lovelace" /></label>}
        <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@school.edu" /></label>
        {!forgot && <label><span className="password-label"><span>Password</span>{!register && <button type="button" onClick={() => changeMode("forgot")}>Forgot password?</button>}</span><div className="password-field"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}
        <Button disabled={busy} type="submit">{busy ? "Please wait…" : forgot ? "Send reset link" : register ? "Create account" : "Enter console"}{forgot ? <KeyRound size={18} /> : <ArrowRight size={18} />}</Button>
        {forgot ? <button className="text-button" type="button" onClick={() => changeMode("login")}><ArrowLeft />Back to sign in</button> : registrationEnabled && <button className="text-button" type="button" onClick={() => changeMode(register ? "login" : "register")}>{register ? "Already have an account? Sign in" : "New instructor? Create an account"}</button>}
      </form>
    </section>
  </div>;
}

function ResetPassword() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const token = params.get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" }); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(token ? "" : "This reset link is incomplete."); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try { await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: form.password }) }); setDone(true); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="join-page"><div className="join-glow" /><form className="join-card reset-card" onSubmit={submit}><Brand /><div className="join-icon"><KeyRound /></div><p className="eyebrow">INSTRUCTOR ACCOUNT</p><h1>{done ? "Password updated" : "Choose a new password"}</h1><p className="muted">{done ? "Your old password no longer works." : "Use at least eight characters and keep it unique."}</p><ErrorBox error={error} />{done ? <Button type="button" onClick={() => navigate("/login")}>Return to sign in<ArrowRight /></Button> : <><label>New password<div className="password-field"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label><label>Confirm password<input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></label><Button disabled={busy || !token}>{busy ? "Updating…" : "Update password"}<ArrowRight /></Button></>}</form></div>;
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div>{children}</section></div>;
}

function Pagination({ page, onPageChange, total, pageSize, label = "items" }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > pageCount) onPageChange(pageCount); }, [page, pageCount, onPageChange]);
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1; const last = Math.min(page * pageSize, total);
  return <nav className="pagination" aria-label={`${label} pagination`}><span>{first}–{last} of {total} {label}</span><div><button aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronDown /></button><b>Page {page} of {pageCount}</b><button aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}><ChevronDown /></button></div></nav>;
}

function Dashboard() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem("quizforge_user") || "null");
  const [quizzes, setQuizzes] = useState(null); const [folders, setFolders] = useState(null); const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(""); const [launching, setLaunching] = useState(null); const [search, setSearch] = useState(""); const [folderFilter, setFolderFilter] = useState("all");
  const [folderModal, setFolderModal] = useState(false); const [folderForm, setFolderForm] = useState({ name: "", course_tag: "", description: "" }); const [sharing, setSharing] = useState(null); const [memberEmail, setMemberEmail] = useState("");
  const [workspaceView, setWorkspaceView] = useState("library"); const [quizPage, setQuizPage] = useState(1); const [folderPage, setFolderPage] = useState(1); const [sessionPage, setSessionPage] = useState(1); const [memberPage, setMemberPage] = useState(1);
  const load = useCallback(() => Promise.all([api("/quizzes"), api("/folders"), api("/sessions/history")]).then(([quizData, folderData, sessionData]) => { setQuizzes(quizData); setFolders(folderData); setSessions(sessionData); }).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function launch(quiz) {
    setLaunching(quiz.id); setError("");
    try { const game = await api(`/quizzes/${quiz.id}/sessions`, { method: "POST" }); navigate(`/host/${game.id}`); }
    catch (e) { setError(e.message); setLaunching(null); }
  }
  async function createFolder(event) {
    event.preventDefault(); setError("");
    try { await api("/folders", { method: "POST", body: JSON.stringify(folderForm) }); setFolderModal(false); setFolderForm({ name: "", course_tag: "", description: "" }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function shareFolder(event) {
    event.preventDefault(); setError("");
    try { const updated = await api(`/folders/${sharing.id}/members`, { method: "POST", body: JSON.stringify({ email: memberEmail }) }); setSharing(updated); setMemberEmail(""); await load(); }
    catch (e) { setError(e.message); }
  }
  async function removeMember(memberId) {
    try { await api(`/folders/${sharing.id}/members/${memberId}`, { method: "DELETE" }); const fresh = (await api("/folders")).find(folder => folder.id === sharing.id); setSharing(fresh); await load(); }
    catch (e) { setError(e.message); }
  }
  async function removeQuiz(quiz) {
    if (!window.confirm(`Delete “${quiz.title}” from the library? Played sessions and results will stay in history.`)) return;
    try { await api(`/quizzes/${quiz.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function removeSession(game) {
    if (!window.confirm(`Remove the ${game.quiz_title} session and all student results?`)) return;
    try { await api(`/sessions/${game.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function exportHistory(sessionId, format) { try { await downloadExport(sessionId, format); } catch (e) { setError(e.message); } }
  const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${value}Z`)) : "In progress";
  const filtered = (quizzes || []).filter(quiz => {
    const matchesFolder = folderFilter === "all" || (folderFilter === "mine" && quiz.owner.id === currentUser?.id) || (folderFilter === "unfiled" && !quiz.folder) || quiz.folder?.id === Number(folderFilter);
    const needle = search.trim().toLowerCase();
    return matchesFolder && (!needle || [quiz.title, quiz.course_tag, quiz.owner.name, quiz.folder?.name].some(value => value?.toLowerCase().includes(needle)));
  });
  const quizPageSize = 6; const folderPageSize = 6; const sessionPageSize = 8; const memberPageSize = 5;
  const pagedQuizzes = filtered.slice((quizPage - 1) * quizPageSize, quizPage * quizPageSize);
  const pagedFolders = (folders || []).slice((folderPage - 1) * folderPageSize, folderPage * folderPageSize);
  const pagedSessions = (sessions || []).slice((sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize);
  const sharingPeople = sharing ? [{ ...sharing.owner, is_owner: true }, ...sharing.members] : [];
  const pagedSharingPeople = sharingPeople.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);
  useEffect(() => { setQuizPage(1); }, [search, folderFilter]);
  useEffect(() => { setMemberPage(1); }, [sharing?.id]);
  return <Shell><div className="page-heading"><div><p className="eyebrow">COURSE QUIZ LIBRARY</p><h1>Your classroom, shared.</h1><p className="muted">Organize quizzes, collaborate with instructors, and keep every result.</p></div><Button onClick={() => navigate("/quizzes/new")}><Plus size={18} />New quiz</Button></div>
    <ErrorBox error={error} />
    <div className="library-layout">
      <aside className="folder-sidebar"><div className="workspace-menu"><p className="eyebrow">WORKSPACE</p><button className={workspaceView === "library" ? "active" : ""} onClick={() => setWorkspaceView("library")}><FolderOpen />Quiz library <b>{quizzes?.length || 0}</b></button><button className={workspaceView === "history" ? "active" : ""} onClick={() => setWorkspaceView("history")}><History />Session history <b>{sessions?.length || 0}</b></button></div>
        <div className="folder-divider" />
        <div className="sidebar-section-title"><p className="eyebrow">COURSE FOLDERS</p><button aria-label="Create folder" onClick={() => setFolderModal(true)}><Plus /></button></div>
        <button className={workspaceView === "library" && folderFilter === "all" ? "active" : ""} onClick={() => { setWorkspaceView("library"); setFolderFilter("all"); }}><FolderOpen />All quizzes <b>{quizzes?.length || 0}</b></button>
        <button className={workspaceView === "library" && folderFilter === "mine" ? "active" : ""} onClick={() => { setWorkspaceView("library"); setFolderFilter("mine"); }}><GraduationCap />Created by me</button>
        <button className={workspaceView === "library" && folderFilter === "unfiled" ? "active" : ""} onClick={() => { setWorkspaceView("library"); setFolderFilter("unfiled"); }}><Folder />Unfiled</button>
        <div className="folder-divider subtle" />
        {pagedFolders.map(folder => <div className="folder-row" key={folder.id}><button className={workspaceView === "library" && folderFilter === String(folder.id) ? "active" : ""} onClick={() => { setWorkspaceView("library"); setFolderFilter(String(folder.id)); }}><Folder />{folder.name}<b>{folder.quiz_count}</b></button>{folder.is_owner && <button className="folder-share" title="Share folder" onClick={() => { setSharing(folder); setMemberEmail(""); setMemberPage(1); }}><Share2 /></button>}</div>)}
        <Pagination page={folderPage} onPageChange={setFolderPage} total={(folders || []).length} pageSize={folderPageSize} label="folders" />
      </aside>
      <section className="library-main">
        {workspaceView === "library" ? <><div className="library-toolbar"><div className="search-box"><Search /><input aria-label="Search quizzes" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quiz, course, or instructor…" /></div><Button variant="ghost" onClick={() => setFolderModal(true)}><Folder size={18} />New folder</Button></div>
          <div className="library-title"><div><h2>{folderFilter === "all" ? "All accessible quizzes" : folderFilter === "mine" ? "Created by me" : folderFilter === "unfiled" ? "Unfiled quizzes" : folders?.find(folder => folder.id === Number(folderFilter))?.name}</h2><p>{filtered.length} quiz{filtered.length === 1 ? "" : "zes"}</p></div></div>
          {quizzes === null ? <Loader /> : filtered.length === 0 ? <div className="empty-state compact"><div className="empty-icon"><FilePlus2 /></div><h2>No quizzes found</h2><p>Create a quiz here or try another folder or search.</p><Button onClick={() => navigate("/quizzes/new")}><Plus size={18} />Create quiz</Button></div> : <><div className="quiz-grid">
            {pagedQuizzes.map((quiz, index) => <article className="quiz-card" key={quiz.id}>
              <div className={`quiz-card-accent ${palette[((quizPage - 1) * quizPageSize + index) % palette.length]}`}><span>{quiz.course_tag || quiz.folder?.course_tag || "UNTAGGED"}</span><BarChart3 size={28} /></div>
              <div className="quiz-card-body"><div className="ownership-line"><span>{quiz.folder?.name || "Unfiled"}</span>{!quiz.can_edit && <b>Shared</b>}</div><h2>{quiz.title}</h2><div className="quiz-meta"><span>By {quiz.owner.name}</span><span>•</span><span>{quiz.questions.length} questions</span><span>•</span><span>{quiz.questions.reduce((sum, q) => sum + q.time_limit_sec, 0)} sec</span></div>
                <div className="card-actions"><Button onClick={() => launch(quiz)} disabled={launching === quiz.id}><CirclePlay size={18} />{launching === quiz.id ? "Launching…" : "Play"}</Button><Button variant="ghost" onClick={() => navigate(`/quizzes/${quiz.id}/preview`)}><Eye size={17} />Review</Button>{quiz.can_edit && <><Button variant="ghost" onClick={() => navigate(`/quizzes/${quiz.id}`)}>Edit</Button><button className="card-delete" aria-label="Delete quiz" onClick={() => removeQuiz(quiz)}><Trash2 /></button></>}</div>
              </div>
            </article>)}
          </div><Pagination page={quizPage} onPageChange={setQuizPage} total={filtered.length} pageSize={quizPageSize} label="quizzes" /></>}
        </> : <section className="history-section in-workspace">
          <div className="history-heading"><div><p className="eyebrow">SESSION HISTORY</p><h2>Played quizzes</h2><p className="muted">Preview statistics, see who used your quiz, export, or remove a test run.</p></div><History size={30} /></div>
          {sessions === null ? <Loader label="Loading session history…" /> : sessions.length === 0 ? <div className="history-empty">Started sessions will appear here.</div> : <><div className="history-table-wrap"><table className="history-table"><thead><tr><th>Quiz</th><th>Hosted by</th><th>Played</th><th>Players</th><th>Status</th><th>Results</th></tr></thead><tbody>{pagedSessions.map(game => <tr key={game.id}><td><strong>{game.quiz_title}</strong><span>{game.used_my_quiz ? "Used your quiz" : game.course_tag || `PIN ${game.pin}`}</span></td><td>{game.host.name}</td><td>{formatDate(game.started_at)}</td><td>{game.participant_count}</td><td><span className={`status-pill ${game.status}`}>{game.status}</span></td><td><div className="history-actions">{game.status !== "ended" && game.hosted_by_me && <button onClick={() => navigate(`/host/${game.id}`)}>Resume</button>}<button onClick={() => navigate(`/results/${game.id}`)}><Eye />Stats</button><button onClick={() => exportHistory(game.id, "xlsx")}><Download />XLSX</button><button onClick={() => exportHistory(game.id, "csv")}>CSV</button>{game.can_delete && <button className="danger" onClick={() => removeSession(game)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div><Pagination page={sessionPage} onPageChange={setSessionPage} total={sessions.length} pageSize={sessionPageSize} label="sessions" /></>}
        </section>}
      </section>
    </div>
    {folderModal && <Modal title="Create course folder" onClose={() => setFolderModal(false)}><form className="modal-form" onSubmit={createFolder}><label>Folder name<input required value={folderForm.name} onChange={e => setFolderForm({ ...folderForm, name: e.target.value })} placeholder="Web Development — Term 1" /></label><label>Course tag<input value={folderForm.course_tag} onChange={e => setFolderForm({ ...folderForm, course_tag: e.target.value.toUpperCase() })} placeholder="WEB-101" /></label><label>Description<input value={folderForm.description} onChange={e => setFolderForm({ ...folderForm, description: e.target.value })} placeholder="Shared quizzes for the course" /></label><Button type="submit"><Folder />Create folder</Button></form></Modal>}
    {sharing && <Modal title={`Share ${sharing.name}`} onClose={() => setSharing(null)}><p className="muted">Invite an instructor who already has a QuizForge account.</p><form className="share-form" onSubmit={shareFolder}><input required type="email" value={memberEmail} onChange={e => setMemberEmail(e.target.value)} placeholder="instructor@school.edu" /><Button type="submit"><UserPlus />Share</Button></form><div className="member-list">{pagedSharingPeople.map(person => <div key={person.id}><span className="member-avatar">{person.name[0]}</span><p><b>{person.name}</b><small>{person.email}{person.is_owner ? " · Owner" : ""}</small></p>{!person.is_owner && <button className="danger-link" onClick={() => removeMember(person.id)}>Remove</button>}</div>)}</div><Pagination page={memberPage} onPageChange={setMemberPage} total={sharingPeople.length} pageSize={memberPageSize} label="instructors" /></Modal>}
  </Shell>;
}

function QuizEditor() {
  const { quizId } = useParams(); const navigate = useNavigate(); const isNew = quizId === "new";
  const [quiz, setQuiz] = useState({ title: "", course_tag: "", folder_id: null, questions: [blankQuestion()] }); const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [questionPage, setQuestionPage] = useState(1); const questionPageSize = 5;
  useEffect(() => { Promise.all([api("/folders"), isNew ? Promise.resolve(null) : api(`/quizzes/${quizId}`)]).then(([folderData, quizData]) => { setFolders(folderData); if (quizData) setQuiz({ ...quizData, folder_id: quizData.folder?.id || null }); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }, [isNew, quizId]);
  function updateQuestion(index, patch) { setQuiz({ ...quiz, questions: quiz.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }); }
  function toggleCorrect(qIndex, optionIndex) {
    const q = quiz.questions[qIndex]; let selected;
    if (q.type === "single") selected = [optionIndex];
    else selected = q.correct_options.includes(optionIndex) ? q.correct_options.filter(i => i !== optionIndex) : [...q.correct_options, optionIndex];
    updateQuestion(qIndex, { correct_options: selected });
  }
  function changeType(index, type) {
    const q = quiz.questions[index];
    if (type === "single") updateQuestion(index, { type, match_options: [], correct_options: [q.correct_options[0] ?? 0] });
    else if (type === "multi") updateQuestion(index, { type, match_options: [], correct_options: q.correct_options.length ? q.correct_options : [0] });
    else if (type === "order") updateQuestion(index, { type, options: q.options.length >= 3 ? q.options : [...q.options, ""], match_options: [], correct_options: [] });
    else updateQuestion(index, { type, match_options: q.options.map((_, i) => q.match_options?.[i] || ""), correct_options: [] });
  }
  function move(index, direction) { const copy = [...quiz.questions]; const other = index + direction; if (other < 0 || other >= copy.length) return; [copy[index], copy[other]] = [copy[other], copy[index]]; setQuiz({ ...quiz, questions: copy }); }
  function moveOption(questionIndex, optionIndex, direction) {
    const q = quiz.questions[questionIndex]; const other = optionIndex + direction;
    if (other < 0 || other >= q.options.length) return;
    const options = [...q.options]; [options[optionIndex], options[other]] = [options[other], options[optionIndex]];
    updateQuestion(questionIndex, { options });
  }
  async function save() {
    setError("");
    if (!quiz.title.trim()) return setError("Give the quiz a title.");
    if (quiz.questions.some(q => !q.text.trim() || q.options.some(o => !o.trim()) || (["single", "multi"].includes(q.type) && !q.correct_options.length) || (q.type === "matching" && (q.match_options?.length !== q.options.length || q.match_options.some(o => !o.trim()))))) return setError("Complete every question and answer before saving.");
    setSaving(true);
    const body = { title: quiz.title, course_tag: quiz.course_tag, folder_id: quiz.folder_id ? Number(quiz.folder_id) : null, questions: quiz.questions.map(({ id, position, ...q }) => ({ ...q, match_options: q.match_options || [] })) };
    try { await api(isNew ? "/quizzes" : `/quizzes/${quizId}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) }); navigate("/dashboard"); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function removeQuiz() {
    if (!window.confirm(`Delete “${quiz.title}” from the library? Played sessions and results will stay in history.`)) return;
    try { await api(`/quizzes/${quizId}`, { method: "DELETE" }); navigate("/dashboard"); } catch (e) { setError(e.message); }
  }
  if (loading) return <Shell><Loader /></Shell>;
  return <Shell><div className="editor-header"><button className="back-link" onClick={() => navigate("/dashboard")}><ArrowLeft size={17} />Library</button><div><p className="eyebrow">{isNew ? "NEW QUIZ" : "EDIT QUIZ"}</p><h1>{quiz.title || "Untitled quiz"}</h1></div><div className="editor-actions">{!isNew && <Button variant="ghost" onClick={removeQuiz}><Trash2 size={17} />Delete</Button>}<Button onClick={save} disabled={saving}><Save size={18} />{saving ? "Saving…" : "Save quiz"}</Button></div></div>
    <ErrorBox error={error} />
    <section className="quiz-basics panel"><label>Quiz title<input value={quiz.title} onChange={e => setQuiz({ ...quiz, title: e.target.value })} placeholder="Java fundamentals — Week 3" /></label><label>Course folder<select value={quiz.folder_id || ""} onChange={e => setQuiz({ ...quiz, folder_id: e.target.value || null })}><option value="">Unfiled</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}{folder.is_owner ? "" : ` · ${folder.owner.name}`}</option>)}</select></label><label>Course tag<input value={quiz.course_tag} onChange={e => setQuiz({ ...quiz, course_tag: e.target.value.toUpperCase() })} placeholder="OOP-JAVA" /></label></section>
    <div className="question-list">{quiz.questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize).map((q, pageIndex) => { const qIndex = (questionPage - 1) * questionPageSize + pageIndex; return <section className="question-editor panel" key={q.id || qIndex}>
      <div className="question-number"><span>{String(qIndex + 1).padStart(2, "0")}</span><div><button aria-label="Move up" onClick={() => move(qIndex, -1)} disabled={qIndex === 0}><ChevronUp /></button><button aria-label="Move down" onClick={() => move(qIndex, 1)} disabled={qIndex === quiz.questions.length - 1}><ChevronDown /></button></div></div>
      <div className="question-fields"><label>Question<input value={q.text} onChange={e => updateQuestion(qIndex, { text: e.target.value })} placeholder="What does encapsulation protect?" /></label>
        <div className="settings-row"><label>Answer type<select value={q.type} onChange={e => changeType(qIndex, e.target.value)}><option value="single">Single choice</option><option value="multi">Multiple choice</option><option value="order">Drag to order</option><option value="matching">Matching pairs</option></select></label><label>Time<select value={q.time_limit_sec} onChange={e => updateQuestion(qIndex, { time_limit_sec: Number(e.target.value) })}>{[10, 15, 20, 30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label>Points<input type="number" min="0" max="100000" value={q.points} onChange={e => updateQuestion(qIndex, { points: Number(e.target.value) })} /></label></div>
        {q.type === "matching" ? <div className="matching-editor"><p className="field-hint"><Shuffle />Each row is one correct pair.</p>{q.options.map((option, oIndex) => <div className="matching-editor-row" key={oIndex}><span>{oIndex + 1}</span><input value={option} onChange={e => { const options = [...q.options]; options[oIndex] = e.target.value; updateQuestion(qIndex, { options }); }} placeholder={`Prompt ${oIndex + 1}`} /><ArrowRight /><input value={q.match_options?.[oIndex] || ""} onChange={e => { const match_options = [...(q.match_options || [])]; match_options[oIndex] = e.target.value; updateQuestion(qIndex, { match_options }); }} placeholder={`Match ${oIndex + 1}`} />{q.options.length > 2 && <button className="mini-remove" aria-label="Remove pair" onClick={() => updateQuestion(qIndex, { options: q.options.filter((_, i) => i !== oIndex), match_options: (q.match_options || []).filter((_, i) => i !== oIndex) })}><X /></button>}</div>)}</div> : q.type === "order" ? <div className="order-editor"><p className="field-hint"><ListOrdered />Arrange the correct order from top to bottom.</p>{q.options.map((option, oIndex) => <div className={`order-editor-row ${palette[oIndex]}`} key={oIndex}><GripVertical /><span>{oIndex + 1}</span><input value={option} onChange={e => { const options = [...q.options]; options[oIndex] = e.target.value; updateQuestion(qIndex, { options }); }} placeholder={`Step ${oIndex + 1}`} /><div><button onClick={() => moveOption(qIndex, oIndex, -1)} disabled={oIndex === 0} aria-label="Move item up"><ChevronUp /></button><button onClick={() => moveOption(qIndex, oIndex, 1)} disabled={oIndex === q.options.length - 1} aria-label="Move item down"><ChevronDown /></button></div>{q.options.length > 3 && <button className="mini-remove" aria-label="Remove item" onClick={() => updateQuestion(qIndex, { options: q.options.filter((_, i) => i !== oIndex) })}><X /></button>}</div>)}</div> : <div className="option-editor-grid">{q.options.map((option, oIndex) => <div className={`option-editor ${palette[oIndex]} ${q.correct_options.includes(oIndex) ? "correct" : ""}`} key={oIndex}><button className="correct-toggle" aria-label={`Mark option ${oIndex + 1} correct`} onClick={() => toggleCorrect(qIndex, oIndex)}>{q.correct_options.includes(oIndex) ? <Check size={17} /> : String.fromCharCode(65 + oIndex)}</button><input value={option} onChange={e => { const options = [...q.options]; options[oIndex] = e.target.value; updateQuestion(qIndex, { options }); }} placeholder={`Answer ${oIndex + 1}`} />{q.options.length > 2 && <button className="mini-remove" aria-label="Remove answer" onClick={() => { const options = q.options.filter((_, i) => i !== oIndex); const correct = q.correct_options.filter(i => i !== oIndex).map(i => i > oIndex ? i - 1 : i); updateQuestion(qIndex, { options, correct_options: correct.length ? correct : [0] }); }}><X size={16} /></button>}</div>)}</div>}
        <div className="question-footer"><div className="answer-tools"><button className="text-button left" disabled={q.options.length >= 6} onClick={() => updateQuestion(qIndex, q.type === "matching" ? { options: [...q.options, ""], match_options: [...(q.match_options || []), ""] } : { options: [...q.options, ""] })}><Plus size={16} />Add {q.type === "matching" ? "pair" : q.type === "order" ? "step" : "answer"} <small>{q.options.length}/6</small></button>{["single", "multi"].includes(q.type) && <button className="text-button preset-button" onClick={() => updateQuestion(qIndex, { type: "single", options: ["True", "False"], match_options: [], correct_options: [0] })}>True / False</button>}</div>{quiz.questions.length > 1 && <button className="danger-link" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qIndex) })}><Trash2 size={16} />Delete question</button>}</div>
      </div>
    </section>; })}</div>
    <Pagination page={questionPage} onPageChange={setQuestionPage} total={quiz.questions.length} pageSize={questionPageSize} label="questions" />
    <button className="add-question" onClick={() => { const questions = [...quiz.questions, blankQuestion()]; setQuiz({ ...quiz, questions }); setQuestionPage(Math.ceil(questions.length / questionPageSize)); }}><Plus />Add another question</button>
  </Shell>;
}

function QuizPreview() {
  const { quizId } = useParams(); const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null); const [error, setError] = useState(""); const [launching, setLaunching] = useState(false); const [questionPage, setQuestionPage] = useState(1); const questionPageSize = 5;
  useEffect(() => { api(`/quizzes/${quizId}`).then(setQuiz).catch(e => setError(e.message)); }, [quizId]);
  async function launch() {
    setLaunching(true); setError("");
    try { const game = await api(`/quizzes/${quizId}/sessions`, { method: "POST" }); navigate(`/host/${game.id}`); }
    catch (e) { setError(e.message); setLaunching(false); }
  }
  if (!quiz) return <Shell><ErrorBox error={error} />{!error && <Loader label="Opening quiz review…" />}</Shell>;
  const totalSeconds = quiz.questions.reduce((sum, question) => sum + question.time_limit_sec, 0);
  const totalPoints = quiz.questions.reduce((sum, question) => sum + question.points, 0);
  return <Shell><button className="back-link" onClick={() => navigate("/dashboard")}><ArrowLeft />Back to library</button>
    <div className="preview-heading"><div><p className="eyebrow">READ-ONLY QUIZ REVIEW</p><h1>{quiz.title}</h1><p>Created by <b>{quiz.owner.name}</b>{quiz.folder ? ` · ${quiz.folder.name}` : " · Unfiled"}{quiz.course_tag ? ` · ${quiz.course_tag}` : ""}</p></div><div className="preview-actions">{quiz.can_edit && <Button variant="ghost" onClick={() => navigate(`/quizzes/${quiz.id}`)}>Edit quiz</Button>}<Button onClick={launch} disabled={launching}><CirclePlay />{launching ? "Launching…" : "Play quiz"}</Button></div></div>
    <ErrorBox error={error} />
    <div className="preview-summary"><span><FilePlus2 />{quiz.questions.length} questions</span><span><Clock3 />{totalSeconds} seconds</span><span><BarChart3 />{totalPoints.toLocaleString()} total points</span></div>
    <div className="preview-question-list">{quiz.questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize).map((question, pageIndex) => { const qIndex = (questionPage - 1) * questionPageSize + pageIndex; return <article className="panel preview-question" key={question.id}><header><span>{String(qIndex + 1).padStart(2, "0")}</span><div><p>{questionTypeLabels[question.type]?.toUpperCase()}</p><h2>{question.text}</h2></div><aside><span><Clock3 />{question.time_limit_sec}s</span><span><Zap />{question.points.toLocaleString()} pts</span></aside></header>{question.type === "matching" ? <div className="preview-matching">{question.options.map((left, index) => <div key={index}><span>{left}</span><ArrowRight /><strong>{question.match_options[index]}</strong></div>)}</div> : question.type === "order" ? <div className="preview-order">{question.options.map((option, index) => <div key={index}><span>{index + 1}</span><strong>{option}</strong></div>)}</div> : <div className="preview-options">{question.options.map((option, index) => <div className={`${palette[index]} ${question.correct_options.includes(index) ? "correct" : ""}`} key={index}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{question.correct_options.includes(index) && <small><Check />Correct</small>}</div>)}</div>}</article>; })}</div>
    <Pagination page={questionPage} onPageChange={setQuestionPage} total={quiz.questions.length} pageSize={questionPageSize} label="questions" />
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
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return <div className="no-data">No scores yet</div>;
  return <div className="leaderboard">{safeRows.map(row => <div className={`leader-row ${row.participant_id === me ? "me" : ""}`} key={row.participant_id}><span className={`rank rank-${row.rank}`}>{row.rank}</span><strong>{row.display_name}</strong><span className="rank-change">{row.rank_delta > 0 ? <><ArrowUp />{row.rank_delta}</> : row.rank_delta < 0 ? <><ArrowDown />{Math.abs(row.rank_delta)}</> : "—"}</span><b>{row.score.toLocaleString()}</b></div>)}</div>;
}

function useHostSounds() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("quizforge_host_sound") !== "off");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => Number(localStorage.getItem("quizforge_music_volume") || 35));
  const audio = useRef(null);
  const musicTimer = useRef(null);
  const beat = useRef(0);
  const musicEnabledRef = useRef(false);
  const musicVolumeRef = useRef(musicVolume / 100);
  const context = () => {
    if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.current.state === "suspended") audio.current.resume();
    return audio.current;
  };
  const tone = useCallback((frequency, offset = 0, duration = .12, gain = .055, type = "sine") => {
    const ctx = context();
    const oscillator = ctx.createOscillator(); const volume = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
    volume.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + offset + .015);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + duration);
    oscillator.connect(volume); volume.connect(ctx.destination);
    oscillator.start(ctx.currentTime + offset); oscillator.stop(ctx.currentTime + offset + duration + .02);
  }, []);
  const play = useCallback((kind, detail = {}) => {
    if (!enabled) return;
    if (kind === "player_joined") tone(660, 0, .09, .035);
    if (kind === "question_start") { tone(440, 0, .12); tone(660, .12, .16); }
    if (kind === "question_progress") { const notes = [659, 740, 831, 988]; const note = notes[(Math.max(1, detail.response_count || 1) - 1) % notes.length]; tone(note, 0, .07, .025, "triangle"); tone(note * 1.5, .045, .055, .012, "sine"); }
    if (kind === "question_reveal") { tone(523, 0, .14); tone(659, .1, .14); tone(784, .2, .22); }
    if (kind === "session_end") { tone(523, 0, .18); tone(659, .14, .18); tone(784, .28, .18); tone(1047, .42, .3); }
  }, [enabled, tone]);
  const toggle = () => setEnabled(current => {
    const next = !current;
    localStorage.setItem("quizforge_host_sound", next ? "on" : "off");
    if (next) { context(); tone(660, 0, .08); tone(880, .08, .12); }
    return next;
  });
  const playMusicBeat = useCallback(() => {
    const melody = [392, 523, null, 659, 523, 440, null, 587, 698, null, 587, 440, 392, null, 494, 659];
    const index = beat.current % melody.length;
    const note = melody[index]; const volume = musicVolumeRef.current;
    if (note) tone(note, 0, .24, .028 * volume, "triangle");
    if (note && index % 4 === 0) tone(note / 2, 0, .3, .032 * volume, "sine");
    if (note && index % 2 === 1) tone(note * 2, .14, .055, .009 * volume, "sine");
    beat.current += 1;
  }, [tone]);
  const pauseMusic = useCallback(() => {
    if (musicTimer.current) clearInterval(musicTimer.current);
    musicTimer.current = null;
    setMusicPlaying(false);
  }, []);
  const startMusic = useCallback(() => {
    if (musicTimer.current) return;
    context(); playMusicBeat();
    musicTimer.current = setInterval(playMusicBeat, 380);
    setMusicPlaying(true);
  }, [playMusicBeat]);
  const toggleMusic = () => {
    if (musicPlaying) {
      musicEnabledRef.current = false; setMusicEnabled(false); pauseMusic();
    } else {
      musicEnabledRef.current = true; setMusicEnabled(true); startMusic();
    }
  };
  const changeMusicVolume = value => {
    const normalized = Number(value);
    musicVolumeRef.current = normalized / 100;
    setMusicVolume(normalized);
    localStorage.setItem("quizforge_music_volume", String(normalized));
  };
  const handleSessionEvent = useCallback(message => {
    if (message.type === "question_reveal") pauseMusic();
    if (message.type === "question_start" && musicEnabledRef.current) startMusic();
    if (message.type === "session_end") {
      musicEnabledRef.current = false; setMusicEnabled(false); pauseMusic();
    }
    if (message.type === "snapshot" && message.session?.is_revealed) pauseMusic();
  }, [pauseMusic, startMusic]);
  useEffect(() => () => { pauseMusic(); audio.current?.close(); audio.current = null; }, [pauseMusic]);
  const unlock = useCallback(() => { if (enabled) context(); }, [enabled]);
  return { enabled, toggle, play, unlock, musicEnabled, musicPlaying, musicVolume, toggleMusic, changeMusicVolume, handleSessionEvent };
}

function AutoAdvance({ nextAt, fallback = 6, final = false }) {
  const [left, setLeft] = useState(fallback);
  useEffect(() => {
    const target = nextAt ? new Date(nextAt).getTime() : Date.now() + fallback * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer);
  }, [nextAt, fallback]);
  return <span className="auto-advance"><Clock3 />{final ? "Final results" : "Next question"} in {left}s</span>;
}

function Host() {
  const { sessionId } = useParams(); const navigate = useNavigate();
  const [state, setState] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const sounds = useHostSounds();
  const handleMessage = useCallback(message => { sounds.play(message.type, message); sounds.handleSessionEvent(message); setState(prev => {
    if (message.type === "snapshot") return { ...message, response_count: message.reveal?.response_count || 0, distribution: message.reveal?.distribution || [] };
    if (!prev) return prev;
    if (message.type === "player_joined") return { ...prev, participants: message.participants };
    if (message.type === "question_start") return { ...prev, session: { ...prev.session, status: "live", current_question_index: message.question.position, is_revealed: false }, question: message.question, reveal: null, leaderboard: null, response_count: 0, distribution: (message.question.options || []).map(() => 0) };
    if (message.type === "question_progress") return { ...prev, response_count: message.response_count };
    if (message.type === "question_reveal") return { ...prev, session: { ...prev.session, is_revealed: true }, reveal: message, response_count: message.response_count, distribution: message.distribution };
    if (message.type === "leaderboard_update") return { ...prev, leaderboard: message.leaderboard };
    if (message.type === "session_end") return { ...prev, session: { ...prev.session, status: "ended" }, leaderboard: message.leaderboard };
    return prev;
  }); }, [sounds.play, sounds.handleSessionEvent]);
  const connected = useLiveSocket(sessionId, { access_token: getToken() }, handleMessage);
  useEffect(() => { api(`/sessions/${sessionId}`).then(setState).catch(e => setError(e.message)); }, [sessionId]);
  async function action(name) { sounds.unlock(); setBusy(true); setError(""); try { await api(`/sessions/${sessionId}/${name}`, { method: "POST" }); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (!state) return <div className="host-page"><Loader label="Opening presenter view…" /></div>;
  const { session, participants = [], question, leaderboard: board = [] } = state;
  const joinUrl = `${location.origin}/join?pin=${session.pin}`;
  const exportFile = async format => { try { await downloadExport(sessionId, format); } catch (e) { setError(e.message); } };
  const copyJoinLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(joinUrl);
      else { const field = document.createElement("textarea"); field.value = joinUrl; field.style.position = "fixed"; field.style.opacity = "0"; document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove(); }
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { setError("Could not copy the link. Share the game PIN instead."); }
  };
  return <div className="host-page">
    <header className="presenter-bar"><Brand /><div className="presenter-status"><div className={`connection ${connected ? "online" : ""}`}><span />{connected ? "Live" : "Reconnecting"}</div><button className={`sound-toggle ${sounds.enabled ? "enabled" : ""}`} onClick={sounds.toggle} aria-pressed={sounds.enabled}>{sounds.enabled ? <Volume2 /> : <VolumeX />}{sounds.enabled ? "SFX on" : "SFX off"}</button><div className={`music-controls ${sounds.musicEnabled ? "enabled" : ""}`}><button className="music-play" onClick={sounds.toggleMusic} aria-label={sounds.musicPlaying ? "Pause background music" : "Play background music"}>{sounds.musicPlaying ? <Pause /> : <Play />}</button><Music2 /><input aria-label="Background music volume" type="range" min="0" max="100" step="5" value={sounds.musicVolume} onChange={event => sounds.changeMusicVolume(event.target.value)} /><span>{sounds.musicPlaying ? "Music" : sounds.musicEnabled ? "Paused" : "Off"}</span></div></div><button className="text-button" onClick={() => navigate("/dashboard")}>Exit presenter</button></header>
    <ErrorBox error={error} />
    {session.status === "pending" && <main className="lobby-layout"><section className="join-panel"><p className="eyebrow">JOIN AT {location.host}/join</p><h1>Game PIN</h1><div className="pin-display">{session.pin}</div><button className="copy-link" onClick={copyJoinLink}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy join link"}</button><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={154} bgColor="transparent" fgColor="#071621" /></div></section>
      <section className="lobby-players"><div className="section-title"><div><p className="eyebrow">LOBBY</p><h2>{participants.length} {participants.length === 1 ? "player" : "players"} ready</h2></div><Users size={30} /></div><div className="player-cloud">{participants.map((p, i) => <span key={p.id} style={{ animationDelay: `${i * 35}ms` }}>{p.display_name}</span>)}</div>{!participants.length && <div className="waiting"><span className="dots"><i /><i /><i /></span>Waiting for students to join</div>}<Button className="start-button" disabled={busy || !participants.length} onClick={() => action("start")}><CirclePlay />Start quiz</Button></section></main>}
    {session.status === "live" && <main className="live-host"><div className="question-stage"><div className="question-topline"><span>Question {(session.current_question_index ?? 0) + 1} / {session.question_count}</span><span><Users />{state.response_count || 0} / {participants.length} answered</span></div><h1>{question?.text}</h1><HostQuestion question={question} reveal={state.reveal} distribution={state.distribution} /></div>
      <aside className="host-sidebar"><div className="host-action panel"><p className="eyebrow">HOST CONTROL</p>{!session.is_revealed ? <><h2>Answers coming in</h2><p>{state.response_count || 0} of {participants.length} responses locked. Results appear when everyone answers or time expires.</p><Button disabled={busy} onClick={() => action("reveal")}><ShieldCheck />Reveal now</Button></> : <><h2>Scores updated</h2><AutoAdvance nextAt={state.reveal?.next_at} fallback={state.reveal?.next_in_sec || 6} final={(session.current_question_index ?? 0) + 1 >= session.question_count} /><Button disabled={busy} onClick={() => action((session.current_question_index ?? 0) + 1 >= session.question_count ? "end" : "next")}>{(session.current_question_index ?? 0) + 1 >= session.question_count ? "Show final results" : "Next now"}<ArrowRight /></Button></>}</div>{session.is_revealed && <div className="panel compact-board"><p className="eyebrow">LEADERBOARD</p><Leaderboard rows={board?.slice(0, 5)} /></div>}</aside></main>}
    {session.status === "ended" && <main className="final-screen"><div className="final-heading"><p className="eyebrow">SESSION COMPLETE</p><h1>That’s a wrap.</h1><p>{participants.length} players • {session.question_count} questions • PIN {session.pin}</p></div><div className="final-grid"><section className="panel"><div className="section-title"><h2>Final leaderboard</h2><GraduationCap /></div><Leaderboard rows={board} /></section><aside className="export-card"><Download size={34} /><h2>Gradebook ready</h2><p>One row per student, with question results, accuracy, score, and rank.</p><Button onClick={() => exportFile("xlsx")}><Download />Export XLSX</Button><Button variant="secondary" onClick={() => exportFile("csv")}>Export CSV</Button><button className="text-button" onClick={() => navigate("/dashboard")}>Back to library</button></aside></div></main>}
  </div>;
}

function Join() {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const [form, setForm] = useState({ pin: params.get("pin") || "", display_name: "", student_id: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api("/sessions/join", { method: "POST", body: JSON.stringify(form) }); localStorage.setItem(`quizforge_player_${result.session_id}`, result.resume_token); navigate(`/play/${result.session_id}`); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <div className="join-page"><div className="join-glow" /><div className="join-card"><Brand /><div className="join-icon"><Radio /></div><p className="eyebrow">JOIN LIVE QUIZ</p><h1>Ready to play?</h1><p className="muted">Enter the code on the classroom screen.</p><form onSubmit={submit}><ErrorBox error={error} /><label>Game PIN<input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} placeholder="000000" className="pin-input" required /></label><label>Your name<input value={form.display_name} maxLength={80} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Sokha" required /></label><label>Student ID <span>optional</span><input value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} placeholder="e.g. 20260042" /></label><Button disabled={busy || form.pin.length < 4}>{busy ? "Joining…" : "Join game"}<ArrowRight /></Button></form></div></div>;
}

function Countdown({ deadline, onExpire }) {
  const [left, setLeft] = useState(0);
  const expired = useRef(false); const expireCallback = useRef(onExpire); expireCallback.current = onExpire;
  useEffect(() => { expired.current = false; const tick = () => { const remaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)); setLeft(remaining); if (remaining === 0 && !expired.current) { expired.current = true; expireCallback.current?.(); } }; tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer); }, [deadline]);
  return <span className={`countdown ${left <= 5 ? "urgent" : ""}`}><Clock3 />{left}s</span>;
}

function initialSelection(question) {
  if (question?.type === "order") return (question.items || []).map(item => item.id);
  if (question?.type === "matching") return Array(question.left_items?.length || 0).fill(null);
  return [];
}

function HostQuestion({ question, reveal, distribution = [] }) {
  if (!question) return null;
  if (question.type === "order") {
    const itemById = new Map((question.items || []).map(item => [item.id, item]));
    const ordered = reveal?.correct_sequence ? reveal.correct_sequence.map(id => itemById.get(id)).filter(Boolean) : question.items || [];
    return <div className={`host-sequence ${reveal ? "revealed" : ""}`}><p>{reveal ? "Correct order" : "Students are arranging these steps"}</p>{ordered.map((item, index) => <div key={item.id}><span>{index + 1}</span><strong>{item.text}</strong>{reveal && <Check />}</div>)}</div>;
  }
  if (question.type === "matching") {
    const rightById = new Map((question.right_items || []).map(item => [item.id, item]));
    return <div className={`host-matching ${reveal ? "revealed" : ""}`}><p>{reveal ? "Correct matches" : "Students are matching both sides"}</p>{(question.left_items || []).map((left, index) => <div key={index}><strong>{left.text}</strong><ArrowRight /><span>{reveal ? rightById.get(reveal.correct_matches?.[index])?.text : "Hidden until reveal"}</span>{reveal && <Check />}</div>)}</div>;
  }
  return <div className="host-options">{(question.options || []).map((option, index) => { const revealed = Boolean(reveal); const count = revealed ? distribution[index] || 0 : 0; const max = Math.max(1, ...(revealed ? distribution : [])); return <div className={`host-option ${palette[index]} ${revealed ? "revealed" : "private"}`} key={index}><span className="option-key">{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{revealed ? <><div className="bar-track"><i style={{ width: `${count / max * 100}%` }} /></div><b>{count}</b>{reveal?.correct_options?.includes(index) && <span className="correct-badge"><Check /></span>}</> : <span className="answer-hidden">Hidden</span>}</div>; })}</div>;
}

function PlayerQuestionInput({ question, selected, setSelected, locked, reveal, dragIndex, setDragIndex }) {
  if (question.type === "order") {
    const itemById = new Map((question.items || []).map(item => [item.id, item]));
    const moveItem = (from, to) => {
      if (locked || from === to || from < 0 || to < 0 || from >= selected.length || to >= selected.length) return;
      const next = [...selected]; const [item] = next.splice(from, 1); next.splice(to, 0, item); setSelected(next);
    };
    return <div className="drag-order">{selected.map((id, index) => { const correct = reveal?.correct_sequence?.[index] === id; return <div className={`${correct ? "correct" : reveal ? "wrong" : ""}`} draggable={!locked} onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => { moveItem(dragIndex, index); setDragIndex(null); }} key={id}><GripVertical /><span>{index + 1}</span><strong>{itemById.get(id)?.text}</strong><aside><button disabled={locked || index === 0} onClick={() => moveItem(index, index - 1)} aria-label="Move up"><ChevronUp /></button><button disabled={locked || index === selected.length - 1} onClick={() => moveItem(index, index + 1)} aria-label="Move down"><ChevronDown /></button></aside>{reveal && (correct ? <Check /> : <X />)}</div>; })}</div>;
  }
  if (question.type === "matching") {
    const chooseMatch = (leftIndex, value) => {
      if (locked) return;
      const id = value === "" ? null : Number(value); const next = [...selected];
      if (id !== null) next.forEach((chosen, index) => { if (index !== leftIndex && chosen === id) next[index] = null; });
      next[leftIndex] = id; setSelected(next);
    };
    return <div className="matching-play">{(question.left_items || []).map((left, index) => { const correct = reveal?.correct_matches?.[index] === selected[index]; return <label className={`${correct ? "correct" : reveal ? "wrong" : ""}`} key={index}><strong>{left.text}</strong><ArrowRight /><select value={selected[index] ?? ""} disabled={locked} onChange={event => chooseMatch(index, event.target.value)}><option value="">Choose a match…</option>{(question.right_items || []).map(item => <option value={item.id} key={item.id}>{item.text}</option>)}</select>{reveal && (correct ? <Check /> : <X />)}</label>; })}</div>;
  }
  return <div className="player-options">{(question.options || []).map((option, index) => { const isSelected = selected.includes(index); const isCorrect = reveal?.correct_options?.includes(index); const isWrong = reveal && isSelected && !isCorrect; return <button aria-pressed={isSelected} disabled={locked} onClick={() => { if (question.type === "single") setSelected([index]); else setSelected(current => current.includes(index) ? current.filter(i => i !== index) : [...current, index]); }} className={`${palette[index]} ${isSelected ? "selected" : ""} ${isCorrect ? "revealed-correct" : ""} ${isWrong ? "revealed-wrong" : ""}`} key={index}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{(isSelected || isCorrect) && <i>{isWrong ? <X /> : <Check />}</i>}</button>; })}</div>;
}

function QuestionStatistics({ question }) {
  if (question.type === "order") return <div className="stat-solution order">{question.options.map((option, index) => <div key={index}><span>{index + 1}</span><strong>{option}</strong></div>)}</div>;
  if (question.type === "matching") return <div className="stat-solution matching">{question.options.map((left, index) => <div key={index}><strong>{left}</strong><ArrowRight /><span>{question.match_options?.[index]}</span></div>)}</div>;
  return <div className="stat-options">{question.options.map((option, index) => { const count = question.distribution[index] || 0; const max = Math.max(1, ...question.distribution); const correct = question.correct_options.includes(index); return <div className={correct ? "correct" : ""} key={index}><span>{String.fromCharCode(65 + index)}</span><p>{option}{correct && <small>Correct</small>}</p><i><b style={{ width: `${count / max * 100}%` }} /></i><strong>{count}</strong></div>; })}</div>;
}

function Player() {
  const { sessionId } = useParams(); const navigate = useNavigate(); const token = localStorage.getItem(`quizforge_player_${sessionId}`);
  const [state, setState] = useState(null); const [selected, setSelected] = useState([]); const [submitted, setSubmitted] = useState(false); const [expired, setExpired] = useState(false); const [notice, setNotice] = useState(""); const [dragIndex, setDragIndex] = useState(null); const socket = useRef(null);
  const onMessage = useCallback((message, ws) => { socket.current = ws; setState(prev => {
    if (message.type === "snapshot") { const answered = Boolean(message.me?.answered); setSubmitted(answered); setSelected(answered ? message.me?.selected_options || [] : initialSelection(message.question)); setExpired(Boolean(message.session?.is_revealed) || (message.question?.deadline ? Date.now() >= new Date(message.question.deadline).getTime() : false)); return message; }
    if (!prev) return prev;
    if (message.type === "question_start") { setSelected(initialSelection(message.question)); setSubmitted(false); setExpired(false); setNotice(""); setDragIndex(null); return { ...prev, session: { ...prev.session, status: "live", is_revealed: false, current_question_index: message.question.position, question_count: message.question_count }, question: message.question, reveal: null, leaderboard: null, me: { ...prev.me, answered: false, selected_options: [], current_result: null } }; }
    if (message.type === "answer_accepted") { setSubmitted(true); setNotice("Answer locked"); return { ...prev, me: { ...prev.me, score: message.score, answered: true } }; }
    if (message.type === "answer_rejected") { setNotice(message.message); if (message.message === "Time is up") setExpired(true); return prev; }
    if (message.type === "player_result") { setSelected(message.selected_options || []); return { ...prev, me: { ...prev.me, score: message.score, current_result: { is_correct: message.is_correct, points_awarded: message.points_awarded } } }; }
    if (message.type === "question_reveal") { setExpired(true); return { ...prev, session: { ...prev.session, is_revealed: true }, reveal: message }; }
    if (message.type === "leaderboard_update") return { ...prev, leaderboard: message.leaderboard };
    if (message.type === "session_end") return { ...prev, session: { ...prev.session, status: "ended" }, leaderboard: message.leaderboard };
    return prev;
  }); }, []);
  const connected = useLiveSocket(sessionId, { participant_token: token || "" }, onMessage);
  if (!token) return <Navigate to="/join" replace />;
  if (!state) return <div className="player-page"><Loader label="Joining the room…" /></div>;
  const { session, question, reveal, leaderboard = [], me = {} } = state;
  const safeLeaderboard = Array.isArray(leaderboard) ? leaderboard : [];
  const myRow = safeLeaderboard.find(row => row.participant_id === Number(state.me?.participant_id));
  const wasCorrect = Boolean(me.current_result?.is_correct);
  const complete = question?.type === "matching" ? selected.length === (question.left_items?.length || 0) && selected.every(Number.isInteger) && new Set(selected).size === selected.length : question?.type === "order" ? selected.length === (question.items?.length || 0) : selected.length > 0;
  function submit() { if (!complete || expired || !socket.current || socket.current.readyState !== WebSocket.OPEN) return; socket.current.send(JSON.stringify({ type: "answer_submitted", question_id: question.id, selected_options: selected })); }
  if (session.status === "pending") return <div className="player-page waiting-room"><div className="player-status"><Brand /><div className="ready-check"><Check /></div><p className="eyebrow">YOU’RE IN</p><h1>Eyes up front.</h1><p>Your instructor will start <b>{session.quiz_title}</b> soon.</p><span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "Connected" : "Reconnecting"}</span></div></div>;
  if (session.status === "ended") return <div className="player-page result-page"><div className="result-card"><p className="eyebrow">FINAL RESULT</p><h1>{myRow ? `#${myRow.rank}` : "Finished"}</h1><h2>{myRow?.display_name || "Quiz complete"}</h2><div className="score-big">{(myRow?.score ?? me.score ?? 0).toLocaleString()}<span>points</span></div><Leaderboard rows={safeLeaderboard.slice(0, 5)} me={myRow?.participant_id} /><Button onClick={() => navigate("/join")}>Join another game</Button></div></div>;
  return <div className="player-page play-surface"><header className="player-bar"><span>Q{(session.current_question_index ?? 0) + 1}/{session.question_count}</span><strong>{session.quiz_title}</strong><span>{(me.score || 0).toLocaleString()} pts</span></header>
    <main className="player-main">{question && <><div className="player-question"><Countdown deadline={question.deadline} onExpire={() => { setExpired(true); setNotice("Time is up — waiting for results"); }} /><h1>{question.text}</h1><p>{question.type === "multi" ? "Select all correct answers" : question.type === "order" ? "Drag the steps into the correct order" : question.type === "matching" ? "Match every item with its partner" : "Choose one answer"}</p></div><PlayerQuestionInput question={question} selected={selected} setSelected={setSelected} locked={submitted || expired || Boolean(reveal)} reveal={reveal} dragIndex={dragIndex} setDragIndex={setDragIndex} />{reveal && !wasCorrect && question.type === "order" && <div className="correct-solution"><b>Correct order</b>{reveal.correct_sequence.map((id, index) => <span key={id}>{index + 1}. {question.items.find(item => item.id === id)?.text}</span>)}</div>}{reveal && !wasCorrect && question.type === "matching" && <div className="correct-solution"><b>Correct matches</b>{question.left_items.map((left, index) => <span key={index}>{left.text} → {question.right_items.find(item => item.id === reveal.correct_matches[index])?.text}</span>)}</div>}{!reveal && <div className="submit-zone"><Button onClick={submit} disabled={!complete || submitted || expired}>{submitted ? <><Check />Answer locked</> : expired ? "Time is up" : question.type === "matching" ? "Lock matches" : question.type === "order" ? "Lock order" : question.type === "multi" ? "Lock answers" : "Lock answer"}</Button>{notice && <span>{notice}</span>}</div>}</>}
      {reveal && <div className={`feedback-banner ${wasCorrect ? "right" : "wrong"}`}><div>{wasCorrect ? <Check /> : <X />}</div><span><b>{wasCorrect ? "Correct!" : "Not this time"}</b>{wasCorrect ? `+${(me.current_result?.points_awarded || 0).toLocaleString()} points` : `Score: ${(me.score || 0).toLocaleString()}`}</span><AutoAdvance nextAt={reveal.next_at} fallback={reveal.next_in_sec || 6} final={(session.current_question_index ?? 0) + 1 >= session.question_count} /></div>}
    </main></div>;
}

function Results() {
  const { sessionId } = useParams(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [questionPage, setQuestionPage] = useState(1); const [leaderPage, setLeaderPage] = useState(1); const questionPageSize = 5; const leaderPageSize = 10;
  useEffect(() => { api(`/sessions/${sessionId}/statistics`).then(setData).catch(e => setError(e.message)); }, [sessionId]);
  const exportFile = async format => { try { await downloadExport(sessionId, format); } catch (e) { setError(e.message); } };
  if (!data) return <Shell><ErrorBox error={error} />{!error && <Loader label="Building session statistics…" />}</Shell>;
  return <Shell><button className="back-link" onClick={() => navigate("/dashboard")}><ArrowLeft />Back to library</button>
    <div className="results-heading"><div><p className="eyebrow">RESULT PREVIEW · PIN {data.session.pin}</p><h1>{data.session.quiz_title}</h1><p>Hosted by {data.session.host.name}{data.session.course_tag ? ` · ${data.session.course_tag}` : ""}</p></div><div className="result-export"><Button variant="ghost" onClick={() => exportFile("csv")}><Download />CSV</Button><Button onClick={() => exportFile("xlsx")}><Download />Export XLSX</Button></div></div>
    <ErrorBox error={error} />
    <div className="summary-grid"><article><Users /><span>Participants</span><b>{data.summary.participants}</b></article><article><FilePlus2 /><span>Questions</span><b>{data.summary.questions}</b></article><article><Check /><span>Average accuracy</span><b>{data.summary.average_accuracy}%</b></article><article><BarChart3 /><span>Average score</span><b>{data.summary.average_score.toLocaleString()}</b></article></div>
    <div className="results-layout"><section className="panel results-panel"><div className="section-title"><div><p className="eyebrow">QUESTION ANALYSIS</p><h2>Class response</h2></div><BarChart3 /></div><div className="question-stats">{data.questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize).map((question, pageIndex) => { const qIndex = (questionPage - 1) * questionPageSize + pageIndex; return <article key={question.id}><div className="question-stat-head"><span>{String(qIndex + 1).padStart(2, "0")}</span><div><h3>{question.text}</h3><p>{questionTypeLabels[question.type]} · {question.response_count} responses · {question.correct_rate}% correct</p></div></div><QuestionStatistics question={question} /></article>; })}</div><Pagination page={questionPage} onPageChange={setQuestionPage} total={data.questions.length} pageSize={questionPageSize} label="questions" /></section>
      <aside className="panel results-panel leaderboard-panel"><div className="section-title"><div><p className="eyebrow">LEADERBOARD</p><h2>Final ranking</h2></div><GraduationCap /></div><Leaderboard rows={data.leaderboard.slice((leaderPage - 1) * leaderPageSize, leaderPage * leaderPageSize)} /><Pagination page={leaderPage} onPageChange={setLeaderPage} total={data.leaderboard.length} pageSize={leaderPageSize} label="players" /></aside></div>
  </Shell>;
}

export default function App() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Login />} /><Route path="/reset-password" element={<ResetPassword />} /><Route path="/join" element={<Join />} /><Route path="/play/:sessionId" element={<Player />} /><Route path="/dashboard" element={<Protected><Dashboard /></Protected>} /><Route path="/quizzes/:quizId/preview" element={<Protected><QuizPreview /></Protected>} /><Route path="/quizzes/:quizId" element={<Protected><QuizEditor /></Protected>} /><Route path="/host/:sessionId" element={<Protected><Host /></Protected>} /><Route path="/results/:sessionId" element={<Protected><Results /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
