CREATE TABLE IF NOT EXISTS ktc_dynasty (
    player_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    value INT NOT NULL,
    overall_rank INT,
    position_rank INT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, date)
);