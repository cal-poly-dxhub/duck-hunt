## Concise DynamoDB Schema: ScavengerHuntData

This document provides a concise overview of the `ScavengerHuntData` DynamoDB table's logical schema and primary access patterns. This table uses a **Single-Table Design**.

**Table Name:** `ScavengerHuntData-[YourUniqueId]`
(The actual name will include the `uniqueId` provided during CDK deployment.)

---

### 1. Core Table Structure

- **Primary Key:**

  - **`PK` (Partition Key - String):** Groups related items.
  - **`SK` (Sort Key - String):** Orders items within a partition and provides additional query capabilities.

- **Global Secondary Indexes (GSIs):**
  - **`GSI1`**: `GSI1PK` (String), `GSI1SK` (String)
  - **`GSI2`**: `GSI2PK` (String), `GSI2SK` (String)
  - **`GSI3`**: `GSI3PK` (String), `GSI3SK` (String)
  - **Purpose:** Enable efficient queries on attributes not covered by the main table's primary key. All GSIs project `ALL` attributes.

---

### 2. Common Attributes

All items include:

- **`ItemType` (String):** Distinguishes the type of data (e.g., "GAME", "TEAM", "USER").
- **`id` (String - UUID):** Unique identifier for the specific entity.
- **`created_at` (String - ISO 8601):** Creation timestamp.
- **`updated_at` (String - ISO 8601):** Last update timestamp.
- **`deleted_at` (Number - Epoch Timestamp, optional):** TTL attribute for automatic deletion.

---

### 3. Item Structures & Access Patterns

This section outlines how each entity is stored and the main ways to retrieve them.

| Entity (ItemType)     | PK Format        | SK Format                       | GSI1PK Format      | GSI1SK Format                   | GSI2PK Format    | GSI2SK Format       | GSI3PK Format      | GSI3SK Format       | Key Attributes (beyond PK/SK)                               | Primary Access Patterns                                                                                                                                                                                                                                                                                                       |
| :-------------------- | :--------------- | :------------------------------ | :----------------- | :------------------------------ | :--------------- | :------------------ | :----------------- | :------------------ | :---------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAME`                | `GAME#{game_id}` | `#METADATA`                     | -                  | -                               | -                | -                   | -                  | -                   | `name`, `description`                                       | `GET_ITEM(PK=GAME#{game_id}, SK=#METADATA)`                                                                                                                                                                                                                                                                                   |
| `LEVEL`               | `GAME#{game_id}` | `LEVEL#{level_id}`              | `LEVEL#{level_id}` | `GAME#{game_id}`                | -                | -                   | -                  | -                   | `game_id`                                                   | `QUERY(PK=GAME#{game_id}, SK.begins_with(LEVEL#))` (All levels for game) <br> `GET_ITEM(PK=GAME#{game_id}, SK=LEVEL#{level_id})`                                                                                                                                                                                              |
| `TEAM`                | `GAME#{game_id}` | `TEAM#{team_id}`                | -                  | -                               | -                | -                   | -                  | -                   | `name`, `game_id`, `difficulty_level`                       | `QUERY(PK=GAME#{game_id}, SK.begins_with(TEAM#))` (All teams for game) <br> `GET_ITEM(PK=GAME#{game_id}, SK=TEAM#{team_id})`                                                                                                                                                                                                  |
| `USER`                | `TEAM#{team_id}` | `USER#{user_id}`                | `USER#{user_id}`   | `#METADATA`                     | -                | -                   | -                  | -                   | `team_id`                                                   | `QUERY(PK=TEAM#{team_id}, SK.begins_with(USER#))` (All users for team) <br> `QUERY_GSI1(GSI1PK=USER#{user_id})` (User by ID)                                                                                                                                                                                                  |
| `TEAM_LEVEL`          | `TEAM#{team_id}` | `LEVEL#{level_id}`              | `LEVEL#{level_id}` | `TEAM#{team_id}`                | -                | -                   | -                  | -                   | `team_id`, `level_id`, `index`, `completed_at`              | `QUERY(PK=TEAM#{team_id}, SK.begins_with(LEVEL#))` (All levels for team) <br> `QUERY_GSI1(GSI1PK=LEVEL#{level_id})` (Teams on a level)                                                                                                                                                                                        |
| `MESSAGE`             | `USER#{user_id}` | `MESSAGE#{ts}#{id}`             | `TEAM#{team_id}`   | `MESSAGE#{ts}#{id}`             | `GAME#{game_id}` | `MESSAGE#{ts}#{id}` | `LEVEL#{level_id}` | `MESSAGE#{ts}#{id}` | `user_id`, `team_id`, `game_id`, `level_id`, `role`, `text` | `QUERY(PK=USER#{user_id}, SK.begins_with(MESSAGE#))` (User messages)<br> `QUERY_GSI1(GSI1PK=TEAM#{team_id}, SK.begins_with(MESSAGE#))` (Team messages)<br> `QUERY_GSI2(GSI2PK=GAME#{game_id}, SK.begins_with(MESSAGE#))` (Game messages)<br> `QUERY_GSI3(GSI3PK=LEVEL#{level_id}, SK.begins_with(MESSAGE#))` (Level messages) |
| `PHOTO`               | `USER#{user_id}` | `PHOTO#{ts}#{id}`               | `TEAM#{team_id}`   | `PHOTO#{ts}#{id}`               | `GAME#{game_id}` | `PHOTO#{ts}#{id}`   | `LEVEL#{level_id}` | `PHOTO#{ts}#{id}`   | `user_id`, `team_id`, `game_id`, `level_id`, `url`          | `QUERY(PK=USER#{user_id}, SK.begins_with(PHOTO#))` (User photos)<br> `QUERY_GSI1(GSI1PK=TEAM#{team_id}, SK.begins_with(PHOTO#))` (Team photos)<br> `QUERY_GSI2(GSI2PK=GAME#{game_id}, SK.begins_with(PHOTO#))` (Game photos)<br> `QUERY_GSI3(GSI3PK=LEVEL#{level_id}, SK.begins_with(PHOTO#))` (Level photos)                 |
| `COORDINATE_SNAPSHOT` | `USER#{user_id}` | `COORDINATE_SNAPSHOT#{ts}#{id}` | `TEAM#{team_id}`   | `COORDINATE_SNAPSHOT#{ts}#{id}` | -                | -                   | -                  | -                   | `user_id`, `team_id`, `latitude`, `longitude`               | `QUERY(PK=USER#{user_id}, SK.begins_with(COORDINATE_SNAPSHOT#))` (User coordinates)<br> `QUERY_GSI1(GSI1PK=TEAM#{team_id}, SK.begins_with(COORDINATE_SNAPSHOT#))` (Team coordinates)                                                                                                                                          |

_Note: `ts` represents an epoch timestamp for chronological sorting._

---

### 4. General Principles

- **Access Pattern First:** Design is driven by _how_ data is queried, not just _what_ data exists.
- **No Joins:** Relationships are managed by denormalization and specific key patterns.
- **UUIDs for IDs:** All `id` attributes are UUID strings.
- **Timestamp Format:** Use ISO 8601 strings for `created_at` and `updated_at`. `deleted_at` must be an epoch timestamp for TTL.
- **Eventual Consistency:** Reads are eventually consistent by default. Use `ConsistentRead=True` for strong consistency (higher cost).
- **`begins_with`:** Leverage `SK.begins_with()` on sort keys to retrieve related items in a partition.

---
