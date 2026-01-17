-- Create trigger to auto-create profiles on new auth.users
-- and backfill missing profiles

-- 1) Ensure the trigger exists on auth.users calling public.handle_new_user
-- Note: handle_new_user already exists with SECURITY DEFINER

begin;

-- Drop existing trigger if present to avoid duplicates
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to insert into public.profiles after a new user is created
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill: insert profiles for any existing users missing a profile
INSERT INTO public.profiles (user_id, full_name, email)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email) AS full_name,
       u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

commit;