/*
 * Copyright 2026 Shazron Abdullah
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import { Command } from 'commander'

const parseTimemark = (timemark) => {
  if (!timemark) return 0
  const parts = timemark.split(':')
  if (parts.length !== 3) return 0
  const hours = parseFloat(parts[0])
  const minutes = parseFloat(parts[1])
  const seconds = parseFloat(parts[2])
  return (hours * 3600) + (minutes * 60) + seconds
}

const probeFile = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err)
      else resolve(metadata)
    })
  })
}

const stitchFiles = async (files, outputPath, options = {}) => {
  const { imageDuration, bgAudio, bgAudioVolume = 1.0, onProgress } = options
  const defaultImageDuration = imageDuration || 1

  const fileMetadatas = await Promise.all(files.map(f => probeFile(f.path)))

  let totalDuration = 0
  let width = 1920
  let height = 1080

  const firstVideoIndex = files.findIndex(f => f.mimetype && f.mimetype.startsWith('video/'))
  if (firstVideoIndex !== -1) {
    const meta = fileMetadatas[firstVideoIndex]
    const vStream = meta.streams.find(s => s.codec_type === 'video')
    if (vStream && vStream.width < vStream.height) {
      width = 1080
      height = 1920
    }
  } else if (files.length > 0) {
    const meta = fileMetadatas[0]
    const vStream = meta.streams.find(s => s.codec_type === 'video')
    if (vStream && vStream.width < vStream.height) {
      width = 1080
      height = 1920
    }
  }

  const command = ffmpeg()
  const filterComplex = []
  const videoInputs = []
  const audioInputs = []

  files.forEach((file, index) => {
    const meta = fileMetadatas[index]
    const isImage = file.mimetype && file.mimetype.startsWith('image/')

    command.input(file.path)

    let fileDuration = 0

    if (isImage) {
      fileDuration = file.duration || defaultImageDuration
      command.inputOptions([
        '-loop 1',
        `-t ${fileDuration}`
      ])
    } else {
      if (meta.format && meta.format.duration) {
        fileDuration = parseFloat(meta.format.duration)
      } else {
        const vStream = meta.streams.find(s => s.codec_type === 'video')
        if (vStream && vStream.duration) fileDuration = parseFloat(vStream.duration)
      }
    }
    totalDuration += fileDuration

    const vStream = `v${index}`
    const aStream = `a${index}`

    filterComplex.push({
      filter: 'scale',
      options: { w: width, h: height, force_original_aspect_ratio: 'decrease' },
      inputs: `${index}:v`,
      outputs: `sc${index}`
    })

    filterComplex.push({
      filter: 'pad',
      options: { w: width, h: height, x: '(ow-iw)/2', y: '(oh-ih)/2', color: 'black' },
      inputs: `sc${index}`,
      outputs: `pd${index}`
    })

    filterComplex.push({
      filter: 'setsar',
      options: '1',
      inputs: `pd${index}`,
      outputs: vStream
    })

    videoInputs.push(vStream)

    if (isImage) {
      filterComplex.push({
        filter: 'anullsrc',
        options: { cl: 'stereo', r: 44100 },
        outputs: `raw_silence${index}`
      })
      filterComplex.push({
        filter: 'atrim',
        options: { duration: fileDuration },
        inputs: `raw_silence${index}`,
        outputs: aStream
      })
    } else {
      const hasAudio = meta.streams.some(s => s.codec_type === 'audio')
      if (hasAudio) {
        filterComplex.push({
          filter: 'aresample',
          options: 44100,
          inputs: `${index}:a`,
          outputs: aStream
        })
      } else {
        filterComplex.push({
          filter: 'anullsrc',
          options: { cl: 'stereo', r: 44100 },
          outputs: `raw_silence${index}`
        })
        filterComplex.push({
          filter: 'atrim',
          options: { duration: fileDuration },
          inputs: `raw_silence${index}`,
          outputs: aStream
        })
      }
    }
    audioInputs.push(aStream)
  })

  const concatInputs = []
  for (let i = 0; i < files.length; i++) {
    concatInputs.push(videoInputs[i])
    concatInputs.push(audioInputs[i])
  }

  const concatAudioOut = bgAudio ? 'concat_outa' : 'outa'

  filterComplex.push({
    filter: 'concat',
    options: { n: files.length, v: 1, a: 1 },
    inputs: concatInputs,
    outputs: ['outv', concatAudioOut]
  })

  if (bgAudio) {
    const bgAudioIndex = files.length
    command.input(bgAudio).inputOptions(['-stream_loop -1'])
    filterComplex.push({
      filter: 'volume',
      options: { volume: bgAudioVolume },
      inputs: `${bgAudioIndex}:a`,
      outputs: 'bg_vol'
    })
    filterComplex.push({
      filter: 'amix',
      options: { inputs: 2, duration: 'first', normalize: 0 },
      inputs: ['concat_outa', 'bg_vol'],
      outputs: 'outa'
    })
  }

  return new Promise((resolve, reject) => {
    command
      .complexFilter(filterComplex)
      .outputOptions(['-map [outv]', '-map [outa]'])
      .on('start', (cmdLine) => {
        console.log('Spawned FFmpeg with command: ' + cmdLine)
        console.log(`Total expected duration: ${totalDuration.toFixed(2)} seconds`)
      })
      .on('error', (err) => {
        console.error('An error occurred: ' + err.message)
        reject(err)
      })
      .on('progress', (progress) => {
        let percent = progress.percent
        if ((!percent || percent < 0) && progress.timemark) {
          const currentSeconds = parseTimemark(progress.timemark)
          if (totalDuration > 0) {
            percent = (currentSeconds / totalDuration) * 100
          }
        }
        if (percent > 99.9) percent = 99.9
        percent = percent ?? 0

        if (onProgress) {
          onProgress({ ...progress, percent })
        }

        process.stdout.write(`\rProgress: ${percent.toFixed(1)}%`)
      })
      .on('end', () => {
        console.log('\nProcessing finished.')
        resolve(outputPath)
      })
      .save(outputPath)
  })
}

const parseInputArg = (raw) => {
  const lastColon = raw.lastIndexOf(':')
  if (lastColon === -1) return { filepath: raw, perFileDuration: null }
  const after = raw.slice(lastColon + 1)
  const parsed = parseFloat(after)
  if (!isNaN(parsed) && parsed > 0 && String(parsed) === after.trim()) {
    return { filepath: raw.slice(0, lastColon), perFileDuration: parsed }
  }
  return { filepath: raw, perFileDuration: null }
}

const buildProgram = () => {
  const program = new Command()

  program
    .name('video-stitcher')
    .description('Stitch videos and images into a single MP4 using FFmpeg')
    .argument('<input-files...>', 'Input video or image files (at least 2)')
    .option('-o, --output <file>', 'Output file path')
    .option('-d, --image-duration <n>', 'Duration for images in seconds', parseFloat, 1)
    .option('--bg-audio <file>', 'Background audio file to mix into the output')
    .option('--bg-audio-volume <n>', 'Background audio volume (0.0–2.0)', parseFloat, 1.0)
    .addHelpText('after', `
Examples:
  video-stitch video1.mp4 video2.mp4 -o output.mp4
  video-stitch image1.jpg video1.mp4 image2.jpg -o output.mp4 -d 2
  video-stitch *.mp4 -o combined.mp4
  video-stitch image1.jpg:3 image2.jpg:5 video1.mp4 -o output.mp4
  video-stitch image1.jpg:3 image2.jpg video1.mp4 -o output.mp4 -d 2
  video-stitch video1.mp4 video2.mp4 --bg-audio music.mp3 --bg-audio-volume 0.5 -o output.mp4

Per-image duration:
  Append :<seconds> to an image filename to override the global --image-duration default.
  Example: image.jpg:3 displays for 3 seconds regardless of -d value.
  Globs with duration annotations (*.jpg:4) are not supported; use -d for a uniform default.

Background audio:
  --bg-audio loops automatically to match video length and is trimmed if longer.
  --bg-audio-volume sets the volume multiplier (0.0 = muted, 1.0 = original, 2.0 = double).`)

  return program
}

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
    return 'image/' + ext.substring(1).replace('.', '')
  } else if (['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.3gp'].includes(ext)) {
    return 'video/' + ext.substring(1).replace('.', '')
  }
  return 'video/mp4'
}

const main = async () => {
  const program = buildProgram()
  program.parse()

  const inputFiles = program.args
  const opts = program.opts()

  if (inputFiles.length < 2) {
    program.error('At least 2 input files are required')
  }

  for (const raw of program.args) {
    const { filepath } = parseInputArg(raw)
    if (!fs.existsSync(filepath)) {
      program.error(`File does not exist: ${filepath}`)
    }
  }

  if (isNaN(opts.imageDuration)) {
    program.error('--image-duration requires a numeric value')
  }

  if (opts.bgAudio && !fs.existsSync(opts.bgAudio)) {
    program.error(`Background audio file does not exist: ${opts.bgAudio}`)
  }

  if (isNaN(opts.bgAudioVolume)) {
    program.error('--bg-audio-volume requires a numeric value')
  }

  const outputFile = opts.output || `stitched_${Date.now()}.mp4`

  console.log(`Input files: ${program.args.map(r => parseInputArg(r).filepath).join(', ')}`)
  console.log(`Output file: ${outputFile}`)
  console.log(`Image duration: ${opts.imageDuration}s`)
  if (opts.bgAudio) {
    console.log(`Background audio: ${opts.bgAudio} (volume: ${opts.bgAudioVolume})`)
  }
  console.log('')

  const files = program.args.map(raw => {
    const { filepath, perFileDuration } = parseInputArg(raw)
    const mimetype = getMimeType(filepath)
    const isImage = mimetype.startsWith('image/')
    return {
      path: filepath,
      mimetype,
      duration: isImage
        ? (perFileDuration !== null ? perFileDuration : opts.imageDuration)
        : undefined
    }
  })

  const result = await stitchFiles(files, outputFile, {
    imageDuration: opts.imageDuration,
    bgAudio: opts.bgAudio,
    bgAudioVolume: opts.bgAudioVolume,
    onProgress: () => {}
  })

  console.log(`\nOutput saved to: ${result}`)
}

export { parseTimemark, parseInputArg, getMimeType, stitchFiles, buildProgram, main }
