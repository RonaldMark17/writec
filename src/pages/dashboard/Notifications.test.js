import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { NotificationBell, NotificationsPage, useNotifications } from "./Notifications";
import { supabase } from "../../supabaseClient";

jest.mock("../../supabaseClient", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
const row = { id: "n1", type: "resubmission_requested", title: "Resubmission requested", message: "Action required: revise Essay A.",
  classroom_id: "c1", assignment_id: "a1", submission_id: "s1", metadata: { classroom_name: "English" }, is_read: false, created_at: "2026-10-14T01:00:00Z" };
let calls, response;
function model(extra = {}) { return { userId: "student", unread: 3, version: 0, refresh: jest.fn(), markRead: jest.fn().mockResolvedValue(), ...extra }; }
beforeEach(() => {
  jest.clearAllMocks(); calls = []; response = { data: [row], count: 1 };
  supabase.from.mockImplementation(table => {
    const query = { then: (resolve, reject) => Promise.resolve(response).then(resolve, reject) };
    ["select", "eq", "in", "order", "range"].forEach(method => { query[method] = (...args) => { calls.push([table, method, ...args]); return query; }; });
    return query;
  });
  supabase.rpc.mockResolvedValue({ data: 1 });
});

test("bell count, keyboard dismissal and exact destination read acknowledgement", async () => {
  const state = model({ unread: 12 }); const navigate = jest.fn(); const open = jest.fn().mockResolvedValue(navigate);
  render(<NotificationBell model={state} onOpen={open} onViewAll={jest.fn()} />);
  const bell = screen.getByRole("button", { name: "Notifications, 12 unread" });
  expect(screen.getByText("9+")).toBeInTheDocument();
  fireEvent.click(bell);
  await screen.findByText(row.title);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(bell).toHaveFocus();
  expect(screen.queryByText(row.title)).not.toBeInTheDocument();
  fireEvent.click(bell);
  fireEvent.click(await screen.findByRole("button", { name: /Resubmission requested Action required/ }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(open).toHaveBeenCalledWith(row);
  expect(state.markRead).toHaveBeenCalledWith("n1");
  expect(state.markRead.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
});

test("failed read keeps notification open, displays retryable error, and does not navigate", async () => {
  const navigate = jest.fn();
  const state = model({ markRead: jest.fn().mockRejectedValue(new Error("Could not mark notifications as read. Please retry.")) });
  render(<NotificationBell model={state} onOpen={async () => navigate} onViewAll={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Notifications, 3 unread/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Resubmission requested Action required/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not mark");
  expect(navigate).not.toHaveBeenCalled();
});

test("view all, desktop columns, server pagination and filters resetting to page one", async () => {
  response = { data: [row], count: 45 };
  render(<NotificationsPage model={model()} onOpen={jest.fn()} />);
  await screen.findByText(row.message);
  expect(screen.getAllByRole("columnheader").map(e => e.textContent)).toEqual(["Type", "Classroom", "Notification", "Date/Time", "Status", "Action"]);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(calls).toContainEqual(["notifications", "range", 20, 39]));
  fireEvent.click(screen.getByRole("button", { name: "Unread" }));
  await waitFor(() => expect(calls).toContainEqual(["notifications", "eq", "is_read", false]));
  expect(calls[calls.length - 1]).toEqual(["notifications", "range", 0, 19]);
  expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
});

test("mark all read, local error recovery, and empty state", async () => {
  const state = model();
  response = { error: { message: "offline" } };
  render(<NotificationsPage model={state} onOpen={jest.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Notifications could not be loaded");
  response = { data: [], count: 0 };
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No notifications yet");
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() => expect(state.markRead).toHaveBeenCalledWith());
});

test("quiet count uses HEAD, refreshes on focus, and uses the protected read RPC", async () => {
  response = { count: 7 };
  const { result, unmount } = renderHook(() => useNotifications("student"));
  await waitFor(() => expect(result.current.unread).toBe(7));
  expect(calls).toContainEqual(["notifications", "select", "id", { count: "exact", head: true }]);
  expect(calls).toContainEqual(["notifications", "eq", "recipient_user_id", "student"]);
  response = { count: 8 };
  fireEvent.focus(window);
  expect(result.current.unread).toBe(7);
  await waitFor(() => expect(result.current.unread).toBe(8));
  await act(async () => { await result.current.markRead("n1"); });
  expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_read", { notification_key: "n1" });
  const count = supabase.from.mock.calls.length;
  unmount(); fireEvent.focus(window);
  expect(supabase.from).toHaveBeenCalledTimes(count);
});

 test.each(["student_class_comment", "student_private_comment"])("comment type %s is categorized and opens safely", async type => {
  const item = { ...row, type, title: type === "student_class_comment" ? "New class comment" : "New private comment", submission_id: null };
  response = { data: [item], count: 1 };
  const state = model(); const navigate = jest.fn(); const open = jest.fn().mockResolvedValue(navigate);
  render(<NotificationsPage model={state} onOpen={open} />);
  await screen.findByText(type === "student_class_comment" ? "Class Comment" : "Private Comment");
  fireEvent.click(screen.getByRole("button", { name: "Comments" }));
  await waitFor(() => expect(calls).toContainEqual(["notifications", "in", "type", ["student_class_comment", "student_private_comment"]]));
  fireEvent.click(await screen.findByRole("button", { name: "View comments" }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(open).toHaveBeenCalledWith(item);
  expect(state.markRead).toHaveBeenCalledWith(item.id);
});
