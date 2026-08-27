import { useState } from "react";
import { getServerUrl } from "../lib/socket";

type Report = {
  id: string;
  authorName: string;
  tasksCompleted: string;
  blockers: string;
  planForTomorrow: string;
  date: string;
  submittedAt: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminReports() {
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReports(adminCode: string, forDate: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getServerUrl()}/reports?date=${forDate}`, {
        headers: { "x-admin-code": adminCode },
      });
      if (res.status === 401) {
        setUnlocked(false);
        setError("Incorrect admin code.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      setReports(await res.json());
      setUnlocked(true);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    loadReports(code, date);
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    loadReports(code, newDate);
  }

  if (!unlocked) {
    return (
      <div className="admin-gate">
        <h2>Admin reports</h2>
        <p className="section-sub">Enter the admin code to view today's submitted reports.</p>
        <form onSubmit={handleUnlock} className="admin-gate-form">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Admin code"
            autoFocus
          />
          <button type="submit" disabled={loading || !code}>
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
        {error && <div className="report-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="admin-reports">
      <div className="admin-reports-header">
        <h2>Daily reports</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
        />
      </div>
      {loading && <p className="empty">Loading…</p>}
      {!loading && reports.length === 0 && <p className="empty">No reports submitted for this date.</p>}
      <ul className="report-list">
        {reports.map((r) => (
          <li key={r.id} className="report-card">
            <div className="report-card-header">
              <strong>{r.authorName}</strong>
              <span className="meta">{new Date(r.submittedAt).toLocaleTimeString()}</span>
            </div>
            <div className="report-field">
              <span className="report-label">Tasks completed</span>
              <p>{r.tasksCompleted}</p>
            </div>
            {r.blockers && (
              <div className="report-field">
                <span className="report-label">Blockers</span>
                <p>{r.blockers}</p>
              </div>
            )}
            {r.planForTomorrow && (
              <div className="report-field">
                <span className="report-label">Plan for tomorrow</span>
                <p>{r.planForTomorrow}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
