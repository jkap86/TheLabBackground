CREATE TABLE IF NOT EXISTS trades (
    transaction_id VARCHAR(255) PRIMARY KEY,
    status_updated TIMESTAMP,
    adds JSONB,
    drops JSONB,
    draft_picks JSONB,
    price_check VARCHAR[],
    rosters JSONB,
    managers VARCHAR[],
    players VARCHAR[],
    league_id VARCHAR(255),
    FOREIGN KEY (league_id) REFERENCES leagues(league_id)
    ON DELETE CASCADE
);