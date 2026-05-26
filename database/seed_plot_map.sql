DO $$
DECLARE
    org_id INT;
    admin_id INT;
    v_project_id INT;
    v_map_id INT;
    plot_row RECORD;
    plot_id INT;
BEGIN
    SELECT id INTO org_id FROM organizations WHERE slug = 'saral' LIMIT 1;

    IF org_id IS NULL THEN
        RAISE EXCEPTION 'Organization saral not found. Run seed_sample_data.sql first.';
    END IF;

    SELECT id INTO admin_id
    FROM users
    WHERE organization_id = org_id
    ORDER BY is_super_admin DESC, id
    LIMIT 1;

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
        'Green Valley Plotting',
        'GVP',
        'plotting',
        'Noida Extension',
        'Plotting layout with database-driven SVG map and plot floors.',
        'active'
    )
    ON CONFLICT (organization_id, project_code) DO UPDATE
    SET name = EXCLUDED.name,
        project_type = EXCLUDED.project_type,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        status = EXCLUDED.status
    RETURNING id INTO v_project_id;

    SELECT id INTO v_map_id
    FROM project_maps
    WHERE organization_id = org_id
      AND project_id = v_project_id
      AND map_name = 'Green Valley SVG Plot Map'
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
            'Green Valley SVG Plot Map',
            'svg',
            1,
            TRUE,
            jsonb_build_object('viewBox', '0 0 1200 750', 'svg', $svg$
<svg width="1200" height="750" viewBox="0 0 1200 750" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="750" fill="#f4f8ee"/>
  <rect x="60" y="60" width="1080" height="620" rx="28" fill="#d9f2c7" stroke="#3f7d20" stroke-width="6"/>
  <rect id="road_main" x="80" y="330" width="1040" height="90" rx="12" fill="#4b5563"/>
  <rect id="road_vertical" x="555" y="330" width="90" height="300" rx="12" fill="#4b5563"/>
  <line x1="110" y1="375" x2="1090" y2="375" stroke="#ffffff" stroke-width="4" stroke-dasharray="35 28"/>
  <line x1="600" y1="350" x2="600" y2="610" stroke="#ffffff" stroke-width="4" stroke-dasharray="35 28"/>
  <text x="470" y="390" fill="white" font-size="26" font-family="Arial" font-weight="bold">24 FT WIDE ROAD</text>
  <text x="615" y="555" fill="white" font-size="22" font-family="Arial" transform="rotate(-90 615 555)">24 FT WIDE ROAD</text>
  <g class="plots">
    <rect id="plot_A1" x="100" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A2" x="295" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A3" x="490" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A4" x="685" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A5" x="880" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B1" x="100" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B2" x="295" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B3" x="685" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B4" x="880" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B5" x="490" y="450" width="60" height="180" rx="10" fill="#a3d977" stroke="white" stroke-width="4"/>
  </g>
  <g fill="white" font-family="Arial" font-weight="bold" text-anchor="middle">
    <text x="192" y="195" font-size="24">PLOT 1</text>
    <text x="387" y="195" font-size="24">PLOT 2</text>
    <text x="582" y="195" font-size="24">PLOT 3</text>
    <text x="777" y="195" font-size="24">PLOT 4</text>
    <text x="972" y="195" font-size="24">PLOT 5</text>
    <text x="192" y="545" font-size="24">PLOT 6</text>
    <text x="387" y="545" font-size="24">PLOT 7</text>
    <text x="775" y="545" font-size="24">PLOT 8</text>
    <text x="972" y="545" font-size="24">PLOT 9</text>
    <text x="520" y="545" font-size="18">PLOT 10</text>
  </g>
  <g id="trees">
    <circle cx="90" cy="80" r="28" fill="#3f7d20"/>
    <circle cx="160" cy="75" r="22" fill="#4f8f2f"/>
    <circle cx="250" cy="75" r="18" fill="#5fa83b"/>
    <circle cx="350" cy="75" r="22" fill="#3f7d20"/>
    <circle cx="470" cy="75" r="18" fill="#5fa83b"/>
    <circle cx="620" cy="75" r="24" fill="#3f7d20"/>
    <circle cx="760" cy="75" r="18" fill="#5fa83b"/>
    <circle cx="900" cy="75" r="24" fill="#3f7d20"/>
    <circle cx="1040" cy="75" r="20" fill="#5fa83b"/>
    <circle cx="1110" cy="130" r="26" fill="#3f7d20"/>
    <circle cx="85" cy="250" r="22" fill="#4f8f2f"/>
    <circle cx="85" cy="480" r="24" fill="#3f7d20"/>
    <circle cx="135" cy="660" r="28" fill="#3f7d20"/>
    <circle cx="320" cy="660" r="22" fill="#5fa83b"/>
    <circle cx="520" cy="660" r="20" fill="#4f8f2f"/>
    <circle cx="720" cy="660" r="25" fill="#3f7d20"/>
    <circle cx="900" cy="660" r="22" fill="#5fa83b"/>
    <circle cx="1080" cy="650" r="30" fill="#3f7d20"/>
    <circle cx="1115" cy="500" r="24" fill="#4f8f2f"/>
    <circle cx="1115" cy="300" r="22" fill="#5fa83b"/>
  </g>
  <g fill="#6aa84f">
    <circle cx="210" cy="665" r="10"/>
    <circle cx="235" cy="665" r="10"/>
    <circle cx="260" cy="665" r="10"/>
    <circle cx="805" cy="665" r="10"/>
    <circle cx="830" cy="665" r="10"/>
    <circle cx="855" cy="665" r="10"/>
    <circle cx="1085" cy="210" r="9"/>
    <circle cx="1095" cy="240" r="9"/>
    <circle cx="1090" cy="270" r="9"/>
  </g>
  <rect x="535" y="650" width="35" height="45" fill="#d6c3a3" stroke="#8b7355" stroke-width="3"/>
  <rect x="630" y="650" width="35" height="45" fill="#d6c3a3" stroke="#8b7355" stroke-width="3"/>
  <text x="600" y="720" font-size="22" fill="#374151" font-family="Arial" font-weight="bold" text-anchor="middle">ENTRY</text>
  <g transform="translate(1080,70)">
    <text x="0" y="-25" font-size="22" font-weight="bold" text-anchor="middle">N</text>
    <text x="0" y="45" font-size="18" font-weight="bold" text-anchor="middle">S</text>
    <text x="-42" y="10" font-size="18" font-weight="bold" text-anchor="middle">W</text>
    <text x="42" y="10" font-size="18" font-weight="bold" text-anchor="middle">E</text>
    <polygon points="0,-20 8,0 0,20 -8,0" fill="#111827"/>
    <polygon points="-20,0 0,-8 20,0 0,8" fill="#111827"/>
  </g>
</svg>
$svg$),
            admin_id
        )
        RETURNING id INTO v_map_id;
    ELSE
        UPDATE project_maps
        SET map_data = jsonb_build_object('viewBox', '0 0 1200 750', 'svg', $svg$
<svg width="1200" height="750" viewBox="0 0 1200 750" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="750" fill="#f4f8ee"/>
  <rect x="60" y="60" width="1080" height="620" rx="28" fill="#d9f2c7" stroke="#3f7d20" stroke-width="6"/>
  <rect id="road_main" x="80" y="330" width="1040" height="90" rx="12" fill="#4b5563"/>
  <rect id="road_vertical" x="555" y="330" width="90" height="300" rx="12" fill="#4b5563"/>
  <g class="plots">
    <rect id="plot_A1" x="100" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A2" x="295" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A3" x="490" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A4" x="685" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_A5" x="880" y="100" width="185" height="200" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B1" x="100" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B2" x="295" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B3" x="685" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B4" x="880" y="450" width="185" height="180" rx="10" fill="#8bc34a" stroke="white" stroke-width="4"/>
    <rect id="plot_B5" x="490" y="450" width="60" height="180" rx="10" fill="#a3d977" stroke="white" stroke-width="4"/>
  </g>
  <g fill="white" font-family="Arial" font-weight="bold" text-anchor="middle"><text x="192" y="195" font-size="24">PLOT 1</text><text x="387" y="195" font-size="24">PLOT 2</text><text x="582" y="195" font-size="24">PLOT 3</text><text x="777" y="195" font-size="24">PLOT 4</text><text x="972" y="195" font-size="24">PLOT 5</text><text x="192" y="545" font-size="24">PLOT 6</text><text x="387" y="545" font-size="24">PLOT 7</text><text x="775" y="545" font-size="24">PLOT 8</text><text x="972" y="545" font-size="24">PLOT 9</text><text x="520" y="545" font-size="18">PLOT 10</text></g>
  <text x="600" y="720" font-size="22" fill="#374151" font-family="Arial" font-weight="bold" text-anchor="middle">ENTRY</text>
</svg>
$svg$)
        WHERE id = v_map_id;
    END IF;

    FOR plot_row IN
        SELECT *
        FROM (
            VALUES
                ('plot_A1', 'PLOT 1', 'available', 1, 1850.00, 6500000.00),
                ('plot_A2', 'PLOT 2', 'available', 2, 1850.00, 6700000.00),
                ('plot_A3', 'PLOT 3', 'hold', 3, 1850.00, 6900000.00),
                ('plot_A4', 'PLOT 4', 'available', 4, 1850.00, 7000000.00),
                ('plot_A5', 'PLOT 5', 'available', 5, 1850.00, 7200000.00),
                ('plot_B1', 'PLOT 6', 'booked', 6, 1665.00, 6100000.00),
                ('plot_B2', 'PLOT 7', 'available', 7, 1665.00, 6150000.00),
                ('plot_B3', 'PLOT 8', 'sold', 8, 1665.00, 6400000.00),
                ('plot_B4', 'PLOT 9', 'available', 9, 1665.00, 6500000.00),
                ('plot_B5', 'PLOT 10', 'available', 10, 600.00, 2500000.00)
        ) AS p(code, name, status, sort_order, area, price)
    LOOP
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
        VALUES (
            org_id,
            v_project_id,
            'plot',
            plot_row.code,
            plot_row.name,
            plot_row.status,
            'active_sales',
            1,
            'GVP/' || plot_row.code,
            plot_row.sort_order
        )
        ON CONFLICT (project_id, entity_code) DO UPDATE
        SET name = EXCLUDED.name,
            inventory_status = EXCLUDED.inventory_status,
            lifecycle_stage = EXCLUDED.lifecycle_stage,
            level_no = EXCLUDED.level_no,
            path = EXCLUDED.path,
            sort_order = EXCLUDED.sort_order
        RETURNING id INTO plot_id;

        INSERT INTO inventory_dimensions (organization_id, inventory_entity_id, saleable_area, measurement_unit)
        VALUES (org_id, plot_id, plot_row.area, 'sqyd')
        ON CONFLICT (inventory_entity_id) DO UPDATE
        SET saleable_area = EXCLUDED.saleable_area,
            measurement_unit = EXCLUDED.measurement_unit;

        INSERT INTO inventory_pricing (organization_id, inventory_entity_id, final_price, price_per_sqft)
        VALUES (org_id, plot_id, plot_row.price, ROUND((plot_row.price / NULLIF(plot_row.area, 0))::numeric, 2))
        ON CONFLICT (inventory_entity_id) DO UPDATE
        SET final_price = EXCLUDED.final_price,
            price_per_sqft = EXCLUDED.price_per_sqft;

        INSERT INTO inventory_details (organization_id, inventory_entity_id, facing, display_note)
        VALUES (org_id, plot_id, 'Internal Road', 'Click plot to manage floors, customer, broker, booking, payment and documents.')
        ON CONFLICT (inventory_entity_id) DO UPDATE
        SET facing = EXCLUDED.facing,
            display_note = EXCLUDED.display_note;

        INSERT INTO inventory_entities (
            organization_id,
            project_id,
            parent_id,
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
            (org_id, v_project_id, plot_id, 'floor', plot_row.code || '_F1', plot_row.name || ' Floor 1', plot_row.status, 'active_sales', 2, 'GVP/' || plot_row.code || '/F1', 1),
            (org_id, v_project_id, plot_id, 'floor', plot_row.code || '_F2', plot_row.name || ' Floor 2', 'available', 'active_sales', 2, 'GVP/' || plot_row.code || '/F2', 2)
        ON CONFLICT (project_id, entity_code) DO UPDATE
        SET parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            inventory_status = EXCLUDED.inventory_status,
            path = EXCLUDED.path;

        INSERT INTO map_elements (
            organization_id,
            project_map_id,
            inventory_entity_id,
            element_id,
            element_type,
            is_interactive,
            metadata
        )
        VALUES (
            org_id,
            v_map_id,
            plot_id,
            plot_row.code,
            'plot',
            TRUE,
            jsonb_build_object('label', plot_row.name)
        )
        ON CONFLICT (project_map_id, element_id) DO UPDATE
        SET inventory_entity_id = EXCLUDED.inventory_entity_id,
            element_type = 'plot',
            is_interactive = TRUE,
            metadata = EXCLUDED.metadata;
    END LOOP;
END $$;
