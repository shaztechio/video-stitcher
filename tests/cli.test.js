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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

import { parseTimemark, parseInputArg, getMimeType, stitchFiles, buildProgram, main } from '../cli.js'

// Hoist mock state so it's available inside vi.mock factory
const { mockCommand, mockFfmpeg } = vi.hoisted(() => {
  const handlers = {}
  const mockCommand = {
    input: vi.fn().mockReturnThis(),
    inputOptions: vi.fn().mockReturnThis(),
    complexFilter: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation((event, handler) => {
      handlers[event] = handler
      return mockCommand
    }),
    save: vi.fn().mockImplementation(() => handlers.end?.()),
    _handlers: handlers
  }
  const mockFfmpeg = vi.fn(() => mockCommand)
  mockFfmpeg.ffprobe = vi.fn()
  return { mockCommand, mockFfmpeg }
})

vi.mock('fluent-ffmpeg', () => ({ default: mockFfmpeg }))

// --- Metadata fixtures ---
const landscapeVideoMeta = {
  format: { duration: '5.0' },
  streams: [{ codec_type: 'video', width: 1920, height: 1080 }, { codec_type: 'audio' }]
}
const portraitVideoMeta = {
  format: { duration: '5.0' },
  streams: [{ codec_type: 'video', width: 1080, height: 1920 }, { codec_type: 'audio' }]
}
const videoNoAudioMeta = {
  format: { duration: '5.0' },
  streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
}
const videoStreamDurationMeta = {
  format: {},
  streams: [{ codec_type: 'video', width: 1920, height: 1080, duration: '3.0' }]
}
const videoNoDurationMeta = {
  format: {},
  streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
}
const landscapeImageMeta = {
  format: {},
  streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
}
const portraitImageMeta = {
  format: {},
  streams: [{ codec_type: 'video', width: 1080, height: 1920 }]
}

// --- File fixtures ---
const videoFile = { path: 'video.mp4', mimetype: 'video/mp4' }
const imageFile = { path: 'image.jpg', mimetype: 'image/jpeg', duration: 3 }
const imageFileNoDuration = { path: 'image2.jpg', mimetype: 'image/jpeg' }

// Helper to reset the shared handler map and save behaviour each test
function setupMockCommand (triggerOnSave) {
  const handlers = {}
  mockCommand.on.mockImplementation((event, handler) => {
    handlers[event] = handler
    return mockCommand
  })
  mockCommand.save.mockImplementation(() => triggerOnSave(handlers))
  mockFfmpeg.mockReturnValue(mockCommand)
  return handlers
}

describe('parseTimemark', () => {
  it('returns 0 for falsy input', () => {
    expect(parseTimemark('')).toBe(0)
    expect(parseTimemark(null)).toBe(0)
    expect(parseTimemark(undefined)).toBe(0)
  })

  it('returns 0 for invalid format (not 3 parts)', () => {
    expect(parseTimemark('12:34')).toBe(0)
    expect(parseTimemark('invalid')).toBe(0)
  })

  it('parses HH:MM:SS correctly', () => {
    expect(parseTimemark('00:00:00')).toBe(0)
    expect(parseTimemark('00:00:01')).toBe(1)
    expect(parseTimemark('00:01:00')).toBe(60)
    expect(parseTimemark('01:00:00')).toBe(3600)
    expect(parseTimemark('01:30:45')).toBe(5445)
  })

  it('parses fractional seconds', () => {
    expect(parseTimemark('00:00:01.5')).toBeCloseTo(1.5)
    expect(parseTimemark('00:01:30.25')).toBeCloseTo(90.25)
  })
})

describe('parseInputArg', () => {
  it('returns filepath with null duration when no colon', () => {
    expect(parseInputArg('video.mp4')).toEqual({ filepath: 'video.mp4', perFileDuration: null })
  })

  it('returns filepath with duration when colon followed by valid positive number', () => {
    expect(parseInputArg('image.jpg:3')).toEqual({ filepath: 'image.jpg', perFileDuration: 3 })
    expect(parseInputArg('image.jpg:2.5')).toEqual({ filepath: 'image.jpg', perFileDuration: 2.5 })
  })

  it('returns full string as filepath when after-colon value is not a valid positive number', () => {
    expect(parseInputArg('image.jpg:abc')).toEqual({ filepath: 'image.jpg:abc', perFileDuration: null })
    expect(parseInputArg('image.jpg:0')).toEqual({ filepath: 'image.jpg:0', perFileDuration: null })
    expect(parseInputArg('image.jpg:-1')).toEqual({ filepath: 'image.jpg:-1', perFileDuration: null })
  })

  it('uses the last colon for paths with multiple colons', () => {
    expect(parseInputArg('/path/to/file.jpg:5')).toEqual({ filepath: '/path/to/file.jpg', perFileDuration: 5 })
    expect(parseInputArg('/path/to/file.jpg:abc')).toEqual({ filepath: '/path/to/file.jpg:abc', perFileDuration: null })
  })
})

describe('getMimeType', () => {
  it('returns image mime type for image extensions', () => {
    expect(getMimeType('photo.jpg')).toBe('image/jpg')
    expect(getMimeType('photo.jpeg')).toBe('image/jpeg')
    expect(getMimeType('photo.png')).toBe('image/png')
    expect(getMimeType('photo.gif')).toBe('image/gif')
    expect(getMimeType('photo.bmp')).toBe('image/bmp')
    expect(getMimeType('photo.webp')).toBe('image/webp')
  })

  it('returns video mime type for video extensions', () => {
    expect(getMimeType('video.mp4')).toBe('video/mp4')
    expect(getMimeType('video.avi')).toBe('video/avi')
    expect(getMimeType('video.mov')).toBe('video/mov')
    expect(getMimeType('video.mkv')).toBe('video/mkv')
    expect(getMimeType('video.webm')).toBe('video/webm')
  })

  it('is case-insensitive for extensions', () => {
    expect(getMimeType('photo.JPG')).toBe('image/jpg')
    expect(getMimeType('video.MP4')).toBe('video/mp4')
  })

  it('returns video/mp4 as fallback for unknown extension', () => {
    expect(getMimeType('file.xyz')).toBe('video/mp4')
    expect(getMimeType('file')).toBe('video/mp4')
  })
})

describe('buildProgram', () => {
  it('returns a configured Commander program', () => {
    const program = buildProgram()
    expect(program.name()).toBe('video-stitcher')
  })
})

describe('stitchFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMockCommand((h) => h.end?.())
  })

  it('rejects when ffprobe fails', async () => {
    const err = new Error('probe failed')
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(err))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).rejects.toThrow('probe failed')
  })

  it('resolves with outputPath for landscape video files with audio', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4', { imageDuration: 2 })).resolves.toBe('out.mp4')
  })

  it('handles portrait orientation from first video', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, portraitVideoMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles videos without audio (generates silence)', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, videoNoAudioMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles video with duration in stream but not in format', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, videoStreamDurationMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles video with no duration anywhere (fileDuration stays 0)', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, videoNoDurationMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles image files using file.duration', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeImageMeta))
    await expect(stitchFiles([imageFile, imageFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles image files falling back to defaultImageDuration when file.duration is absent', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeImageMeta))
    await expect(stitchFiles([imageFileNoDuration, imageFileNoDuration], 'out.mp4', { imageDuration: 4 })).resolves.toBe('out.mp4')
  })

  it('handles portrait orientation from image when no videos present', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, portraitImageMeta))
    await expect(stitchFiles([imageFile, imageFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('handles mixed image and video files', async () => {
    mockFfmpeg.ffprobe
      .mockImplementationOnce((_, cb) => cb(null, landscapeVideoMeta))
      .mockImplementationOnce((_, cb) => cb(null, landscapeImageMeta))
    await expect(stitchFiles([videoFile, imageFile], 'out.mp4')).resolves.toBe('out.mp4')
  })

  it('rejects when ffmpeg emits an error event', async () => {
    setupMockCommand((h) => h.error(new Error('ffmpeg failed')))
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).rejects.toThrow('ffmpeg failed')
  })

  it('fires start, progress (with percent), and caps percent at 99.9', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    const onProgress = vi.fn()
    setupMockCommand((h) => {
      h.start('ffmpeg cmd')
      h.progress({ percent: 50 })
      h.progress({ percent: 200 })
      h.end()
    })
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await stitchFiles([videoFile, videoFile], 'out.mp4', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }))
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 99.9 }))
    consoleSpy.mockRestore()
    writeSpy.mockRestore()
  })

  it('calculates percent from timemark when percent is falsy and totalDuration > 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    const onProgress = vi.fn()
    setupMockCommand((h) => {
      h.progress({ percent: null, timemark: '00:00:05' })
      h.end()
    })
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, { format: { duration: '10.0' }, streams: [{ codec_type: 'video', width: 1920, height: 1080 }, { codec_type: 'audio' }] }))
    await stitchFiles([videoFile], 'out.mp4', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }))
    writeSpy.mockRestore()
  })

  it('falls back to percent=0 when timemark present but totalDuration is 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    const onProgress = vi.fn()
    setupMockCommand((h) => {
      h.progress({ percent: null, timemark: '00:00:05' })
      h.end()
    })
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, videoNoDurationMeta))
    await stitchFiles([videoFile], 'out.mp4', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 0 }))
    writeSpy.mockRestore()
  })

  it('skips onProgress when not provided', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    setupMockCommand((h) => {
      h.progress({ percent: 50 })
      h.end()
    })
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await expect(stitchFiles([videoFile, videoFile], 'out.mp4')).resolves.toBe('out.mp4')
    writeSpy.mockRestore()
  })

  it('mixes background audio at default volume (1.0) when bgAudio is provided', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await expect(
      stitchFiles([videoFile, videoFile], 'out.mp4', { bgAudio: 'music.mp3' })
    ).resolves.toBe('out.mp4')
    // Extra input call for bgAudio
    expect(mockCommand.input).toHaveBeenCalledWith('music.mp3')
  })

  it('mixes background audio at custom volume when bgAudioVolume is provided', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
    await expect(
      stitchFiles([videoFile, videoFile], 'out.mp4', { bgAudio: 'music.mp3', bgAudioVolume: 0.5 })
    ).resolves.toBe('out.mp4')
    expect(mockCommand.input).toHaveBeenCalledWith('music.mp3')
  })
})

describe('main', () => {
  let origArgv
  let exitSpy, stderrSpy, consoleSpy, writeSpy, existsSpy

  beforeEach(() => {
    vi.clearAllMocks()
    origArgv = process.argv
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit:${code}`)
    })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {})
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {})
    existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    setupMockCommand((h) => { h.progress?.({ percent: 50 }); h.end?.() })
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeVideoMeta))
  })

  afterEach(() => {
    process.argv = origArgv
    exitSpy.mockRestore()
    stderrSpy.mockRestore()
    consoleSpy.mockRestore()
    writeSpy.mockRestore()
    existsSpy.mockRestore()
  })

  it('runs successfully with two video files', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '-o', 'out.mp4']
    await expect(main()).resolves.toBeUndefined()
  })

  it('runs with image file using per-file duration (perFileDuration !== null)', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeImageMeta))
    process.argv = ['node', 'cli.js', 'a.jpg:3', 'b.jpg:2', '-o', 'out.mp4']
    await expect(main()).resolves.toBeUndefined()
  })

  it('runs with image file using global duration (perFileDuration === null)', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_, cb) => cb(null, landscapeImageMeta))
    process.argv = ['node', 'cli.js', 'a.jpg', 'b.jpg', '-o', 'out.mp4', '-d', '3']
    await expect(main()).resolves.toBeUndefined()
  })

  it('uses generated output filename when -o is not provided', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4']
    await expect(main()).resolves.toBeUndefined()
  })

  it('errors when fewer than 2 files are provided', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4']
    await expect(main()).rejects.toThrow('process.exit:1')
  })

  it('errors when a file does not exist', async () => {
    existsSpy.mockReturnValue(false)
    process.argv = ['node', 'cli.js', 'missing.mp4', 'b.mp4', '-o', 'out.mp4']
    await expect(main()).rejects.toThrow('process.exit:1')
  })

  it('errors when --image-duration is not a number', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '-d', 'abc', '-o', 'out.mp4']
    await expect(main()).rejects.toThrow('process.exit:1')
  })

  it('runs successfully with --bg-audio and existing file', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '--bg-audio', 'music.mp3', '-o', 'out.mp4']
    await expect(main()).resolves.toBeUndefined()
  })

  it('runs successfully with --bg-audio and custom --bg-audio-volume', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '--bg-audio', 'music.mp3', '--bg-audio-volume', '0.5', '-o', 'out.mp4']
    await expect(main()).resolves.toBeUndefined()
  })

  it('errors when --bg-audio file does not exist', async () => {
    existsSpy.mockImplementation((p) => p !== 'music.mp3')
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '--bg-audio', 'music.mp3', '-o', 'out.mp4']
    await expect(main()).rejects.toThrow('process.exit:1')
  })

  it('errors when --bg-audio-volume is not a number', async () => {
    process.argv = ['node', 'cli.js', 'a.mp4', 'b.mp4', '--bg-audio-volume', 'abc', '-o', 'out.mp4']
    await expect(main()).rejects.toThrow('process.exit:1')
  })
})
