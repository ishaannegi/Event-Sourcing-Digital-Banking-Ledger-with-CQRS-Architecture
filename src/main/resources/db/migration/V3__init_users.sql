CREATE TABLE users (
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
('admin', '$2a$10$8.UnVuG9HHgffUDAlk8qfOUVGkqRzgVymGe07xD0Bo17FuT1pqq/q', 'ADMIN'),
('alice', '$2a$10$8.UnVuG9HHgffUDAlk8qfOUVGkqRzgVymGe07xD0Bo17FuT1pqq/q', 'CUSTOMER'),
('bob',   '$2a$10$8.UnVuG9HHgffUDAlk8qfOUVGkqRzgVymGe07xD0Bo17FuT1pqq/q', 'CUSTOMER');
