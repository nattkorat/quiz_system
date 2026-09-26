import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, Ban, BarChart3, Check, CheckCircle2, CircleStop, Copy, Gamepad2, KeyRound, MessageSquareText, Search, ShieldCheck, Users, UserX } from "lucide-react";
import { api, getUser } from "../../api";
import { Button, ErrorBox, Loader, Modal, Pagination, Shell } from "../../shared/ui";

const PAGE_SIZE = 10;
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${value}Z`)) : "Never";

export function AdminPage() {
  const navigate = useNavigate(); const currentUser = getUser();
  const [overview, setOverview] = useState(null); const [users, setUsers] = useState(null);
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [page, setPage] = useState(1);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(null);
  const [resetLink, setResetLink] = useState(null); const [resetCopied, setResetCopied] = useState(false);
  const loadOverview = useCallback(() => api("/admin/overview").then(setOverview), []);
  const loadUsers = useCallback(() => api(`/admin/users?${new URLSearchParams({ search: query, status, page: String(page), page_size: String(PAGE_SIZE) })}`).then(setUsers), [query, status, page]);
  useEffect(() => { setError(""); Promise.all([loadOverview(), loadUsers()]).catch(requestError => setError(requestError.message)); }, [loadOverview, loadUsers]);
  useEffect(() => { const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 300); return () => clearTimeout(timer); }, [search]);

  async function toggleUser(user) {
    const verb = user.is_active ? "suspend" : "reactivate";
    if (user.is_active && !window.confirm(`Suspend ${user.name}? They will immediately lose access until reactivated.`)) return;
    setBusy(`user-${user.id}`); setError("");
    try { await api(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) }); await Promise.all([loadOverview(), loadUsers()]); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(null); }
  }
  async function endGame(game) {
    if (!window.confirm(`End “${game.quiz_title}” now? Connected students will see the final result.`)) return;
    setBusy(`game-${game.id}`); setError("");
    try { await api(`/admin/sessions/${game.id}/end`, { method: "POST" }); await loadOverview(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(null); }
  }
  async function generateResetLink(user) {
    setBusy(`reset-${user.id}`); setError(""); setResetCopied(false);
    try {
      const result = await api(`/admin/users/${user.id}/password-reset-link`, { method: "POST" });
      setResetLink({ ...result, url: `${window.location.origin}/reset-password?token=${encodeURIComponent(result.token)}` });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(null); }
  }
  async function copyResetLink() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(resetLink.url);
      else { const field = document.createElement("textarea"); field.value = resetLink.url; field.style.position = "fixed"; field.style.opacity = "0"; document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove(); }
      setResetCopied(true); setTimeout(() => setResetCopied(false), 1800);
    } catch { setError("Could not copy the reset link. Select and copy it manually."); }
  }

  if (error === "Administrator access required") return <Shell><section className="admin-denied"><ShieldCheck /><h1>Administrator access required</h1><p>Only the configured platform administrator can open this area.</p><Button onClick={() => navigate("/dashboard")}><ArrowLeft />Back to dashboard</Button></section></Shell>;
  return <Shell><div className="admin-heading"><div><p className="eyebrow">PLATFORM ADMINISTRATION</p><h1>QuizForge control room</h1><p>Monitor usage, manage instructor access, and control open games.</p></div><Button variant="ghost" onClick={() => navigate("/dashboard")}><ArrowLeft />Instructor dashboard</Button></div><ErrorBox error={error} />
    {!overview ? <Loader label="Loading platform activity…" /> : <>
      <MetricGrid metrics={overview.metrics} />
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">LIVE OPERATIONS</p><h2>Open games</h2></div><span className="live-count"><i />{overview.open_sessions.length} open</span></div>{overview.open_sessions.length ? <div className="open-game-list">{overview.open_sessions.map(game => <article key={game.id}><div className="open-game-pin"><span>PIN</span><b>{game.pin}</b></div><div><strong>{game.quiz_title}</strong><span>{game.host?.name || "Unknown host"} · {game.participant_count} student{game.participant_count === 1 ? "" : "s"}</span></div><span className={`status-pill ${game.status}`}>{game.status}</span><Button variant="ghost" disabled={busy === `game-${game.id}`} onClick={() => endGame(game)}><CircleStop />{busy === `game-${game.id}` ? "Ending…" : "End game"}</Button></article>)}</div> : <div className="admin-empty">No lobby or live quiz is open.</div>}</section>
    </>}
    <section className="admin-panel users-panel"><div className="admin-panel-heading"><div><p className="eyebrow">ACCOUNT CONTROL</p><h2>Registered instructors</h2></div>{users && <b>{users.total} account{users.total === 1 ? "" : "s"}</b>}</div><div className="admin-user-toolbar"><label className="search-box"><Search /><input aria-label="Search instructors" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email…" /></label><select aria-label="Filter accounts" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="admin">Administrators</option></select></div>
      {!users ? <Loader label="Loading instructors…" /> : users.items.length ? <><div className="admin-user-table-wrap"><table className="admin-user-table"><thead><tr><th>Instructor</th><th>Usage</th><th>Last login</th><th>Status</th><th>Control</th></tr></thead><tbody>{users.items.map(user => <tr key={user.id}><td><strong>{user.name}{user.is_admin && <span className="admin-badge"><ShieldCheck />Admin</span>}</strong><span>{user.email}</span><small>Joined {formatDate(user.created_at)}</small></td><td><b>{user.quiz_count}</b> quizzes · <b>{user.session_count}</b> plays<span>{user.student_count} student joins</span></td><td>{formatDate(user.last_login_at)}</td><td><span className={`account-status ${user.is_active ? "active" : "suspended"}`}>{user.is_active ? <CheckCircle2 /> : <Ban />}{user.is_active ? "Active" : "Suspended"}</span></td><td><div className="account-actions"><button className="account-control reset" disabled={busy === `reset-${user.id}`} onClick={() => generateResetLink(user)}><KeyRound />{busy === `reset-${user.id}` ? "Generating…" : "Reset link"}</button><button className={`account-control ${user.is_active ? "suspend" : "activate"}`} disabled={busy === `user-${user.id}` || user.id === currentUser?.id} title={user.id === currentUser?.id ? "You cannot suspend yourself" : undefined} onClick={() => toggleUser(user)}>{user.is_active ? <UserX /> : <CheckCircle2 />}{busy === `user-${user.id}` ? "Saving…" : user.is_active ? "Suspend" : "Reactivate"}</button></div></td></tr>)}</tbody></table></div><Pagination page={page} onPageChange={setPage} total={users.total} pageSize={PAGE_SIZE} label="instructors" /></> : <div className="admin-empty">No instructors match this filter.</div>}
    </section>
    {resetLink && <Modal title="Manual password reset" onClose={() => setResetLink(null)}><div className="admin-reset-modal"><div className="reset-recipient"><KeyRound /><div><b>{resetLink.user.name}</b><span>{resetLink.user.email}</span></div></div><p>Send this private link to the instructor. It expires {formatDate(resetLink.expires_at)} and stops working after the password is changed.</p>{!resetLink.user.is_active && <p className="reset-warning">This account is suspended and must also be reactivated before it can sign in.</p>}<label>Password reset link<textarea readOnly value={resetLink.url} onFocus={event => event.target.select()} /></label><Button onClick={copyResetLink}>{resetCopied ? <Check /> : <Copy />}{resetCopied ? "Link copied" : "Copy reset link"}</Button><small>Anyone with this link can change this account’s password. Share it only with the email owner.</small></div></Modal>}
  </Shell>;
}

function MetricGrid({ metrics }) {
  const cards = [
    [Users, "Registered instructors", metrics.registered_instructors, `${metrics.active_accounts} active accounts`],
    [Activity, "Logged in (24h)", metrics.recent_logins, "Recent instructor activity"],
    [Gamepad2, "Open games", metrics.open_games, `${metrics.student_joins} total student joins`],
    [BarChart3, "Played sessions", metrics.played_sessions, `${metrics.quizzes} published quizzes`],
    [MessageSquareText, "Answers collected", metrics.answers, "Across all quiz sessions"],
  ];
  return <section className="admin-metrics">{cards.map(([Icon, label, value, detail]) => <article key={label}><Icon /><span>{label}</span><b>{value.toLocaleString()}</b><small>{detail}</small></article>)}</section>;
}
