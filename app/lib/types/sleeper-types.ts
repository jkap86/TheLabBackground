export type SleeperLeague = {
  league_id: string;
  previous_league_id: string | null;
  name: string;
  avatar: string | null;
  roster_positions: string[] | null;
  scoring_settings: { [key: string]: number } | null;
  settings: SleeperLeagueSettings;
  status: string;
  season: string;
};

export type SleeperLeagueSettings = {
  taxi_slots: number;
  reserve_slots: number;
  best_ball?: number;
  type: number;
  reserve_allow_na: number;
  reserve_allow_doubtful: number;
  league_average_match: number;
  draft_rounds: number;
  playoff_week_start: number;
  trade_deadline: number;
  disable_trades: number;
  daily_waivers: number;
};

export type SleeperUser = {
  user_id: string;
  display_name: string;
  avatar: string | null;
};

export type SleeperRoster = {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
  starters: string[] | null;
  taxi: string[] | null;
  reserve: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
};

export type SleeperDraft = {
  draft_id: string;
  season: string;
  draft_order: {
    [key: string]: number;
  };
  last_picked: number | null;
  status: string;
  settings: {
    rounds: number;
    slots_k: number;
  };
};

export type SleeperDraftPick = {
  season: string;
  owner_id: number;
  roster_id: number;
  previous_owner_id: number;
  round: number;
};

export type SleeperDraftDraftPick = {
  player_id: string;
  picked_by: string;
  metadata: {
    first_name: string;
    last_name: string;
    position: string;
  };
};

export type SleeperTransaction = {
  transaction_id: string;
  status_updated: number;
  type: string;
  status: string;
  adds: { [player_id: string]: number };
  drops: { [player_id: string]: number };
  draft_picks: {
    round: number;
    season: string;
    roster_id: number;
    owner_id: number;
    previous_owner_id: number;
  }[];
};
