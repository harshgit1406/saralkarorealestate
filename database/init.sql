CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- ORGANIZATIONS
-- =========================================================

CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    email VARCHAR(150),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- RBAC
-- =========================================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_roles_org_name UNIQUE (organization_id, name)
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    module VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    CONSTRAINT uq_role_permissions UNIQUE (role_id, permission_id)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_org_username UNIQUE (organization_id, username),
    CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
);

CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_roles UNIQUE (user_id, role_id)
);

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_label VARCHAR(150),
    ip_address VARCHAR(64),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_login_attempts (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    username_or_email VARCHAR(150),
    ip_address VARCHAR(64),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_mfa (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    mfa_type VARCHAR(30) NOT NULL CHECK (mfa_type IN ('totp', 'sms', 'email')),
    secret_encrypted TEXT,
    backup_codes_hash JSONB,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- PROJECTS AND INVENTORY
-- =========================================================

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    project_code VARCHAR(50),
    project_type VARCHAR(50) NOT NULL CHECK (project_type IN ('plotting', 'apartment', 'villa', 'floor', 'commercial', 'mixed_use')),
    location TEXT,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'hold', 'completed', 'archived')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_projects_org_code UNIQUE (organization_id, project_code)
);

CREATE TABLE inventory_entities (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id INT REFERENCES inventory_entities(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('layout', 'sector', 'block', 'tower', 'floor', 'flat', 'plot', 'villa', 'shop', 'office', 'parking', 'warehouse', 'other')),
    entity_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    inventory_status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (inventory_status IN ('available', 'blocked', 'booked', 'sold', 'hold', 'reserved', 'inactive')),
    lifecycle_stage VARCHAR(50) NOT NULL DEFAULT 'launch' CHECK (lifecycle_stage IN ('launch', 'active_sales', 'legal', 'construction', 'handover', 'possession', 'closed')),
    level_no INT NOT NULL DEFAULT 0,
    path VARCHAR(500) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_inventory_project_code UNIQUE (project_id, entity_code),
    CONSTRAINT uq_inventory_project_path UNIQUE (project_id, path)
);

CREATE TABLE inventory_dimensions (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inventory_entity_id INT NOT NULL UNIQUE REFERENCES inventory_entities(id) ON DELETE CASCADE,
    area NUMERIC(14,2),
    carpet_area NUMERIC(14,2),
    builtup_area NUMERIC(14,2),
    saleable_area NUMERIC(14,2),
    length NUMERIC(14,2),
    width NUMERIC(14,2),
    measurement_unit VARCHAR(20) NOT NULL DEFAULT 'sqft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_pricing (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inventory_entity_id INT NOT NULL UNIQUE REFERENCES inventory_entities(id) ON DELETE CASCADE,
    base_price NUMERIC(14,2),
    final_price NUMERIC(14,2),
    price_per_sqft NUMERIC(14,2),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    pricing_metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_details (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inventory_entity_id INT NOT NULL UNIQUE REFERENCES inventory_entities(id) ON DELETE CASCADE,
    facing VARCHAR(50),
    bhk_type VARCHAR(50),
    display_note VARCHAR(255),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- CRM
-- =========================================================

CREATE TABLE lead_sources (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_name VARCHAR(100) NOT NULL,
    source_key VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('portal', 'meta_ads', 'google_ads', 'website', 'whatsapp', 'broker', 'manual', 'telephony', 'other')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lead_sources_org_key UNIQUE (organization_id, source_key)
);

CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INT REFERENCES projects(id) ON DELETE SET NULL,
    lead_source_id INT REFERENCES lead_sources(id) ON DELETE SET NULL,
    lead_code VARCHAR(50),
    external_lead_id VARCHAR(100),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    alternate_phone VARCHAR(20),
    email VARCHAR(150),
    source VARCHAR(100),
    source_data JSONB,
    budget_min NUMERIC(14,2),
    budget_max NUMERIC(14,2),
    requirements JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'attempted', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visit_done', 'proposal_sent', 'negotiation', 'won', 'lost', 'junk')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
    last_contacted_at TIMESTAMP,
    next_follow_up_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_leads_org_code UNIQUE (organization_id, lead_code)
);

CREATE TABLE lead_assignments (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by INT REFERENCES users(id) ON DELETE SET NULL,
    assignment_reason VARCHAR(100),
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_followups (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
    followup_type VARCHAR(50) NOT NULL CHECK (followup_type IN ('call', 'whatsapp', 'site_visit', 'meeting', 'email', 'task')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
    title VARCHAR(150) NOT NULL,
    notes TEXT,
    due_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_status_history (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_activities (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('note', 'call', 'whatsapp', 'email', 'status_change', 'assignment', 'site_visit', 'system')),
    notes TEXT,
    metadata JSONB,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TELEPHONY
-- =========================================================

CREATE TABLE telephony_providers (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_name VARCHAR(100) NOT NULL,
    provider_key VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    config JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_telephony_provider_org_key UNIQUE (organization_id, provider_key)
);

CREATE TABLE call_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id INT REFERENCES telephony_providers(id) ON DELETE SET NULL,
    lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
    assigned_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    trigger_source VARCHAR(50) NOT NULL CHECK (trigger_source IN ('lead_auto_call', 'manual_click_to_call', 'followup', 'campaign', 'other')),
    direction VARCHAR(20) NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'agent_dialing', 'agent_answered', 'lead_dialing', 'bridged', 'completed', 'failed', 'missed', 'cancelled')),
    started_at TIMESTAMP,
    bridged_at TIMESTAMP,
    ended_at TIMESTAMP,
    disposition VARCHAR(50),
    recording_url TEXT,
    provider_call_reference VARCHAR(150),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE call_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
    leg_type VARCHAR(20) NOT NULL CHECK (leg_type IN ('agent', 'lead', 'conference')),
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
    phone VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ringing', 'answered', 'busy', 'no_answer', 'failed', 'completed', 'cancelled')),
    started_at TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INT,
    provider_leg_reference VARCHAR(150),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE call_events (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
    call_leg_id UUID REFERENCES call_legs(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_payload JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE call_recordings (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    duration_seconds INT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- CUSTOMERS, BROKERS, BOOKINGS
-- =========================================================

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_code VARCHAR(50),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(150),
    pan_no VARCHAR(20),
    aadhaar_no VARCHAR(20),
    address TEXT,
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customers_org_code UNIQUE (organization_id, customer_code)
);

CREATE TABLE brokers (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    broker_code VARCHAR(50),
    username VARCHAR(100),
    full_name VARCHAR(150) NOT NULL,
    company_name VARCHAR(150),
    phone VARCHAR(20),
    email VARCHAR(150),
    address TEXT,
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_brokers_org_code UNIQUE (organization_id, broker_code),
    CONSTRAINT uq_brokers_org_username UNIQUE (organization_id, username)
);

CREATE TABLE payment_plans (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('construction_linked', 'time_linked', 'down_payment', 'custom')),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_plan_stages (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payment_plan_id INT NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    sequence_no INT NOT NULL,
    percentage NUMERIC(5,2),
    trigger_type VARCHAR(50),
    requires_payment BOOLEAN NOT NULL DEFAULT FALSE,
    stage_type VARCHAR(50) NOT NULL CHECK (stage_type IN ('payment', 'approval', 'legal', 'construction', 'possession', 'custom')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_plan_sequence UNIQUE (payment_plan_id, sequence_no)
);

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inventory_entity_id INT NOT NULL REFERENCES inventory_entities(id) ON DELETE RESTRICT,
    lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
    booking_code VARCHAR(50) NOT NULL,
    booking_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (booking_status IN ('draft', 'reserved', 'confirmed', 'cancelled', 'completed')),
    booking_amount NUMERIC(14,2),
    payment_plan_id INT REFERENCES payment_plans(id) ON DELETE SET NULL,
    booked_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bookings_org_code UNIQUE (organization_id, booking_code)
);

CREATE UNIQUE INDEX uq_active_booking_per_inventory
ON bookings (inventory_entity_id)
WHERE booking_status IN ('reserved', 'confirmed');

CREATE TABLE booking_applicants (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    applicant_role VARCHAR(50) NOT NULL CHECK (applicant_role IN ('primary', 'co_applicant', 'guarantor')),
    ownership_percentage NUMERIC(5,2),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_booking_customer UNIQUE (booking_id, customer_id)
);

CREATE TABLE booking_brokers (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    broker_id INT NOT NULL REFERENCES brokers(id) ON DELETE RESTRICT,
    commission_amount NUMERIC(14,2),
    commission_percentage NUMERIC(5,2),
    CONSTRAINT uq_booking_broker UNIQUE (booking_id, broker_id)
);

CREATE TABLE booking_stages (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    sequence_no INT NOT NULL,
    stage_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (stage_status IN ('pending', 'in_progress', 'completed', 'skipped', 'cancelled')),
    stage_type VARCHAR(50) NOT NULL CHECK (stage_type IN ('payment', 'approval', 'legal', 'construction', 'possession', 'custom')),
    requires_payment BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    percentage NUMERIC(5,2),
    amount NUMERIC(14,2),
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(14,2),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_booking_stage_sequence UNIQUE (booking_id, sequence_no)
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    booking_stage_id INT REFERENCES booking_stages(id) ON DELETE SET NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    payment_code VARCHAR(50),
    amount NUMERIC(14,2) NOT NULL,
    payment_mode VARCHAR(50) NOT NULL CHECK (payment_mode IN ('cash', 'cheque', 'bank_transfer', 'upi', 'card', 'loan', 'other')),
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('booking', 'stage', 'refund', 'adjustment', 'other')),
    reference_no VARCHAR(100),
    payment_status VARCHAR(50) NOT NULL CHECK (payment_status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payments_org_code UNIQUE (organization_id, payment_code)
);

-- =========================================================
-- DOCUMENTS AND MAPS
-- =========================================================

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    document_type VARCHAR(100),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_by INT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_links (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_maps (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    map_name VARCHAR(100) NOT NULL,
    map_engine VARCHAR(50) NOT NULL CHECK (map_engine IN ('svg', 'konva', 'json', 'cad')),
    version_no INT NOT NULL DEFAULT 1,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    map_data JSONB NOT NULL,
    thumbnail_url TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE map_elements (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_map_id INT NOT NULL REFERENCES project_maps(id) ON DELETE CASCADE,
    inventory_entity_id INT REFERENCES inventory_entities(id) ON DELETE SET NULL,
    element_id VARCHAR(100) NOT NULL,
    element_type VARCHAR(50) NOT NULL CHECK (element_type IN ('plot', 'flat', 'tower', 'floor', 'villa', 'shop', 'label', 'road', 'zone', 'other')),
    is_interactive BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_map_element UNIQUE (project_map_id, element_id)
);

-- =========================================================
-- MESSAGING
-- =========================================================

CREATE TABLE message_templates (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_name VARCHAR(100) NOT NULL,
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
    provider_template_id VARCHAR(150),
    content TEXT NOT NULL,
    variables JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_message_template_name UNIQUE (organization_id, template_name, channel)
);

CREATE TABLE outbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    booking_id INT REFERENCES bookings(id) ON DELETE SET NULL,
    template_id INT REFERENCES message_templates(id) ON DELETE SET NULL,
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
    recipient_phone VARCHAR(20),
    recipient_email VARCHAR(150),
    content TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
    provider_message_id VARCHAR(150),
    sent_by INT REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE message_attachments (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    outbound_message_id UUID NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
    document_id INT REFERENCES documents(id) ON DELETE SET NULL,
    file_url TEXT,
    media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('image', 'pdf', 'video', 'other')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- ATTENDANCE AND TASKS
-- =========================================================

CREATE TABLE employee_shifts (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    shift_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_minutes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_shift_name UNIQUE (organization_id, shift_name)
);

CREATE TABLE attendance_records (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id INT REFERENCES employee_shifts(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'week_off')),
    check_in_at TIMESTAMP,
    check_out_at TIMESTAMP,
    late_minutes INT,
    work_minutes INT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attendance_user_date UNIQUE (user_id, attendance_date)
);

CREATE TABLE attendance_events (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attendance_record_id INT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'manual_adjustment')),
    event_time TIMESTAMP NOT NULL,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    source VARCHAR(30) NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'admin', 'biometric', 'api')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE social_media_tasks (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INT REFERENCES projects(id) ON DELETE SET NULL,
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
    platform VARCHAR(30) NOT NULL CHECK (platform IN ('instagram', 'facebook', 'youtube', 'linkedin', 'whatsapp', 'other')),
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('post', 'reel', 'story', 'ad_creative', 'comment_reply', 'lead_export', 'campaign_review', 'other')),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    due_at TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- GLOBAL ACTIVITY AND AUDIT
-- =========================================================

CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_users_org_active ON users (organization_id, is_active);
CREATE INDEX idx_projects_org_status ON projects (organization_id, status);
CREATE INDEX idx_inventory_project_parent ON inventory_entities (project_id, parent_id);
CREATE INDEX idx_inventory_project_status ON inventory_entities (project_id, inventory_status);
CREATE INDEX idx_leads_org_status ON leads (organization_id, status);
CREATE INDEX idx_leads_org_assigned_to ON leads (organization_id, assigned_to);
CREATE INDEX idx_leads_phone ON leads (phone);
CREATE INDEX idx_lead_followups_due ON lead_followups (organization_id, due_at, status);
CREATE INDEX idx_call_sessions_lead ON call_sessions (lead_id, status);
CREATE INDEX idx_call_sessions_user ON call_sessions (assigned_user_id, status);
CREATE INDEX idx_bookings_org_status ON bookings (organization_id, booking_status);
CREATE INDEX idx_payments_booking ON payments (booking_id, payment_status);
CREATE INDEX idx_document_links_entity ON document_links (entity_type, entity_id);
CREATE INDEX idx_map_elements_inventory ON map_elements (inventory_entity_id);
CREATE INDEX idx_attendance_user_date ON attendance_records (user_id, attendance_date);
CREATE INDEX idx_social_tasks_assigned_to ON social_media_tasks (assigned_to, status);
CREATE INDEX idx_activities_entity ON activities (entity_type, entity_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_mfa_updated_at BEFORE UPDATE ON user_mfa
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_entities_updated_at BEFORE UPDATE ON inventory_entities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_dimensions_updated_at BEFORE UPDATE ON inventory_dimensions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_pricing_updated_at BEFORE UPDATE ON inventory_pricing
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_details_updated_at BEFORE UPDATE ON inventory_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lead_sources_updated_at BEFORE UPDATE ON lead_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lead_followups_updated_at BEFORE UPDATE ON lead_followups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_telephony_providers_updated_at BEFORE UPDATE ON telephony_providers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_call_sessions_updated_at BEFORE UPDATE ON call_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brokers_updated_at BEFORE UPDATE ON brokers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payment_plans_updated_at BEFORE UPDATE ON payment_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payment_plan_stages_updated_at BEFORE UPDATE ON payment_plan_stages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_booking_stages_updated_at BEFORE UPDATE ON booking_stages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_project_maps_updated_at BEFORE UPDATE ON project_maps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_map_elements_updated_at BEFORE UPDATE ON map_elements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_message_templates_updated_at BEFORE UPDATE ON message_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_outbound_messages_updated_at BEFORE UPDATE ON outbound_messages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_employee_shifts_updated_at BEFORE UPDATE ON employee_shifts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_social_media_tasks_updated_at BEFORE UPDATE ON social_media_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
