import { useState } from "react";
import { authFetch } from "../lib/auth";

export default function DailyReport() {
  const [tasksCompleted, setTasksCompleted] = useState("");
  const [blockers, setBlockers] = useState("");
  const [planForTomorrow, setPlanForTomorrow] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tasksCompleted.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch("/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasksCompleted, blockers, planForTomorrow, link }),
      });
      if (!res.ok) throw new Error("Submit failed");
      setSubmitted(true);
      setTasksCompleted("");
      setBlockers("");
      setPlanForTomorrow("");
      setLink("");
    } catch {
      setError("Couldn't submit your report. Check your connection to the server and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="report-panel">
      <h2>Daily report</h2>
      <p className="section-sub">What did you get done today? Your manager can see today's reports.</p>

      {submitted && (
        <div className="report-success">
          Report submitted for today. You can submit again to update it.
        </div>
      )}

      <form className="report-form" onSubmit={handleSubmit}>
        <label>
          Tasks completed *
          <textarea
            value={tasksCompleted}
            onChange={(e) => {
              setTasksCompleted(e.target.value);
              setSubmitted(false);
            }}
            placeholder="What did you work on today?"
            rows={4}
            required
          />
        </label>
        <label>
          Blockers
          <textarea
            value={blockers}
            onChange={(e) => {
              setBlockers(e.target.value);
              setSubmitted(false);
            }}
            placeholder="Anything holding you up? (optional)"
            rows={2}
          />
        </label>
        <label>
          Plan for tomorrow
          <textarea
            value={planForTomorrow}
            onChange={(e) => {
              setPlanForTomorrow(e.target.value);
              setSubmitted(false);
            }}
            placeholder="What's next? (optional)"
            rows={2}
          />
        </label>
        <label>
          Report link
          <input
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setSubmitted(false);
            }}
            placeholder="Link to a doc, sheet, or deliverable (optional)"
          />
        </label>
        {error && <div className="report-error">{error}</div>}
        <button type="submit" disabled={submitting || !tasksCompleted.trim()}>
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </div>
  );
}
