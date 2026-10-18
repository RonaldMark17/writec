import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteAssignmentDialog from "./DeleteAssignmentDialog";
import { supabase } from "../../supabaseClient";
jest.mock("../../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));
const assignment = {id:"a", classroomId:"c", title:"Essay A", classroomName:"CSST101", classroomSection:"3IS1"};
const preview = {...assignment, students:27,submissions:22,graded:18,comments:4};
let onClose, onDeleted;
beforeEach(() => {
  onClose=jest.fn(); onDeleted=jest.fn(async()=>{});
  supabase.rpc.mockReset().mockResolvedValue({data:preview});
});
async function setup() {
  render(<DeleteAssignmentDialog assignment={assignment} onClose={onClose} onDeleted={onDeleted} />);
  await waitFor(()=>expect(screen.getByRole("textbox")).toBeEnabled());
}
function confirm() {
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"Essay A"}});
  fireEvent.click(screen.getByRole("checkbox"));
}
const finalButton=()=>screen.getByRole("button",{name:"Permanently delete assignment"});
const deletes=()=>supabase.rpc.mock.calls.filter(([name])=>name==="delete_assignment_confirmed");
test("safe initial focus, details, empty title, partial/case mismatch, and both confirmations",async()=>{
  await setup();
  expect(screen.getByRole("button",{name:"Cancel"})).toHaveFocus();
  expect(screen.getByText(/27 enrolled students/)).toHaveTextContent("22 submissions · 18 graded submissions · 4 comments");
  expect(finalButton()).toBeDisabled();
  if (process.env.WC_CAPTURE_DIR) {
    const fs = require("fs"), path = require("path");
    fs.mkdirSync(process.env.WC_CAPTURE_DIR, {recursive:true});
    fs.writeFileSync(path.join(process.env.WC_CAPTURE_DIR,"assignment-delete.body.html"), document.body.innerHTML);
  }
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"Essay A"}});
  expect(finalButton()).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(finalButton()).toBeEnabled();
  for (const value of ["", "DELETE", "yes", "Essay", "essay a", "CSST101"]) {
    fireEvent.change(screen.getByRole("textbox"),{target:{value}});
    expect(finalButton()).toBeDisabled();
  }
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"  Essay A  "}});
  expect(finalButton()).toBeEnabled();
  expect(deletes()).toHaveLength(0);
});
test("Enter never deletes even after confirmation; outside click and Escape are safe",async()=>{
  await setup();
  screen.getByRole("textbox").focus(); userEvent.keyboard("{Enter}");
  confirm();
  finalButton().focus(); userEvent.keyboard("{Enter}");
  fireEvent.click(screen.getByRole("dialog").parentElement);
  expect(deletes()).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDeleted).not.toHaveBeenCalled();
});
test("Tab stays in dialog and Cancel never submits",async()=>{
  await setup();
  fireEvent.keyDown(screen.getByRole("button",{name:"Cancel"}),{key:"Tab"});
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("textbox"),{key:"Tab",shiftKey:true});
  expect(screen.getByRole("button",{name:"Cancel"})).toHaveFocus();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  expect(onClose).toHaveBeenCalledTimes(1); expect(deletes()).toHaveLength(0);
});
test("one final confirmed request, disabled controls, no duplicate click, server confirmation before success",async()=>{
  await setup(); confirm();
  let finish;
  supabase.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  fireEvent.click(finalButton()); fireEvent.click(finalButton());
  expect(deletes()).toHaveLength(1);
  expect(deletes()[0][1]).toEqual({assignment_key:"a",classroom_key:"c",confirmation_title:"Essay A",acknowledged:true});
  expect(screen.getByText("Deleting assignment…")).toBeInTheDocument();
  expect(finalButton()).toBeDisabled(); expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("checkbox")).toBeDisabled(); expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
  expect(onClose).not.toHaveBeenCalled(); expect(onDeleted).not.toHaveBeenCalled();
  await act(async()=>finish({data:{deleted:true,id:"a",classroomId:"c"}}));
  expect(onDeleted).toHaveBeenCalledWith({deleted:true,id:"a",classroomId:"c"});
});
test.each([{error:{message:"Access denied"}}, {data:{deleted:false}}, {data:{deleted:true,id:"other",classroomId:"c"}}])("failure retains dialog and restores controls: %j",async response=>{
  await setup(); confirm(); supabase.rpc.mockResolvedValue(response);
  fireEvent.click(finalButton());
  await screen.findByRole("alert");
  expect(onDeleted).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  expect(finalButton()).toBeEnabled(); expect(screen.getByRole("textbox")).toHaveValue("Essay A");
});
test("preview errors disable deletion and allow verification retry",async()=>{
  supabase.rpc.mockResolvedValue({error:{message:"Unavailable"}});
  render(<DeleteAssignmentDialog assignment={assignment} onClose={onClose} onDeleted={onDeleted}/>);
  await screen.findByRole("alert");
  expect(finalButton()).toBeDisabled();
  supabase.rpc.mockResolvedValue({data:preview});
  fireEvent.click(screen.getByRole("button",{name:"Retry verification"}));
  await waitFor(()=>expect(screen.getByRole("textbox")).toBeEnabled());
  expect(finalButton()).toBeDisabled(); expect(deletes()).toHaveLength(0);
});
