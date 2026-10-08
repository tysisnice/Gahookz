import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useBackToClose, useScrollLock } from "./history.jsx";

const createPortal = (...args) => window.ReactDOM.createPortal(...args);

// Reporting is how a player tells the host that something in the room is not
// okay. The server stores the report and shows it to the host only; it removes
// nothing by itself. No account is needed: any player who has joined the room
// (a guest included) can report.
export const ReportContext = createContext(null);

export const REPORT_REASONS = Object.freeze([
  { id: "offensive", label: "Offensive or inappropriate" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "spam", label: "Spam or noise" },
  { id: "other", label: "Something else" }
]);

const SUBJECT_LABELS = Object.freeze({
  chat: "chat message",
  answer: "answer",
  question: "question",
  drawing: "drawing",
  room: "room",
  player: "player"
});

export function reasonLabel(reason) {
  return REPORT_REASONS.find((item) => item.id === reason)?.label || "Something else";
}

export function subjectLabel(kind) {
  return SUBJECT_LABELS[kind] || "item";
}

/**
 * A small "Report" control for something another player made. Renders nothing
 * unless the viewer is a joined, non-host player in a room (the host has the
 * removal controls and a reports list instead).
 */
export function ReportButton({ kind, id = "", name = "", className = "" }) {
  const reporter = useContext(ReportContext);
  if (!reporter?.canReport) return null;
  const label = "Report this " + subjectLabel(kind);
  return (
    <button
      className={["report-button", className].filter(Boolean).join(" ")}
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        reporter.openReport({ kind, id, name });
      }}>
      Report
    </button>);
}

export function ReportDialog({ subject, onClose, onSubmit }) {
  const [reason, setReason] = useState("other");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const dialogRef = useRef(null);
  const open = Boolean(subject);
  useScrollLock(open);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    setReason("other");
    setNote("");
    setError("");
    setSent(false);
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose?.();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, subject?.kind, subject?.id, onClose]);

  if (!open) return null;
  const isRoom = subject.kind === "room";
  const what = isRoom ? "this room" : "this " + subjectLabel(subject.kind) + (subject.name ? " from " + subject.name : "");

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await onSubmit({ ...subject, reason, note: note.trim() });
    setBusy(false);
    if (result?.ok) setSent(true);
    else setError(result?.error || "That report could not be sent.");
  };

  return createPortal(
    <div className="rules-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="rules-modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" tabIndex={-1} ref={dialogRef}>
        <header className="rules-modal-header">
          <h2 id="report-title">{sent ? "Report sent" : isRoom ? "Report a problem" : "Report " + what + "?"}</h2>
          <p>{sent ? "The host can see it. Other players are not told who reported." : "This goes to the host, who can remove it. Other players are not told who reported."}</p>
        </header>
        {sent ? null :
        <div className="rules-modal-body report-modal-body">
          <label className="report-field"><span>Reason</span>
            <select value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)}>
              {REPORT_REASONS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="report-field"><span>Details (optional)</span>
            <textarea value={note} disabled={busy} maxLength={200} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Anything the host should know" />
          </label>
          {error ? <p className="report-error" role="alert">{error}</p> : null}
        </div>}
        <footer className="rules-modal-footer">
          {sent ?
          <button className="primary-button" type="button" onClick={onClose}>Done</button> :
          <>
              <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="primary-button" type="button" disabled={busy} onClick={send}>{busy ? "Sending..." : "Send report"}</button>
            </>}
        </footer>
      </section>
    </div>, document.body);
}

// The host's list. Reports the server holds are shown here and nowhere else.
export function HostReportsDialog({ open, reports = [], chatMessages = [], onClose, onDismiss, onRemoveChat }) {
  const dialogRef = useRef(null);
  useScrollLock(open);
  useBackToClose(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose?.();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="rules-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="rules-modal report-modal host-reports-modal" role="dialog" aria-modal="true" aria-labelledby="host-reports-title" tabIndex={-1} ref={dialogRef}>
        <header className="rules-modal-header">
          <h2 id="host-reports-title">Reports</h2>
          <p>Players raised these. Only you can see them. Dismiss one when it is dealt with.</p>
        </header>
        <div className="rules-modal-body">
          {reports.length ? <ul className="host-report-list">
            {reports.map((report) => {
              const message = report.subjectKind === "chat" ? chatMessages.find((item) => item.id === report.subjectId) : null;
              return (
                <li className="host-report" key={report.id}>
                  <strong>{report.subjectKind === "room" ? "Room problem" : "Reported " + subjectLabel(report.subjectKind) + (report.subjectName ? " from " + report.subjectName : "")}</strong>
                  <span>{reasonLabel(report.reason)} · by {report.reporterName}</span>
                  {message ? <q>{message.text}</q> : report.subjectKind === "chat" ? <em>That message is no longer in the chat.</em> : null}
                  {report.note ? <p>{report.note}</p> : null}
                  <div className="host-report-actions">
                    {message ? <button className="secondary-button" type="button" onClick={() => onRemoveChat?.(report, message)}>Remove message</button> : null}
                    <button className="secondary-button" type="button" onClick={() => onDismiss?.(report)}>Dismiss</button>
                  </div>
                </li>);
            })}
          </ul> : <p className="host-report-empty">No open reports.</p>}
        </div>
        <footer className="rules-modal-footer">
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>, document.body);
}
