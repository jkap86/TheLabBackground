export type User = {
  user_id: string;
  username: string;
  avatar: string;
};

export type League = {
  index: number;
  league_id: string;
  name: string;
  avatar: string;
  season: string;
  settings: LeagueSettings;
  status: string;
  scoring_settings: { [key: string]: number };
  roster_positions: string[];
  rosters: Roster[];
  userRoster: Roster;
  updatedat?: Date;
};

export type LeagueSettings = {
  taxi_slots: number;
  reserve_slots: number;
  best_ball: number;
  type: number;
  reserve_allow_na: number;
  reserve_allow_doubtful: number;
  league_average_match: number;
  draft_rounds: number;
  playoff_week_start: number;
  trade_deadline: number;
  disable_trades: number;
};

export type Roster = {
  roster_id: number;
  username: string;
  user_id: string;
  avatar: string | null;
  players: string[] | null;
  draftpicks: Draftpick[];
  starters: string[];
  taxi: string[];
  reserve: string[];
  wins: number;
  losses: number;
  ties: number;
  fp: number;
  fpa: number;
  starters_optimal?: string[];
};

export type Draftpick = {
  season: number;
  round: number;
  roster_id: number;
  original_user: {
    avatar: string;
    user_id: string;
    username: string;
  };
  order?: number | null;
};

export type Playershare = {
  owned: string[];
  taken: {
    lm_roster_id: number;
    lm: User;
    league_id: string;
  }[];
  available: string[];
};

export type Leaguemate = {
  user_id: string;
  username: string;
  avatar: string | null;
  leagues: string[];
};

export type Matchup = {
  roster_id: number;
  matchup_id: number;
  league_id: string;
  players: string[];
  starters: string[];
  starters_optimal?: string[];
  players_points?: { [player_id: string]: number };
  week?: number;
  updatedat?: Date;
  playoffs_alive?: number[];
};

export type Trade = {
  transaction_id: string;
  status_updated: string;
  adds: { [key: string]: string };
  drops: { [key: string]: string };
  draft_picks: {
    season: string;
    round: number;
    order: number | null;
    original: string;
    old: string;
    new: string;
  }[];
  avatar: string;
  name: string;
  settings: LeagueSettings;
  scoring_settings: { [key: string]: number };
  roster_positions: string[];
  managers: string[];
  rosters: Roster[];
  league_id: string;
  price_check: string[];
  players: string[];
  tips?: {
    for: { league_id: string; leaguemate_id: string; player_id: string }[];
    away: { league_id: string; leaguemate_id: string; player_id: string }[];
  };
};

export type PlayerProjection = {
  player_id: string;
  kickoff: number;
  stats: { [cat: string]: number };
  injury_status: string;
  game_id: string;
};
