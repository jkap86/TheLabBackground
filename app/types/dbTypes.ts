import { LeagueSettings, Roster } from "./userTypes";

export type LeagueDb = {
  league_id: string;
  name: string;
  avatar: string;
  season: string;
  status: string;
  settings: LeagueSettings;
  scoring_settings: { [key: string]: number };
  roster_positions: string[];
  rosters: Roster[];
  updatedat: Date;
};

export type UserDb = {
  user_id: string;
  username: string;
  avatar: string | null;
  type: string;
  updatedAt: Date;
  createdAt: Date;
};
