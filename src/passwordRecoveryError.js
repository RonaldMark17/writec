export function passwordRecoveryError(error, fallback) {
  if (
    error?.code === "over_email_send_rate_limit" ||
    /email rate limit exceeded/i.test(error?.message || "")
  ) {
    return "Password reset emails are temporarily unavailable because the email sending limit has been reached. Please try again later. If this continues, contact support.";
  }
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return "Too many requests. Please wait before requesting another password reset email.";
  }
  return error?.message || fallback;
}
