"use strict";

/*
 * Shared-list connection for Supabase.
 *
 * Fill in your project's URL and anon (public) key to load shared lists.
 * The site UI lets the recorded maker edit a list and shows other lists as
 * view-only. Leave url empty and each browser keeps private local files.
 *
 *   1. Create a free project at https://supabase.com
 *   2. Run migrations 0001, 0002 and 0003 from supabase/migrations/ in order
 *   3. Copy the Project URL and anon public key from
 *      Project Settings → API, and paste them below.
 *
 * Important: the current browser-side login is not server authentication.
 * The anon key is public and the current RLS policies allow API writes, so
 * the owner-only UI is not a security boundary. See README.md.
 */
window.SUPABASE_CONFIG = {
  url: "https://xgaojserktdecclcaptd.supabase.co",
  anonKey: "sb_publishable_AYpE-D48rLe2aT1Vh3yBHg_K25eCwcD",
  listId: "main"
};
