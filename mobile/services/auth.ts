import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { NativeModules, Platform } from "react-native";

export type ExpenseSession = {
  token: string;
  user: {
    id: string;
    username: string;
  };
};

const SESSION_KEY = "memonest.expense.session";

const nativeModule = NativeModules.ExpenseSmsModule as
  | { setActiveExpenseUserId?: (userId: string) => Promise<void> }
  | undefined;

const readValue = async () =>
  Platform.OS === "web"
    ? AsyncStorage.getItem(SESSION_KEY)
    : SecureStore.getItemAsync(SESSION_KEY);

const writeValue = async (value: string) => {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SESSION_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, value);
};

const deleteValue = async () => {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
};

export const getExpenseSession = async (): Promise<ExpenseSession | null> => {
  const raw = await readValue();

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as ExpenseSession;
    return session.token && session.user?.id && session.user?.username ? session : null;
  } catch {
    return null;
  }
};

export const saveExpenseSession = async (session: ExpenseSession) => {
  await writeValue(JSON.stringify(session));
  await setActiveExpenseUserId(session.user.id);
};

export const clearExpenseSession = async () => {
  await deleteValue();
  await setActiveExpenseUserId("main");
};

export const getExpenseSessionToken = async () => (await getExpenseSession())?.token || "";

export const setActiveExpenseUserId = async (userId: string) => {
  if (Platform.OS === "android" && nativeModule?.setActiveExpenseUserId) {
    await nativeModule.setActiveExpenseUserId(userId);
  }
};
