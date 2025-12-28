const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    // Strip optional surrounding quotes
    if (v.startsWith("\"") && v.endsWith("\"")) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

// Load apps/web/.env.local if present
const envPath = path.resolve(__dirname, '..', 'apps', 'web', '.env.local');
loadEnv(envPath);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE URL or SERVICE ROLE KEY. Check apps/web/.env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const email = 'asgc.president@gcccd.edu';
  console.log('Ensuring invite allowlist entry for', email);
  const { error: upErr1 } = await supabase.from('invites_allowlist').upsert(
    {
      email,
      is_active: true,
      revoked_at: null,
      notes: 'Ensure president allowlist',
    },
    { onConflict: 'email_normalized' },
  );
  if (upErr1) console.error('invites_allowlist upsert error:', upErr1.message);
  else console.log('invites_allowlist upsert OK');

  console.log('Resolving current term id');
  const { data: termRows, error: termErr } = await supabase.from('terms').select('id').eq('is_current', true).limit(1);
  if (termErr) {
    console.error('failed to read terms:', termErr.message);
    process.exit(1);
  }
  const termId = (termRows && termRows[0] && termRows[0].id) || null;
  console.log('current term id =', termId);

  console.log('Ensuring bootstrap_role_grants for', email);
  const { error: upErr2 } = await supabase.from('bootstrap_role_grants').upsert(
    {
      email,
      role_key: 'president',
      term_id: termId,
      notes: 'Ensure president bootstrap',
      is_active: true,
    },
    { onConflict: ['email_normalized', 'role_key', 'term_id'] },
  );
  if (upErr2) console.error('bootstrap_role_grants upsert error:', upErr2.message);
  else console.log('bootstrap_role_grants upsert OK');

  console.log('Checking if a user already exists with that email (profile_private)');
  const { data: profiles, error: profErr } = await supabase.from('profile_private').select('id,email').ilike('email', email).limit(1);
  if (profErr) {
    console.error('profile_private select error:', profErr.message);
  } else if (profiles && profiles.length > 0) {
    const userId = profiles[0].id;
    console.log('Found user id', userId, '— ensuring role_assignments');
    const { error: raErr } = await supabase.from('role_assignments').upsert(
      {
        user_id: userId,
        role_key: 'president',
        term_id: termId,
        starts_at: new Date().toISOString(),
        ends_at: null,
        is_primary: false,
      },
      { onConflict: ['user_id', 'role_key', 'term_id'] },
    );
    if (raErr) console.error('role_assignments upsert error:', raErr.message);
    else console.log('role_assignments upsert OK');
  } else {
    console.log('No existing user found for that email — role will be granted on signup via bootstrap grant.');
  }

  console.log('Done. You can verify in Supabase SQL: select * from bootstrap_role_grants where email_normalized = lower(\'asgc.president@gcccd.edu\');');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
