// Path segment for POST "submit report" (prod default: submit-report). Staging Amplify can set VITE_REPORT_SUBMIT_PATH.
export function getReportSubmitPath(): string {
  const raw = import.meta.env.VITE_REPORT_SUBMIT_PATH?.trim()
  if (!raw) return 'submit-report'
  const seg = raw.replace(/^\/+/, '').split('/')[0] ?? ''
  if (!/^[a-zA-Z0-9_-]+$/.test(seg)) return 'submit-report'
  return seg
}
