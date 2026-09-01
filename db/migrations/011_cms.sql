CREATE TABLE IF NOT EXISTS cms_pages (
  id SERIAL PRIMARY KEY,
  page_key VARCHAR(120) UNIQUE NOT NULL,
  page_type VARCHAR(80) NOT NULL DEFAULT 'page',
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  hero_image_url VARCHAR(500),
  hero_image_alt VARCHAR(255),
  seo_title VARCHAR(255),
  seo_description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Published',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_page_type
  ON cms_pages (page_type, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_cms_pages_status
  ON cms_pages (status, is_active);

INSERT INTO cms_pages (
  page_key,
  page_type,
  title,
  summary,
  body,
  settings,
  seo_title,
  seo_description,
  status,
  display_order,
  is_active
)
SELECT *
FROM (
  VALUES
    (
      'site-settings',
      'global',
      'Site Settings',
      'Global contact details, social links, and brand settings used across the site.',
      '{"siteName":"White Impact Development Initiative","tagline":"Community-led change","contact":{"email":"whiteimpactinitiative@gmail.com","phone":"+234 706 529 9613","address":"No. 4A Marafa Estate Kaduna, Kaduna State, Nigeria."},"socialLinks":{"facebook":"https://www.facebook.com/share/18rQd6wgFj/","x":"https://x.com/whiteimpactinitiative","linkedin":"https://linkedin.com/company/white-initiative-project"},"footerNote":"Community-led education, digital inclusion, advocacy, and humanitarian support across Nigeria.","supportCta":{"label":"Donate","href":"donate.html"}}'::jsonb,
      '{"theme":"sandstone","showAdminLink":true}'::jsonb,
      'White Impact Development Initiative',
      'Global contact details, social links, and brand settings for White Impact Development Initiative.',
      'Published',
      1,
      TRUE
    ),
    (
      'homepage',
      'page',
      'Homepage',
      'Homepage sections and editorial content used to shape the public landing page.',
      '{"missionTitle":"Communities experiencing crisis are not passive beneficiaries of aid.","missionLead":"White Impact Development Initiative was founded in 2025 and registered with the Corporate Affairs Commission of Nigeria in 2025 in response to the intersecting humanitarian, social, and governance challenges affecting underserved communities across Nigeria.","supportMessage":"Stand with community-led change by supporting education, protection, and digital opportunity.","sections":["mission","impact","programs","stories","partners","transparency"]}'::jsonb,
      '{"layout":"storytelling","showImpactStats":true}'::jsonb,
      'Homepage | White Impact Development Initiative',
      'White Impact Development Initiative empowers underserved youth and communities through inclusive education, digital skills, and sustainable development.',
      'Published',
      2,
      TRUE
    ),
    (
      'hero',
      'section',
      'Hero',
      'Homepage hero copy, calls to action, and featured response content.',
      '{"kicker":"Youth led · Community centered · Impact driven","title":"Changing systems by backing the people already building them.","lead":"White Impact Development Initiative works with young people, women, and crisis-affected communities to expand education, digital opportunity, protection, and civic participation across Nigeria.","primaryCta":{"label":"See Our Work","href":"#programs"},"secondaryCta":{"label":"Get Involved","href":"work-with-us.html"},"featured":{"title":"Edu4All Initiative","summary":"Bridging education gaps for displaced and underserved children.","href":"edu4all.html"}}'::jsonb,
      '{"spotlight":"featured-response"}'::jsonb,
      'Homepage Hero | White Impact Development Initiative',
      'Homepage hero copy for White Impact Development Initiative.',
      'Published',
      3,
      TRUE
    ),
    (
      'footer',
      'global',
      'Footer',
      'Footer copy, section labels, and connector details for the shared site chrome.',
      '{"intro":"Community-led education, digital inclusion, advocacy, and humanitarian support across Nigeria.","explore":["Home","Impact","Stories","News","Reports","Insights","Contact"],"work":["All Programs","Projects","Edu4All","Blood Donation","Creative Lab","NextGen AI","NextGen Civic Action Lab"],"about":["Our Story","Our Members","Partners","Get Involved","Support Us"],"connect":["info@whiteimpactinitiative.org","+234 706 529 9613","Admin Console"]}'::jsonb,
      '{"layout":"footer-columns"}'::jsonb,
      'Footer | White Impact Development Initiative',
      'Shared footer content for White Impact Development Initiative.',
      'Published',
      4,
      TRUE
    ),
    (
      'seo',
      'global',
      'SEO Defaults',
      'Default metadata and page-specific SEO copy used across the public site.',
      '{"siteTitle":"White Impact Development Initiative","siteDescription":"White Impact Development Initiative empowers underserved youth and communities through inclusive education, digital skills, and sustainable development.","pages":{"home":{"title":"White Impact Development Initiative | Empowering Futures, One Community at a Time","description":"White Impact Development Initiative empowers underserved youth and communities through inclusive education, digital skills, and sustainable development."},"partner-with-us":{"title":"Partner With Us | White Impact Development Initiative","description":"Partner with White Impact Development Initiative to collaborate on education, digital inclusion, and community development programs."},"stories":{"title":"Stories | White Impact Development Initiative","description":"Read editorial stories from White Impact Development Initiative, with field reporting, community voices, and program highlights."},"news":{"title":"News | White Impact Development Initiative","description":"Read White Impact Development Initiative news and announcements from the field and the organization."},"reports":{"title":"Reports | White Impact Development Initiative","description":"Explore White Impact Development Initiative reports, publications, and download analytics."}}}'::jsonb,
      '{"robots":"index,follow"}'::jsonb,
      'SEO Defaults | White Impact Development Initiative',
      'Default metadata and page-specific SEO settings for the White Impact site.',
      'Published',
      5,
      TRUE
    ),
    (
      'partners',
      'collection',
      'Partners',
      'Partner logos and collaboration references used on the public partner page.',
      '{"logos":["UNICEF","UNDP","GIZ","British Council","Ford Foundation","ActionAid","Plan International","Save the Children"]}'::jsonb,
      '{"layout":"marquee","showCounts":false}'::jsonb,
      'Partners | White Impact Development Initiative',
      'Partner logos and collaboration references used on the public partner page.',
      'Published',
      6,
      TRUE
    ),
    (
      'events',
      'collection',
      'Events',
      'Upcoming or featured event items managed by the CMS.',
      '{"items":[]}'::jsonb,
      '{"layout":"list","showEmptyState":true}'::jsonb,
      'Events | White Impact Development Initiative',
      'Upcoming or featured event items managed by the CMS.',
      'Draft',
      7,
      TRUE
    )
) AS seed(
  page_key,
  page_type,
  title,
  summary,
  body,
  settings,
  seo_title,
  seo_description,
  status,
  display_order,
  is_active
)
WHERE NOT EXISTS (SELECT 1 FROM cms_pages);
