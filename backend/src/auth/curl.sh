PROJECT_URL=http://127.0.0.1:54321
ANON_KEY=$SUPABASE_ANON_KEY
EMAIL=$SUPABASE_TEST_EMAIL
PASSWORD=$SUPABASE_TEST_PASSWORD

curl -s -X POST "$PROJECT_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 
  