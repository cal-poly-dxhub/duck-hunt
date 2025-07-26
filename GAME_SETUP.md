# Game Setup

## Setup Process

### 1. Configure Game Stack

If using an existing stack:

- Delete the database items (in `ScavengerHuntData` table in DynamoDB)
- Delete files in photos and game config buckets (in `game-config` and `photo-bucket` in S3)
- Upload new configuration to game config bucket (see `example-config.json`)
- Database will populate automatically

### 2. Retrieve Game URLs

Check CloudWatch logs (`CreateGameLambdaLogGroup`) for:

**Team URLs** - Starting links for each team

- Shows: team name, ID, and URL

**Level URLs** - Links placed at physical locations

- Shows: level name (location name), ID, occurrence count, and URL

## Optional Additional Documentation

- **Custom Deployment**: Follow `README.md` to develop/deploy your own stack
- **Database Reference**: See `DB_SCHEMA.md` for database structure details
