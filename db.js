// ══════════════════════════════════════════════════════════
//  db.js — Supabase Client Singleton
// ══════════════════════════════════════════════════════════

import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const { createClient } = supabase;   // dari CDN supabase-js
export const db = createClient(SUPABASE_URL, SUPABASE_ANON);
