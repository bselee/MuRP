-- Migration 167: Fix email inbox RLS
-- Part of: Email Monitoring System

DROP POLICY IF EXISTS "Allow authenticated users to manage email inbox configs" ON email_inbox_configs;
DROP POLICY IF EXISTS "Users can manage own inbox configs" ON email_inbox_configs;
DROP POLICY IF EXISTS "Users can read own or org inbox configs" ON email_inbox_configs;
DROP POLICY IF EXISTS "Allow authenticated users to read email inbox configs" ON email_inbox_configs;

CREATE POLICY "email_inbox_select_own_or_org"
    ON email_inbox_configs FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "email_inbox_insert_own" ON email_inbox_configs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "email_inbox_update_own" ON email_inbox_configs FOR UPDATE TO authenticated USING (user_id = auth.uid() OR user_id IS NULL) WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "email_inbox_delete_own" ON email_inbox_configs FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "service_role_full_access_email_inbox" ON email_inbox_configs;
CREATE POLICY "service_role_full_access_email_inbox" ON email_inbox_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_read_active_email_inbox" ON email_inbox_configs;
CREATE POLICY "anon_read_active_email_inbox" ON email_inbox_configs FOR SELECT TO anon USING (is_active = true);
DROP POLICY IF EXISTS "Service role manages oauth states" ON oauth_states;
CREATE POLICY "service_role_oauth_states" ON oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "users_read_own_oauth_states" ON oauth_states;
CREATE POLICY "users_read_own_oauth_states" ON oauth_states FOR SELECT TO authenticated USING (user_id = auth.uid());
