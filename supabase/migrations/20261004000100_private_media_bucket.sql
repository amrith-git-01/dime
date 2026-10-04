-- Private bucket for receipts and voice notes (security fix S5).
--
-- The API stores only the object path (e.g. receipts/<user_id>/receipts/<day>/<ts>.jpg) in
-- transactions.receipt_url / voice_url and returns 6-hour signed URLs at read time, so these
-- objects must NOT be publicly readable. Avatars and email postcard assets stay in the existing
-- public bucket (STORAGE_BUCKET, default "Dime").
--
-- Deploy notes:
--   * Set PRIVATE_STORAGE_BUCKET to this bucket's name (default: Dime-private).
--   * Existing rows still hold full public URLs into the old bucket. The API extracts the
--     bucket and path from those URLs and signs them, so they keep working. To retire public
--     access to old receipts, re-upload them into the private bucket (do not edit
--     storage.objects by hand) and then restrict the old bucket's receipts/ and voice_inputs/
--     folders with a policy or remove the objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'Dime-private',
  'Dime-private',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm',
    'audio/x-caf'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The backend uses the service role (bypasses RLS) to upload and sign. Clients never touch
-- this bucket directly, so the only policy allows an authenticated user to read their own
-- objects (second path segment = user id); there is no insert/update/delete policy.
drop policy if exists "private media: owner can read" on storage.objects;
create policy "private media: owner can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'Dime-private'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
