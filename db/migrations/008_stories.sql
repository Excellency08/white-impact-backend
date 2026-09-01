CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(160) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url VARCHAR(500),
  hero_image_alt VARCHAR(255),
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_name VARCHAR(255) NOT NULL,
  author_role VARCHAR(255),
  program_slug VARCHAR(120) REFERENCES programs(slug) ON DELETE SET NULL,
  location VARCHAR(255),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  publication_date DATE,
  seo_title VARCHAR(255),
  seo_description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_slug
  ON stories (slug);

CREATE INDEX IF NOT EXISTS idx_stories_program_slug
  ON stories (program_slug);

CREATE INDEX IF NOT EXISTS idx_stories_publication_date
  ON stories (publication_date DESC);

CREATE INDEX IF NOT EXISTS idx_stories_is_active
  ON stories (is_active);

CREATE INDEX IF NOT EXISTS idx_stories_display_order
  ON stories (display_order ASC);

INSERT INTO stories (
  slug,
  title,
  excerpt,
  content,
  hero_image_url,
  hero_image_alt,
  images,
  gallery,
  author_name,
  author_role,
  program_slug,
  location,
  tags,
  publication_date,
  seo_title,
  seo_description,
  display_order,
  is_featured,
  is_active
)
SELECT *
FROM (
  VALUES
    (
      'back-to-class-in-saminaka',
      'Back to Class in Saminaka',
      'A caregiver shared how education support helped her son return to school and brought stability back to the household.',
      '[{"type":"paragraph","text":"The biggest change was not only the school enrollment itself. It was the sense of stability that returned to the household once a child could learn again."},{"type":"paragraph","text":"This story reflects the heart of Edu4All: practical support for displaced and underserved families, coupled with safeguarding and caregiver empowerment."},{"type":"quote","text":"I am beyond happy to see my son enrolled in school and to have received empowerment to start a business.","attribution":"Edu4All Beneficiary, Saminaka Community"}]'::jsonb,
      './assets/images/education 1.jpg',
      'Children supported by the Edu4All response',
      '[{"url":"./assets/images/education 1.jpg","alt":"Children learning in class"},{"url":"./assets/images/education  3.jpg","alt":"Learning activity"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM.jpeg","alt":"Community education outreach"}]'::jsonb,
      '[{"url":"./assets/images/education 1.jpg","alt":"Children learning in class"},{"url":"./assets/images/education  3.jpg","alt":"Learning activity"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM.jpeg","alt":"Community education outreach"}]'::jsonb,
      'White Impact Team',
      'Community education desk',
      'edu4all',
      'Saminaka Community, Kaduna State',
      '["education","children","community support","safeguarding"]'::jsonb,
      DATE '2026-08-27',
      'Back to Class in Saminaka | White Impact Development Initiative',
      'A caregiver shared how education support helped her son return to school and brought stability back to the household.',
      1,
      TRUE,
      TRUE
    ),
    (
      'young-voices-in-civic-action',
      'Young Voices in Civic Action',
      'Participants in the civic accountability lab learned how to question public decisions and work with peers to improve services.',
      '[{"type":"paragraph","text":"Civic education works best when young people can connect ideas to action. In the civic lab, participants practiced social monitoring, accountability conversations, and peer-led advocacy."},{"type":"paragraph","text":"The result is a growing network of young leaders who can spot gaps, ask questions, and help shape public systems."},{"type":"quote","text":"I now know how to question public decisions and work with my peers to improve services.","attribution":"NextGen participant"}]'::jsonb,
      './assets/images/nextGen.jpeg',
      'Youth civic accountability work',
      '[{"url":"./assets/images/nextGen.jpeg","alt":"Youth civic action session"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM (1).jpeg","alt":"Community discussion"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM (2).jpeg","alt":"Youth meeting"}]'::jsonb,
      '[{"url":"./assets/images/nextGen.jpeg","alt":"Youth civic action session"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM (1).jpeg","alt":"Community discussion"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM (2).jpeg","alt":"Youth meeting"}]'::jsonb,
      'White Impact Team',
      'Civic participation desk',
      'nextgen-civic-lab',
      'Kaduna State',
      '["youth","governance","accountability","civic participation"]'::jsonb,
      DATE '2026-08-27',
      'Young Voices in Civic Action | White Impact Development Initiative',
      'Participants in the civic accountability lab learned how to question public decisions and work with peers to improve services.',
      2,
      TRUE,
      TRUE
    ),
    (
      'creative-lab-community-voice',
      'Creative Lab Community Voice',
      'Creative Lab helped young storytellers turn community experience into media that could travel beyond the neighborhood.',
      '[{"type":"paragraph","text":"Storytelling becomes advocacy when it is grounded in lived experience. Creative Lab gives young creators the tools to document their communities and share what change looks like on the ground."},{"type":"paragraph","text":"The lab supports media production, storytelling workshops, and campaign work that amplifies the voices already pushing for change."},{"type":"quote","text":"The lab gave us a way to tell our own story and advocate for what matters.","attribution":"Creative Lab participant"}]'::jsonb,
      './assets/images/creative-lab.jpeg',
      'Creative storytelling and media production',
      '[{"url":"./assets/images/creative-lab.jpeg","alt":"Creative lab workspace"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM.jpeg","alt":"Storytelling activity"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.51 PM.jpeg","alt":"Creative collaboration"}]'::jsonb,
      '[{"url":"./assets/images/creative-lab.jpeg","alt":"Creative lab workspace"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.50 PM.jpeg","alt":"Storytelling activity"},{"url":"./assets/images/WhatsApp Image 2026-06-24 at 12.14.51 PM.jpeg","alt":"Creative collaboration"}]'::jsonb,
      'White Impact Team',
      'Creative engagement desk',
      'creative-lab',
      'Kaduna State and online',
      '["storytelling","media","creative advocacy","youth voices"]'::jsonb,
      DATE '2026-08-27',
      'Creative Lab Community Voice | White Impact Development Initiative',
      'Creative Lab helped young storytellers turn community experience into media that could travel beyond the neighborhood.',
      3,
      TRUE,
      TRUE
    )
) AS seed(
  slug,
  title,
  excerpt,
  content,
  hero_image_url,
  hero_image_alt,
  images,
  gallery,
  author_name,
  author_role,
  program_slug,
  location,
  tags,
  publication_date,
  seo_title,
  seo_description,
  display_order,
  is_featured,
  is_active
)
WHERE NOT EXISTS (SELECT 1 FROM stories);
