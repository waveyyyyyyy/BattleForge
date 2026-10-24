-- Permanent, code-only referrals with lifetime one-referrer enforcement.
ALTER TABLE public.player_accounts ADD COLUMN IF NOT EXISTS referred_by_player_number bigint;

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid := auth.uid(); v_player public.player_accounts%ROWTYPE; v_inviter public.player_accounts%ROWTYPE; v_code bigint;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'You must be logged in to apply a referral code.'; END IF;
 IF p_code IS NULL OR btrim(p_code) !~ '^[0-9]{1,19}$' THEN RAISE EXCEPTION 'Referral code not found or invalid.'; END IF;
 v_code := btrim(p_code)::bigint;
 SELECT * INTO v_player FROM public.player_accounts WHERE user_id=v_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Player account not found.'; END IF;
 IF v_player.referred_by IS NOT NULL OR v_player.referred_by_player_number IS NOT NULL THEN RAISE EXCEPTION 'A referral code has already been applied and cannot be changed.'; END IF;
 SELECT * INTO v_inviter FROM public.player_accounts WHERE player_number=v_code;
 IF NOT FOUND THEN RAISE EXCEPTION 'Referral code not found.'; END IF;
 IF v_inviter.user_id=v_user_id THEN RAISE EXCEPTION 'You cannot use your own referral code.'; END IF;
 UPDATE public.player_accounts SET referred_by=v_inviter.user_id, referred_by_player_number=v_inviter.player_number WHERE user_id=v_user_id AND referred_by IS NULL AND referred_by_player_number IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'A referral code has already been applied and cannot be changed.'; END IF;
 RETURN jsonb_build_object('success',true,'referred_by_player_number',v_inviter.player_number);
END; $$;
REVOKE ALL ON FUNCTION public.apply_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_referral_reassignment() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.referred_by IS NOT NULL AND NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN RAISE EXCEPTION 'Referral attribution is permanent and cannot be changed.'; END IF;
 IF OLD.referred_by_player_number IS NOT NULL AND NEW.referred_by_player_number IS DISTINCT FROM OLD.referred_by_player_number THEN RAISE EXCEPTION 'Referral attribution is permanent and cannot be changed.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS player_accounts_referral_immutable ON public.player_accounts;
CREATE TRIGGER player_accounts_referral_immutable BEFORE UPDATE OF referred_by,referred_by_player_number ON public.player_accounts FOR EACH ROW EXECUTE FUNCTION public.prevent_referral_reassignment();

UPDATE public.player_accounts p SET referred_by_player_number=i.player_number FROM public.player_accounts i WHERE p.referred_by=i.user_id AND p.referred_by_player_number IS NULL;
CREATE OR REPLACE FUNCTION public.sync_referral_player_number() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.referred_by IS NULL THEN NEW.referred_by_player_number:=NULL;
 ELSE SELECT player_number INTO NEW.referred_by_player_number FROM public.player_accounts WHERE user_id=NEW.referred_by;
  IF NEW.referred_by_player_number IS NULL THEN RAISE EXCEPTION 'Referral attribution does not match a valid player.'; END IF;
 END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS player_accounts_sync_referral_number ON public.player_accounts;
CREATE TRIGGER player_accounts_sync_referral_number BEFORE INSERT OR UPDATE OF referred_by ON public.player_accounts FOR EACH ROW EXECUTE FUNCTION public.sync_referral_player_number();
