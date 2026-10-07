import { APIError } from "better-auth/api";

export const deniedSignIn = () => new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
export function accountBlockHooks(checkUser: (id: string) => Promise<boolean>, checkEmail: (email: string) => Promise<boolean>, acceptSession: (userId: string, sessionId: string) => Promise<boolean>) {
  return {
    // Better Auth turns a forbidden create into its generic duplicate-signup response
    // when verification is required, without revealing whether this email is blocked.
    user: { create: { before: async (user: { email: string }) => {
      if (await checkEmail(user.email)) throw new APIError("FORBIDDEN", { code: "ACCOUNT_CREATION_UNAVAILABLE", message: "Unable to create account." });
    } } },
    session: { create: {
      before: async (session: { userId: string }) => { if (await checkUser(session.userId)) throw deniedSignIn(); },
      after: async (session: { userId: string; id: string }) => { if (!await acceptSession(session.userId, session.id)) throw deniedSignIn(); },
    } },
  };
}
