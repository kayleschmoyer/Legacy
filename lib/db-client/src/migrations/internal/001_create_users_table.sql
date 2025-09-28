-- Create app_internal schema and access_level enum
-- This schema handles user management and authentication

-- Create the app_internal schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS app_internal;

-- Create access level enum for user permissions
CREATE TYPE app_internal.access_level AS ENUM ('admin', 'user', 'guest');

-- Create users table in app_internal schema
CREATE TABLE IF NOT EXISTS app_internal.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    access_level app_internal.access_level NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Add indexes for user lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON app_internal.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON app_internal.users(username);
CREATE INDEX IF NOT EXISTS idx_users_access_level ON app_internal.users(access_level);
CREATE INDEX IF NOT EXISTS idx_users_active ON app_internal.users(is_active) WHERE is_active = TRUE;
