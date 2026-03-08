-- Migration: add role column to users table
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Ensure the configured admin has the correct role
UPDATE users SET role = 'admin' WHERE email = 'shubhodippal01@gmail.com';
