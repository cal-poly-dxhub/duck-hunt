# Game Config Schema

## Root Object Schema

| Field          | Type              | Required | Description                                                 |
| -------------- | ----------------- | -------- | ----------------------------------------------------------- |
| `id`           | `string` (UUIDV4) | ❌       | Unique identifier (auto-generated if not provided)          |
| `teams`        | `array<object>`   | ✅       | Array of team objects                                       |
| `levelsInGame` | `integer`         | ❌       | Number of levels each team plays (default: `levels.length`) |
| `levels`       | `array<object>`   | ✅       | Array of level objects                                      |

## Team Object Schema

| Field  | Type              | Required | Description                                        |
| ------ | ----------------- | -------- | -------------------------------------------------- |
| `id`   | `string` (UUIDv4) | ❌       | Unique identifier (auto-generated if not provided) |
| `name` | `string`          | ✅       | Team name                                          |

## Level Object Schema

| Field        | Type              | Required | Description                                        |
| ------------ | ----------------- | -------- | -------------------------------------------------- |
| `id`         | `string` (UUIDv4) | ❌       | Unique identifier (auto-generated if not provided) |
| `levelName`  | `string`          | ✅       | Name/identifier for the level                      |
| `character`  | `object`          | ✅       | Character configuration object                     |
| `location`   | `object`          | ✅       | Location configuration object                      |
| `clues`      | `array<string>`   | ✅       | Array of 3 main clues                              |
| `easyClues`  | `array<string>`   | ✅       | Array of 2 easier clues                            |
| `mapLink`    | `string`          | ✅       | Google Maps link to the location                   |
| `max_tokens` | `integer`         | ✅       | Maximum tokens for AI responses (default: 128)     |

### Character Object

| Field          | Type     | Required | Description                                           |
| -------------- | -------- | -------- | ----------------------------------------------------- |
| `name`         | `string` | ✅       | Famous person, celebrity, or fictional character name |
| `systemPrompt` | `string` | ✅       | Single sentence system prompt for AI persona adoption |

### Location Object

| Field         | Type     | Required | Description                      |
| ------------- | -------- | -------- | -------------------------------- |
| `description` | `string` | ✅       | Text description of the location |
| `latitude`    | `float`  | ✅       | Geographic latitude coordinate   |
| `longitude`   | `float`  | ✅       | Geographic longitude coordinate  |

## Example Structure

```json
{
  "teams": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Team Alpha"
    },
    {
      "name": "Team Beta"
    }
  ],
  "levelsInGame": 5,
  "levels": [
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "levelName": "Downtown Mystery",
      "character": {
        "name": "Sherlock Holmes",
        "systemPrompt": "You are the brilliant detective Sherlock Holmes, speaking with keen observation and deductive reasoning."
      },
      "location": {
        "description": "Historic downtown district with cobblestone streets",
        "latitude": 40.7128,
        "longitude": -74.006
      },
      "clues": [
        "The clock tower chimes at noon",
        "Red brick building with ivy",
        "Fountain in the square"
      ],
      "easyClues": ["Near the main street", "Close to shops"],
      "mapLink": "https://maps.google.com/?q=40.7128,-74.0060",
      "max_tokens": 128
    }
  ]
}
```

## Game Logic Notes

- **Level Order**: The order of levels in the array doesn't matter for gameplay
- **Final Level**: The **last level** in the `levels` array will be the final level for **all teams**
- **Subset Selection**: `levelsInGame` determines how many levels each team will play from the available levels
- **Team Levels**: Each team gets a subset of `levelsInGame` levels, but all teams end with the same final level

## Validation Rules

- **clues**: Must contain at least 3 elements
- **easyClues**: Must contain at least 2 elements
- **latitude**: Valid range -90.0 to 90.0
- **longitude**: Valid range -180.0 to 180.0
- **max_tokens**: Positive integer
- **mapLink**: Should be a valid Google Maps URL
- **id**: Must be valid UUIDv4 format when provided
- **levelsInGame**: Must be ≤ `levels.length`
- **teams**: Must contain at least 1 team
- **levels**: Must contain at least 1 level
- **team.name**: Must be non-empty string
- **levelName**: Must be non-empty string

## Business Rules

1. **Final Level Logic**: The last level in the `levels` array serves as the final level for all teams
2. **Level Distribution**: Each team receives exactly `levelsInGame` number of levels
3. **Subset Creation**: Teams get different subsets of levels (except for the final level)
4. **ID Generation**: UUIDs are auto-generated for any `team` or `level` object missing an `id` field
5. **Default Behavior**: If `levelsInGame` is not specified, all teams play all levels

## Error Conditions

- `levelsInGame > levels.length` → Invalid configuration
- Empty `teams` array → At least one team required
- Empty `levels` array → At least one level required
- Invalid UUID format in `id` fields → Must be valid UUIDv4
- Missing required fields → All required fields must be present
- Invalid coordinate ranges → Latitude/longitude must be within valid ranges
