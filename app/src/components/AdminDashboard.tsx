import { useEffect, useState } from "react";
import { authFetch, Staff } from "../lib/auth";

type Stats = {
  totalStaff: number;
  onlineCount: number;
  reportsToday: number;
  reportsReviewed: number;
};

type ActivityEntry = {
  id: string;
  type: string;
  detail: Record<string, any>;
  at: string;
};

type Scorecard = {
  staffId: string;
  name: string;
  department: string;
  expectedDays: number;
  submittedDays: number;
  missedDays: number;
  punctualityPct: number;
  currentStreak: number;
  submittedToday: boolean;
};

type Report = {
  id: string;
  authorName: string;
  department: string;
  tasksCompleted: string;
  blockers: string;
  planForTomorrow: string;
  link: string;
  date: string;
  submittedAt: string;
  status: "new" | "reviewed";
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function describeActivity(entry: ActivityEntry): string {
  const d = entry.detail || {};
  switch (entry.type) {
    case "login":
      return `${d.name} logged in`;
    case "presence:online":
      return `${d.name} came online`;
    case "presence:offline":
      return `${d.name} went offline`;
    case "ring:sent":
      return `${d.from} rang a colleague`;
    case "ring:acknowledged":
      return `${d.name} acknowledged a ring`;
    case "call:started":
      return `${d.from} started a call`;
    case "call:accepted":
      return `${d.name} answered a call`;
    case "group-call:started":
      return `${d.from} started a group call (${d.count} invited)`;
    case "report:submitted":
      return `${d.name} submitted a daily report`;
    case "file:shared":
      return `${d.name} shared "${d.fileName}"`;
    case "staff:created":
      return `${d.by} created an account for ${d.name}`;
    default:
      return entry.type;
  }
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<"overview" | "reports" | "scorecards" | "staff" | "departments">("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportDate, setReportDate] = useState(todayISO());
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  function loadOverview() {
    authFetch("/admin/stats").then((r) => r.json()).then(setStats).catch(() => {});
    authFetch("/admin/activity").then((r) => r.json()).then(setActivity).catch(() => {});
  }

  function loadReports(date: string) {
    authFetch(`/reports?date=${date}`).then((r) => r.json()).then(setReports).catch(() => {});
  }

  function loadScorecards() {
    authFetch("/admin/scorecards").then((r) => r.json()).then(setScorecards).catch(() => {});
  }

  function loadStaff() {
    authFetch("/auth/staff").then((r) => r.json()).then(setStaff).catch(() => {});
  }

  function loadDepartments() {
    authFetch("/departments").then((r) => r.json()).then(setDepartments).catch(() => {});
  }

  useEffect(() => {
    loadOverview();
    loadDepartments();
  }, []);

  useEffect(() => {
    if (tab === "reports") loadReports(reportDate);
    if (tab === "staff") loadStaff();
    if (tab === "scorecards") loadScorecards();
  }, [tab, reportDate]);

  async function markReportStatus(id: string, status: "new" | "reviewed") {
    await authFetch(`/reports/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadReports(reportDate);
  }

  return (
    <div className="admin-dashboard">
      <div className="tab-bar">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>
          Reports
        </button>
        <button className={tab === "scorecards" ? "active" : ""} onClick={() => setTab("scorecards")}>
          Scorecards
        </button>
        <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}>
          Staff
        </button>
        <button className={tab === "departments" ? "active" : ""} onClick={() => setTab("departments")}>
          Departments
        </button>
      </div>

      {tab === "overview" && (
        <div>
          {stats && (
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-value">{stats.onlineCount}</span>
                <span className="stat-label">Online now</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{stats.totalStaff}</span>
                <span className="stat-label">Total staff</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{stats.reportsToday}</span>
                <span className="stat-label">Reports today</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{stats.reportsReviewed}</span>
                <span className="stat-label">Reviewed today</span>
              </div>
            </div>
          )}
          <h3 className="section-heading">Recent activity</h3>
          <ul className="activity-list">
            {activity.length === 0 && <p className="empty">No activity yet.</p>}
            {activity.map((entry) => (
              <li key={entry.id} className="activity-item">
                <span>{describeActivity(entry)}</span>
                <span className="meta">{new Date(entry.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "reports" && (
        <div>
          <div className="admin-reports-header">
            <h2>Daily reports</h2>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          {reports.length === 0 && <p className="empty">No reports submitted for this date.</p>}
          <ul className="report-list">
            {reports.map((r) => (
              <li key={r.id} className="report-card">
                <div className="report-card-header">
                  <strong>
                    {r.authorName} <span className="meta">· {r.department}</span>
                  </strong>
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
                {r.link && (
                  <div className="report-field">
                    <span className="report-label">Link</span>
                    <p>
                      <a href={r.link} target="_blank" rel="noreferrer">
                        {r.link}
                      </a>
                    </p>
                  </div>
                )}
                <div className="report-status-row">
                  <span className={`badge ${r.status === "reviewed" ? "reviewed" : ""}`}>{r.status}</span>
                  {r.status === "new" ? (
                    <button onClick={() => markReportStatus(r.id, "reviewed")}>Mark reviewed</button>
                  ) : (
                    <button onClick={() => markReportStatus(r.id, "new")}>Mark unreviewed</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "scorecards" && (
        <div>
          <h2>Punctuality scorecards</h2>
          <p className="section-sub">
            Daily-report consistency over the last 30 weekdays (or since the account was created, if newer).
          </p>
          {scorecards.length === 0 && <p className="empty">No staff accounts yet.</p>}
          <ul className="report-list">
            {scorecards.map((sc) => (
              <li key={sc.staffId} className="report-card">
                <div className="report-card-header">
                  <strong>
                    {sc.name} <span className="meta">· {sc.department}</span>
                  </strong>
                  <span className={`badge ${sc.submittedToday ? "reviewed" : ""}`}>
                    {sc.submittedToday ? "submitted today" : "no report today yet"}
                  </span>
                </div>
                <div className="scorecard-stats">
                  <div className="stat-tile">
                    <span className="stat-value">{sc.punctualityPct}%</span>
                    <span className="stat-label">On-time rate</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-value">{sc.currentStreak}</span>
                    <span className="stat-label">Current streak</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-value">{sc.missedDays}</span>
                    <span className="stat-label">Missed days</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-value">
                      {sc.submittedDays}/{sc.expectedDays}
                    </span>
                    <span className="stat-label">Days submitted</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "staff" && <StaffManager staff={staff} departments={departments} onChange={loadStaff} />}

      {tab === "departments" && <DepartmentManager departments={departments} onChange={loadDepartments} />}
    </div>
  );
}

function StaffManager({
  staff,
  departments,
  onChange,
}: {
  staff: Staff[];
  departments: string[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState(departments[0] || "");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch("/auth/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, department, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create account");
      }
      setUsername("");
      setPassword("");
      setDisplayName("");
      setShowForm(false);
      onChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await authFetch(`/auth/staff/${id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div>
      <div className="admin-reports-header">
        <h2>Staff accounts</h2>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add staff"}</button>
      </div>

      {showForm && (
        <form className="report-form staff-form" onSubmit={handleCreate}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {error && <div className="report-error">{error}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <ul className="staff-list">
        {staff.map((s) => (
          <li key={s.id} className="staff-row">
            <div>
              <strong>{s.displayName}</strong> <span className="meta">@{s.username}</span>
              <div className="meta">
                {s.department} · {s.role}
              </div>
            </div>
            <button className="danger" onClick={() => handleDelete(s.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepartmentManager({ departments, onChange }: { departments: string[]; onChange: () => void }) {
  const [name, setName] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await authFetch("/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setName("");
    onChange();
  }

  async function handleRemove(dept: string) {
    await authFetch(`/departments/${encodeURIComponent(dept)}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div>
      <h2>Departments</h2>
      <form className="admin-gate-form" onSubmit={handleAdd}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department name" />
        <button type="submit">Add</button>
      </form>
      <ul className="staff-list">
        {departments.map((d) => (
          <li key={d} className="staff-row">
            <strong>{d}</strong>
            <button className="danger" onClick={() => handleRemove(d)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
