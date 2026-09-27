import { accountRequest } from "./accountRequest";

test("returns successful account verification and clears its timer", async () => {
  jest.useFakeTimers();
  await expect(accountRequest(() => Promise.resolve({ data: { id: "user" } }))).resolves.toEqual({ data: { id: "user" } });
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test("stalled verification times out and aborts the request", async () => {
  jest.useFakeTimers();
  let signal;
  const pending = accountRequest((value) => { signal = value; return new Promise(() => {}); });
  const assertion = expect(pending).rejects.toThrow("Account verification took too long");
  await Promise.resolve();
  jest.advanceTimersByTime(12000);
  await assertion;
  expect(signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
