import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

import {
  fetchAllRemoteExpenses,
  listLocalExpenses,
  mergeExpenseEntries,
  subscribeToExpenseChanges,
  type ExpenseEntry,
} from "../services/expenses";

type LoadOptions = {
  refreshing?: boolean;
  silent?: boolean;
};

export function useExpenseData() {
  const [transactions, setTransactions] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTransactions = useCallback(async (options?: LoadOptions) => {
    if (options?.refreshing) {
      setRefreshing(true);
    } else if (!options?.silent) {
      setLoading(true);
    }

    try {
      setError("");
      const local = await listLocalExpenses();
      setTransactions(local);

      try {
        const remote = await fetchAllRemoteExpenses(100);
        setTransactions(mergeExpenseEntries(local, remote.data));
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message}. Showing transactions saved on this device.`
            : "Unable to load cloud transactions. Showing transactions saved on this device.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load transactions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTransactions();
      const subscription = subscribeToExpenseChanges(() => {
        void loadTransactions({ silent: true });
      });
      const appStateSubscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          void loadTransactions({ silent: true });
        }
      });

      return () => {
        subscription.remove();
        appStateSubscription.remove();
      };
    }, [loadTransactions]),
  );

  return {
    error,
    loading,
    loadTransactions,
    refreshing,
    transactions,
  };
}
