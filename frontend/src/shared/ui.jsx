import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, ShieldCheck, X, Zap } from "lucide-react";
import { api, clearAuth, getToken, getUser, setUser as saveUser } from "../api";

export function Brand({ compact = false }) {
  return <Link className="brand" to="/" aria-label="QuizForge home"><span className="brand-mark"><Zap size={compact ? 17 : 21} fill="currentColor" /></span>{!compact && <span>QuizForge</span>}</Link>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
}

export function Loader({ label = "Loading…" }) {
  return <div className="loader"><span />{label}</div>;
}

export function ErrorBox({ error }) {
  return error ? <div className="error-box">{error}</div> : null;
}

export function Shell({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser);
  useEffect(() => { api("/auth/me").then(fresh => { saveUser(fresh); setUser(fresh); }).catch(error => { if (error.status === 401 || error.status === 403) { clearAuth(); navigate("/login", { replace: true }); } }); }, [navigate]);
  return <div className="app-shell"><header className="topbar"><Brand /><div className="topbar-right">{user?.is_admin && <Link className="admin-nav-link" to="/admin"><ShieldCheck />Admin</Link>}<span className="user-chip"><span>{user?.name?.[0] || "I"}</span>{user?.name || "Instructor"}</span><button className="icon-button" aria-label="Sign out" onClick={() => { clearAuth(); navigate("/login"); }}><LogOut size={18} /></button></div></header><main className="shell-content">{children}</main></div>;
}

export function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div>{children}</section></div>;
}

export function Pagination({ page, onPageChange, total, pageSize, label = "items" }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > pageCount) onPageChange(pageCount); }, [page, pageCount, onPageChange]);
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1; const last = Math.min(page * pageSize, total);
  return <nav className="pagination" aria-label={`${label} pagination`}><span>{first}–{last} of {total} {label}</span><div><button aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronDown /></button><b>Page {page} of {pageCount}</b><button aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}><ChevronDown /></button></div></nav>;
}
