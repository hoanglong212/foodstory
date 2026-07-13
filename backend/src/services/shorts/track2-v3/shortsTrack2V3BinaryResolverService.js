import path from 'node:path'

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export function track2V3TesseractCommandCandidates({
  env = process.env,
  deps = {},
  platform = process.platform,
} = {}) {
  if (Array.isArray(deps.tesseractCommands) && deps.tesseractCommands.length) {
    return [...new Set(
      deps.tesseractCommands
        .map((command) => safeString(command, 500))
        .filter(Boolean),
    )]
  }

  const configured = safeString(
    deps.tesseractBin ||
      env.TRACK2_TESSERACT_BIN ||
      env.TRACK2_V3_TESSERACT_BIN ||
      env.TESSERACT_BIN ||
      env.TESSERACT_PATH,
    500,
  )
  const commands = [configured, 'tesseract'].filter(Boolean)
  if (platform === 'win32') {
    const programFiles = safeString(env.ProgramFiles, 500) || 'C:\\Program Files'
    const programFilesX86 = safeString(env['ProgramFiles(x86)'], 500)
    commands.push(
      path.win32.join(programFiles, 'Tesseract-OCR', 'tesseract.exe'),
      ...(programFilesX86
        ? [path.win32.join(programFilesX86, 'Tesseract-OCR', 'tesseract.exe')]
        : []),
    )
  }

  return [...new Set(commands.map((command) => safeString(command, 500)).filter(Boolean))]
}

export default {
  track2V3TesseractCommandCandidates,
}
