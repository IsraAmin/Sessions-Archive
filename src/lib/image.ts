const PROFILE_IMAGE_MAX_BYTES = 50 * 1024
const PROFILE_IMAGE_MAX_EDGE = 640
const MIN_EDGE = 24
const QUALITY_STEPS = [0.88, 0.78, 0.68, 0.58, 0.48, 0.38, 0.28, 0.2, 0.14, 0.1]

export type CompressedProfileImage = {
  file: File
  originalBytes: number
  compressedBytes: number
  width: number
  height: number
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('تعذر تجهيز الصورة. جرّب صورة أخرى.'))
    }, type, quality)
  })
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => ctx.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close(),
      }
    } catch {
      // Fall back to an HTMLImageElement for browsers with partial ImageBitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = objectUrl
  await image.decode()

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => ctx.drawImage(image, 0, 0, width, height),
    close: () => URL.revokeObjectURL(objectUrl),
  }
}

function scaledSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function compressProfileImage(file: File): Promise<CompressedProfileImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختر ملف صورة فقط.')
  }

  const source = await decodeImage(file)
  try {
    let maxEdge = Math.min(PROFILE_IMAGE_MAX_EDGE, Math.max(source.width, source.height))
    let lastBlob: Blob | null = null
    let lastWidth = source.width
    let lastHeight = source.height

    while (maxEdge >= MIN_EDGE) {
      const { width, height } = scaledSize(source.width, source.height, maxEdge)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('المتصفح لا يستطيع معالجة الصورة على هذا الجهاز.')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      source.draw(context, width, height)

      for (const quality of QUALITY_STEPS) {
        let blob = await canvasToBlob(canvas, 'image/webp', quality)
        if (blob.type !== 'image/webp') {
          blob = await canvasToBlob(canvas, 'image/jpeg', quality)
        }

        lastBlob = blob
        lastWidth = width
        lastHeight = height
        if (blob.size <= PROFILE_IMAGE_MAX_BYTES) {
          const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
          return {
            file: new File([blob], `avatar.${extension}`, { type: blob.type, lastModified: Date.now() }),
            originalBytes: file.size,
            compressedBytes: blob.size,
            width,
            height,
          }
        }
      }

      maxEdge = Math.floor(maxEdge * 0.78)
    }

    if (lastBlob && lastBlob.size <= PROFILE_IMAGE_MAX_BYTES) {
      return {
        file: new File([lastBlob], 'avatar.jpg', { type: lastBlob.type || 'image/jpeg', lastModified: Date.now() }),
        originalBytes: file.size,
        compressedBytes: lastBlob.size,
        width: lastWidth,
        height: lastHeight,
      }
    }

    throw new Error('تعذر ضغط الصورة إلى 50KB. جرّب صورة مختلفة.')
  } finally {
    source.close()
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
}

export { PROFILE_IMAGE_MAX_BYTES }
