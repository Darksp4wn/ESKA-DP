import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://dadtfwggctppvlthfakk.supabase.co';

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
