import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignOutButton, useSignOutConfirmation } from "./SignOutConfirmation";
import { signOutAndExpireToken } from "./supabaseClient";
import ResponsiveNavigation from "./pages/dashboard/ResponsiveNavigation";
jest.mock("./supabaseClient", () => ({supabase:{},signOutAndExpireToken:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();signOutAndExpireToken.mockResolvedValue();});
test("cancel and Escape preserve the session; only confirmation invokes existing logout", async()=>{
 render(<SignOutButton />);
 const trigger=screen.getByRole("button",{name:"Sign out"});
 fireEvent.click(trigger);
 const dialog=await screen.findByRole("dialog",{name:"Sign out of WriteCheck?"});
 expect(signOutAndExpireToken).not.toHaveBeenCalled();
 expect(screen.getByRole("button",{name:"Cancel"})).toHaveFocus();
 fireEvent.keyDown(dialog,{key:"Escape"});
 expect(trigger).toHaveFocus();
 fireEvent.click(trigger); await screen.findByRole("dialog");
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
 expect(signOutAndExpireToken).not.toHaveBeenCalled();
 fireEvent.click(trigger); await screen.findByRole("dialog");
 fireEvent.click(screen.getByRole("button",{name:"Sign Out"}));
 await waitFor(()=>expect(signOutAndExpireToken).toHaveBeenCalledWith("/login", {preserveOnFailure:true}));
});
function Workspace({role}) {
 const {requestSignOut,signOutDialog}=useSignOutConfirmation();
 return <><ResponsiveNavigation label="Menu" current="Classes" profile={{role,full_name:"Juan Dela Cruz",academicTitle:"Prof."}} onSignOut={requestSignOut}><nav><button>Classes</button></nav></ResponsiveNavigation>{signOutDialog}</>;
}
test.each(["student","teacher","admin"])("%s drawer suspends before confirmation and keeps Sign out last",async role=>{
 render(<Workspace role={role}/>);
 fireEvent.click(screen.getByRole("button",{name:"Menu Classes"}));
 expect(screen.getByText("Prof. Juan Dela Cruz")).toBeInTheDocument();
 const buttons=screen.getByRole("dialog").querySelectorAll("button");
 expect(buttons[buttons.length-1]).toHaveTextContent("Sign out");
 fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
 await screen.findByRole("dialog",{name:"Sign out of WriteCheck?"});
 expect(screen.queryByRole("dialog",{name:"Menu navigation"})).not.toBeInTheDocument();
 expect(signOutAndExpireToken).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
 expect(document.body.style.overflow).toBe("");
});

test("repeated confirmation sends one request; failure keeps dialog open and permits retry", async () => {
 let reject;
 signOutAndExpireToken.mockImplementationOnce(() => new Promise((_resolve, fail) => {reject=fail;}));
 render(<SignOutButton />);
 fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
 const dialog=await screen.findByRole("dialog");
 const confirm=screen.getByRole("button",{name:"Sign Out"});
 fireEvent.click(confirm); fireEvent.click(confirm);
 expect(signOutAndExpireToken).toHaveBeenCalledTimes(1);
 expect(screen.getByRole("button",{name:"Signing out..."})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
 fireEvent.keyDown(dialog,{key:"Escape"});
 expect(dialog).toBeInTheDocument();
 await act(async () => reject(new Error("Unavailable")));
 expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
 expect(screen.getByRole("button",{name:"Sign Out"})).toBeEnabled();
 await act(async () => fireEvent.click(screen.getByRole("button",{name:"Sign Out"})));
 expect(signOutAndExpireToken).toHaveBeenCalledTimes(2);
});

test("confirmation traps keyboard focus and shared action has a decorative icon", async () => {
 render(<SignOutButton />);
 expect(screen.getByRole("button",{name:"Sign out"}).querySelector("svg")).toHaveAttribute("aria-hidden","true");
 fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
 const dialog=await screen.findByRole("dialog");
 const cancel=screen.getByRole("button",{name:"Cancel"});
 fireEvent.keyDown(cancel,{key:"Tab",shiftKey:true});
 expect(screen.getByRole("button",{name:"Sign Out"})).toHaveFocus();
 fireEvent.keyDown(dialog,{key:"Tab"});
 expect(cancel).toHaveFocus();
});
