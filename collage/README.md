# Duck Hunt Collage Generator

Generates photo collages from the game's S3 photo bucket after the hunt:

- **Per-team collage** (`collages/<team_id>.jpg`) — the **latest** photo each team
  uploaded at each level, auto-arranged into a grid.
- **Big collage** (`collages/all-teams.jpg`) — one **random** photo per team (any
  level), auto-arranged into a grid.

Photos are read straight from S3 (keys encode `team_id/level_id/timestamp`), so
no DynamoDB access is needed. Team ids are used as labels (no name join).

## Setup

```bash
cd collage
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

Make sure your AWS credentials are available (same ones you deploy with):
```bash
aws sts get-caller-identity   # should succeed
```

## Run

```bash
PHOTO_BUCKET=photo-bucket-<UNIQUE_ID> AWS_REGION=us-west-2 python3 make_collages.py
```

or with flags:

```bash
python3 make_collages.py --bucket photo-bucket-<UNIQUE_ID> --region us-west-2 --out collages
```

Output lands in `collages/` (created if missing).

### Testing on a subset first

```bash
# Just one team (skips the big collage) — cheapest way to validate output:
python3 make_collages.py --bucket photo-bucket-<UNIQUE_ID> --team <team_id>

# First N teams only:
python3 make_collages.py --bucket photo-bucket-<UNIQUE_ID> --limit 3
```

## Notes

- **Latest / random logic:** per-team collage uses the newest photo per level
  (highest timestamp in the key); the big collage picks one photo at random
  across all of a team's photos.
- **Orientation:** phone EXIF rotation is corrected automatically.
- **Missing data:** teams with no photos are skipped; per-team collages include
  only the levels that actually have photos.
- **Cost/scope:** read-only. It downloads each selected photo once to compose
  the grids; nothing is written back to S3.
- Tweak `CELL`, `PAD`, `BG` at the top of `make_collages.py` to change photo
  size, spacing, or background color.
