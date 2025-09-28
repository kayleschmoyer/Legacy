-- Create user sessions and authentication tables
-- Handles user login sessions and OAuth tokens

-- User Sessions Table
CREATE TABLE IF NOT EXISTS app_internal.user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- OAuth Provider Tokens (for Google, etc.)
CREATE TABLE IF NOT EXISTS app_internal.oauth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'google', 'github', etc.
    provider_user_id VARCHAR(255) NOT NULL, -- User ID from OAuth provider
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One OAuth account per provider per user
    UNIQUE(user_id, provider),
    -- Unique provider user ID per provider
    UNIQUE(provider, provider_user_id)
);

-- User Preferences/Settings
CREATE TABLE IF NOT EXISTS app_internal.user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One value per preference key per user
    UNIQUE(user_id, preference_key)
);

-- Add indexes for session and OAuth queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON app_internal.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON app_internal.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON app_internal.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON app_internal.user_sessions(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON app_internal.oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON app_internal.oauth_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider_user_id ON app_internal.oauth_tokens(provider_user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON app_internal.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON app_internal.user_preferences(preference_key);
