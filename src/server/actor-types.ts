export interface Actor {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  isAdmin: boolean;
  onboarded: boolean;
  sessionId: string;
  reauthAt: Date | null;
  /** Club ids this user manages (club_manager flag per club). */
  managedClubIds: string[];
}
