/* eslint-disable @typescript-eslint/no-require-imports */
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
    if (v.startsWith("\"") && v.endsWith("\"")) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

// Load .env.local in the same app directory
const envPath = path.resolve(__dirname, '..', '.env.local');
loadEnv(envPath);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE URL or SERVICE ROLE KEY. Check .env.local');
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
  const normalizedEmail = email.trim().toLowerCase();

  // Look for an existing active, unconsumed bootstrap grant for this email/role/term
  let where = supabase.from('bootstrap_role_grants').select('id,is_active,consumed_at');
  where = where.eq('email_normalized', normalizedEmail).eq('role_key', 'president');
  if (termId === null) {
    where = where.is('term_id', null);
  } else {
    where = where.eq('term_id', termId);
  }

  const { data: existingGrants, error: existingErr } = await where.limit(1);
  if (existingErr) {
    console.error('bootstrap_role_grants lookup error:', existingErr.message);
  } else if (existingGrants && existingGrants.length > 0) {
    const g = existingGrants[0];
    if (!g.is_active || g.consumed_at !== null) {
      const { error: updateErr } = await supabase.from('bootstrap_role_grants').update({ is_active: true, notes: 'Ensure president bootstrap' }).eq('id', g.id);
      if (updateErr) console.error('bootstrap_role_grants update error:', updateErr.message);
      else console.log('bootstrap_role_grants updated to active');
    } else {
      console.log('bootstrap_role_grants already present and active');
    }
  } else {
    const { error: insertErr } = await supabase.from('bootstrap_role_grants').insert({
      email,
      role_key: 'president',
      term_id: termId,
      notes: 'Ensure president bootstrap',
      is_active: true,
    });
    if (insertErr) console.error('bootstrap_role_grants insert error:', insertErr.message);
    else console.log('bootstrap_role_grants inserted');
  }

  console.log('Checking if a user already exists with that email (profile_private)');
  const { data: profiles, error: profErr } = await supabase.from('profile_private').select('id,email').ilike('email', email).limit(1);
  if (profErr) {
    console.error('profile_private select error:', profErr.message);
  } else if (profiles && profiles.length > 0) {
    const userId = profiles[0].id;
    console.log('Found user id', userId, '— ensuring role_assignments');

    // Check for an existing active assignment (ends_at is null)
    let raQuery = supabase.from('role_assignments').select('id,ends_at').eq('user_id', userId).eq('role_key', 'president');
    if (termId === null) {
      raQuery = raQuery.is('term_id', null);
    } else {
      raQuery = raQuery.eq('term_id', termId);
    }
    const { data: existingRA, error: existingRAErr } = await raQuery.limit(1);
    if (existingRAErr) {
      console.error('role_assignments lookup error:', existingRAErr.message);
    } else if (existingRA && existingRA.length > 0 && existingRA[0].ends_at === null) {
      console.log('role_assignments already exists and active');
    } else {
      const { error: raInsertErr } = await supabase.from('role_assignments').insert({
        user_id: userId,
        role_key: 'president',
        term_id: termId,
        starts_at: new Date().toISOString(),
        ends_at: null,
        is_primary: false,
      });
      if (raInsertErr) console.error('role_assignments insert error:', raInsertErr.message);
      else console.log('role_assignments inserted');
    }
  } else {
    console.log('No existing user found for that email — role will be granted on signup via bootstrap grant.');
  }

  console.log('Done. Verify in Supabase SQL if needed.');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
