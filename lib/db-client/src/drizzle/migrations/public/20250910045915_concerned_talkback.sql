CREATE OR REPLACE VIEW users AS 
SELECT id, email, username, access_level
FROM app_internal.users;