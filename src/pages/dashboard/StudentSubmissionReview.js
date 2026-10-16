import StudentReviewDialog from "./StudentReviewDialog";
import SubmissionFilePreview from "./SubmissionFilePreview";
import StudentSimilarity from "./StudentSimilarity";
import AssignmentComments from "./AssignmentComments";
import { formatDateTime } from "./shared";
import "./studentSubmission.css";

export function submissionStatus(submission) {
  if (submission.revisionRequest) return "Resubmission Requested";
  if (submission.returnedAt) return "Returned";
  if (submission.revisionHistory?.some(entry => entry.completed_at)) return "Resubmitted";
  return "Submitted";
}

export function StudentSubmissionContent({ submission: s, profile, onResubmit, showComments = true }) {
  const status = submissionStatus(s);
  const graded = s.returnedAt && String(s.grade ?? "").trim() !== "";
  return <div className="student-review-content">
    <section className="student-review-summary" aria-label="Submission summary">
      <div><p className="student-review-label">Submission</p>
        <span className={`student-status ${s.revisionRequest ? "revision" : s.returnedAt ? "returned" : "submitted"}`}>{status}</span>
        <p className="student-review-muted">{formatDateTime(s.createdAt)}</p>
      </div>
      <div><p className="student-review-label">Teacher review</p>
        <p>{s.revisionRequest ? "Updated work requested" : s.returnedAt ? "Review returned" : "Awaiting teacher review"}</p>
      </div>
      <div><h3>{graded ? "Your Grade" : "Grade"}</h3>
        {graded ? <p className="student-review-grade">{s.grade}</p>
          : <p>{s.returnedAt ? "Returned without a grade" : "Not graded yet"}</p>}
      </div>
    </section>
    {(s.revisionRequest?.message || (s.returnedAt && s.feedback)) ? <section className="student-review-feedback" aria-label="Teacher feedback">
      <h3>Teacher Feedback</h3>
      <p className="student-feedback">{s.revisionRequest?.message || s.feedback}</p>
      {s.revisionRequest?.message && s.returnedAt && s.feedback && s.feedback !== s.revisionRequest.message && <p className="student-feedback">{s.feedback}</p>}
    </section> : <p className="student-review-muted">No teacher feedback yet.</p>}
    {onResubmit && <section className="student-review-action" aria-label="Resubmission">
      <p>{s.revisionRequest ? "Update your work using your teacher’s feedback. Your earlier submission will be preserved." : "You can upload your work again."}</p>
      <button type="button" className="student-review-primary" onClick={onResubmit}>Resubmit Work</button>
    </section>}
    <section className="student-review-work" aria-label="Your Submission">
      <h3>Your Submission</h3>
      <SubmissionFilePreview key={s.fileUrl || s.id} fileUrl={s.fileUrl} originalsOnly studentReview />
    </section>
    <StudentSimilarity submission={s} />
    <details className="student-review-card"><summary>Submission details</summary>
      {s.essayTitle && s.essayTitle !== s.assignmentTitle && <p className="student-review-title">{s.essayTitle}</p>}
      <dl className="student-review-details"><div><dt>Submitted</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
        {s.returnedAt && <div><dt>Returned</dt><dd>{formatDateTime(s.returnedAt)}</dd></div>}</dl>
      {s.transcribedText && <><h3>Submitted text</h3><p className="student-feedback">{s.transcribedText}</p></>}
    </details>
    {!!s.revisionHistory?.length && <details className="student-review-card"><summary>Submission history</summary>
      <ol className="student-review-history">{s.revisionHistory.map((entry, index) => <li key={entry.id || index}>
        <p>Resubmission requested · {formatDateTime(entry.requested_at)}</p><p className="student-feedback">{entry.message}</p>
        {entry.completed_at && <p>Resubmitted · {formatDateTime(entry.completed_at)}</p>}
        <details><summary>Earlier submission {index + 1}{entry.essay_title ? `: ${entry.essay_title}` : ""}</summary>
          <SubmissionFilePreview fileUrl={entry.file_url} originalsOnly studentReview />
        </details>
      </li>)}</ol>
    </details>}
    {showComments && s.assignmentId && s.classroomId && <details className="student-review-card"><summary>Class and private comments</summary>
      <AssignmentComments assignmentId={s.assignmentId} classroomId={s.classroomId} profile={profile} />
    </details>}
  </div>;
}

export default function StudentSubmissionReview({ submission, onClose, ...props }) {
  return <StudentReviewDialog title={submission.assignmentTitle || "Submitted assignment"} onClose={onClose}>
    <p className="student-review-metadata">{[...new Set([submission.classroomName, submission.classroomSubject].filter(Boolean))].join(" / ")}<br />Due: {submission.dueDate ? formatDateTime(submission.dueDate) : "No due date"}</p>
    <StudentSubmissionContent submission={submission} {...props} />
  </StudentReviewDialog>;
}
