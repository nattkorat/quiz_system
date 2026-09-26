import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, Check, Download, FilePlus2, GraduationCap, Users } from "lucide-react";
import { api, downloadExport } from "../../api";
import { questionTypeLabels } from "../../shared/constants";
import { Button, ErrorBox, Loader, Pagination, Shell } from "../../shared/ui";
import { Leaderboard } from "../live/components";

export function ResultsPage() {
  const { sessionId } = useParams(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [questionPage, setQuestionPage] = useState(1); const [leaderPage, setLeaderPage] = useState(1);
  const questionPageSize = 5; const leaderPageSize = 10;
  useEffect(() => { api(`/sessions/${sessionId}/statistics`).then(setData).catch(requestError => setError(requestError.message)); }, [sessionId]);
  const exportFile = async format => { try { await downloadExport(sessionId, format); } catch (requestError) { setError(requestError.message); } };
  if (!data) return <Shell><ErrorBox error={error} />{!error && <Loader label="Building session statistics…" />}</Shell>;
  return <Shell><button className="back-link" onClick={() => navigate("/dashboard")}><ArrowLeft />Back to library</button><div className="results-heading"><div><p className="eyebrow">RESULT PREVIEW · PIN {data.session.pin}</p><h1>{data.session.quiz_title}</h1><p>Hosted by {data.session.host.name}{data.session.course_tag ? ` · ${data.session.course_tag}` : ""}</p></div><div className="result-export"><Button variant="ghost" onClick={() => exportFile("csv")}><Download />CSV</Button><Button onClick={() => exportFile("xlsx")}><Download />Export XLSX</Button></div></div><ErrorBox error={error} /><div className="summary-grid"><article><Users /><span>Participants</span><b>{data.summary.participants}</b></article><article><FilePlus2 /><span>Questions</span><b>{data.summary.questions}</b></article><article><Check /><span>Average accuracy</span><b>{data.summary.average_accuracy}%</b></article><article><BarChart3 /><span>Average score</span><b>{data.summary.average_score.toLocaleString()}</b></article></div><div className="results-layout"><section className="panel results-panel"><div className="section-title"><div><p className="eyebrow">QUESTION ANALYSIS</p><h2>Class response</h2></div><BarChart3 /></div><div className="question-stats">{data.questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize).map((question, pageIndex) => { const questionIndex = (questionPage - 1) * questionPageSize + pageIndex; return <article key={question.id}><div className="question-stat-head"><span>{String(questionIndex + 1).padStart(2, "0")}</span><div><h3>{question.text}</h3><p>{questionTypeLabels[question.type]} · {question.response_count} responses · {question.correct_rate}% correct</p></div></div><QuestionStatistics question={question} /></article>; })}</div><Pagination page={questionPage} onPageChange={setQuestionPage} total={data.questions.length} pageSize={questionPageSize} label="questions" /></section><aside className="panel results-panel leaderboard-panel"><div className="section-title"><div><p className="eyebrow">LEADERBOARD</p><h2>Final ranking</h2></div><GraduationCap /></div><Leaderboard rows={data.leaderboard.slice((leaderPage - 1) * leaderPageSize, leaderPage * leaderPageSize)} /><Pagination page={leaderPage} onPageChange={setLeaderPage} total={data.leaderboard.length} pageSize={leaderPageSize} label="players" /></aside></div></Shell>;
}

function QuestionStatistics({ question }) {
  if (question.type === "order") return <div className="stat-solution order">{question.options.map((option, index) => <div key={index}><span>{index + 1}</span><strong>{option}</strong></div>)}</div>;
  if (question.type === "matching") return <div className="stat-solution matching">{question.options.map((left, index) => <div key={index}><strong>{left}</strong><ArrowRight /><span>{question.match_options?.[index]}</span></div>)}</div>;
  return <div className="stat-options">{question.options.map((option, index) => { const count = question.distribution[index] || 0; const max = Math.max(1, ...question.distribution); const correct = question.correct_options.includes(index); return <div className={correct ? "correct" : ""} key={index}><span>{String.fromCharCode(65 + index)}</span><p>{option}{correct && <small>Correct</small>}</p><i><b style={{ width: `${count / max * 100}%` }} /></i><strong>{count}</strong></div>; })}</div>;
}
