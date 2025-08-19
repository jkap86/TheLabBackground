CREATE TABLE IF NOT EXISTS leagues (
    league_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    season VARCHAR(255),
    settings JSONB,
    scoring_settings JSONB,
    roster_positions JSONB,
    rosters JSONB,
    status VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);