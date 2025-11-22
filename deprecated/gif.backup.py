#!/usr/bin/env python3
import subprocess
import yt_dlp
import shutil
import os
import sys
import re
import tempfile
from urllib.parse import urlparse
import urllib.parse
import urllib.request
import argparse
from typing import Optional, List

def download_twitter_video(url: str, output_path: str) -> str:
    """
    Downloads video (without audio) from the given X/Twitter URL with max 1080 quality.
    Returns the filename of the downloaded video.
    """
    ydl_opts = {
        'outtmpl': output_path,
        'format': 'bestvideo[height<=1080][ext=mp4]/best[height<=1080][ext=mp4]',
        # 'format': 'bv*+ba/bestvideo/best',
        'quiet': False,
        'noprogress': True,
        'postprocessors': [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4',
        }],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        final_name = ydl.prepare_filename(info)
        return final_name

def _safe_basename_from_url(url: str) -> str:
    """Return a safe filename from a URL path component."""
    parsed = urllib.parse.urlparse(url)
    base = os.path.basename(parsed.path)
    if not base:
        base = "image"
    base = base.split('?')[0]
    root, ext = os.path.splitext(base)
    if not ext:
        ext = ".jpg"
    return re.sub(r"[^A-Za-z0-9._-]", "_", root) + ext

def download_twitter_images(url: str, dest_dir: str) -> List[str]:
    """
    Attempt to extract and download all images from an X/Twitter post.
    Returns a list of downloaded image file paths in order.
    """
    os.makedirs(dest_dir, exist_ok=True)
    ydl_opts = {
        'quiet': True,
        'noprogress': True,
        'skip_download': True,
    }
    images: List[str] = []
    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        print(f"yt-dlp info fetch failed for images: {e}")

    candidates: List[str] = []

    def _collect_from(obj):
        if not isinstance(obj, dict):
            return
        if 'images' in obj and isinstance(obj['images'], list):
            for it in obj['images']:
                u = it.get('url') or it.get('src')
                if u:
                    candidates.append(u)
        if 'media' in obj and isinstance(obj['media'], list):
            for it in obj['media']:
                if it.get('type') == 'photo':
                    u = it.get('url') or it.get('thumbnail_url')
                    if u:
                        candidates.append(u)
        if 'thumbnails' in obj and isinstance(obj['thumbnails'], list):
            best_by_id = {}
            for th in obj['thumbnails']:
                if not isinstance(th, dict):
                    continue
                tid = th.get('id') or th.get('preference') or th.get('url')
                h = th.get('height') or 0
                if tid not in best_by_id or (h and h > (best_by_id[tid][1] or 0)):
                    best_by_id[tid] = (th.get('url'), h)
            for u, _ in best_by_id.values():
                if u:
                    candidates.append(u)

    if isinstance(info, dict):
        _collect_from(info)
        if 'entries' in info and isinstance(info['entries'], list):
            for entry in info['entries']:
                if isinstance(entry, dict):
                    _collect_from(entry)

    def looks_image(u: str) -> bool:
        return any(u.lower().split('?')[0].endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp'))

    ordered_unique = []
    seen = set()
    for u in candidates:
        if not isinstance(u, str):
            continue
        if not looks_image(u):
            if 'twimg.com' not in u:
                continue
        key = u.split('?')[0]
        if key in seen:
            continue
        seen.add(key)
        ordered_unique.append(u)

    if not ordered_unique:
        try:
            print("No images in metadata. Scraping HTML for images...")
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
            urls = re.findall(r"https://pbs\.twimg\.com/media/[A-Za-z0-9_-]+\.[A-Za-z0-9]+(?:\?[^'\"\s<>]*)?", html)
            norm = []
            seen2 = set()
            for u in urls:
                base = u.split("?")[0]
                if base in seen2:
                    continue
                seen2.add(base)
                norm.append(base + "?name=orig")
            ordered_unique = norm
        except Exception as e:
            print(f"HTML scrape failed: {e}")
            ordered_unique = []

    if not ordered_unique:
        print("No images detected in the tweet.")
        return []

    for idx, u in enumerate(ordered_unique, start=1):
        try:
            name = _safe_basename_from_url(u)
            name = f"{idx:02d}_" + name
            outp = os.path.join(dest_dir, name)
            print(f"Downloading image {idx}: {u}")
            with urllib.request.urlopen(u, timeout=15) as response, open(outp, 'wb') as out_file:
                shutil.copyfileobj(response, out_file)
            images.append(outp)
        except Exception as e:
            print(f"Failed to download image {idx}: {e}")
    return images

def build_slideshow_video(images: List[str], output_mp4: str, fps: int = 30, seconds_per_image: float = 2.0) -> str:
    """
    Build a slideshow MP4 from a list of images with a subtle zoom effect.
    """
    if not images:
        raise ValueError("No images provided for slideshow")
    _require_cmd("ffmpeg")
    with tempfile.TemporaryDirectory(prefix="x_gallery_") as tmp_dir:
        clip_paths: List[str] = []
        for i, img in enumerate(images, start=1):
            clip = os.path.join(tmp_dir, f"clip_{i:02d}.mp4")
            vf = (
                f"scale=720:720:force_original_aspect_ratio=increase,"
                f"crop=720:720,"
                f"zoompan=z='min(zoom+0.0015,1.05)':d={int(seconds_per_image*fps)}:s=720x720:fps={fps}"
            )
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1",
                "-t", f"{seconds_per_image}",
                "-i", img,
                "-vf", vf,
                "-an",
                "-r", str(fps),
                "-pix_fmt", "yuv420p",
                clip,
            ]
            print(f"Creating clip for {os.path.basename(img)}")
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            clip_paths.append(clip)

        list_path = os.path.join(tmp_dir, "list.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in clip_paths:
                safe_p = p.replace("'", "'\\''")
                f.write("file '{}'\n".format(safe_p))
        cmd_concat = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            output_mp4,
        ]
        print("Concatenating image clips into slideshow")
        subprocess.run(cmd_concat, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return output_mp4

def _require_cmd(cmd: str):
    if shutil.which(cmd) is None:
        raise RuntimeError(
            f"Required command '{cmd}' not found. Please install it and ensure it's on PATH."
        )

def _unique_path(path: str) -> str:
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    i = 1
    while True:
        candidate = f"{base}_{i}{ext}"
        if not os.path.exists(candidate):
            return candidate
        i += 1

def _build_crop_filter(crop_angle: str) -> str:
    angle = crop_angle.upper()
    w_h = "floor(min(iw\\,ih)/2)*2"
    if angle == "LEFT":
        xy = "x=0:y=(ih-min(iw\\,ih))/2"
    elif angle == "RIGHT":
        xy = "x=iw-min(iw\\,ih):y=(ih-min(iw\\,ih))/2"
    elif angle == "TOP":
        xy = "x=(iw-min(iw\\,ih))/2:y=0"
    elif angle == "CENTER":
        xy = "x=(iw-min(iw\\,ih))/2:y=(ih-min(iw\\,ih))/2"
    else:  # BOTTOM
        xy = "x=(iw-min(iw\\,ih))/2:y=ih-min(iw\\,ih)"
    return f"crop=w={w_h}:h={w_h}:{xy}"

def _get_video_fps(input_video: str) -> int:
    """Get the FPS of the input video using FFmpeg."""
    cmd = [
        "ffmpeg",
        "-i", input_video,
        "-vf", "fpsprobesidechain=none",
        "-f", "null",
        "-"
    ]
    result = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    stderr = result.stderr.decode('utf-8', errors='ignore')

    # Extract FPS from FFmpeg output
    fps_match = re.search(r"(\d+(?:\.\d+)?) fps", stderr)
    if fps_match:
        return int(float(fps_match.group(1)))
    return 0

def _get_video_duration(input_video: str) -> float:
    """Get the duration of the input video in seconds using FFmpeg."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_video
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    duration = result.stdout.decode('utf-8', errors='ignore').strip()
    try:
        return float(duration)
    except ValueError:
        return 0.0

def convert_video_to_webp(
    input_video: str,
    output_webp: str,
    max_size: int = 300,
    fps: int = 20,
    webp_quality: int = 85,
    lossless: bool = False,
    crop_angle: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    quality_boost: bool = False,
):
    _require_cmd("ffmpeg")

    # Get video's actual FPS
    video_fps = _get_video_fps(input_video)
    print(f"Video FPS: {video_fps}, Config FPS: {fps}")

    # Use the lower FPS to avoid creating duplicate frames
    if video_fps > 0 and video_fps < fps:
        fps = video_fps
        print(f"Adjusting FPS to match video: {fps}")

    crop_filter = _build_crop_filter(crop_angle) if crop_angle and crop_angle.upper() in {"LEFT", "RIGHT", "TOP", "BOTTOM", "CENTER"} else None
    scale_filter = f"scale=w=min(iw\\,{max_size}):h=min(ih\\,{max_size}):force_original_aspect_ratio=decrease:flags=lanczos"

    v_filters = [f"fps={fps}"]
    if crop_filter:
        v_filters.append(crop_filter)
    if quality_boost:
        v_filters.append("hqdn3d=1.2:1.2:6:6")
    v_filters.append(scale_filter)
    chain = ",".join(v_filters)

    cmd = ["ffmpeg", "-y"]
    if start_time:
        cmd.extend(["-ss", start_time])
    if end_time:
        cmd.extend(["-to", end_time])
    cmd.extend(["-i", input_video])
    cmd.extend([
        "-vf", chain,
        "-sws_flags", "lanczos+accurate_rnd+full_chroma_int",
        "-loop", "0",
        "-c:v", "libwebp",
        "-compression_level", "9",
        "-q:v", str(min(80, max(50, webp_quality))),
        "-preset", "default",
        "-f", "webp",
        "-metadata", "loop=0"
    ])
    if lossless:
        cmd.extend(["-lossless", "1"])
    cmd.append(output_webp)

    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def extract_post_id(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    parts = [p for p in path.split('/') if p]
    for part in reversed(parts):
        if part.isdigit():
            return part
    m = re.search(r"(\d+)", parsed.geturl())
    return m.group(1) if m else "post"

def is_image_only_post(info) -> bool:
    """Heuristic to detect if post has only images and no video."""
    if not isinstance(info, dict):
        return False
    entries = info.get('entries', [info]) if 'entries' in info else [info]
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get('duration') or entry.get('formats'):
            return False
        media = entry.get('media') or []
        for m in media:
            if m.get('type') == 'video':
                return False
    return True

def build_preset(name: str):
    name = name.lower()
    if name == "fast":
        return dict(fps=12, colors=128, dither="bayer:bayer_scale=3", stats_mode_full=False, quality_boost=False, webp_quality=75, webp_lossless=False, max_size=300)
    if name == "medium":
        return dict(fps=16, colors=200, dither="sierra2_4a", stats_mode_full=True, quality_boost=False, webp_quality=80, webp_lossless=False, max_size=300)
    return dict(fps=24, colors=256, dither="sierra2_4a", stats_mode_full=True, quality_boost=True, webp_quality=90, webp_lossless=False, max_size=720)

def parse_time(time_str: str) -> int:
    """Parse MM:SS time string into total seconds."""
    try:
        minutes, seconds = map(int, time_str.split(':'))
        return minutes * 60 + seconds
    except:
        raise ValueError(f"Invalid time format: {time_str}. Expected MM:SS")

def main():
    parser = argparse.ArgumentParser(description='Convert X/Twitter videos to WebP format')
    parser.add_argument('url', help='X/Twitter post URL')
    parser.add_argument('start_time', help='Start time in MM:SS format (00:00 for no trim)')
    parser.add_argument('end_time', help='End time in MM:SS format (00:00 for no trim)')
    parser.add_argument('output', help='Output file path for the WebP image')

    args = parser.parse_args()

    # Validate time format
    if args.start_time != "00:00":
        parse_time(args.start_time)
    if args.end_time != "00:00":
        parse_time(args.end_time)

    # Set default quality to high
    preset = build_preset("high")
    preset['fps'] = 24  # Override with default 30fps

    print(f"Processing: {args.url}")
    print(f"Time range: {args.start_time} to {args.end_time}")
    print(f"Quality: high, FPS: {preset['fps']}")

    try:
        post_id = extract_post_id(args.url)
        output_dir = "output"
        os.makedirs(output_dir, exist_ok=True)

        # Use provided output path
        out_name = args.output

        ydl_opts = {'quiet': True, 'noprogress': True, 'skip_download': True}
        info = None
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(args.url, download=False)
        except Exception as e:
            print(f"Failed to analyze URL: {e}")
            raise

        input_video = None
        temp_slideshow = None

        if is_image_only_post(info):
            print("Detected image-only post. Creating slideshow...")
            with tempfile.TemporaryDirectory() as img_dir:
                images = download_twitter_images(args.url, img_dir)
                if not images:
                    raise ValueError("No images found in the post.")
                temp_slideshow = f"{post_id}_temp_slideshow.mp4"
                input_video = build_slideshow_video(images, temp_slideshow, fps=preset['fps'])
        else:
            print("Detected video post.")
            downloaded_path = download_twitter_video(args.url, f"{post_id}.%(ext)s")
            candidate = os.path.splitext(downloaded_path)[0] + ".mp4"
            input_video = candidate if os.path.exists(candidate) else downloaded_path

        # Handle time trimming
        start_time = None
        end_time = None

        # If both start and end times are 00:00, check video duration
        if args.start_time == "00:00" and args.end_time == "00:00":
            video_duration = _get_video_duration(input_video)
            print(f"Video duration: {video_duration} seconds")
            if video_duration > 5:
                print("Video is longer than 5 seconds, limiting to 5 seconds")
                end_time = "00:05"
        elif args.start_time != "00:00" and args.end_time != "00:00":
            start_time = args.start_time
            end_time = args.end_time
        elif args.start_time != "00:00" and args.end_time == "00:00":
            start_time = args.start_time
        elif args.start_time == "00:00" and args.end_time != "00:00":
            end_time = args.end_time

        print(f"Converting to WebP -> {out_name}")
        # Ensure output directory exists
        os.makedirs(os.path.dirname(out_name), exist_ok=True)

        convert_video_to_webp(
            input_video,
            out_name,
            max_size=preset['max_size'],
            fps=preset['fps'],
            webp_quality=preset['webp_quality'],
            lossless=False,
            crop_angle=None,
            start_time=start_time,
            end_time=end_time,
            quality_boost=preset.get('quality_boost', False),
        )

        print(f"Done. Saved: {out_name}")

        # Clean up temporary files
        try:
            if input_video and os.path.exists(input_video):
                os.remove(input_video)
                print(f"Removed temporary video: {input_video}")
        except Exception as e:
            print(f"Warning: could not remove temp file ({e})")

    except subprocess.CalledProcessError as e:
        msg = "ffmpeg failed during conversion."
        if e.stderr:
            dec = e.stderr.decode(errors='ignore') if isinstance(e.stderr, bytes) else str(e.stderr)
            msg += "\n" + dec[:500]
        print(msg)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
