#!/usr/bin/env python3
"""
Duck Hunt collage generator.

Builds, from the photos in the game's S3 bucket:
  1. One collage per team  -> collages/<team_id>.jpg
       (the LATEST photo the team uploaded at each level, auto-arranged)
  2. One big collage        -> collages/all-teams.jpg
       (one RANDOM photo per team, any level, auto-arranged)

Photos are stored in S3 as:  {team_id}/{level_id}/{epochTimestamp}_{photoId}.{ext}
so team / level / recency are all derivable from the key alone -- no DynamoDB
lookups needed. Team ids are used as labels (no name join).

Usage:
    PHOTO_BUCKET=photo-bucket-dev-sshreyy python3 make_collages.py
    # or
    python3 make_collages.py --bucket photo-bucket-dev-sshreyy [--region us-west-2] [--out collages]

Requires: boto3, Pillow  (see requirements.txt). Uses your ambient AWS creds.
"""
import argparse
import io
import math
import os
import random
import sys
from collections import defaultdict

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, ImageOps

# ---- layout constants ----
CELL = 400  # each photo is fit into a CELL x CELL square
PAD = 12  # padding between cells (px)
BG = (17, 17, 17)  # dark background to match the game's aesthetic
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif")


def parse_args():
    p = argparse.ArgumentParser(description="Generate Duck Hunt photo collages.")
    p.add_argument(
        "--bucket",
        default=os.environ.get("PHOTO_BUCKET"),
        help="S3 photo bucket name (or set PHOTO_BUCKET).",
    )
    p.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-west-2"),
        help="AWS region (default: us-west-2 or $AWS_REGION).",
    )
    p.add_argument(
        "--out", default="collages", help="Output directory (default: collages)."
    )
    p.add_argument(
        "--team",
        default=None,
        help="Only process this single team_id (for testing). Skips the big collage.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N teams (for a cheap test run).",
    )
    args = p.parse_args()
    if not args.bucket:
        p.error("bucket is required (--bucket or PHOTO_BUCKET env var).")
    return args


def list_photo_keys(s3, bucket):
    """Return all image object keys in the bucket (paginated)."""
    keys = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.lower().endswith(IMAGE_EXTS):
                keys.append(key)
    return keys


def parse_key(key):
    """
    Parse '{team_id}/{level_id}/{timestamp}_{photoId}.{ext}'.
    Returns (team_id, level_id, timestamp:int) or None if it doesn't match.
    """
    parts = key.split("/")
    if len(parts) != 3:
        return None
    team_id, level_id, filename = parts
    ts_str = filename.split("_", 1)[0]
    try:
        ts = int(ts_str)
    except ValueError:
        ts = 0  # unknown timestamp -> sorts oldest; still usable
    return team_id, level_id, ts


def index_photos(keys):
    """
    Build: photos[team_id][level_id] = list of (timestamp, key), and
           all_by_team[team_id] = list of keys (any level).
    """
    photos = defaultdict(lambda: defaultdict(list))
    all_by_team = defaultdict(list)
    skipped = 0
    for key in keys:
        parsed = parse_key(key)
        if not parsed:
            skipped += 1
            continue
        team_id, level_id, ts = parsed
        photos[team_id][level_id].append((ts, key))
        all_by_team[team_id].append(key)
    if skipped:
        print(f"WARN: skipped {skipped} object(s) with unexpected key format.")
    return photos, all_by_team


def load_image(s3, bucket, key):
    """Download an S3 object and return an EXIF-corrected RGB PIL image."""
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        img = Image.open(io.BytesIO(resp["Body"].read()))
        img = ImageOps.exif_transpose(img)  # fix phone rotation
        return img.convert("RGB")
    except (BotoCoreError, ClientError, OSError) as e:
        print(f"WARN: could not load {key}: {e}")
        return None


def fit_into_cell(img):
    """Resize+crop (center) an image to exactly CELL x CELL."""
    return ImageOps.fit(img, (CELL, CELL), method=Image.LANCZOS)


def build_grid(images, title_key=None):
    """
    Arrange a list of PIL images into an auto-sized near-square grid.
    Returns a new PIL image, or None if there are no images.
    """
    imgs = [im for im in images if im is not None]
    if not imgs:
        return None
    n = len(imgs)
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    width = cols * CELL + (cols + 1) * PAD
    height = rows * CELL + (rows + 1) * PAD
    canvas = Image.new("RGB", (width, height), BG)
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        x = PAD + c * (CELL + PAD)
        y = PAD + r * (CELL + PAD)
        canvas.paste(fit_into_cell(im), (x, y))
    return canvas


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    s3 = boto3.client("s3", region_name=args.region)

    print(f"INFO: Listing photos in s3://{args.bucket} ...")
    keys = list_photo_keys(s3, args.bucket)
    if not keys:
        print("ERROR: no photos found in the bucket.")
        sys.exit(1)
    print(f"INFO: found {len(keys)} photo object(s).")

    photos, all_by_team = index_photos(keys)
    teams = sorted(photos.keys())
    print(f"INFO: {len(teams)} team(s) have photos.")

    # Optional filters for testing.
    if args.team:
        if args.team not in photos:
            print(f"ERROR: team '{args.team}' has no photos in the bucket.")
            sys.exit(1)
        teams = [args.team]
        print(f"INFO: --team set; processing only {args.team}.")
    elif args.limit is not None:
        teams = teams[: args.limit]
        print(f"INFO: --limit set; processing first {len(teams)} team(s).")

    # ---- 1. Per-team collages: latest photo per level ----
    big_collage_picks = []  # (team_id, key) one random photo per team
    for team_id in teams:
        levels = photos[team_id]
        chosen_keys = []
        for level_id in sorted(levels.keys()):
            # latest photo at this level = max timestamp
            latest = max(levels[level_id], key=lambda t: t[0])
            chosen_keys.append(latest[1])

        images = [load_image(s3, args.bucket, k) for k in chosen_keys]
        grid = build_grid(images)
        if grid is None:
            print(f"WARN: team {team_id} produced no usable images; skipping.")
            continue
        out_path = os.path.join(args.out, f"{team_id}.jpg")
        grid.save(out_path, "JPEG", quality=90)
        print(f"  ✓ {out_path}  ({len(images)} level photo(s))")

        # pick one random photo (any level) for the big collage
        big_collage_picks.append((team_id, random.choice(all_by_team[team_id])))

    # ---- 2. Big collage: one random photo per team ----
    # Skip when testing a single team (a one-team "big" collage is pointless).
    if args.team:
        print("INFO: --team set; skipping the big collage.")
        print(f"\nDone. Collage written to '{args.out}/'.")
        return

    print("INFO: Building big collage (1 random photo per team) ...")
    big_images = [load_image(s3, args.bucket, k) for _, k in big_collage_picks]
    big = build_grid(big_images)
    if big is not None:
        big_path = os.path.join(args.out, "all-teams.jpg")
        big.save(big_path, "JPEG", quality=90)
        print(f"  ✓ {big_path}  ({len([i for i in big_images if i])} team(s))")
    else:
        print("WARN: no images for the big collage.")

    print(f"\nDone. Collages written to '{args.out}/'.")


if __name__ == "__main__":
    main()
