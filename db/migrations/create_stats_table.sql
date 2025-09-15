CREATE TABLE IF NOT EXISTS weekly_stats (
    player_id VARCHAR(255) NOT NULL,
    season INT NOT NULL,
    week INT NOT NULL,
    season_type VARCHAR(255) NOT NULL,
    home BOOLEAN NOT NULL,
    opp VARCHAR(255) NOT NULL,
    kickoff BIGINT NOT NULL,
    stats JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, season, week, season_type)
);