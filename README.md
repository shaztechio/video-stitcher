# video-stitcher

[![CI](https://github.com/shaztechio/video-stitcher/actions/workflows/ci.yml/badge.svg)](https://github.com/shaztechio/video-stitcher/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shaztech/video-stitcher)](https://www.npmjs.com/package/@shaztech/video-stitcher)

A CLI tool to stitch videos and images into a single MP4 using FFmpeg.

## Prerequisites

- Node.js 20+
- [FFmpeg](https://ffmpeg.org/) installed and on your system PATH — see [INSTALLING_FFMPEG.md](INSTALLING_FFMPEG.md) for platform-specific instructions

## Installation

### Global install (recommended)

```sh
npm install -g @shaztech/video-stitcher
```

This adds the `video-stitcher` command to your PATH.

### Run without installing

```sh
npx @shaztech/video-stitcher <input-files...>
```

### Local development

```sh
git clone https://github.com/shaztechio/video-stitcher.git
cd video-stitcher
npm install
npm link          # makes video-stitcher available globally from this checkout
```

## Usage

```sh
video-stitcher [options] <input-files...>
```

At least 2 input files are required.

### Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `-o, --output <file>` | Output file path | `stitched_<timestamp>.mp4` |
| `-d, --image-duration <n>` | Default display duration for images (seconds) | `1` |
| `--bg-audio <file>` | Background audio file to mix into the output | |
| `--bg-audio-volume <n>` | Background audio volume multiplier (0.0–2.0) | `1.0` |
| `-h, --help` | Show help message | |

### Per-image duration

Append `:<seconds>` to an image filename to override the global `--image-duration` default:

```sh
video-stitcher image1.jpg:3 image2.jpg:5 video1.mp4 -o output.mp4
```

- Images without an annotation fall back to `-d` / `--image-duration`
- Duration annotations on video files are silently ignored (videos use their actual duration)
- Globs with annotations (e.g. `*.jpg:4`) are not supported — use `-d` for a uniform default

### Background audio

Use `--bg-audio` to mix a background audio track into the final output:

```sh
video-stitcher video1.mp4 video2.mp4 --bg-audio music.mp3 -o output.mp4
```

- The audio loops automatically if shorter than the video
- The audio is trimmed if longer than the video
- Use `--bg-audio-volume` to adjust the level: `0.0` is muted, `1.0` is original, `2.0` is double

## Use Cases

See [USECASES.md](USECASES.md) for common usage patterns and pipeline ideas.

## Examples

```sh
# Stitch two videos
video-stitcher video1.mp4 video2.mp4 -o output.mp4

# Include images with a global 2-second duration
video-stitcher image1.jpg video1.mp4 image2.jpg -o output.mp4 -d 2

# Per-image durations
video-stitcher image1.jpg:3 image2.jpg:5 video1.mp4 -o output.mp4

# Mix per-image and global default
video-stitcher image1.jpg:3 image2.jpg video1.mp4 -o output.mp4 -d 2

# Process all MP4s in a directory
video-stitcher *.mp4 -o combined.mp4

# Add background music
video-stitcher video1.mp4 video2.mp4 --bg-audio music.mp3 -o output.mp4

# Add background music at half volume
video-stitcher image1.jpg:3 video1.mp4 --bg-audio music.mp3 --bg-audio-volume 0.5 -o output.mp4
```
