import type { UserName } from "../models/user";

export interface AppUserDefinition {
  name: UserName;
  uid: string;
  email: string;
}

// Same Firebase Authentication users already used by TaskFollower.
// Passwords are never stored in the application.
export const APP_USERS_BY_NAME: Record<UserName, AppUserDefinition> = {
  Yisel: {
    name: "Yisel",
    uid: "Z0Kf2S6iCvVOYQycexiJoPE6sPG2",
    email: "yisel@taskfollower.invalid",
  },
  Yorki: {
    name: "Yorki",
    uid: "iF4VXsQ31TT12A44grdEvRAni9S2",
    email: "yorki@taskfollower.invalid",
  },
};

export const APP_USERS = Object.values(APP_USERS_BY_NAME);

export const getAppUserByName = (name: UserName): AppUserDefinition =>
  APP_USERS_BY_NAME[name];

export const getAppUserByUid = (
  uid: string | null | undefined,
): AppUserDefinition | undefined =>
  uid ? APP_USERS.find((user) => user.uid === uid) : undefined;
