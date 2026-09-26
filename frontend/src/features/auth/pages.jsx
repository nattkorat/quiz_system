import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Eye, EyeOff, FilePlus2, FolderOpen, GraduationCap, KeyRound, Radio, ShieldCheck, Users } from "lucide-react";
import { api, getToken, setAuth } from "../../api";
import { Brand, Button, ErrorBox, Loader } from "../../shared/ui";

export function Landing() {
  const navigate = useNavigate();
  const instructorPath = getToken() ? "/dashboard" : "/login";
  return <div className="landing-page"><header className="landing-nav"><Brand /><span>Live classroom quizzes</span></header><main className="landing-main"><section className="landing-intro"><p className="eyebrow">WELCOME TO QUIZFORGE</p><h1>Choose how you’re joining.</h1><p>Enter a live classroom quiz as a student, or open the instructor workspace to create, host, and review quizzes.</p></section><section className="role-grid" aria-label="Choose your QuizForge role"><article className="role-card student-role"><span className="role-icon"><Users /></span><div><p className="eyebrow">STUDENT</p><h2>Join a live quiz</h2><p>Have a game PIN from your instructor? Enter it and start playing—no account needed.</p></div><Button onClick={() => navigate("/join")}>Join quiz<ArrowRight /></Button></article><article className="role-card instructor-role"><span className="role-icon"><GraduationCap /></span><div><p className="eyebrow">INSTRUCTOR</p><h2>{getToken() ? "Open your workspace" : "Instructor access"}</h2><p>Create and organize quizzes, host live games, review statistics, and export results.</p></div><Button variant="secondary" onClick={() => navigate(instructorPath)}>{getToken() ? "Open dashboard" : "Instructor sign in"}<ArrowRight /></Button></article></section><div className="landing-trust"><ShieldCheck /><span>Live scoring</span><i />Real-time results<i />Grade-ready exports</div></main></div>;
}

export function Login() {
  const navigate = useNavigate();
  const registrationEnabled = import.meta.env.VITE_ALLOW_REGISTRATION !== "false";
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const register = mode === "register"; const forgot = mode === "forgot";
  function changeMode(nextMode) { setMode(nextMode); setShowPassword(false); setError(""); setNotice(""); }
  async function submit(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      if (forgot) { const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: form.email }) }); setNotice(result.message); return; }
      const result = await api(`/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(form) });
      setAuth(result); const returnTo = sessionStorage.getItem("quizforge_return_to"); sessionStorage.removeItem("quizforge_return_to"); navigate(returnTo || "/dashboard");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-page"><section className="auth-story"><Brand /><div className="signal-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="pulse-core"><Radio size={52} /></div></div><div><p className="eyebrow">LIVE CLASSROOM SIGNAL</p><h1>Questions in.<br />Energy up.</h1><p>Run fast, fair classroom quizzes with scores your gradebook can actually use.</p></div><div className="story-stats"><span><b>&lt; 1 sec</b>live updates</span><span><b>60+</b>players ready</span><span><b>XLSX</b>grade export</span></div></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="mobile-brand"><Brand /></div><p className="eyebrow">INSTRUCTOR CONSOLE</p><h2>{forgot ? "Reset your password" : register ? "Create your account" : "Welcome back"}</h2><p className="muted">{forgot ? "We’ll email a secure reset link if this account exists." : register ? "Start building your first live quiz." : "Sign in to launch your next session."}</p><ErrorBox error={error} />{notice && <div className="success-box"><Check />{notice}</div>}{register && <label>Full name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Dr. Ada Lovelace" /></label>}<label>Email<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@school.edu" /></label>{!forgot && <label><span className="password-label"><span>Password</span>{!register && <button type="button" onClick={() => changeMode("forgot")}>Forgot password?</button>}</span><div className="password-field"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}<Button disabled={busy} type="submit">{busy ? "Please wait…" : forgot ? "Send reset link" : register ? "Create account" : "Enter console"}{forgot ? <KeyRound size={18} /> : <ArrowRight size={18} />}</Button>{forgot ? <button className="text-button" type="button" onClick={() => changeMode("login")}><ArrowLeft />Back to sign in</button> : registrationEnabled && <button className="text-button" type="button" onClick={() => changeMode(register ? "login" : "register")}>{register ? "Already have an account? Sign in" : "New instructor? Create an account"}</button>}</form></section></div>;
}

export function ResetPassword() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const token = params.get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" }); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(token ? "" : "This reset link is incomplete."); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setError(""); if (form.password !== form.confirm) return setError("Passwords do not match."); setBusy(true); try { await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: form.password }) }); setDone(true); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <div className="join-page"><div className="join-glow" /><form className="join-card reset-card" onSubmit={submit}><Brand /><div className="join-icon"><KeyRound /></div><p className="eyebrow">INSTRUCTOR ACCOUNT</p><h1>{done ? "Password updated" : "Choose a new password"}</h1><p className="muted">{done ? "Your old password no longer works." : "Use at least eight characters and keep it unique."}</p><ErrorBox error={error} />{done ? <Button type="button" onClick={() => navigate("/login")}>Return to sign in<ArrowRight /></Button> : <><label>New password<div className="password-field"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label><label>Confirm password<input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} /></label><Button disabled={busy || !token}>{busy ? "Updating…" : "Update password"}<ArrowRight /></Button></>}</form></div>;
}

function InvitePage({ kind }) {
  const { token } = useParams(); const navigate = useNavigate(); const folderInvite = kind === "folder";
  const [invite, setInvite] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const path = folderInvite ? "folder-invites" : "quiz-invites";
  useEffect(() => { api(`/${path}/${token}`).then(setInvite).catch(err => setError(err.message)); }, [path, token]);
  async function acceptInvite() {
    if (!getToken()) { sessionStorage.setItem("quizforge_return_to", `/${folderInvite ? "folder" : "quiz"}-invite/${token}`); navigate("/login"); return; }
    setBusy(true); setError("");
    try { const result = await api(`/${path}/${token}/accept`, { method: "POST" }); navigate(folderInvite ? "/dashboard" : `/quizzes/${result.id}/preview`); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const title = folderInvite ? invite?.folder.name : invite?.quiz.title;
  return <div className="join-page"><div className="join-glow" /><section className="join-card invite-card"><Brand /><div className="join-icon">{folderInvite ? <FolderOpen /> : <FilePlus2 />}</div><p className="eyebrow">{folderInvite ? "COURSE" : "QUIZ"} INVITATION</p>{!invite && !error ? <Loader label="Checking invitation…" /> : <><h1>{title || "Invitation unavailable"}</h1>{invite && (folderInvite ? <><p className="muted">{invite.owner.name} invited you to collaborate on this folder{invite.folder.course_tag ? ` · ${invite.folder.course_tag}` : ""}.</p>{invite.folder.description && <p className="invite-description">{invite.folder.description}</p>}</> : <><p className="muted">{invite.owner.name} shared this quiz with you.</p><p className="invite-description">{invite.quiz.course_tag || "No course tag"} · {invite.quiz.question_count} question{invite.quiz.question_count === 1 ? "" : "s"}</p></>)}{invite && <p className="invite-expiry"><CalendarDays />Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${invite.expires_at}Z`))}</p>}<ErrorBox error={error} />{invite && <Button onClick={acceptInvite} disabled={busy}>{busy ? (folderInvite ? "Joining…" : "Opening…") : getToken() ? (folderInvite ? "Accept and open folder" : "Accept and review quiz") : "Sign in to accept"}<ArrowRight /></Button>}<button className="text-button" onClick={() => navigate("/")}><ArrowLeft />Back home</button></>}</section></div>;
}

export function FolderInvitePage() { return <InvitePage kind="folder" />; }
export function QuizInvitePage() { return <InvitePage kind="quiz" />; }
