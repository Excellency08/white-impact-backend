INSERT INTO team_members (full_name, role, bio, display_order, is_active)
SELECT *
FROM (
  VALUES
    ('Dr. Amina Yusuf', 'Executive Director', 'Leading White Impact Initiative with vision for sustainable development.', 1, TRUE),
    ('Emmanuel Okonkwo', 'Program Manager', 'Oversees all development programs and partnerships.', 2, TRUE),
    ('Fatima Bello', 'Finance Officer', 'Manages financial operations and compliance.', 3, TRUE),
    ('Chidi Nwosu', 'Communications Lead', 'Drives strategic communications and public engagement.', 4, TRUE)
) AS seed(full_name, role, bio, display_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM team_members);

