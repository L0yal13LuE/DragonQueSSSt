-- Add last_feed column to user_pets table
ALTER TABLE user_pets
ADD COLUMN last_feed TIMESTAMP WITH TIME ZONE;

-- Optional: Update existing records with a default value if needed
-- UPDATE user_pets SET last_feed = NOW() WHERE last_feed IS NULL;
