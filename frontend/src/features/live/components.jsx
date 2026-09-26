import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, MessageCircle, Send } from "lucide-react";
import { reactionEmojis } from "../../shared/constants";

export function ReactionLayer({ reactions }) {
  return <div className="reaction-layer" aria-live="polite" aria-label="Live class reactions">{reactions.map((reaction, index) => <div className={`floating-reaction ${reaction.kind}`} style={{ left: `${reaction.x || 50}%`, "--reaction-drift": `${(index % 3 - 1) * 28}px` }} key={reaction.event_id}>{reaction.kind === "emoji" ? <span>{reaction.content}</span> : <><MessageCircle /><strong>{reaction.content}</strong></>}<small>{reaction.display_name}</small></div>)}</div>;
}

export function ReactionComposer({ socket, connected, notice }) {
  const [open, setOpen] = useState(false); const [chat, setChat] = useState("");
  function send(kind, content) { if (!content.trim() || !socket.current || socket.current.readyState !== WebSocket.OPEN) return; socket.current.send(JSON.stringify({ type: "reaction_send", kind, content: content.trim() })); if (kind === "chat") { setChat(""); setOpen(false); } }
  return <div className={`reaction-composer ${open ? "open" : ""}`}><button className="reaction-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? "Close reactions" : "Send a reaction"}><MessageCircle />React</button>{open && <div className="reaction-popover"><div className="emoji-row">{reactionEmojis.map(emoji => <button disabled={!connected} onClick={() => send("emoji", emoji)} aria-label={`Send ${emoji}`} key={emoji}>{emoji}</button>)}</div><form onSubmit={event => { event.preventDefault(); send("chat", chat); }}><input maxLength={80} value={chat} onChange={event => setChat(event.target.value)} placeholder="Say something…" aria-label="Short class message" /><button disabled={!connected || !chat.trim()} aria-label="Send message"><Send /></button></form>{notice && <small>{notice}</small>}</div>}</div>;
}

export function Leaderboard({ rows = [], me }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return <div className="no-data">No scores yet</div>;
  return <div className="leaderboard">{safeRows.map(row => <div className={`leader-row ${row.participant_id === me ? "me" : ""}`} key={row.participant_id}><span className={`rank rank-${row.rank}`}>{row.rank}</span><strong>{row.display_name}</strong><span className="rank-change">{row.rank_delta > 0 ? <><ArrowUp />{row.rank_delta}</> : row.rank_delta < 0 ? <><ArrowDown />{Math.abs(row.rank_delta)}</> : "—"}</span><b>{row.score.toLocaleString()}</b></div>)}</div>;
}

export function AutoAdvance({ nextAt, fallback = 6, final = false }) {
  const [left, setLeft] = useState(fallback);
  useEffect(() => { const target = nextAt ? new Date(nextAt).getTime() : Date.now() + fallback * 1000; const tick = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer); }, [nextAt, fallback]);
  return <span className="auto-advance"><Clock3 />{final ? "Final results" : "Next question"} in {left}s</span>;
}
