import type { UserName } from "../models/user";

export interface AppUserDefinition {
  name: UserName;
  uid: string;
  email: string;
}

// Dedicated Firebase Authentication users for Daily Expenses.
// Passwords are never stored in the application.
export const APP_USERS_BY_NAME: Record<UserName, AppUserDefinition> = {
  Yisel: {
    name: "Yisel",
    uid: "YHtQh4N0RaViD8rXqDNE4xZTcN12",
    email: "yisel@dailyexpenses.invalid",
  },
  Yorki: {
    name: "Yorki",
    uid: "hmJi0g20svTPkfOF9ZzZwRi9Bdw2",
    email: "yorki@dailyexpenses.invalid",
  },
};

export const APP_USERS = Object.values(APP_USERS_BY_NAME);

export const getAppUserByName = (name: UserName): AppUserDefinition =>
  APP_USERS_BY_NAME[name];

export const getAppUserByUid = (
  uid: string | null | undefined,
): AppUserDefinition | undefined =>
  uid ? APP_USERS.find((user) => user.uid === uid) : undefined;
