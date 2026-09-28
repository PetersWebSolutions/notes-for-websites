"use strict";

/*
 * Shared-list connection for Supabase.
 *
 * Fill in your project's URL and anon (public) key and every visitor to the
 * site sees and edits ONE shared list stored online. Leave url empty and the
 * site keeps its original behavior: each browser keeps its own private files.
 *
 *   1. Create a free project at https://supabase.com
 *   2. In the SQL Editor, run the "Shared list setup" block from README.md
 *   3. Copy the Project URL and the anon public key from
 *      Project Settings → API, and paste them below.
 *
 * The anon key is meant to ship in a public page; what people may do with
 * the table is governed by the row-level-security policies from step 2.
 */
window.SUPABASE_CONFIG = {
  url: "https://xgaojserktdecclcaptd.supabase.co",
  anonKey: "sb_publishable_AYpE-D48rLe2aT1Vh3yBHg_K25eCwcD",
  listId: "main"
};
