import { DraftPick, OptimalPlayer } from "./manager-types";
import { SleeperLeagueSettings } from "./sleeper-types";

export type Roster = {
  roster_id: number;
  username: string;
  user_id: string;
  avatar: string | null;
  players: string[];
  draftPicks: DraftPick[];
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

export type League = {
  league_id: string;
  name: string;
  avatar: string | null;
  roster_positions: string[];
  scoring_settings: { [key: string]: number };
  settings: SleeperLeagueSettings;
  status: string;
  season: string;
};

export type Trade = {
  transaction_id: string;
  status_updated: number;
  adds: { [key: string]: string };
  drops: { [key: string]: string };
  draft_picks: {
    season: string;
    round: number;
    order: number | undefined;
    original: string;
    old: string;
    new: string;
  }[];
  league: League;
  rosters: Roster[];
  league_id: string;
  tips?: {
    for: { league_id: string; leaguemate_id: string; player_id: string }[];
    away: { league_id: string; leaguemate_id: string; player_id: string }[];
  };
};
