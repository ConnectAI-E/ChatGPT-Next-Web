interface RecordMimeType {
  mimeType: string;
  extension: string;
}

export function getRecordMimeType(): RecordMimeType {
  const defaultType = {
    mimeType: "audio/webm",
    extension: "webm",
  };

  if (typeof MediaRecorder === "undefined") {
    return defaultType;
  }

  const audioTypes = [
    {
      mimeType: "audio/webm",
      extension: "webm",
    },
    {
      mimeType: "audio/mp4",
      extension: "mp4",
    },
  ];

  const supportedType = audioTypes.find((type) =>
    MediaRecorder.isTypeSupported(type.mimeType),
  );

  return supportedType || defaultType;
}
