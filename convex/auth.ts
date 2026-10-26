import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { Recovery, passwordRequirements } from "./recovery";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({ validatePasswordRequirements: passwordRequirements }),
    Recovery,
  ],
});
