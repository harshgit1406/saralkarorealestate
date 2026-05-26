DO $$
DECLARE
    org_id INT;
    admin_id INT;
    sales_id INT;
    finance_id INT;
    ai_id INT;
    sales_role_id INT;
    finance_role_id INT;
    admin_role_id INT;
    v_project_id INT;
    v_plan_id INT;
    v_customer_id INT;
    v_broker_id INT;
    v_lead_id INT;
    unit_b1_id INT;
    unit_s1_id INT;
    v_booking_id INT;
    v_stage_id INT;
    v_provider_id INT;
    v_call_id UUID;
    v_template_id INT;
    v_shift_id INT;
    v_map_id INT;
    sample_hash TEXT := '$argon2id$v=19$m=65536,t=3,p=4$lEe0nkAcJeq+fqeguIY+qQ$P2jJ0b6vL8py3j6scXQne7i2sQ00Q1Bn4ugjeKRX/SY';
BEGIN
    INSERT INTO organizations (name, slug, phone, email, address, is_active)
    VALUES (
        'Saral Real Estate',
        'saral',
        '+91 98765 43210',
        'admin@saralrealestate.com',
        'Sector 62, Noida, Uttar Pradesh',
        TRUE
    )
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address
    RETURNING id INTO org_id;

    SELECT id INTO admin_id
    FROM users
    WHERE organization_id = org_id
    ORDER BY is_super_admin DESC, id
    LIMIT 1;

    IF admin_id IS NULL THEN
        INSERT INTO users (
            organization_id,
            full_name,
            username,
            email,
            phone,
            password_hash,
            is_active,
            is_super_admin
        )
        VALUES (
            org_id,
            'System Admin',
            'admin',
            'admin@saralrealestate.com',
            '+91 90000 00001',
            sample_hash,
            TRUE,
            TRUE
        )
        ON CONFLICT (organization_id, email) DO UPDATE
        SET full_name = EXCLUDED.full_name
        RETURNING id INTO admin_id;
    END IF;

    INSERT INTO roles (organization_id, name, description, is_system)
    VALUES
        (org_id, 'Administrator', 'Full application access', TRUE),
        (org_id, 'Sales Manager', 'Lead, booking, and communication access', FALSE),
        (org_id, 'Finance Manager', 'Payment plans, receipts, and outstanding demand', FALSE)
    ON CONFLICT (organization_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        is_system = EXCLUDED.is_system;

    SELECT id INTO admin_role_id FROM roles WHERE organization_id = org_id AND name = 'Administrator';
    SELECT id INTO sales_role_id FROM roles WHERE organization_id = org_id AND name = 'Sales Manager';
    SELECT id INTO finance_role_id FROM roles WHERE organization_id = org_id AND name = 'Finance Manager';

    INSERT INTO permissions (permission_key, module, description)
    VALUES
        ('dashboard.view', 'dashboard', 'View dashboard'),
        ('projects.view', 'projects', 'View projects'),
        ('projects.create', 'projects', 'Create projects'),
        ('projects.update', 'projects', 'Update projects'),
        ('projects.delete', 'projects', 'Delete projects'),
        ('inventory.view', 'inventory', 'View inventory'),
        ('inventory.create', 'inventory', 'Create inventory'),
        ('inventory.update', 'inventory', 'Update inventory'),
        ('inventory.delete', 'inventory', 'Delete inventory'),
        ('maps.view', 'maps', 'View maps'),
        ('maps.create', 'maps', 'Create maps'),
        ('maps.update', 'maps', 'Update maps'),
        ('maps.delete', 'maps', 'Delete maps'),
        ('leads.view', 'leads', 'View leads'),
        ('leads.create', 'leads', 'Create leads'),
        ('leads.update', 'leads', 'Update leads'),
        ('leads.delete', 'leads', 'Delete leads'),
        ('leads.assign', 'leads', 'Assign leads'),
        ('leads.convert', 'leads', 'Convert leads'),
        ('customers.view', 'customers', 'View customers'),
        ('customers.create', 'customers', 'Create customers'),
        ('customers.update', 'customers', 'Update customers'),
        ('customers.delete', 'customers', 'Delete customers'),
        ('brokers.view', 'brokers', 'View brokers'),
        ('brokers.create', 'brokers', 'Create brokers'),
        ('brokers.update', 'brokers', 'Update brokers'),
        ('brokers.delete', 'brokers', 'Delete brokers'),
        ('finance.view', 'finance', 'View finance'),
        ('finance.create', 'finance', 'Create finance'),
        ('finance.update', 'finance', 'Update finance'),
        ('finance.delete', 'finance', 'Delete finance'),
        ('documents.view', 'documents', 'View documents'),
        ('documents.create', 'documents', 'Create documents'),
        ('documents.update', 'documents', 'Update documents'),
        ('documents.delete', 'documents', 'Delete documents'),
        ('communication.view', 'communication', 'View communication'),
        ('communication.create', 'communication', 'Create communication'),
        ('communication.update', 'communication', 'Update communication'),
        ('communication.delete', 'communication', 'Delete communication'),
        ('hrms.view', 'hrms', 'View HRMS'),
        ('hrms.create', 'hrms', 'Create HRMS'),
        ('hrms.update', 'hrms', 'Update HRMS'),
        ('hrms.delete', 'hrms', 'Delete HRMS'),
        ('settings.view', 'settings', 'View settings'),
        ('settings.update', 'settings', 'Update settings')
    ON CONFLICT (permission_key) DO UPDATE
    SET module = EXCLUDED.module,
        description = EXCLUDED.description;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT sales_role_id, id
    FROM permissions
    WHERE permission_key IN (
        'dashboard.view',
        'projects.view',
        'inventory.view',
        'maps.view',
        'leads.view',
        'leads.create',
        'leads.update',
        'leads.assign',
        'customers.view',
        'customers.create',
        'customers.update',
        'communication.view',
        'communication.create',
        'communication.update'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT finance_role_id, id
    FROM permissions
    WHERE permission_key IN (
        'dashboard.view',
        'inventory.view',
        'customers.view',
        'finance.view',
        'finance.create',
        'finance.update',
        'documents.view',
        'documents.create'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO users (organization_id, full_name, username, email, phone, password_hash, is_active)
    VALUES
        (org_id, 'Priya Sharma', 'priya.sales', 'priya@saralrealestate.com', '+91 90000 00002', sample_hash, TRUE)
    ON CONFLICT (organization_id, email) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = TRUE
    RETURNING id INTO sales_id;

    INSERT INTO users (organization_id, full_name, username, email, phone, password_hash, is_active)
    VALUES
        (org_id, 'Rohan Mehta', 'rohan.finance', 'rohan@saralrealestate.com', '+91 90000 00003', sample_hash, TRUE)
    ON CONFLICT (organization_id, email) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = TRUE
    RETURNING id INTO finance_id;

    INSERT INTO users (organization_id, full_name, username, email, phone, password_hash, is_active)
    VALUES
        (org_id, 'AI Calling Agent', 'ai.agent', 'ai-agent@saralrealestate.com', '+91 90000 00004', sample_hash, TRUE)
    ON CONFLICT (organization_id, email) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = TRUE
    RETURNING id INTO ai_id;

    INSERT INTO user_roles (user_id, role_id)
    VALUES
        (admin_id, admin_role_id),
        (sales_id, sales_role_id),
        (finance_id, finance_role_id),
        (ai_id, sales_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    UPDATE users
    SET password_hash = sample_hash
    WHERE organization_id = org_id
      AND username IN ('admin', 'priya.sales', 'rohan.finance', 'ai.agent');

    INSERT INTO projects (
        organization_id,
        name,
        project_code,
        project_type,
        location,
        description,
        status
    )
    VALUES (
        org_id,
        'Horizon Heights Phase II',
        'HH2',
        'mixed_use',
        'Noida Extension',
        'Residential towers with retail frontage and staged payment plans.',
        'active'
    )
    ON CONFLICT (organization_id, project_code) DO UPDATE
    SET name = EXCLUDED.name,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        status = EXCLUDED.status
    RETURNING id INTO v_project_id;

    INSERT INTO inventory_entities (
        organization_id,
        project_id,
        entity_type,
        entity_code,
        name,
        inventory_status,
        lifecycle_stage,
        level_no,
        path,
        sort_order
    )
    VALUES
        (org_id, v_project_id, 'flat', 'A1', 'Tower A 1201', 'available', 'active_sales', 12, 'HH2/A/A1', 1),
        (org_id, v_project_id, 'flat', 'A2', 'Tower B 804', 'available', 'active_sales', 8, 'HH2/B/A2', 2),
        (org_id, v_project_id, 'shop', 'R1', 'Retail 01', 'available', 'active_sales', 0, 'HH2/RETAIL/R1', 3),
        (org_id, v_project_id, 'flat', 'M1', 'Mid Block 502', 'available', 'active_sales', 5, 'HH2/MID/M1', 4),
        (org_id, v_project_id, 'flat', 'B1', 'Podium Lane 305', 'booked', 'legal', 3, 'HH2/PODIUM/B1', 5),
        (org_id, v_project_id, 'flat', 'S1', 'South Wing 210', 'sold', 'handover', 2, 'HH2/SOUTH/S1', 6)
    ON CONFLICT (project_id, entity_code) DO UPDATE
    SET name = EXCLUDED.name,
        inventory_status = EXCLUDED.inventory_status,
        lifecycle_stage = EXCLUDED.lifecycle_stage,
        sort_order = EXCLUDED.sort_order;

    INSERT INTO inventory_dimensions (organization_id, inventory_entity_id, saleable_area, carpet_area, builtup_area)
    SELECT org_id, ie.id, v.saleable_area, v.carpet_area, v.builtup_area
    FROM inventory_entities ie
    JOIN (
        VALUES
            ('A1', 1425.00, 980.00, 1240.00),
            ('A2', 1180.00, 830.00, 1010.00),
            ('R1', 620.00, 580.00, 620.00),
            ('M1', 1360.00, 940.00, 1175.00),
            ('B1', 1540.00, 1075.00, 1320.00),
            ('S1', 1285.00, 890.00, 1100.00)
    ) AS v(entity_code, saleable_area, carpet_area, builtup_area)
        ON v.entity_code = ie.entity_code
    WHERE ie.project_id = v_project_id
    ON CONFLICT (inventory_entity_id) DO UPDATE
    SET saleable_area = EXCLUDED.saleable_area,
        carpet_area = EXCLUDED.carpet_area,
        builtup_area = EXCLUDED.builtup_area;

    INSERT INTO inventory_pricing (organization_id, inventory_entity_id, base_price, final_price, price_per_sqft)
    SELECT org_id, ie.id, v.base_price, v.final_price, v.price_per_sqft
    FROM inventory_entities ie
    JOIN (
        VALUES
            ('A1', 9500000.00, 9850000.00, 6912.28),
            ('A2', 7800000.00, 8050000.00, 6822.03),
            ('R1', 6200000.00, 6500000.00, 10483.87),
            ('M1', 8900000.00, 9200000.00, 6764.71),
            ('B1', 10100000.00, 10450000.00, 6785.71),
            ('S1', 8450000.00, 8700000.00, 6770.43)
    ) AS v(entity_code, base_price, final_price, price_per_sqft)
        ON v.entity_code = ie.entity_code
    WHERE ie.project_id = v_project_id
    ON CONFLICT (inventory_entity_id) DO UPDATE
    SET base_price = EXCLUDED.base_price,
        final_price = EXCLUDED.final_price,
        price_per_sqft = EXCLUDED.price_per_sqft;

    INSERT INTO inventory_details (organization_id, inventory_entity_id, facing, bhk_type, display_note)
    SELECT org_id, ie.id, v.facing, v.bhk_type, v.display_note
    FROM inventory_entities ie
    JOIN (
        VALUES
            ('A1', 'East', '3 BHK', 'Park view unit ready for booking'),
            ('A2', 'North', '2 BHK', 'Compact family unit'),
            ('R1', 'Main Road', 'Retail', 'Retail frontage near entry'),
            ('M1', 'West', '3 BHK', 'Mid block inventory'),
            ('B1', 'East', '3 BHK', 'Reserved against token'),
            ('S1', 'South', '2 BHK', 'Sold with possession stage pending')
    ) AS v(entity_code, facing, bhk_type, display_note)
        ON v.entity_code = ie.entity_code
    WHERE ie.project_id = v_project_id
    ON CONFLICT (inventory_entity_id) DO UPDATE
    SET facing = EXCLUDED.facing,
        bhk_type = EXCLUDED.bhk_type,
        display_note = EXCLUDED.display_note;

    SELECT id INTO v_map_id
    FROM project_maps
    WHERE organization_id = org_id
      AND project_id = v_project_id
      AND map_name = 'Horizon Heights Sales Map'
    ORDER BY id
    LIMIT 1;

    IF v_map_id IS NULL THEN
        INSERT INTO project_maps (
            organization_id,
            project_id,
            map_name,
            map_engine,
            version_no,
            is_published,
            map_data,
            created_by
        )
        VALUES (
            org_id,
            v_project_id,
            'Horizon Heights Sales Map',
            'svg',
            1,
            TRUE,
            '{"viewBox": "0 0 700 780", "source": "seed_sample_data"}'::jsonb,
            admin_id
        )
        RETURNING id INTO v_map_id;
    END IF;

    INSERT INTO map_elements (
        organization_id,
        project_map_id,
        inventory_entity_id,
        element_id,
        element_type,
        is_interactive,
        metadata
    )
    SELECT
        org_id,
        v_map_id,
        ie.id,
        'unit-' || ie.entity_code,
        CASE WHEN ie.entity_type = 'flat' THEN 'flat' ELSE ie.entity_type END,
        TRUE,
        jsonb_build_object(
            'x', v.x,
            'y', v.y,
            'width', v.width,
            'height', v.height,
            'label', ie.name
        )
    FROM inventory_entities ie
    JOIN (
        VALUES
            ('A1', 150, 42, 210, 160),
            ('A2', 362, 42, 145, 160),
            ('R1', 150, 216, 140, 14),
            ('M1', 300, 340, 84, 34),
            ('B1', 330, 300, 16, 24),
            ('S1', 310, 515, 24, 24)
    ) AS v(entity_code, x, y, width, height)
        ON v.entity_code = ie.entity_code
    WHERE ie.project_id = v_project_id
    ON CONFLICT (project_map_id, element_id) DO UPDATE
    SET inventory_entity_id = EXCLUDED.inventory_entity_id,
        metadata = EXCLUDED.metadata,
        is_interactive = TRUE;

    INSERT INTO lead_sources (organization_id, source_name, source_key, source_type, is_active, config)
    VALUES
        (
            org_id,
            'Website Form',
            'website-form',
            'website',
            TRUE,
            jsonb_build_object(
                'webhook_token',
                'change-this-source-token',
                'auto_call',
                TRUE,
                'default_assigned_to',
                sales_id
            )
        )
    ON CONFLICT (organization_id, source_key) DO UPDATE
    SET source_name = EXCLUDED.source_name,
        is_active = TRUE,
        config = EXCLUDED.config;

    INSERT INTO leads (
        organization_id,
        project_id,
        lead_source_id,
        lead_code,
        name,
        phone,
        email,
        budget_min,
        budget_max,
        status,
        priority,
        assigned_to,
        last_contacted_at,
        next_follow_up_at
    )
    SELECT
        org_id,
        v_project_id,
        ls.id,
        'LD-1001',
        'Amit Verma',
        '+91 91111 11111',
        'amit.verma@example.com',
        7500000.00,
        10000000.00,
        'qualified',
        'high',
        sales_id,
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP + INTERVAL '1 day'
    FROM lead_sources ls
    WHERE ls.organization_id = org_id AND ls.source_key = 'website-form'
    ON CONFLICT (organization_id, lead_code) DO UPDATE
    SET status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        assigned_to = EXCLUDED.assigned_to
    RETURNING id INTO v_lead_id;

    INSERT INTO customers (
        organization_id,
        customer_code,
        full_name,
        phone,
        email,
        pan_no,
        address,
        kyc_status
    )
    VALUES (
        org_id,
        'CUST-1001',
        'Neha Kapoor',
        '+91 92222 22222',
        'neha.kapoor@example.com',
        'ABCDE1234F',
        'Indirapuram, Ghaziabad',
        'verified'
    )
    ON CONFLICT (organization_id, customer_code) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        kyc_status = EXCLUDED.kyc_status
    RETURNING id INTO v_customer_id;

    INSERT INTO brokers (organization_id, broker_code, username, full_name, company_name, phone, email, kyc_status)
    VALUES (org_id, 'BR-1001', 'metro.channel', 'Metro Channel Partner', 'Metro Realty', '+91 93333 33333', 'metro@example.com', 'verified')
    ON CONFLICT (organization_id, broker_code) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        company_name = EXCLUDED.company_name
    RETURNING id INTO v_broker_id;

    INSERT INTO payment_plans (organization_id, name, plan_type, description)
    VALUES (org_id, '30-40-30 Construction Linked', 'construction_linked', 'Booking, structure, and possession linked payment schedule.')
    RETURNING id INTO v_plan_id;

    IF NOT EXISTS (
        SELECT 1 FROM payment_plans WHERE organization_id = org_id AND name = '30-40-30 Construction Linked' AND id <> v_plan_id
    ) THEN
        NULL;
    END IF;

    SELECT id INTO v_plan_id
    FROM payment_plans
    WHERE organization_id = org_id AND name = '30-40-30 Construction Linked'
    ORDER BY id
    LIMIT 1;

    DELETE FROM payment_plans
    WHERE organization_id = org_id
      AND name = '30-40-30 Construction Linked'
      AND id <> v_plan_id;

    INSERT INTO payment_plan_stages (
        organization_id,
        payment_plan_id,
        stage_name,
        sequence_no,
        percentage,
        trigger_type,
        requires_payment,
        stage_type
    )
    VALUES
        (org_id, v_plan_id, 'Booking Amount', 1, 10.00, 'booking', TRUE, 'payment'),
        (org_id, v_plan_id, 'Structure Completion', 2, 40.00, 'construction', TRUE, 'construction'),
        (org_id, v_plan_id, 'Possession', 3, 50.00, 'possession', TRUE, 'possession')
    ON CONFLICT (payment_plan_id, sequence_no) DO UPDATE
    SET stage_name = EXCLUDED.stage_name,
        percentage = EXCLUDED.percentage,
        stage_type = EXCLUDED.stage_type;

    SELECT id INTO unit_b1_id FROM inventory_entities WHERE project_id = v_project_id AND entity_code = 'B1';
    SELECT id INTO unit_s1_id FROM inventory_entities WHERE project_id = v_project_id AND entity_code = 'S1';

    INSERT INTO bookings (
        organization_id,
        inventory_entity_id,
        lead_id,
        booking_code,
        booking_status,
        booking_amount,
        payment_plan_id,
        booked_at,
        created_by
    )
    VALUES (
        org_id,
        unit_b1_id,
        v_lead_id,
        'BK-1001',
        'confirmed',
        10450000.00,
        v_plan_id,
        CURRENT_TIMESTAMP - INTERVAL '12 days',
        sales_id
    )
    ON CONFLICT (organization_id, booking_code) DO UPDATE
    SET booking_status = EXCLUDED.booking_status,
        booking_amount = EXCLUDED.booking_amount,
        payment_plan_id = EXCLUDED.payment_plan_id
    RETURNING id INTO v_booking_id;

    INSERT INTO booking_applicants (organization_id, booking_id, customer_id, applicant_role, ownership_percentage, is_primary)
    VALUES (org_id, v_booking_id, v_customer_id, 'primary', 100.00, TRUE)
    ON CONFLICT (booking_id, customer_id) DO UPDATE
    SET applicant_role = EXCLUDED.applicant_role,
        is_primary = TRUE;

    INSERT INTO booking_brokers (organization_id, booking_id, broker_id, commission_amount, commission_percentage)
    VALUES (org_id, v_booking_id, v_broker_id, 156750.00, 1.50)
    ON CONFLICT (booking_id, broker_id) DO UPDATE
    SET commission_amount = EXCLUDED.commission_amount,
        commission_percentage = EXCLUDED.commission_percentage;

    INSERT INTO booking_stages (
        organization_id,
        booking_id,
        stage_name,
        sequence_no,
        stage_status,
        stage_type,
        requires_payment,
        is_completed,
        percentage,
        amount,
        paid_amount,
        remaining_amount,
        due_date,
        completed_at
    )
    VALUES
        (org_id, v_booking_id, 'Booking Amount', 1, 'completed', 'payment', TRUE, TRUE, 10.00, 1045000.00, 1045000.00, 0.00, CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '9 days'),
        (org_id, v_booking_id, 'Structure Completion', 2, 'in_progress', 'construction', TRUE, FALSE, 40.00, 4180000.00, 1500000.00, 2680000.00, CURRENT_TIMESTAMP + INTERVAL '20 days', NULL),
        (org_id, v_booking_id, 'Possession', 3, 'pending', 'possession', TRUE, FALSE, 50.00, 5225000.00, 0.00, 5225000.00, CURRENT_TIMESTAMP + INTERVAL '90 days', NULL)
    ON CONFLICT (booking_id, sequence_no) DO UPDATE
    SET stage_status = EXCLUDED.stage_status,
        amount = EXCLUDED.amount,
        paid_amount = EXCLUDED.paid_amount,
        remaining_amount = EXCLUDED.remaining_amount;

    SELECT id INTO v_stage_id
    FROM booking_stages
    WHERE booking_id = v_booking_id AND sequence_no = 1;

    INSERT INTO payments (
        organization_id,
        booking_id,
        booking_stage_id,
        customer_id,
        payment_code,
        amount,
        payment_mode,
        transaction_type,
        reference_no,
        payment_status,
        paid_at
    )
    VALUES
        (org_id, v_booking_id, v_stage_id, v_customer_id, 'RCPT-1001', 1045000.00, 'bank_transfer', 'booking', 'UTR123456', 'completed', CURRENT_TIMESTAMP - INTERVAL '9 days'),
        (org_id, v_booking_id, NULL, v_customer_id, 'RCPT-1002', 1500000.00, 'upi', 'stage', 'UPI987654', 'completed', CURRENT_TIMESTAMP - INTERVAL '2 days')
    ON CONFLICT (organization_id, payment_code) DO UPDATE
    SET amount = EXCLUDED.amount,
        payment_mode = EXCLUDED.payment_mode,
        payment_status = EXCLUDED.payment_status;

    INSERT INTO telephony_providers (organization_id, provider_name, provider_key, status, config)
    VALUES (
        org_id,
        'Generic HTTP Dialer',
        'generic-http',
        'active',
        jsonb_build_object(
            'adapter',
            'generic_http',
            'call_url',
            'https://your-telephony-provider.example.com/calls',
            'auth_header',
            'Authorization',
            'auth_token',
            'Bearer replace-with-provider-token',
            'from_number',
            '+91 90000 00000',
            'callback_base_url',
            'http://localhost:8000',
            'webhook_token',
            'change-this-provider-token'
        )
    )
    ON CONFLICT (organization_id, provider_key) DO UPDATE
    SET provider_name = EXCLUDED.provider_name,
        status = EXCLUDED.status,
        config = EXCLUDED.config
    RETURNING id INTO v_provider_id;

    UPDATE telephony_providers
    SET status = 'inactive'
    WHERE organization_id = org_id
      AND provider_key <> 'generic-http';

    INSERT INTO call_sessions (
        organization_id,
        provider_id,
        lead_id,
        assigned_user_id,
        trigger_source,
        direction,
        status,
        started_at,
        bridged_at,
        ended_at,
        disposition,
        provider_call_reference
    )
    SELECT
        org_id,
        v_provider_id,
        v_lead_id,
        sales_id,
        'lead_auto_call',
        'outbound',
        'completed',
        CURRENT_TIMESTAMP - INTERVAL '3 hours',
        CURRENT_TIMESTAMP - INTERVAL '2 hours 59 minutes',
        CURRENT_TIMESTAMP - INTERVAL '2 hours 52 minutes',
        'site_visit_scheduled',
        'DEMO-CALL-1001'
    WHERE NOT EXISTS (
        SELECT 1 FROM call_sessions
        WHERE organization_id = org_id AND provider_call_reference = 'DEMO-CALL-1001'
    );

    SELECT id INTO v_call_id
    FROM call_sessions
    WHERE organization_id = org_id AND provider_call_reference = 'DEMO-CALL-1001'
    LIMIT 1;

    INSERT INTO call_legs (organization_id, call_session_id, leg_type, user_id, phone, status, started_at, answered_at, ended_at, duration_seconds)
    SELECT org_id, v_call_id, 'agent', sales_id, '+91 90000 00002', 'completed', CURRENT_TIMESTAMP - INTERVAL '3 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours 59 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours 52 minutes', 420
    WHERE NOT EXISTS (SELECT 1 FROM call_legs WHERE call_session_id = v_call_id AND leg_type = 'agent');

    INSERT INTO call_legs (organization_id, call_session_id, leg_type, lead_id, phone, status, started_at, answered_at, ended_at, duration_seconds)
    SELECT org_id, v_call_id, 'lead', v_lead_id, '+91 91111 11111', 'completed', CURRENT_TIMESTAMP - INTERVAL '2 hours 59 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours 58 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours 52 minutes', 360
    WHERE NOT EXISTS (SELECT 1 FROM call_legs WHERE call_session_id = v_call_id AND leg_type = 'lead');

    INSERT INTO call_events (organization_id, call_session_id, event_type, event_payload)
    SELECT org_id, v_call_id, 'demo_completed', '{"result": "lead asked for Sunday visit"}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM call_events WHERE call_session_id = v_call_id AND event_type = 'demo_completed');

    INSERT INTO message_templates (organization_id, template_name, channel, content, variables, is_active)
    VALUES (org_id, 'Site Visit Confirmation', 'whatsapp', 'Your site visit is confirmed for Sunday at Horizon Heights Phase II.', '["lead_name", "project_name"]'::jsonb, TRUE)
    ON CONFLICT (organization_id, template_name, channel) DO UPDATE
    SET content = EXCLUDED.content,
        is_active = TRUE
    RETURNING id INTO v_template_id;

    INSERT INTO outbound_messages (organization_id, lead_id, template_id, channel, recipient_phone, content, status, sent_by, sent_at)
    SELECT org_id, v_lead_id, v_template_id, 'whatsapp', '+91 91111 11111', 'Your site visit is confirmed for Sunday at Horizon Heights Phase II.', 'sent', sales_id, CURRENT_TIMESTAMP - INTERVAL '2 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM outbound_messages
        WHERE organization_id = org_id
          AND recipient_phone = '+91 91111 11111'
          AND content = 'Your site visit is confirmed for Sunday at Horizon Heights Phase II.'
    );

    INSERT INTO employee_shifts (organization_id, shift_name, start_time, end_time, grace_minutes)
    VALUES (org_id, 'General Shift', '09:30', '18:30', 10)
    ON CONFLICT (organization_id, shift_name) DO UPDATE
    SET start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time
    RETURNING id INTO v_shift_id;

    INSERT INTO attendance_records (
        organization_id,
        user_id,
        shift_id,
        attendance_date,
        status,
        check_in_at,
        check_out_at,
        late_minutes,
        work_minutes
    )
    VALUES
        (org_id, sales_id, v_shift_id, CURRENT_DATE, 'present', CURRENT_DATE + TIME '09:35', CURRENT_DATE + TIME '18:34', 5, 539),
        (org_id, finance_id, v_shift_id, CURRENT_DATE, 'present', CURRENT_DATE + TIME '09:24', CURRENT_DATE + TIME '18:20', 0, 536),
        (org_id, ai_id, v_shift_id, CURRENT_DATE, 'present', CURRENT_DATE + TIME '09:30', CURRENT_DATE + TIME '18:30', 0, 540)
    ON CONFLICT (user_id, attendance_date) DO UPDATE
    SET status = EXCLUDED.status,
        check_in_at = EXCLUDED.check_in_at,
        check_out_at = EXCLUDED.check_out_at,
        work_minutes = EXCLUDED.work_minutes;

    INSERT INTO activities (organization_id, entity_type, entity_id, activity_type, description, created_by)
    SELECT org_id, 'booking', v_booking_id, 'created', 'Booking BK-1001 confirmed for Podium Lane 305', sales_id
    WHERE NOT EXISTS (
        SELECT 1 FROM activities WHERE organization_id = org_id AND description = 'Booking BK-1001 confirmed for Podium Lane 305'
    );

    INSERT INTO activities (organization_id, entity_type, entity_id, activity_type, description, created_by)
    SELECT org_id, 'payment', v_booking_id, 'received', 'Payment RCPT-1002 collected by UPI', finance_id
    WHERE NOT EXISTS (
        SELECT 1 FROM activities WHERE organization_id = org_id AND description = 'Payment RCPT-1002 collected by UPI'
    );

    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_data, ip_address)
    SELECT org_id, admin_id, 'seed', org_id, 'sample_data_upserted', '{"source": "database/seed_sample_data.sql"}'::jsonb, '127.0.0.1'
    WHERE NOT EXISTS (
        SELECT 1 FROM audit_logs
        WHERE organization_id = org_id
          AND entity_type = 'seed'
          AND action = 'sample_data_upserted'
    );
END $$;
