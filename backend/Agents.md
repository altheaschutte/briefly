you can run supabase migrations for me, just dont push them live. 
avoid adding new .env variables for configuration purposes. ENV is for test / prod or for secrets / api keys. 
Avoid being overly generous with catching keys like obj.requiredid ? obj.required_id ? obj.requiredId ? we either know what the key is or we should throw an error, we dont try to catch for variations.