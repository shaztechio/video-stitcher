# video-stitcher

[![CI](https://github.com/shaztechio/video-stitcher/actions/workflows/ci.yml/badge.svg)](https://github.com/shaztechio/video-stitcher/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shaztech/video-stitcher)](https://www.npmjs.com/package/@shaztech/video-stitcher)

A CLI tool to stitch videos and images into a single MP4 using FFmpeg.

## Prerequisites

- Node.js 20+
- [FFmpeg](https://ffmpeg.org/) installed and on your system PATH

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
| `-h, --help` | Show help message | |

### Per-image duration

Append `:<seconds>` to an image filename to override the global `--image-duration` default:

```sh
video-stitcher image1.jpg:3 image2.jpg:5 video1.mp4 -o output.mp4
```

- Images without an annotation fall back to `-d` / `--image-duration`
- Duration annotations on video files are silently ignored (videos use their actual duration)
- Globs with annotations (e.g. `*.jpg:4`) are not supported — use `-d` for a uniform default

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
```
