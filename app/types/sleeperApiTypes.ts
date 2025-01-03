export type SleeperLeague = {
  league_id: string;
  name: string;
  avatar: string;
  settings: { [key: string]: number };
  season: string;
};

export type SleeperUser = {
  user_id: string;
  display_name: string;
  avatar: string | null;
};

export type SleeperMatchup = {
  matchup_id: number;
  roster_id: number;
  players: string[];
  starters: string[];
};

export type SleeperDraft = {
  season: string;
  draft_order: {
    [key: string]: number;
  };
  status: string;
  settings: {
    rounds: number;
    slots_k: number;
  };
};

export type SleeperTrade = {
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

export type SleeperRoster = {
  roster_id: number;
  owner_id: string;
  players: string[];
  reserve?: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
  starters: string[];
  taxi?: string[];
};

export type SleeperDraftpick = {
  season: string;
  owner_id: number;
  roster_id: number;
  previous_owner_id: number;
  round: number;
};

export type SleeperPlayerStat = {
  player_id: string;
  stats: { [key: string]: number };
  player: { injury_status: string };
  team: string;
  game_id: string;
};

export type SleeperWinnersBracket = {
  r: number;
  m: number;
  w: number | null;
  l: number | null;
  t1: number | null;
  t2: number | null;
}[];

export type SleeperDraftpickPicktracker = {
  player_id: string;
  picked_by: string;
  metadata: {
    first_name: string;
    last_name: string;
    position: string;
  };
};

export type SleeperScheduleGame = {
  game_id: string;
  metadata: {
    quarter_num: number;
    time_remaining: string;
    home_team: string;
    away_team: string;
  };
  start_time: number;
  status: string;
};
