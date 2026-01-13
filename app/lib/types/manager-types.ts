import { SleeperLeagueSettings } from "./sleeper-types";

export type User = {
  user_id: string;
  username: string;
  avatar: string | null;
  type: "S" | "LM";
};

export type OptimalPlayer = {
  index: number;
  slot__index: string;
  optimal_player_id: string;
  player_position: string;
  value: number;
};

export type League = {
  index?: number;
  league_id: string;
  name: string;
  avatar: string | null;
  roster_positions: string[];
  scoring_settings: { [key: string]: number };
  settings: SleeperLeagueSettings;
  rosters: Roster[];
  status: string;
  season: string;
  user_roster_id?: number;
};

export type Roster = {
  roster_id: number;
  username: string;
  user_id: string;
  avatar: string | null;
  players: string[];
  starters: string[];
  taxi: string[];
  reserve: string[];
  draftpicks: DraftPick[];
  wins: number;
  losses: number;
  ties: number;
  fp: number;
  fpa: number;
  rank?: number;
  points_rank?: number;
  optimal_ktc?: {
    optimalStarters: OptimalPlayer[];
    optimalBench: OptimalPlayer[];
  };
  optimal_starters_ktc_total?: number;
  optimal_starters_ktc_rank?: number;
  optimal_bench_ktc_total?: number;
  optimal_bench_ktc_rank?: number;
  optimal_qb_starters_ktc_rank?: number;
  optimal_qb_bench_ktc_rank?: number;
  optimal_rb_starters_ktc_rank?: number;
  optimal_rb_bench_ktc_rank?: number;
  optimal_wr_starters_ktc_rank?: number;
  optimal_wr_bench_ktc_rank?: number;
  optimal_te_starters_ktc_rank?: number;
  optimal_te_bench_ktc_rank?: number;
};

export type DraftPick = {
  season: number;
  round: number;
  roster_id: number;
  original_username: string;
  order?: number;
};

export type PlayerShare = {
  owned: string[];
  taken: {
    lm_roster_id: number;
    lm: Omit<User, "type">;
    league_id: string;
  }[];
  available: string[];
};
