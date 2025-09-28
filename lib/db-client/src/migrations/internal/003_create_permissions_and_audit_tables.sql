-- Create user permissions and audit tables
-- Handles fine-grained permissions and system audit logging

-- User Permissions Table (for granular access control beyond access_level)
CREATE TABLE IF NOT EXISTS app_internal.user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
    permission_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- 'league', 'player', 'global', etc.
    resource_id INTEGER, -- ID of specific resource, NULL for global permissions
    granted_by INTEGER REFERENCES app_internal.users(id), -- Admin who granted permission
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL for permanent permissions
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Unique permission per user per resource
    UNIQUE(user_id, permission_name, resource_type, resource_id)
);

-- Audit Log Table (track important system actions)
CREATE TABLE IF NOT EXISTS app_internal.audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES app_internal.users(id), -- NULL for system actions
    action VARCHAR(100) NOT NULL, -- 'login', 'create_league', 'update_roster', etc.
    resource_type VARCHAR(50), -- What type of resource was affected
    resource_id INTEGER, -- ID of affected resource
    old_values JSONB, -- Previous state (for updates/deletes)
    new_values JSONB, -- New state (for creates/updates)
    ip_address INET,
    user_agent TEXT,
    session_id INTEGER REFERENCES app_internal.user_sessions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB -- Additional context-specific data
);

-- System Configuration Table (for application settings)
CREATE TABLE IF NOT EXISTS app_internal.system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE, -- Can non-admin users see this?
    updated_by INTEGER REFERENCES app_internal.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for permissions and audit queries
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON app_internal.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON app_internal.user_permissions(permission_name);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON app_internal.user_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_active ON app_internal.user_permissions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires ON app_internal.user_permissions(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON app_internal.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON app_internal.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON app_internal.audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON app_internal.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_session_id ON app_internal.audit_log(session_id);

CREATE INDEX IF NOT EXISTS idx_system_config_key ON app_internal.system_config(config_key);
CREATE INDEX IF NOT EXISTS idx_system_config_public ON app_internal.system_config(is_public) WHERE is_public = TRUE;
