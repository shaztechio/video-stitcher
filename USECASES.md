# Use Cases for video-stitcher

## Context
video-stitcher is a CLI tool that concatenates videos and images into a single MP4.
It handles orientation detection, aspect ratio normalization (letterboxing), synthetic audio generation for images,
and per-file duration control. Output is always 1920x1080 (landscape) or 1080x1920 (portrait) MP4.

---

## Use Cases

### 1. Social Media Content Creation
**Reels / TikTok / YouTube Shorts pipelines**
- Stitch a sequence of product shots (images) + demo clips (video) into a single short-form video
- Control pacing via per-image duration: `product_shot.jpg:2 demo.mp4 cta.jpg:3`
- Portrait mode (1080x1920) auto-detected when inputs are vertical

### 2. Photo Slideshows with Video Inserts
- Convert a batch of event photos into a video slideshow
- Insert video clips mid-sequence without manual editing tools
- `*.jpg:4 highlight_reel.mp4 group_photo.jpg:6 -o event_recap.mp4`

### 3. CI/CD Screen-Recording Aggregation
- Developers recording multiple test runs or demo sessions across steps
- Stitch recordings together for a single shareable artifact per PR or release
- `step1_recording.mp4 step2_recording.mp4 step3_recording.mp4 -o demo.mp4`

### 4. Presentation / Tutorial Assembly
- Combine intro card (image), demo video, and outro card (image) into one file
- `intro.png:3 tutorial.mp4 outro.png:5 -o lesson_01.mp4`

### 5. Real Estate / Property Showcase
- Stitch exterior photos, interior walkthrough video, and floor plan image together
- `exterior.jpg:4 walkthrough.mp4 floorplan.jpg:5 -o property_tour.mp4`

### 6. Batch Processing via Shell Scripts
- Loop over directories: stitch all clips from a shoot day into a daily review file
```bash
for dir in shoot_*/; do
  video-stitcher "$dir"*.mp4 -o "${dir%/}_daily.mp4"
done
```

### 7. E-learning / Course Content
- Assemble chapter intro slide + lecture recording + summary slide per lesson
- Automate with a script iterating over chapter directories

### 8. Sports / Event Highlight Reels
- Combine multiple short action clips with score card images between them
- `clip1.mp4 scoreboard.png:2 clip2.mp4 scoreboard.png:2 -o highlights.mp4`

### 9. Automated Video Reports
- Cron-driven pipelines that stitch daily/weekly screenshots or screen recordings
- into summary MP4s for stakeholders without manual editing

### 10. Prototype / Mockup Demos
- Combine static wireframe images with short interaction recordings into a demo reel
- Present to stakeholders without a video editor

---

## Potential Feature Enhancements (derived from use cases)
- **Transition effects** between clips (fade, cut) — requested by slideshow/social media use cases
- **Custom resolution** — for use cases needing non-standard outputs (e.g., 4K, square 1:1)
- **Text overlay / title cards** — reduce need for pre-made image slides
- **Input from file list** (e.g., `--manifest playlist.txt`) — useful for batch/CI pipelines
- **Audio track replacement** — add background music over image slideshows
