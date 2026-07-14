const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".wave",
  ".m4a",
  ".mp4",
  ".aac",
  ".aif",
  ".aiff",
  ".flac",
  ".ogg",
  ".oga",
  ".webm",
  ".caf",
];

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".webm": "audio/webm",
  ".caf": "audio/x-caf",
};

export function getFileExtension(name = "") {
  const normalized = name.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
}

export function isSupportedAudioFileName(name = "") {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(getFileExtension(name));
}

export function isSupportedAudioMime(type = "") {
  return type.startsWith("audio/") || type === "video/mp4" || type === "application/ogg";
}

export function isSupportedAudioFile(file: Pick<File, "name" | "type"> | null | undefined) {
  if (!file) return false;
  return isSupportedAudioMime(file.type || "") || isSupportedAudioFileName(file.name || "");
}

export function getAudioContentType(file: Pick<File, "name" | "type">) {
  if (isSupportedAudioMime(file.type || "")) return file.type;
  return AUDIO_MIME_BY_EXTENSION[getFileExtension(file.name || "")] ?? "audio/mpeg";
}

export const SUPPORTED_AUDIO_LABEL = "MP3, WAV, M4A, AAC, AIFF, FLAC, OGG, WEBM, CAF";
