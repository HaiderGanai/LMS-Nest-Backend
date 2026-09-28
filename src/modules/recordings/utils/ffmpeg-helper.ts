export const buildFfmpegCommand = (inputPath: string, outputPath: string): string[] => {
  return [
    'ffmpeg',
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    outputPath,
  ];
};
