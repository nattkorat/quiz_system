import { useCallback, useEffect, useRef, useState } from "react";
import { socketUrl } from "../../api";

export function useLiveSocket(sessionId, params, onMessage) {
  const callback = useRef(onMessage); callback.current = onMessage;
  const [connected, setConnected] = useState(false);
  const serializedParams = JSON.stringify(params);
  useEffect(() => {
    let active = true; let socket; let retry;
    const connect = () => {
      socket = new WebSocket(socketUrl(sessionId, params));
      socket.onopen = () => active && setConnected(true);
      socket.onclose = () => { if (active) { setConnected(false); retry = setTimeout(connect, 1200); } };
      socket.onmessage = event => callback.current(JSON.parse(event.data), socket);
    };
    connect();
    return () => { active = false; clearTimeout(retry); socket?.close(); };
  }, [sessionId, serializedParams]);
  return connected;
}

export function useFloatingReactions() {
  const [reactions, setReactions] = useState([]); const timers = useRef(new Map());
  const addReaction = useCallback(message => {
    const id = message.event_id || `${Date.now()}-${Math.random()}`;
    setReactions(current => [...current.slice(-11), { ...message, event_id: id }]);
    const timer = setTimeout(() => { setReactions(current => current.filter(item => item.event_id !== id)); timers.current.delete(id); }, 4200);
    timers.current.set(id, timer);
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return { reactions, addReaction };
}

export const musicTracks = [
  { id: "adaptive", label: "Adaptive Rush", melody: [392, 523, null, 659, 523, 440, 587, 698, null, 587, 440, 494, 659, 784, 698, 587], tempo: 470, wave: "triangle", energy: .2 },
  { id: "arcade", label: "Arcade Pop", melody: [523, 659, 784, 659, 880, 784, 659, 587, 698, 880, 1047, 880, 784, 698, 659, 784], tempo: 285, wave: "square", energy: .78 },
  { id: "focus", label: "Focus Flow", melody: [330, null, 392, null, 440, null, 392, 349, null, 440, null, 494, null, 440, 392, null], tempo: 560, wave: "sine", energy: .28 },
  { id: "adventure", label: "Quiz Quest", melody: [294, 440, 587, 440, 330, 494, 659, 494, 349, 523, 698, 523, 392, 587, 784, 698], tempo: 390, wave: "sawtooth", energy: .56 },
];

const musicTrackMap = Object.fromEntries(musicTracks.map(track => [track.id, track]));
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function useHostSounds() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("quizforge_host_sound") !== "off");
  const [musicEnabled, setMusicEnabled] = useState(false); const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => Number(localStorage.getItem("quizforge_music_volume") || 55));
  const [musicTrack, setMusicTrack] = useState(() => musicTrackMap[localStorage.getItem("quizforge_music_track")] ? localStorage.getItem("quizforge_music_track") : "adaptive");
  const [musicIntensity, setMusicIntensity] = useState(() => musicTrackMap[localStorage.getItem("quizforge_music_track")]?.energy || .2);
  const audio = useRef(null); const musicTimer = useRef(null); const beat = useRef(0); const musicEnabledRef = useRef(false);
  const musicVolumeRef = useRef(musicVolume / 100); const musicTrackRef = useRef(musicTrack); const musicIntensityRef = useRef(musicIntensity);
  const context = () => { if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)(); if (audio.current.state === "suspended") audio.current.resume(); return audio.current; };
  const tone = useCallback((frequency, offset = 0, duration = .12, gain = .055, type = "sine") => {
    if (gain <= 0) return;
    const ctx = context(); const oscillator = ctx.createOscillator(); const volume = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, ctx.currentTime + offset); volume.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), ctx.currentTime + offset + .015); volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + duration);
    oscillator.connect(volume); volume.connect(ctx.destination); oscillator.start(ctx.currentTime + offset); oscillator.stop(ctx.currentTime + offset + duration + .02);
  }, []);
  const play = useCallback((kind, detail = {}) => {
    if (!enabled) return;
    if (kind === "player_joined") tone(660, 0, .09, .035);
    if (kind === "question_start") { tone(440, 0, .12); tone(660, .12, .16); }
    if (kind === "question_progress") { const notes = [659, 740, 831, 988]; const note = notes[(Math.max(1, detail.response_count || 1) - 1) % notes.length]; tone(note, 0, .07, .025, "triangle"); tone(note * 1.5, .045, .055, .012, "sine"); }
    if (kind === "question_reveal") { tone(523, 0, .14); tone(659, .1, .14); tone(784, .2, .22); }
    if (kind === "session_end") { tone(523, 0, .18); tone(659, .14, .18); tone(784, .28, .18); tone(1047, .42, .3); }
  }, [enabled, tone]);
  const toggle = () => setEnabled(current => { const next = !current; localStorage.setItem("quizforge_host_sound", next ? "on" : "off"); if (next) { context(); tone(660, 0, .08); tone(880, .08, .12); } return next; });
  const playMusicBeat = useCallback(() => {
    const track = musicTrackMap[musicTrackRef.current] || musicTracks[0]; const intensity = musicTrackRef.current === "adaptive" ? musicIntensityRef.current : track.energy;
    const index = beat.current % track.melody.length; const note = track.melody[index]; const volume = musicVolumeRef.current;
    if (volume <= 0) { beat.current += 1; return; }
    if (note) tone(note, 0, .18 + intensity * .08, (.029 + intensity * .026) * volume, track.wave);
    if (note && index % 4 === 0 && intensity >= .22) tone(note / 2, 0, .28, (.03 + intensity * .027) * volume, "sine");
    if (note && index % 2 === 1 && intensity >= .48) tone(note * 2, .11, .06, .015 * volume, "sine");
    if (note && index % 4 === 2 && intensity >= .72) tone(note * 1.5, .04, .12, .013 * volume, "triangle");
    beat.current += 1;
  }, [tone]);
  const pauseMusic = useCallback(() => { if (musicTimer.current) clearTimeout(musicTimer.current); musicTimer.current = null; setMusicPlaying(false); }, []);
  const scheduleMusicBeat = useCallback(() => {
    const track = musicTrackMap[musicTrackRef.current] || musicTracks[0]; const intensity = musicTrackRef.current === "adaptive" ? musicIntensityRef.current : track.energy; const delay = Math.round(track.tempo * (1 - intensity * .34));
    musicTimer.current = setTimeout(() => { musicTimer.current = null; if (!musicEnabledRef.current) return; playMusicBeat(); scheduleMusicBeat(); }, delay);
  }, [playMusicBeat]);
  const startMusic = useCallback(() => { if (musicTimer.current) return; context(); playMusicBeat(); scheduleMusicBeat(); setMusicPlaying(true); }, [playMusicBeat, scheduleMusicBeat]);
  const toggleMusic = () => { if (musicPlaying) { musicEnabledRef.current = false; setMusicEnabled(false); pauseMusic(); } else { musicEnabledRef.current = true; setMusicEnabled(true); startMusic(); } };
  const changeMusicVolume = value => { const normalized = Number(value); musicVolumeRef.current = normalized / 100; setMusicVolume(normalized); localStorage.setItem("quizforge_music_volume", String(normalized)); };
  const changeMusicTrack = value => { const track = musicTrackMap[value] || musicTracks[0]; musicTrackRef.current = track.id; musicIntensityRef.current = track.energy; setMusicTrack(track.id); setMusicIntensity(track.energy); beat.current = 0; localStorage.setItem("quizforge_music_track", track.id); if (musicTimer.current) { clearTimeout(musicTimer.current); musicTimer.current = null; playMusicBeat(); scheduleMusicBeat(); } };
  const updateMusicContext = useCallback(({ deadline, durationSec, responseCount, participantCount, scoreRatio, status }) => {
    const track = musicTrackMap[musicTrackRef.current] || musicTracks[0]; let next = track.energy;
    if (track.id === "adaptive") { const total = Math.max(1, Number(durationSec) || 20); const remaining = deadline ? Math.max(0, new Date(deadline).getTime() - Date.now()) / 1000 : total; const timePressure = status === "live" ? clamp(1 - remaining / total) : 0; const participation = participantCount ? clamp((responseCount || 0) / participantCount) : 0; next = clamp(.14 + timePressure * .56 + participation * .14 + clamp(scoreRatio || 0) * .16); }
    if (Math.abs(next - musicIntensityRef.current) >= .02) { musicIntensityRef.current = next; setMusicIntensity(next); }
  }, []);
  const handleSessionEvent = useCallback(message => { if (message.type === "question_reveal") pauseMusic(); if (message.type === "question_start" && musicEnabledRef.current) startMusic(); if (message.type === "session_end") { musicEnabledRef.current = false; setMusicEnabled(false); pauseMusic(); } if (message.type === "snapshot" && message.session?.is_revealed) pauseMusic(); }, [pauseMusic, startMusic]);
  useEffect(() => () => { pauseMusic(); audio.current?.close(); audio.current = null; }, [pauseMusic]);
  const unlock = useCallback(() => { if (enabled) context(); }, [enabled]);
  const intensityLabel = musicIntensity < .38 ? "Chill" : musicIntensity < .7 ? "Building" : "Intense";
  return { enabled, toggle, play, unlock, musicEnabled, musicPlaying, musicVolume, musicTrack, musicIntensity, intensityLabel, toggleMusic, changeMusicVolume, changeMusicTrack, updateMusicContext, handleSessionEvent };
}
