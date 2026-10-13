import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useClassroomArchiveSync } from "./useClassroomArchiveSync";
import { supabase } from "../../supabaseClient";
jest.mock("../../supabaseClient", () => ({ supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));

test("realtime and focus reconciliation update names while preserving classroom metadata", async () => {
  let receive;
  const channel = { on: (_, __, callback) => { receive = callback; return channel; }, subscribe: () => channel };
  supabase.channel.mockReturnValue(channel);
  const select = jest.fn(() => ({ in: async () => ({ data: [{ id: "c", classroom_name: "Persisted name", is_archived: false }] }) }));
  supabase.from.mockReturnValue({ select });
  function Classroom() {
    const [classes, setClasses] = useState([{ id: "c", name: "Old", code: "ABC123", isArchived: true }]);
    useClassroomArchiveSync(classes, setClasses);
    return <output>{JSON.stringify(classes[0])}</output>;
  }
  render(<Classroom />);
  act(() => receive({ new: { id: "c", classroom_name: "Renamed" } }));
  expect(JSON.parse(screen.getByRole("status").textContent)).toEqual({ id: "c", name: "Renamed", code: "ABC123", isArchived: true });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Persisted name"));
  expect(select).toHaveBeenCalledWith("id, is_archived, classroom_name");
});
