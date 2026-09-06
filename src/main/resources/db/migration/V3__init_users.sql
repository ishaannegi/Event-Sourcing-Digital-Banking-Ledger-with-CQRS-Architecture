CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL
);

-- Seed initial test users (BCrypt hashed passwords)
-- admin / admin123 (ROLE_ADMIN)
-- alice / alice123 (ROLE_CUSTOMER)
-- bob / bob123 (ROLE_CUSTOMER)
INSERT INTO users (username, password_hash, role) VALUES
('admin', '$2a$10$f87JHojXkb7Kxv6OzbDUj.a2PCJbBnNCfWHVFVwvsyP//EvnEHaU2', 'ADMIN'),
('alice', '$2a$10$n6l8c3GQWK4zpCD9HjHqo.kkOhMVvwRhhHVk0UmHSwp0FY7UPcSrW', 'CUSTOMER'),
('bob',   '$2a$10$SBpS.jFgpGNklnk.PC1QourcSBAqJT7789p1uPxbe3pvjaxnoAEcW', 'CUSTOMER')
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;
