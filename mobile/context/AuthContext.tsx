import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { loginExpenseUser } from "../services/api";
import {
  clearExpenseSession,
  getExpenseSession,
  saveExpenseSession,
  setActiveExpenseUserId,
  type ExpenseSession,
} from "../services/auth";

type AuthContextValue = {
  ready: boolean;
  session: ExpenseSession | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ExpenseSession | null>(null);

  useEffect(() => {
    void getExpenseSession()
      .then(async (storedSession) => {
        setSession(storedSession);
        if (storedSession) {
          await setActiveExpenseUserId(storedSession.user.id);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      signIn: async (username, password) => {
        const response = await loginExpenseUser(username, password);
        const nextSession: ExpenseSession = {
          token: response.token,
          user: response.user,
        };
        await saveExpenseSession(nextSession);
        setSession(nextSession);
      },
      signOut: async () => {
        await clearExpenseSession();
        setSession(null);
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
};
