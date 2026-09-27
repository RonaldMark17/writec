// Bound account verification even if the auth client stalls before starting fetch.
export async function accountRequest(buildRequest, timeoutMs = 12000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => buildRequest(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Account verification took too long. Check your connection and click Retry."));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
