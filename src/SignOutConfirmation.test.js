import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 await waitFor(()=>expect(signOutAndExpireToken).toHaveBeenCalledWith("/login"));
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
