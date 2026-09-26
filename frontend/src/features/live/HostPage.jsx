import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, CirclePlay, Copy, Download, GraduationCap, Maximize2, Music2, Pause, Play, QrCode, ShieldCheck, Users, Volume2, VolumeX } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, downloadExport, getToken } from "../../api";
import { palette } from "../../shared/constants";
import { Brand, Button, ErrorBox, Loader, Modal } from "../../shared/ui";
import { AutoAdvance, Leaderboard, ReactionLayer } from "./components";
import { musicTracks, useFloatingReactions, useHostSounds, useLiveSocket } from "./hooks";

export function HostPage() {
  const { sessionId } = useParams(); const navigate = useNavigate();
  const [state, setState] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false); const [qrLarge, setQrLarge] = useState(false);
  const { reactions, addReaction } = useFloatingReactions(); const sounds = useHostSounds();
  const handleMessage = useCallback(message => {
    sounds.play(message.type, message); sounds.handleSessionEvent(message); if (message.type === "reaction") addReaction(message);
    setState(previous => {
      if (message.type === "snapshot") return { ...message, response_count: message.reveal?.response_count || 0, distribution: message.reveal?.distribution || [] };
      if (!previous) return previous;
      if (message.type === "player_joined") return { ...previous, participants: message.participants };
      if (message.type === "question_start") return { ...previous, session: { ...previous.session, status: "live", current_question_index: message.question.position, is_revealed: false }, question: message.question, reveal: null, leaderboard: previous.leaderboard || [], response_count: 0, distribution: (message.question.options || []).map(() => 0) };
      if (message.type === "question_progress") return { ...previous, response_count: message.response_count };
      if (message.type === "question_reveal") return { ...previous, session: { ...previous.session, is_revealed: true }, reveal: message, response_count: message.response_count, distribution: message.distribution };
      if (message.type === "leaderboard_update") return { ...previous, leaderboard: message.leaderboard };
      if (message.type === "session_end") return { ...previous, session: { ...previous.session, status: "ended" }, leaderboard: message.leaderboard };
      return previous;
    });
  }, [sounds.play, sounds.handleSessionEvent, addReaction]);
  const connected = useLiveSocket(sessionId, { access_token: getToken() }, handleMessage);
  useEffect(() => { api(`/sessions/${sessionId}`).then(setState).catch(requestError => setError(requestError.message)); }, [sessionId]);
  useEffect(() => {
    const syncMusic = () => {
      const rows = Array.isArray(state?.leaderboard) ? state.leaderboard : [];
      const averageScore = rows.length ? rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / rows.length : 0;
      const questionNumber = (state?.session?.current_question_index ?? 0) + 1;
      sounds.updateMusicContext({ deadline: state?.question?.deadline, durationSec: state?.question?.duration_sec, responseCount: state?.response_count || 0, participantCount: state?.participants?.length || 0, scoreRatio: averageScore / Math.max(1, (Number(state?.question?.points) || 1000) * questionNumber), status: state?.session?.status });
    };
    syncMusic(); if (state?.session?.status !== "live") return undefined;
    const timer = setInterval(syncMusic, 500); return () => clearInterval(timer);
  }, [state, sounds.updateMusicContext]);
  async function action(name) { sounds.unlock(); setBusy(true); setError(""); try { await api(`/sessions/${sessionId}/${name}`, { method: "POST" }); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  if (!state) return <div className="host-page"><Loader label="Opening presenter view…" /></div>;
  const { session, participants = [], question, leaderboard: board = [] } = state;
  const joinUrl = `${window.location.origin}/join?pin=${session.pin}`;
  const exportFile = async format => { try { await downloadExport(sessionId, format); } catch (requestError) { setError(requestError.message); } };
  const copyJoinLink = async () => { try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(joinUrl); else { const field = document.createElement("textarea"); field.value = joinUrl; field.style.position = "fixed"; field.style.opacity = "0"; document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove(); } setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError("Could not copy the link. Share the game PIN instead."); } };

  return <div className="host-page"><ReactionLayer reactions={reactions} /><PresenterBar session={session} connected={connected} sounds={sounds} navigate={navigate} showQr={() => setQrLarge(true)} /><ErrorBox error={error} />
    {session.status === "pending" && <Lobby session={session} participants={participants} joinUrl={joinUrl} copied={copied} copyJoinLink={copyJoinLink} showQr={() => setQrLarge(true)} busy={busy} start={() => action("start")} />}
    {session.status === "live" && <LiveQuestion state={state} session={session} participants={participants} question={question} board={board} busy={busy} action={action} />}
    {session.status === "ended" && <FinalScreen session={session} participants={participants} board={board} exportFile={exportFile} navigate={navigate} />}
    {qrLarge && <Modal title="Join this live quiz" onClose={() => setQrLarge(false)}><div className="qr-large"><QRCodeSVG value={joinUrl} size={420} bgColor="#ffffff" fgColor="#071621" /><div><b>PIN {session.pin}</b><a href={joinUrl} target="_blank" rel="noreferrer">{joinUrl}</a><span>Students can join even after the quiz starts.</span></div><Button onClick={copyJoinLink}>{copied ? <Check /> : <Copy />}{copied ? "Link copied" : "Copy student join link"}</Button></div></Modal>}
  </div>;
}

function PresenterBar({ session, connected, sounds, navigate, showQr }) {
  return <header className="presenter-bar"><Brand /><div className="presenter-status">{session.status !== "ended" && <button className="join-info-button" onClick={showQr} aria-label={`Show join QR code and link for PIN ${session.pin}`}><QrCode /><span>Join</span><b>{session.pin}</b></button>}<div className={`connection ${connected ? "online" : ""}`}><span />{connected ? "Live" : "Reconnecting"}</div><button className={`sound-toggle ${sounds.enabled ? "enabled" : ""}`} onClick={sounds.toggle} aria-pressed={sounds.enabled}>{sounds.enabled ? <Volume2 /> : <VolumeX />}{sounds.enabled ? "SFX on" : "SFX off"}</button><div className={`music-controls ${sounds.musicEnabled ? "enabled" : ""}`}><button className="music-play" onClick={sounds.toggleMusic} aria-label={sounds.musicPlaying ? "Pause background music" : "Play background music"}>{sounds.musicPlaying ? <Pause /> : <Play />}</button><Music2 /><select className="music-track-select" aria-label="Background music track" value={sounds.musicTrack} onChange={event => sounds.changeMusicTrack(event.target.value)}>{musicTracks.map(track => <option value={track.id} key={track.id}>{track.label}</option>)}</select><div className="music-energy" aria-label={`Music intensity: ${sounds.intensityLabel}`}>{[.25, .5, .75].map(level => <i className={sounds.musicIntensity >= level ? "active" : ""} key={level} />)}<span>{sounds.intensityLabel}</span></div><input aria-label="Background music volume" type="range" min="0" max="100" step="5" value={sounds.musicVolume} onChange={event => sounds.changeMusicVolume(event.target.value)} /></div></div><button className="text-button" onClick={() => navigate("/dashboard")}>Exit presenter</button></header>;
}

function Lobby({ session, participants, joinUrl, copied, copyJoinLink, showQr, busy, start }) {
  return <main className="lobby-layout"><section className="join-panel"><p className="eyebrow">JOIN AT {window.location.host}/join</p><h1>Game PIN</h1><div className="pin-display">{session.pin}</div><button className="copy-link" onClick={copyJoinLink}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy join link"}</button><button className="qr-wrap" onClick={showQr} aria-label="Enlarge join QR code"><QRCodeSVG value={joinUrl} size={154} bgColor="transparent" fgColor="#071621" /><span><Maximize2 />Tap to enlarge</span></button></section><section className="lobby-players"><div className="section-title"><div><p className="eyebrow">LOBBY</p><h2>{participants.length}{session.participant_limit ? ` / ${session.participant_limit}` : ""} players ready</h2></div><Users size={30} /></div><div className="player-cloud">{participants.map((participant, index) => <span key={participant.id} style={{ animationDelay: `${index * 35}ms` }}>{participant.display_name}</span>)}</div>{!participants.length && <div className="waiting"><span className="dots"><i /><i /><i /></span>Waiting for students to join</div>}<Button className="start-button" disabled={busy || !participants.length} onClick={start}><CirclePlay />Start quiz</Button></section></main>;
}

function LiveQuestion({ state, session, participants, question, board, busy, action }) {
  const finalQuestion = (session.current_question_index ?? 0) + 1 >= session.question_count;
  return <main className="live-host"><div className="question-stage"><div className="question-topline"><span>Question {(session.current_question_index ?? 0) + 1} / {session.question_count}</span><span><Users />{state.response_count || 0} / {participants.length} answered</span></div><h1>{question?.text}</h1><HostQuestion question={question} reveal={state.reveal} distribution={state.distribution} /></div><aside className="host-sidebar"><div className="host-action panel"><p className="eyebrow">HOST CONTROL</p>{!session.is_revealed ? <><h2>Answers coming in</h2><p>{state.response_count || 0} of {participants.length} responses locked. Results appear when everyone answers or time expires.</p><Button disabled={busy} onClick={() => action("reveal")}><ShieldCheck />Reveal now</Button></> : <><h2>Scores updated</h2><AutoAdvance nextAt={state.reveal?.next_at} fallback={state.reveal?.next_in_sec || 6} final={finalQuestion} /><Button disabled={busy} onClick={() => action(finalQuestion ? "end" : "next")}>{finalQuestion ? "Show final results" : "Next now"}<ArrowRight /></Button></>}</div>{session.is_revealed && <div className="panel compact-board"><p className="eyebrow">LEADERBOARD</p><Leaderboard rows={board?.slice(0, 5)} /></div>}</aside></main>;
}

function FinalScreen({ session, participants, board, exportFile, navigate }) { return <main className="final-screen"><div className="final-heading"><p className="eyebrow">SESSION COMPLETE</p><h1>That’s a wrap.</h1><p>{participants.length} players • {session.question_count} questions • PIN {session.pin}</p></div><div className="final-grid"><section className="panel"><div className="section-title"><h2>Final leaderboard</h2><GraduationCap /></div><Leaderboard rows={board} /></section><aside className="export-card"><Download size={34} /><h2>Gradebook ready</h2><p>One row per student, with question results, accuracy, score, and rank.</p><Button onClick={() => exportFile("xlsx")}><Download />Export XLSX</Button><Button variant="secondary" onClick={() => exportFile("csv")}>Export CSV</Button><button className="text-button" onClick={() => navigate("/dashboard")}>Back to library</button></aside></div></main>; }

function HostQuestion({ question, reveal, distribution = [] }) {
  if (!question) return null;
  if (question.type === "order") { const itemById = new Map((question.items || []).map(item => [item.id, item])); const ordered = reveal?.correct_sequence ? reveal.correct_sequence.map(id => itemById.get(id)).filter(Boolean) : question.items || []; return <div className={`host-sequence ${reveal ? "revealed" : ""}`}><p>{reveal ? "Correct order" : "Students are arranging these steps"}</p>{ordered.map((item, index) => <div key={item.id}><span>{index + 1}</span><strong>{item.text}</strong>{reveal && <Check />}</div>)}</div>; }
  if (question.type === "matching") { const rightById = new Map((question.right_items || []).map(item => [item.id, item])); return <div className={`host-matching ${reveal ? "revealed" : ""}`}><p>{reveal ? "Correct matches" : "Students are matching both sides"}</p>{(question.left_items || []).map((left, index) => <div key={index}><strong>{left.text}</strong><ArrowRight /><span>{reveal ? rightById.get(reveal.correct_matches?.[index])?.text : "Hidden until reveal"}</span>{reveal && <Check />}</div>)}</div>; }
  return <div className="host-options">{(question.options || []).map((option, index) => { const revealed = Boolean(reveal); const count = revealed ? distribution[index] || 0 : 0; const max = Math.max(1, ...(revealed ? distribution : [])); return <div className={`host-option ${palette[index]} ${revealed ? "revealed" : "private"}`} key={index}><span className="option-key">{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{revealed ? <><div className="bar-track"><i style={{ width: `${count / max * 100}%` }} /></div><b>{count}</b>{reveal?.correct_options?.includes(index) && <span className="correct-badge"><Check /></span>}</> : <span className="answer-hidden">Hidden</span>}</div>; })}</div>;
}
