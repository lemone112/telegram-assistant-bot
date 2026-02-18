-- Baseline migration 0001
-- Purpose: ensure required extensions exist and create the application schema.

-- Extensions live in public by default; this is fine.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Single application schema for all runtime tables
CREATE SCHEMA IF NOT EXISTS bot;
